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

const DAILY_COUNTER_CATEGORIES = ["Tankninger", "Trailerreparationer"];

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

// Real-world work already done today for a category BEFORE any target/total
// was ever set for it — e.g. trailers washed via Vaskeplan earlier in the
// day, before the briefing mentioned a count at all. Without this, setting
// "11 trailere" after already washing 4 would start the counter back at 0,
// silently losing the washes that happened first.
async function alreadyCompletedToday(category: string, day: Date): Promise<number> {
  if (category !== "Vaske") return 0;
  const end = new Date(day.getTime() + 24 * 60 * 60 * 1000);
  return prisma.trailerWash.count({ where: { washedAt: { gte: day, lt: end } } });
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
  const alreadyDone = Math.min(initialTotal, await alreadyCompletedToday(category, day));
  const task = await prisma.task.create({
    data: {
      userId,
      title: `${category}`,
      categoryId,
      scheduledFor: day,
      isQuantityTask: true,
      quantityTotal: initialTotal,
      quantityDone: alreadyDone,
      quantityUnit: meta.unit,
      sourceBriefingId: briefingId,
      completed: alreadyDone >= initialTotal && initialTotal > 0,
      completedAt: alreadyDone >= initialTotal && initialTotal > 0 ? new Date() : null,
    },
  });
  if (alreadyDone > 0) {
    await prisma.quantityLogEntry.create({
      data: { taskId: task.id, userId, delta: alreadyDone, shift: "DAGHOLD" },
    });
  }
  return task;
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
  const items = tasks.map((t) => ({
    taskId: t.id,
    category: t.category?.name ?? "Andre opgaver",
    total: t.quantityTotal ?? 0,
    done: t.quantityDone ?? 0,
  }));

  // No "Vaske" quantity item yet, but washes already happened today (e.g.
  // trailers washed via Vaskeplan before any target was mentioned) — seed a
  // virtual entry so the assistant's reply reflects that work instead of
  // claiming "0 done" for a target that's actually already partly met.
  if (!items.some((i) => i.category === "Vaske")) {
    const alreadyWashed = await alreadyCompletedToday("Vaske", day);
    if (alreadyWashed > 0) {
      items.push({ taskId: "", category: "Vaske", total: 0, done: alreadyWashed });
    }
  }

  return items;
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

// Manual counterpart to the AI briefing flow — lets a category/count be
// added directly from the UI (e.g. "Tankninger", "Trailerreparationer")
// without going through the assistant chat. Adds to today's existing task
// for that category if one already exists, otherwise creates a new one.
export async function addManualQuantityTask(categoryName: string, total: number): Promise<void> {
  const name = categoryName.trim();
  if (!name) throw new Error("Angiv en kategori.");
  if (!Number.isFinite(total) || total <= 0) throw new Error("Angiv et antal større end 0.");

  const userId = await getCurrentUserId();
  const day = startOfDay(new Date());
  const briefing = await getOrCreateTodayBriefing(userId, day);

  const existing = await findOpenQuantityTask(userId, name, day);
  if (existing) {
    await prisma.task.update({
      where: { id: existing.id },
      data: { quantityTotal: { increment: Math.round(total) } },
    });
  } else {
    await findOrCreateQuantityTask(userId, name, day, briefing.id, Math.round(total));
  }

  revalidatePath("/");
  revalidatePath("/planlaegning");
}

// Simple daily +/- counters (Tankninger, Trailerreparationer) shown directly
// on the homepage — no target/goal, no modal, just tap + or -. Backed by the
// same Task/quantityDone fields as the goal-based briefing quantity tasks
// (so a wash-linked or chat-set total for the same category still adds up
// correctly), but the tile itself only ever shows/changes the raw count.
export async function getDailyCounters(): Promise<{ category: string; count: number }[]> {
  const userId = await getCurrentUserId();
  const day = startOfDay(new Date());
  const results = await Promise.all(
    DAILY_COUNTER_CATEGORIES.map(async (category) => {
      const task = await findOpenQuantityTask(userId, category, day);
      return { category, count: task?.quantityDone ?? 0 };
    })
  );
  return results;
}

export async function bumpDailyCounter(category: string, delta: number): Promise<number> {
  const userId = await getCurrentUserId();
  const day = startOfDay(new Date());
  const existing = await findOpenQuantityTask(userId, category, day);

  if (!existing) {
    const briefing = await getOrCreateTodayBriefing(userId, day);
    const next = Math.max(0, delta);
    const created = await findOrCreateQuantityTask(userId, category, day, briefing.id, next);
    if (created.quantityDone !== next) {
      await prisma.task.update({ where: { id: created.id }, data: { quantityDone: next } });
    }
    revalidatePath("/");
    revalidatePath("/planlaegning");
    return next;
  }

  const before = existing.quantityDone ?? 0;
  const next = Math.max(0, before + delta);
  await prisma.task.update({
    where: { id: existing.id },
    // Keep quantityTotal at least as large as quantityDone so this stays
    // sane if the same category also shows up as a goal-based progress
    // card elsewhere (e.g. set via the briefing chat).
    data: { quantityDone: next, quantityTotal: Math.max(existing.quantityTotal ?? 0, next) },
  });
  revalidatePath("/");
  revalidatePath("/planlaegning");
  return next;
}

// Called whenever a trailer wash is actually completed (Vaskeplan) — advances
// today's "Vaske" quantity task by one, if one exists, so saying "jeg har 10
// vaske fra haven" and then actually washing trailers keeps the done-count in
// sync automatically instead of needing a separate manual tap for every wash.
export async function recordVaskeCompleted(userId: string): Promise<void> {
  const day = startOfDay(new Date());
  const task = await findOpenQuantityTask(userId, "Vaske", day);
  if (!task) return;

  const total = task.quantityTotal ?? 0;
  const before = task.quantityDone ?? 0;
  const after = total > 0 ? Math.min(total, before + 1) : before + 1;
  if (after === before) return;

  await prisma.task.update({
    where: { id: task.id },
    data: {
      quantityDone: after,
      completed: total > 0 && after >= total,
      completedAt: total > 0 && after >= total ? new Date() : null,
    },
  });
  await prisma.quantityLogEntry.create({
    data: { taskId: task.id, userId, delta: after - before, shift: "DAGHOLD" },
  });

  revalidatePath("/");
  revalidatePath("/planlaegning");
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

// Removes a wrongly-created quantity task (e.g. the parser got the count
// wrong, or a duplicate was made) — there was previously no way to correct
// or remove one at all short of editing the database directly.
export async function deleteQuantityTask(taskId: string): Promise<void> {
  const userId = await getCurrentUserId();
  await prisma.task.updateMany({
    where: { id: taskId, userId, isQuantityTask: true },
    data: { deletedAt: new Date() },
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
