"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { startOfDay } from "@/lib/date";
import { templateAppliesOn } from "@/lib/recurrence";
import { Priority, RecurrenceType } from "@prisma/client";

export async function ensureTodayTasksGenerated(date: Date = new Date()) {
  const userId = await getCurrentUserId();
  const day = startOfDay(date);

  const templates = await prisma.taskTemplate.findMany({
    where: { userId, active: true },
    include: { checklistItems: true },
  });

  const applicable = templates.filter((t) => templateAppliesOn(t, day));
  if (applicable.length === 0) return;

  const existing = await prisma.task.findMany({
    where: {
      userId,
      scheduledFor: day,
      templateId: { in: applicable.map((t) => t.id) },
    },
    select: { templateId: true },
  });
  const existingTemplateIds = new Set(existing.map((e) => e.templateId));

  for (const template of applicable) {
    if (existingTemplateIds.has(template.id)) continue;
    await prisma.task.create({
      data: {
        userId,
        title: template.title,
        description: template.description,
        priority: template.priority,
        categoryId: template.categoryId,
        templateId: template.id,
        scheduledFor: day,
        checklistItems: {
          create: template.checklistItems.map((item, idx) => ({
            title: item.title,
            order: idx,
          })),
        },
      },
    });
  }
}

export async function getTasksForDay(date: Date) {
  const userId = await getCurrentUserId();
  const day = startOfDay(date);
  return prisma.task.findMany({
    where: { userId, scheduledFor: day, deletedAt: null },
    include: { checklistItems: { orderBy: { order: "asc" } }, category: true },
    orderBy: [{ order: "asc" }, { createdAt: "asc" }],
  });
}

export async function toggleTaskCompleted(taskId: string) {
  const userId = await getCurrentUserId();
  const task = await prisma.task.findFirst({ where: { id: taskId, userId } });
  if (!task) throw new Error("Opgave ikke fundet");

  const completed = !task.completed;
  await prisma.task.update({
    where: { id: taskId },
    data: {
      completed,
      completedAt: completed ? new Date() : null,
      startedAt: completed && !task.startedAt ? task.startedAt : task.startedAt,
    },
  });
  revalidatePath("/");
  revalidatePath("/opgaver");
}

export async function startTask(taskId: string) {
  const userId = await getCurrentUserId();
  await prisma.task.updateMany({
    where: { id: taskId, userId },
    data: { startedAt: new Date() },
  });
  revalidatePath("/opgaver");
}

export async function toggleChecklistItem(itemId: string) {
  const item = await prisma.taskChecklistItem.findUnique({ where: { id: itemId }, include: { task: true } });
  if (!item) throw new Error("Punkt ikke fundet");
  await prisma.taskChecklistItem.update({
    where: { id: itemId },
    data: { completed: !item.completed },
  });

  const siblings = await prisma.taskChecklistItem.findMany({ where: { taskId: item.taskId } });
  const allDone = siblings.every((s) => (s.id === itemId ? !item.completed : s.completed));
  if (allDone && siblings.length > 0) {
    await prisma.task.update({
      where: { id: item.taskId },
      data: { completed: true, completedAt: new Date() },
    });
  } else if (!allDone) {
    await prisma.task.update({
      where: { id: item.taskId },
      data: { completed: false, completedAt: null },
    });
  }

  revalidatePath("/");
  revalidatePath("/opgaver");
}

export type CreateTaskInput = {
  title: string;
  description?: string;
  categoryId?: string | null;
  priority: Priority;
  dueDate?: string | null;
  scheduledFor?: string;
  checklist?: string[];
};

export async function createTask(input: CreateTaskInput) {
  const userId = await getCurrentUserId();
  if (!input.title.trim()) throw new Error("Titel mangler");

  const scheduledFor = input.scheduledFor ? startOfDay(new Date(input.scheduledFor)) : startOfDay(new Date());

  const task = await prisma.task.create({
    data: {
      userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      categoryId: input.categoryId || null,
      priority: input.priority,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      scheduledFor,
      checklistItems: input.checklist?.length
        ? { create: input.checklist.filter(Boolean).map((title, idx) => ({ title, order: idx })) }
        : undefined,
    },
  });
  revalidatePath("/");
  revalidatePath("/opgaver");
  return task;
}

export async function updateTask(taskId: string, input: Partial<CreateTaskInput>) {
  const userId = await getCurrentUserId();
  await prisma.task.updateMany({
    where: { id: taskId, userId },
    data: {
      title: input.title?.trim(),
      description: input.description?.trim() || null,
      categoryId: input.categoryId,
      priority: input.priority,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
    },
  });
  revalidatePath("/opgaver");
}

export async function deleteTask(taskId: string) {
  const userId = await getCurrentUserId();
  await prisma.task.updateMany({
    where: { id: taskId, userId },
    data: { deletedAt: new Date() },
  });
  revalidatePath("/");
  revalidatePath("/opgaver");
}

export async function reorderTasks(orderedIds: string[]) {
  const userId = await getCurrentUserId();
  await Promise.all(
    orderedIds.map((id, index) =>
      prisma.task.updateMany({ where: { id, userId }, data: { order: index } })
    )
  );
  revalidatePath("/opgaver");
}

export type CreateTemplateInput = {
  title: string;
  description?: string;
  categoryId?: string | null;
  priority: Priority;
  recurrenceType: RecurrenceType;
  weekdays?: number[];
  dayOfMonth?: number | null;
  specificDate?: string | null;
  checklist?: string[];
};

export async function createTemplate(input: CreateTemplateInput) {
  const userId = await getCurrentUserId();
  const template = await prisma.taskTemplate.create({
    data: {
      userId,
      title: input.title.trim(),
      description: input.description?.trim() || null,
      categoryId: input.categoryId || null,
      priority: input.priority,
      recurrenceType: input.recurrenceType,
      weekdays: input.weekdays || [],
      dayOfMonth: input.dayOfMonth || null,
      specificDate: input.specificDate ? new Date(input.specificDate) : null,
      checklistItems: input.checklist?.length
        ? { create: input.checklist.filter(Boolean).map((title, idx) => ({ title, order: idx })) }
        : undefined,
    },
  });
  revalidatePath("/indstillinger");
  await ensureTodayTasksGenerated();
  revalidatePath("/");
  revalidatePath("/opgaver");
  return template;
}

export async function toggleTemplateActive(templateId: string) {
  const userId = await getCurrentUserId();
  const template = await prisma.taskTemplate.findFirst({ where: { id: templateId, userId } });
  if (!template) throw new Error("Rutine ikke fundet");
  await prisma.taskTemplate.update({
    where: { id: templateId },
    data: { active: !template.active },
  });
  revalidatePath("/indstillinger");
}

export async function deleteTemplate(templateId: string) {
  const userId = await getCurrentUserId();
  await prisma.taskTemplate.deleteMany({ where: { id: templateId, userId } });
  revalidatePath("/indstillinger");
}

export async function getTemplates() {
  const userId = await getCurrentUserId();
  return prisma.taskTemplate.findMany({
    where: { userId },
    include: { checklistItems: true, category: true },
    orderBy: { createdAt: "desc" },
  });
}
