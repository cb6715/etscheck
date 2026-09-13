"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { getWeekRange, getMonthRange } from "@/lib/date";
import { computeIntervalEarnings, netForIncrement, DEFAULT_WAGE_CONFIG, type WageConfig } from "@/lib/wage/engine";

async function getOrCreateWageSettings(userId: string) {
  return prisma.wageSettings.upsert({
    where: { userId },
    update: {},
    create: { userId, ...DEFAULT_WAGE_CONFIG },
  });
}

export async function getWageSettings() {
  const userId = await getCurrentUserId();
  return getOrCreateWageSettings(userId);
}

export type WageSettingsInput = Partial<WageConfig>;

export async function updateWageSettings(input: WageSettingsInput) {
  const userId = await getCurrentUserId();
  await getOrCreateWageSettings(userId);
  await prisma.wageSettings.update({ where: { userId }, data: input });
  revalidatePath("/indstillinger");
}

// Paid seconds already worked this ISO week, strictly before `before` —
// the baseline the 37-timers-overtime threshold is measured against.
async function priorWeekPaidSeconds(userId: string, before: Date) {
  const { start } = getWeekRange(before);
  const sessions = await prisma.workSession.findMany({
    where: { userId, checkOutAt: { not: null }, checkInAt: { gte: start, lt: before } },
    select: { paidSeconds: true },
  });
  return sessions.reduce((sum, s) => sum + (s.paidSeconds ?? 0), 0);
}

// Gross kr already earned this calendar month, strictly before `before` —
// the baseline the skattefradrag threshold is measured against.
async function priorMonthGross(userId: string, before: Date) {
  const { start } = getMonthRange(before);
  const sessions = await prisma.workSession.findMany({
    where: { userId, checkOutAt: { not: null }, checkInAt: { gte: start, lt: before } },
    select: { grossAmount: true },
  });
  return sessions.reduce((sum, s) => sum + (s.grossAmount ?? 0), 0);
}

export type WageContext = {
  config: WageConfig;
  openSession: { id: string; checkInAt: string } | null;
  priorWeekPaidSeconds: number;
  priorMonthGross: number;
};

export async function getWageContext(): Promise<WageContext> {
  const userId = await getCurrentUserId();
  const [config, openSession] = await Promise.all([
    getOrCreateWageSettings(userId),
    prisma.workSession.findFirst({ where: { userId, checkOutAt: null }, orderBy: { checkInAt: "desc" } }),
  ]);

  const referenceTime = openSession?.checkInAt ?? new Date();
  const [weekSeconds, monthGross] = await Promise.all([
    priorWeekPaidSeconds(userId, referenceTime),
    priorMonthGross(userId, referenceTime),
  ]);

  return {
    config,
    openSession: openSession ? { id: openSession.id, checkInAt: openSession.checkInAt.toISOString() } : null,
    priorWeekPaidSeconds: weekSeconds,
    priorMonthGross: monthGross,
  };
}

export async function checkIn(): Promise<WageContext> {
  const userId = await getCurrentUserId();
  const existing = await prisma.workSession.findFirst({ where: { userId, checkOutAt: null } });
  if (!existing) {
    await prisma.workSession.create({ data: { userId, checkInAt: new Date() } });
  }
  revalidatePath("/");
  return getWageContext();
}

export async function checkOut(): Promise<WageContext> {
  const userId = await getCurrentUserId();
  const session = await prisma.workSession.findFirst({
    where: { userId, checkOutAt: null },
    orderBy: { checkInAt: "desc" },
  });

  if (session) {
    const config = await getOrCreateWageSettings(userId);
    const now = new Date();
    const [weekSecondsBefore, monthGrossBefore] = await Promise.all([
      priorWeekPaidSeconds(userId, session.checkInAt),
      priorMonthGross(userId, session.checkInAt),
    ]);
    const { paidSeconds, grossAmount } = computeIntervalEarnings(session.checkInAt, now, weekSecondsBefore, config);
    const netAmount = netForIncrement(monthGrossBefore, grossAmount, config);

    await prisma.workSession.update({
      where: { id: session.id },
      data: { checkOutAt: now, paidSeconds, grossAmount, netAmount },
    });
  }

  revalidatePath("/");
  return getWageContext();
}
