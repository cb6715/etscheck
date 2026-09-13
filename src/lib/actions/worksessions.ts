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
  const config = await prisma.wageSettings.update({ where: { userId }, data: input });
  // Pay period dates may have just changed, which shifts which sessions
  // count as "prior" for every net figure in the period.
  await rebalancePeriodNetAmounts(userId, config);
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

// Re-derives netAmount for every session in the current pay period, in
// chronological order. Needed because a session's net share depends on how
// much gross came *before* it in the period — inserting a manual week out
// of date order (e.g. logging last week's hours after this week's) would
// otherwise leave earlier-inserted sessions with a stale, wrong net figure
// computed against an incomplete picture of the period.
async function rebalancePeriodNetAmounts(userId: string, config: WageConfig) {
  const { start, end } = getPayPeriodRange(config);
  const sessions = await prisma.workSession.findMany({
    where: { userId, checkOutAt: { not: null }, checkInAt: { gte: start, lt: end } },
    orderBy: { checkInAt: "asc" },
    select: { id: true, grossAmount: true, netAmount: true },
  });

  let cumulativeGross = 0;
  for (const s of sessions) {
    const gross = s.grossAmount ?? 0;
    const net = netForIncrement(cumulativeGross, gross, config);
    cumulativeGross += gross;
    if (Math.abs((s.netAmount ?? 0) - net) > 0.001) {
      await prisma.workSession.update({ where: { id: s.id }, data: { netAmount: net } });
    }
  }
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
    await rebalancePeriodNetAmounts(userId, config);
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
  /** false if this week falls outside the currently configured pay period
   * — it's kept in the list but doesn't count toward the period's total. */
  inPeriod: boolean;
};

// Weeks logged as a single "worked X hours" total (no tjek-ind/ud), used to
// bridge the gap between a pay period's start and when tjek-ind/ud started
// being used. Kept separate (isManualEntry) so it's distinguishable/deletable.
export async function getHistoricalWeeks(): Promise<HistoricalWeek[]> {
  const userId = await getCurrentUserId();
  const [rows, config] = await Promise.all([
    prisma.workSession.findMany({
      where: { userId, isManualEntry: true },
      orderBy: { checkInAt: "asc" },
    }),
    getOrCreateWageSettings(userId),
  ]);
  const { start, end } = getPayPeriodRange(config);
  return rows.map((r) => ({
    id: r.id,
    weekStart: r.checkInAt.toISOString(),
    hours: (r.paidSeconds ?? 0) / 3600,
    grossAmount: r.grossAmount ?? 0,
    netAmount: r.netAmount ?? 0,
    inPeriod: r.checkInAt >= start && r.checkInAt < end,
  }));
}

async function insertManualWeek(userId: string, weekOf: Date, hours: number): Promise<"inserted" | "exists"> {
  const { start, end } = getWeekRange(weekOf);

  const existing = await prisma.workSession.findFirst({
    where: { userId, checkInAt: { gte: start, lte: end } },
  });
  if (existing) return "exists";

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
  await rebalancePeriodNetAmounts(userId, config);
  return "inserted";
}

export async function logHistoricalWeek(weekOf: Date, hours: number): Promise<void> {
  if (!(hours > 0)) throw new Error("Antal timer skal være positivt.");
  const userId = await getCurrentUserId();
  const result = await insertManualWeek(userId, weekOf, hours);
  if (result === "exists") throw new Error("Der er allerede registreret arbejde i denne uge.");
  revalidatePath("/indstillinger");
  revalidatePath("/");
}

export async function deleteHistoricalWeek(id: string): Promise<void> {
  const userId = await getCurrentUserId();
  await prisma.workSession.deleteMany({ where: { id, userId, isManualEntry: true } });
  const config = await getOrCreateWageSettings(userId);
  await rebalancePeriodNetAmounts(userId, config);
  revalidatePath("/indstillinger");
  revalidatePath("/");
}

// One-off helper for the 3 weeks worked before tjek-ind/ud existed (24/8:
// 42.5t, 31/8: 36.5t, 7/9: 46t) — inserted in order so each week's gross
// correctly builds on the ones before it. Safe to call more than once:
// any week that's already logged is skipped rather than duplicated.
const KNOWN_STARTUP_WEEKS: { weekOf: Date; hours: number }[] = [
  { weekOf: new Date(2026, 7, 24), hours: 42.5 },
  { weekOf: new Date(2026, 7, 31), hours: 36.5 },
  { weekOf: new Date(2026, 8, 7), hours: 46 },
];

export async function seedKnownHistoricalWeeks(): Promise<{ inserted: number; skipped: number }> {
  const userId = await getCurrentUserId();
  let inserted = 0;
  let skipped = 0;
  for (const w of KNOWN_STARTUP_WEEKS) {
    const result = await insertManualWeek(userId, w.weekOf, w.hours);
    if (result === "inserted") inserted++;
    else skipped++;
  }
  revalidatePath("/indstillinger");
  revalidatePath("/");
  return { inserted, skipped };
}
