"use server";

import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { getMonthRange } from "@/lib/date";

export async function getMonthTaskCounts(year: number, month: number) {
  const userId = await getCurrentUserId();
  const { start, end } = getMonthRange(new Date(year, month, 1));
  const tasks = await prisma.task.findMany({
    where: { userId, deletedAt: null, scheduledFor: { gte: start, lte: end } },
    select: { scheduledFor: true, completed: true },
  });

  const counts: Record<string, { total: number; done: number }> = {};
  for (const t of tasks) {
    const key = t.scheduledFor.toISOString().slice(0, 10);
    if (!counts[key]) counts[key] = { total: 0, done: 0 };
    counts[key].total += 1;
    if (t.completed) counts[key].done += 1;
  }
  return counts;
}
