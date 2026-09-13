"use server";

import { revalidatePath } from "next/cache";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { getWeekRange } from "@/lib/date";
import {
  computeIntervalEarnings,
  computeWeekGrossFromHours,
  netForIncrement,
  getPayPeriodRange,
  DEFAULT_WAGE_CONFIG,
  type WageConfig,
} from "@/lib/wage/engine";

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

// Gross kr already earned in the current pay period, strictly before
// `before` — the baseline the skattefradrag threshold is measured against.
async function priorPeriodGross(userId: string, before: Date, config: WageConfig) {
  const { start, end } = getPayPeriodRange(config);
  const windowEnd = before < end ? before : end;
  const sessions = await prisma.workSession.findMany({
    where: { userId, checkOutAt: { not: null }, checkInAt: { gte: start, lt: windowEnd } },
    select: { grossAmount: true },
  });
  return sessions.reduce((sum, s) => sum + (s.grossAmount ?? 0), 0);
}

export type WageContext = {
  config: WageConfig;
  openSession: { id: string; checkInAt: string } | null;
  priorWeekPaidSeconds: number;
  priorPeriodGross: number;
};

export async function getWageContext(): Promise<WageContext> {
  const userId = await getCurrentUserId();
  const [config, openSession] = await Promise.all([
    getOrCreateWageSettings(userId),
    prisma.workSession.findFirst({ where: { userId, checkOutAt: null }, orderBy: { checkInAt: "desc" } }),
  ]);

  const referenceTime = openSession?.checkInAt ?? new Date();
  const [weekSeconds, periodGross] = await Promise.all([
    priorWeekPaidSeconds(userId, referenceTime),
    priorPeriodGross(userId, referenceTime, config),
  ]);

  return {
    config,
    openSession: openSession ? { id: openSession.id, checkInAt: openSession.checkInAt.toISOString() } : null,
    priorWeekPaidSeconds: weekSeconds,
    priorPeriodGross: periodGross,
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
    const [weekSecondsBefore, periodGrossBefore] = await Promise.all([
      priorWeekPaidSeconds(userId, session.checkInAt),
      priorPeriodGross(userId, session.checkInAt, config),
    ]);
    const { paidSeconds, grossAmount } = computeIntervalEarnings(session.checkInAt, now, weekSecondsBefore, config);
    const netAmount = netForIncrement(periodGrossBefore, grossAmount, config);

    await prisma.workSession.update({
      where: { id: session.id },
      data: { checkOutAt: now, paidSeconds, grossAmount, netAmount },
    });
  }

  revalidatePath("/");
  return getWageContext();
}

export type HistoricalWeek = {
  id: string;
  weekStart: string;
  hours: number;
  grossAmount: number;
  netAmount: number;
};

// Weeks logged as a single "worked X hours" total (no tjek-ind/ud), used to
// bridge the gap between a pay period's start and when tjek-ind/ud started
// being used. Kept separate (isManualEntry) so it's distinguishable/deletable.
export async function getHistoricalWeeks(): Promise<HistoricalWeek[]> {
  const userId = await getCurrentUserId();
  const rows = await prisma.workSession.findMany({
    where: { userId, isManualEntry: true },
    orderBy: { checkInAt: "asc" },
  });
  return rows.map((r) => ({
    id: r.id,
    weekStart: r.checkInAt.toISOString(),
    hours: (r.paidSeconds ?? 0) / 3600,
    grossAmount: r.grossAmount ?? 0,
    netAmount: r.netAmount ?? 0,
  }));
}

export async function logHistoricalWeek(weekOf: Date, hours: number): Promise<void> {
  if (!(hours > 0)) throw new Error("Antal timer skal være positivt.");
  const userId = await getCurrentUserId();
  const { start, end } = getWeekRange(weekOf);

  const existing = await prisma.workSession.findFirst({
    where: { userId, checkInAt: { gte: start, lte: end } },
  });
  if (existing) throw new Error("Der er allerede registreret arbejde i denne uge.");

  const config = await getOrCreateWageSettings(userId);
  const [weekSecondsBefore, periodGrossBefore] = await Promise.all([
    priorWeekPaidSeconds(userId, start),
    priorPeriodGross(userId, start, config),
  ]);
  const { paidSeconds, grossAmount } = computeWeekGrossFromHours(hours, weekSecondsBefore, config);
  const netAmount = netForIncrement(periodGrossBefore, grossAmount, config);

  await prisma.workSession.create({
    data: {
      userId,
      checkInAt: start,
      checkOutAt: new Date(start.getTime() + paidSeconds * 1000),
      paidSeconds,
      grossAmount,
      netAmount,
      isManualEntry: true,
    },
  });
  revalidatePath("/indstillinger");
  revalidatePath("/");
}

export async function deleteHistoricalWeek(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  await prisma.workSession.deleteMany({ where: { id, userId, isManualEntry: true } });
  revalidatePath("/indstillinger");
  revalidatePath("/");
}
