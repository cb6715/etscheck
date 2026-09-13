"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { startOfDay } from "@/lib/date";
import { getCategoryMeta } from "@/lib/ai/category-meta";
import { extractNumber } from "@/lib/ai/danish-numbers";
import { findCategoryByKeyword } from "@/lib/ai/category-meta";
import { parseBriefingMessage } from "@/lib/ai/parse-briefing";
import { simulateActions, buildAssistantReply } from "@/lib/ai/simulate";
import type { BriefingAction, ExistingItemContext, ShiftValue } from "@/lib/ai/briefing-types";
import { Prisma } from "@prisma/client";

type PendingClarification = {
  question: string;
  pendingAction:
    | { kind: "increase_total"; category: string }
    | { kind: "increment_done"; category?: string; amount?: number; candidates?: string[] }
    | { kind: "create_quantity_item"; category: string };
};

async function getOrCreateTodayBriefing(userId: string, day: Date) {
  return prisma.dailyBriefing.upsert({
    where: { userId_date: { userId, date: day } },
    update: {},
    create: { userId, date: day },
  });
}

async function resolveCategoryId(userId: string, categoryName: string): Promise<string> {
  const existing = await prisma.category.findFirst({
    where: { userId, name: { equals: categoryName, mode: "insensitive" }, deletedAt: null },
  });
  if (existing) return existing.id;

  const meta = getCategoryMeta(categoryName);
  const count = await prisma.category.count({ where: { userId, deletedAt: null } });
  const created = await prisma.category.create({
    data: { userId, name: categoryName, icon: meta.icon, color: "#64748b", order: count },
  });
  return created.id;
}

async function findOpenQuantityTask(userId: string, category: string, day: Date) {
  const categoryId = await resolveCategoryId(userId, category);
  return prisma.task.findFirst({
    where: {
      userId,
      categoryId,
      isQuantityTask: true,
      scheduledFor: day,
      deletedAt: null,
      cancelledAt: null,
    },
  });
}

async function findOrCreateQuantityTask(
  userId: string,
  category: string,
  day: Date,
  briefingId: string,
  initialTotal: number
) {
  const existing = await findOpenQuantityTask(userId, category, day);
  if (existing) return existing;

  const categoryId = await resolveCategoryId(userId, category);
  const meta = getCategoryMeta(category);
  return prisma.task.create({
    data: {
      userId,
      title: `${category}`,
      categoryId,
      scheduledFor: day,
      isQuantityTask: true,
      quantityTotal: initialTotal,
      quantityDone: 0,
      quantityUnit: meta.unit,
      sourceBriefingId: briefingId,
    },
  });
}

async function applyActions(
  userId: string,
  briefingId: string,
  day: Date,
  actions: BriefingAction[]
) {
  for (const action of actions) {
    switch (action.type) {
      case "create_quantity_item": {
        const task = await findOrCreateQuantityTask(userId, action.category, day, briefingId, action.total);
        if (!task.quantityTotal) {
          await prisma.task.update({ where: { id: task.id }, data: { quantityTotal: action.total } });
        }
        break;
      }
      case "increase_total": {
        const task = await findOrCreateQuantityTask(userId, action.category, day, briefingId, action.deltaTotal);
        if (task.quantityTotal !== action.deltaTotal || task.quantityDone) {
          await prisma.task.update({
            where: { id: task.id },
            data: { quantityTotal: { increment: action.deltaTotal } },
          });
        }
        break;
      }
      case "increment_done": {
        const task = await findOrCreateQuantityTask(userId, action.category, day, briefingId, action.delta);
        const total = task.quantityTotal ?? action.delta;
        const before = task.quantityDone ?? 0;
        const after = Math.min(total, before + action.delta);
        await prisma.task.update({
          where: { id: task.id },
          data: {
            quantityDone: after,
            completed: after >= total,
            completedAt: after >= total ? new Date() : null,
          },
        });
        await prisma.quantityLogEntry.create({
          data: {
            taskId: task.id,
            userId,
            delta: action.delta,
            shift: (action.shift ?? "DAGHOLD") as ShiftValue,
            shiftLabel: action.shiftLabel,
          },
        });
        break;
      }
      case "mark_category_complete": {
        const task = await findOpenQuantityTask(userId, action.category, day);
        if (!task) break;
        const total = task.quantityTotal ?? task.quantityDone ?? 0;
        const before = task.quantityDone ?? 0;
        await prisma.task.update({
          where: { id: task.id },
          data: { quantityDone: total, completed: true, completedAt: new Date() },
        });
        if (total - before > 0) {
          await prisma.quantityLogEntry.create({
            data: { taskId: task.id, userId, delta: total - before, shift: "DAGHOLD" },
          });
        }
        break;
      }
      case "create_plain_task": {
        const categoryId = action.category ? await resolveCategoryId(userId, action.category) : null;
        await prisma.task.create({
          data: {
            userId,
            title: action.title,
            categoryId,
            scheduledFor: day,
            sourceBriefingId: briefingId,
          },
        });
        break;
      }
      case "add_note": {
        await prisma.note.create({
          data: { userId, text: action.text, targetType: "GENERAL" },
        });
        break;
      }
    }
  }
}

async function getExistingItemsContext(userId: string, day: Date): Promise<ExistingItemContext[]> {
  const tasks = await prisma.task.findMany({
    where: { userId, isQuantityTask: true, scheduledFor: day, deletedAt: null, cancelledAt: null },
    include: { category: true },
  });
  return tasks.map((t) => ({
    taskId: t.id,
    category: t.category?.name ?? "Andre opgaver",
    total: t.quantityTotal ?? 0,
    done: t.quantityDone ?? 0,
  }));
}

export async function getTodayBriefingData() {
  const userId = await getCurrentUserId();
  const day = startOfDay(new Date());
  const briefing = await getOrCreateTodayBriefing(userId, day);
  const messages = await prisma.briefingMessage.findMany({
    where: { briefingId: briefing.id },
    orderBy: { createdAt: "asc" },
  });
  const quantityTasks = await getQuantityTasksForDay(day);
  const plainTasks = await prisma.task.findMany({
    where: {
      userId,
      sourceBriefingId: briefing.id,
      isQuantityTask: false,
      deletedAt: null,
      cancelledAt: null,
    },
    include: { category: true },
    orderBy: { createdAt: "asc" },
  });

  return {
    briefing,
    messages,
    quantityTasks,
    plainTasks,
    pendingConfirmation: briefing.pendingConfirmation as BriefingAction[] | null,
    pendingClarification: briefing.pendingClarification as PendingClarification | null,
  };
}

export async function getBriefingForDate(date: Date) {
  const userId = await getCurrentUserId();
  const day = startOfDay(date);
  const briefing = await prisma.dailyBriefing.findUnique({
    where: { userId_date: { userId, date: day } },
    include: { messages: { orderBy: { createdAt: "asc" } } },
  });
  return briefing;
}

export async function getQuantityTasksForDay(day: Date) {
  const userId = await getCurrentUserId();
  const tasks = await prisma.task.findMany({
    where: {
      userId,
      isQuantityTask: true,
      scheduledFor: startOfDay(day),
      deletedAt: null,
      cancelledAt: null,
    },
    include: { category: true, quantityLog: true },
    orderBy: { createdAt: "asc" },
  });
  return tasks;
}

export async function sendBriefingMessage(text: string) {
  const userId = await getCurrentUserId();
  const day = startOfDay(new Date());
  const trimmed = text.trim();
  if (!trimmed) throw new Error("Skriv en besked først.");

  const briefing = await getOrCreateTodayBriefing(userId, day);

  await prisma.briefingMessage.create({
    data: { briefingId: briefing.id, role: "USER", text: trimmed },
  });

  const messageCountBefore = await prisma.briefingMessage.count({
    where: { briefingId: briefing.id, role: "USER" },
  });
  const isFirstToday = messageCountBefore <= 1;

  // Try to resolve a pending clarification from the previous turn first.
  const pendingClarification = briefing.pendingClarification as PendingClarification | null;
  if (pendingClarification) {
    const resolved = await tryResolveClarification(userId, briefing.id, day, pendingClarification, trimmed);
    if (resolved) {
      await prisma.briefingMessage.create({
        data: { briefingId: briefing.id, role: "ASSISTANT", text: resolved.reply },
      });
      await prisma.dailyBriefing.update({
        where: { id: briefing.id },
        data: { pendingClarification: Prisma.JsonNull },
      });
      revalidatePath("/");
      revalidatePath("/planlaegning");
      return { reply: resolved.reply, requiresConfirmation: false, clarification: false };
    }
    // fall through to a normal parse if the reply didn't answer the question
    await prisma.dailyBriefing.update({
      where: { id: briefing.id },
      data: { pendingClarification: Prisma.JsonNull },
    });
  }

  const existingItems = await getExistingItemsContext(userId, day);
  const result = await parseBriefingMessage(trimmed, { existingItems }, { isFirstToday });

  if (result.clarification) {
    const stored: PendingClarification = {
      question: result.clarification.question,
      pendingAction: result.clarification.pendingAction,
    };
    await prisma.dailyBriefing.update({
      where: { id: briefing.id },
      data: { pendingClarification: stored as unknown as Prisma.InputJsonValue },
    });
    await prisma.briefingMessage.create({
      data: { briefingId: briefing.id, role: "ASSISTANT", text: result.clarification.question },
    });
    revalidatePath("/");
    revalidatePath("/planlaegning");
    return { reply: result.clarification.question, requiresConfirmation: false, clarification: true };
  }

  if (result.requiresConfirmation) {
    await prisma.dailyBriefing.update({
      where: { id: briefing.id },
      data: { pendingConfirmation: result.actions as unknown as Prisma.InputJsonValue },
    });
    await prisma.briefingMessage.create({
      data: { briefingId: briefing.id, role: "ASSISTANT", text: result.assistantReply },
    });
    revalidatePath("/");
    revalidatePath("/planlaegning");
    return {
      reply: result.assistantReply,
      requiresConfirmation: true,
      clarification: false,
      actions: result.actions,
    };
  }

  await applyActions(userId, briefing.id, day, result.actions);
  await freezePlannedSummaryIfNeeded(userId, briefing.id, day);
  await prisma.briefingMessage.create({
    data: { briefingId: briefing.id, role: "ASSISTANT", text: result.assistantReply },
  });

  revalidatePath("/");
  revalidatePath("/planlaegning");
  return { reply: result.assistantReply, requiresConfirmation: false, clarification: false };
}

async function tryResolveClarification(
  userId: string,
  briefingId: string,
  day: Date,
  clarification: PendingClarification,
  reply: string
): Promise<{ reply: string } | null> {
  const { pendingAction } = clarification;

  if (pendingAction.kind === "increase_total") {
    const num = extractNumber(reply);
    if (num === null) return null;
    await applyActions(userId, briefingId, day, [
      { type: "increase_total", category: pendingAction.category, deltaTotal: num },
    ]);
    const meta = getCategoryMeta(pendingAction.category);
    return {
      reply: `Modtaget 👍 Jeg har lagt ${num} ${meta.unit} til dagens ${pendingAction.category.toLowerCase()}.`,
    };
  }

  if (pendingAction.kind === "increment_done") {
    const amount = pendingAction.amount ?? extractNumber(reply);
    if (amount === null) return null;

    let category = pendingAction.category ?? findCategoryByKeyword(reply) ?? undefined;
    if (!category && pendingAction.candidates?.length) {
      category = pendingAction.candidates.find((c) => reply.toLowerCase().includes(c.toLowerCase()));
    }
    if (!category) return null;

    await applyActions(userId, briefingId, day, [
      { type: "increment_done", category, delta: amount, shift: "DAGHOLD" },
    ]);
    return { reply: `Opdateret 👍 ${amount} lagt til ${category}.` };
  }

  return null;
}

async function freezePlannedSummaryIfNeeded(userId: string, briefingId: string, day: Date) {
  const briefing = await prisma.dailyBriefing.findUnique({ where: { id: briefingId } });
  if (!briefing || briefing.plannedSummary) return;

  const items = await getExistingItemsContext(userId, day);
  if (items.length === 0) return;

  const summary = Object.fromEntries(items.map((i) => [i.category, { total: i.total }]));
  await prisma.dailyBriefing.update({
    where: { id: briefingId },
    data: { plannedSummary: summary as unknown as Prisma.InputJsonValue },
  });
}

export async function confirmPendingActions() {
  const userId = await getCurrentUserId();
  const day = startOfDay(new Date());
  const briefing = await getOrCreateTodayBriefing(userId, day);
  const actions = briefing.pendingConfirmation as unknown as BriefingAction[] | null;
  if (!actions || actions.length === 0) return;

  await applyActions(userId, briefing.id, day, actions);
  await freezePlannedSummaryIfNeeded(userId, briefing.id, day);

  await prisma.dailyBriefing.update({
    where: { id: briefing.id },
    data: { pendingConfirmation: Prisma.JsonNull },
  });
  await prisma.briefingMessage.create({
    data: { briefingId: briefing.id, role: "ASSISTANT", text: "✅ Arbejdsplanen er opdateret." },
  });

  revalidatePath("/");
  revalidatePath("/planlaegning");
}

export async function discardPendingActions() {
  const userId = await getCurrentUserId();
  const day = startOfDay(new Date());
  const briefing = await getOrCreateTodayBriefing(userId, day);

  await prisma.dailyBriefing.update({
    where: { id: briefing.id },
    data: { pendingConfirmation: Prisma.JsonNull },
  });
  await prisma.briefingMessage.create({
    data: {
      briefingId: briefing.id,
      role: "ASSISTANT",
      text: "Ok, jeg har ikke ændret noget. Prøv at skrive det igen 🙂",
    },
  });

  revalidatePath("/");
  revalidatePath("/planlaegning");
}

export async function adjustQuantityDone(taskId: string, delta: number, shift: ShiftValue = "DAGHOLD") {
  const userId = await getCurrentUserId();
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new Error("Opgave ikke fundet");

  const total = task.quantityTotal ?? 0;
  const before = task.quantityDone ?? 0;
  const after = Math.max(0, Math.min(total, before + delta));
  if (after === before) return;

  await prisma.task.update({
    where: { id: taskId },
    data: {
      quantityDone: after,
      completed: after >= total && total > 0,
      completedAt: after >= total && total > 0 ? new Date() : null,
    },
  });
  await prisma.quantityLogEntry.create({
    data: { taskId, userId, delta: after - before, shift },
  });

  revalidatePath("/");
  revalidatePath("/planlaegning");
}

export type EndOfDaySummary = {
  plannedCount: number;
  doneCount: number;
  missingCount: number;
  quantityItems: {
    taskId: string;
    category: string;
    icon: string;
    total: number;
    done: number;
    remaining: number;
  }[];
  otherOpenTasks: { taskId: string; title: string }[];
};

export async function getEndOfDaySummary(): Promise<EndOfDaySummary> {
  const userId = await getCurrentUserId();
  const day = startOfDay(new Date());

  const allTasks = await prisma.task.findMany({
    where: { userId, scheduledFor: day, deletedAt: null, cancelledAt: null },
    include: { category: true },
  });

  const quantityItems = allTasks
    .filter((t) => t.isQuantityTask)
    .map((t) => ({
      taskId: t.id,
      category: t.category?.name ?? "Andre opgaver",
      icon: t.category?.icon ?? "📋",
      total: t.quantityTotal ?? 0,
      done: t.quantityDone ?? 0,
      remaining: Math.max((t.quantityTotal ?? 0) - (t.quantityDone ?? 0), 0),
    }))
    .filter((i) => i.remaining > 0);

  const otherOpenTasks = allTasks
    .filter((t) => !t.isQuantityTask && !t.completed)
    .map((t) => ({ taskId: t.id, title: t.title }));

  return {
    plannedCount: allTasks.length,
    doneCount: allTasks.filter((t) => t.completed).length,
    missingCount: allTasks.filter((t) => !t.completed).length,
    quantityItems,
    otherOpenTasks,
  };
}

export type EndOfDayDecisionInput = {
  taskId: string;
  decision: "carry_over" | "not_needed" | "keep";
};

export async function finalizeWorkday(decisions: EndOfDayDecisionInput[]) {
  const userId = await getCurrentUserId();
  const day = startOfDay(new Date());
  const tomorrow = new Date(day);
  tomorrow.setDate(day.getDate() + 1);

  for (const decision of decisions) {
    const task = await prisma.task.findFirst({ where: { id: decision.taskId, userId } });
    if (!task) continue;

    if (decision.decision === "not_needed") {
      await prisma.task.update({ where: { id: task.id }, data: { cancelledAt: new Date() } });
    } else if (decision.decision === "carry_over") {
      if (task.isQuantityTask) {
        const remaining = Math.max((task.quantityTotal ?? 0) - (task.quantityDone ?? 0), 0);
        await prisma.task.create({
          data: {
            userId,
            title: task.title,
            categoryId: task.categoryId,
            scheduledFor: tomorrow,
            isQuantityTask: true,
            quantityTotal: remaining,
            quantityDone: 0,
            quantityUnit: task.quantityUnit,
            carriedOverFromId: task.id,
          },
        });
        await prisma.task.update({ where: { id: task.id }, data: { cancelledAt: new Date() } });
      } else {
        await prisma.task.update({
          where: { id: task.id },
          data: { scheduledFor: tomorrow },
        });
      }
    }
    // 'keep' → leave as-is, day still closes
  }

  const summary = await getEndOfDaySummary();
  const briefing = await getOrCreateTodayBriefing(userId, day);
  await prisma.dailyBriefing.update({
    where: { id: briefing.id },
    data: {
      closedAt: new Date(),
      closedSummary: summary as unknown as Prisma.InputJsonValue,
    },
  });

  const [washes, visits, problems] = await Promise.all([
    prisma.trailerWash.count({ where: { userId, washedAt: { gte: day, lt: tomorrow } } }),
    prisma.driveInVisit.count({ where: { userId, visitedAt: { gte: day, lt: tomorrow } } }),
    prisma.note.count({ where: { userId, isProblem: true, createdAt: { gte: day, lt: tomorrow } } }),
  ]);

  await prisma.dailyActivity.upsert({
    where: { userId_date: { userId, date: day } },
    update: {
      summary: {
        tasksCompleted: summary.doneCount,
        tasksTotal: summary.plannedCount,
        washes,
        driveIns: visits,
        problems,
      },
    },
    create: {
      userId,
      date: day,
      summary: {
        tasksCompleted: summary.doneCount,
        tasksTotal: summary.plannedCount,
        washes,
        driveIns: visits,
        problems,
      },
    },
  });

  revalidatePath("/");
  revalidatePath("/planlaegning");
  return summary;
}

export type PlanVsActual = {
  planned: { category: string; icon: string; total: number }[];
  actual: { category: string; icon: string; total: number; done: number }[];
} | null;

export async function getPlanVsActual(): Promise<PlanVsActual> {
  const userId = await getCurrentUserId();
  const day = startOfDay(new Date());
  const briefing = await prisma.dailyBriefing.findUnique({ where: { userId_date: { userId, date: day } } });
  if (!briefing?.plannedSummary) return null;

  const planned = Object.entries(briefing.plannedSummary as Record<string, { total: number }>).map(
    ([category, v]) => ({ category, icon: getCategoryMeta(category).icon, total: v.total })
  );

  const items = await getExistingItemsContext(userId, day);
  const actual = items.map((i) => ({
    category: i.category,
    icon: getCategoryMeta(i.category).icon,
    total: i.total,
    done: i.done,
  }));

  return { planned, actual };
}
