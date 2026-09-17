"use server";

// Statistik & performance-dashboard — read-only aggregation over data that
// already exists elsewhere in the app (WorkSession, Task, QuantityLogEntry,
// TrailerWash, DriveInVisit, Note). Nothing here writes to the database or
// invents numbers: a stat that cannot be computed from real stored
// timestamps is reported via `dataNotes` instead of a guessed value.
//
// Timezone handling follows the same split established in src/lib/date.ts:
//  - The PERIOD boundaries below (day/week/month/custom) are computed with
//    the exact same naive-local helpers (startOfDay/getWeekRange/
//    getMonthRange) already used everywhere else in the app for
//    Task.scheduledFor — so "denne uge" here always means exactly the same
//    instants as "denne uge" on Kalender/forsiden. This is a range filter
//    (gte/lte), never an exact-match key, so it carries none of the old
//    orphaned-data risk.
//  - Anything DERIVED for display or bucketing — which hour of the day,
//    which weekday, which calendar day a timestamp falls in for the daily
//    chart — is computed Danish-timezone-correctly (Europe/Copenhagen),
//    exactly like formatTime/formatDayHeading already do, via Postgres'
//    `AT TIME ZONE 'Europe/Copenhagen'` in the raw aggregation queries
//    below. A shift that ends at 23:40 UTC (00:40/01:40 Danish) must bucket
//    into the Danish day/hour it actually happened in.
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { startOfDay, getWeekRange, getMonthRange, weekdayShort } from "@/lib/date";
import { zonedParts } from "@/lib/timezone";
import { getWageSettings } from "@/lib/actions/worksessions";

export type StatsPeriod = "day" | "week" | "month" | "custom";

export type PeriodInput = {
  period: StatsPeriod;
  /** ISO date string used as the reference day for day/week/month periods. Defaults to today. */
  anchor?: string;
  /** ISO date strings, inclusive, used only when period === "custom". */
  customStart?: string;
  customEnd?: string;
};

function endOfDay(date: Date): Date {
  const d = startOfDay(date);
  d.setHours(23, 59, 59, 999);
  return d;
}

function addDaysNaive(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

type Range = { start: Date; end: Date };

function resolveRanges(input: PeriodInput): { current: Range; previous: Range; label: string } {
  const anchor = input.anchor ? new Date(input.anchor) : new Date();

  if (input.period === "day") {
    const current = { start: startOfDay(anchor), end: endOfDay(anchor) };
    const yesterday = addDaysNaive(anchor, -1);
    const previous = { start: startOfDay(yesterday), end: endOfDay(yesterday) };
    return { current, previous, label: "Dag" };
  }

  if (input.period === "month") {
    const current = getMonthRange(anchor);
    const prevAnchor = new Date(anchor.getFullYear(), anchor.getMonth() - 1, 1);
    const previous = getMonthRange(prevAnchor);
    return { current, previous, label: "Måned" };
  }

  if (input.period === "custom" && input.customStart && input.customEnd) {
    const start = startOfDay(new Date(input.customStart));
    const end = endOfDay(new Date(input.customEnd));
    const durationMs = end.getTime() - start.getTime() + 1;
    const prevEnd = new Date(start.getTime() - 1);
    const prevStart = new Date(prevEnd.getTime() - durationMs + 1);
    return { current: { start, end }, previous: { start: prevStart, end: prevEnd }, label: "Periode" };
  }

  // default / "week"
  const current = getWeekRange(anchor);
  const previous = getWeekRange(addDaysNaive(anchor, -7));
  return { current, previous, label: "Uge" };
}

type HourRow = { hour: number; count: bigint | number };
type DowRow = { dow: number; count: bigint | number; seconds?: bigint | number; gross?: number };
type DayRow = { day: string; count?: bigint | number; gross?: number; net?: number; units?: bigint | number };

async function hourBuckets(userId: string, r: Range): Promise<{ hour: number; count: number }[]> {
  const buckets = Array.from({ length: 24 }, (_, hour) => ({ hour, count: 0 }));
  const [taskRows, qtyRows, washRows] = await Promise.all([
    prisma.$queryRaw<HourRow[]>`
      SELECT EXTRACT(HOUR FROM "completedAt" AT TIME ZONE 'Europe/Copenhagen')::int AS hour, COUNT(*)::bigint AS count
      FROM "Task"
      WHERE "userId" = ${userId} AND "completed" = true AND "deletedAt" IS NULL
        AND "completedAt" >= ${r.start} AND "completedAt" <= ${r.end}
      GROUP BY hour
    `,
    prisma.$queryRaw<HourRow[]>`
      SELECT EXTRACT(HOUR FROM "createdAt" AT TIME ZONE 'Europe/Copenhagen')::int AS hour,
             COALESCE(SUM(GREATEST("delta", 0)), 0)::bigint AS count
      FROM "QuantityLogEntry"
      WHERE "userId" = ${userId} AND "createdAt" >= ${r.start} AND "createdAt" <= ${r.end}
      GROUP BY hour
    `,
    prisma.$queryRaw<HourRow[]>`
      SELECT EXTRACT(HOUR FROM "washedAt" AT TIME ZONE 'Europe/Copenhagen')::int AS hour, COUNT(*)::bigint AS count
      FROM "TrailerWash"
      WHERE "userId" = ${userId} AND "washedAt" >= ${r.start} AND "washedAt" <= ${r.end}
      GROUP BY hour
    `,
  ]);
  for (const row of [...taskRows, ...qtyRows, ...washRows]) {
    const h = Number(row.hour);
    if (h >= 0 && h < 24) buckets[h].count += Number(row.count);
  }
  return buckets;
}

export type WeekdayBucket = { weekday: number; label: string; hours: number; gross: number; activity: number };

async function weekdayBuckets(userId: string, r: Range): Promise<WeekdayBucket[]> {
  const buckets: WeekdayBucket[] = Array.from({ length: 7 }, (_, dow) => ({
    weekday: dow,
    label: weekdayShort(dow),
    hours: 0,
    gross: 0,
    activity: 0,
  }));

  const [sessionRows, taskRows, washRows, qtyRows] = await Promise.all([
    prisma.$queryRaw<DowRow[]>`
      SELECT EXTRACT(DOW FROM "checkInAt" AT TIME ZONE 'Europe/Copenhagen')::int AS dow,
             COALESCE(SUM("paidSeconds"), 0)::bigint AS seconds,
             COALESCE(SUM("grossAmount"), 0)::float AS gross,
             COUNT(*)::bigint AS count
      FROM "WorkSession"
      WHERE "userId" = ${userId} AND "checkOutAt" IS NOT NULL
        AND "checkInAt" >= ${r.start} AND "checkInAt" <= ${r.end}
      GROUP BY dow
    `,
    prisma.$queryRaw<DowRow[]>`
      SELECT EXTRACT(DOW FROM "completedAt" AT TIME ZONE 'Europe/Copenhagen')::int AS dow, COUNT(*)::bigint AS count
      FROM "Task"
      WHERE "userId" = ${userId} AND "completed" = true AND "deletedAt" IS NULL
        AND "completedAt" >= ${r.start} AND "completedAt" <= ${r.end}
      GROUP BY dow
    `,
    prisma.$queryRaw<DowRow[]>`
      SELECT EXTRACT(DOW FROM "washedAt" AT TIME ZONE 'Europe/Copenhagen')::int AS dow, COUNT(*)::bigint AS count
      FROM "TrailerWash"
      WHERE "userId" = ${userId} AND "washedAt" >= ${r.start} AND "washedAt" <= ${r.end}
      GROUP BY dow
    `,
    prisma.$queryRaw<DowRow[]>`
      SELECT EXTRACT(DOW FROM "createdAt" AT TIME ZONE 'Europe/Copenhagen')::int AS dow,
             COALESCE(SUM(GREATEST("delta", 0)), 0)::bigint AS count
      FROM "QuantityLogEntry"
      WHERE "userId" = ${userId} AND "createdAt" >= ${r.start} AND "createdAt" <= ${r.end}
      GROUP BY dow
    `,
  ]);

  for (const row of sessionRows) {
    const d = Number(row.dow);
    buckets[d].hours += Number(row.seconds ?? 0) / 3600;
    buckets[d].gross += Number(row.gross ?? 0);
  }
  for (const row of [...taskRows, ...washRows, ...qtyRows]) {
    const d = Number(row.dow);
    buckets[d].activity += Number(row.count ?? 0);
  }
  return buckets;
}

export type DailyPoint = {
  dateKey: string;
  label: string;
  hours: number;
  gross: number;
  net: number;
  tasksCompleted: number;
  washes: number;
  quantityUnits: number;
};

async function dailySeries(userId: string, r: Range): Promise<DailyPoint[]> {
  const [sessionRows, taskRows, washRows, qtyRows] = await Promise.all([
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(("checkInAt" AT TIME ZONE 'Europe/Copenhagen')::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM("paidSeconds"), 0)::bigint AS count,
             COALESCE(SUM("grossAmount"), 0)::float AS gross,
             COALESCE(SUM("netAmount"), 0)::float AS net
      FROM "WorkSession"
      WHERE "userId" = ${userId} AND "checkOutAt" IS NOT NULL
        AND "checkInAt" >= ${r.start} AND "checkInAt" <= ${r.end}
      GROUP BY day
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(("completedAt" AT TIME ZONE 'Europe/Copenhagen')::date, 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
      FROM "Task"
      WHERE "userId" = ${userId} AND "completed" = true AND "deletedAt" IS NULL
        AND "completedAt" >= ${r.start} AND "completedAt" <= ${r.end}
      GROUP BY day
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(("washedAt" AT TIME ZONE 'Europe/Copenhagen')::date, 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
      FROM "TrailerWash"
      WHERE "userId" = ${userId} AND "washedAt" >= ${r.start} AND "washedAt" <= ${r.end}
      GROUP BY day
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'Europe/Copenhagen')::date, 'YYYY-MM-DD') AS day,
             COALESCE(SUM(GREATEST("delta", 0)), 0)::bigint AS count
      FROM "QuantityLogEntry"
      WHERE "userId" = ${userId} AND "createdAt" >= ${r.start} AND "createdAt" <= ${r.end}
      GROUP BY day
    `,
  ]);

  const byDay = new Map<string, DailyPoint>();
  const ensure = (key: string): DailyPoint => {
    let p = byDay.get(key);
    if (!p) {
      const [y, m, d] = key.split("-").map(Number);
      const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
      p = {
        dateKey: key,
        label: `${weekdayShort(dow)} ${d}/${m}`,
        hours: 0,
        gross: 0,
        net: 0,
        tasksCompleted: 0,
        washes: 0,
        quantityUnits: 0,
      };
      byDay.set(key, p);
    }
    return p;
  };

  for (const row of sessionRows) {
    const p = ensure(row.day);
    p.hours += Number(row.count ?? 0) / 3600;
    p.gross += Number(row.gross ?? 0);
    p.net += Number(row.net ?? 0);
  }
  for (const row of taskRows) ensure(row.day).tasksCompleted += Number(row.count ?? 0);
  for (const row of washRows) ensure(row.day).washes += Number(row.count ?? 0);
  for (const row of qtyRows) ensure(row.day).quantityUnits += Number(row.count ?? 0);

  return [...byDay.values()].sort((a, b) => a.dateKey.localeCompare(b.dateKey));
}

export type CategoryBreakdownRow = {
  categoryId: string | null;
  name: string;
  icon: string;
  color: string;
  completedTasks: number;
  quantityDone: number;
  quantityTotal: number | null;
};

async function categoryBreakdown(userId: string, r: Range): Promise<CategoryBreakdownRow[]> {
  const [categories, completedByCat, quantityByCat] = await Promise.all([
    prisma.category.findMany({ where: { userId, deletedAt: null }, orderBy: { order: "asc" } }),
    prisma.task.groupBy({
      by: ["categoryId"],
      where: {
        userId,
        deletedAt: null,
        isQuantityTask: false,
        completed: true,
        completedAt: { gte: r.start, lte: r.end },
      },
      _count: { _all: true },
    }),
    prisma.task.groupBy({
      by: ["categoryId"],
      where: { userId, deletedAt: null, isQuantityTask: true, scheduledFor: { gte: r.start, lte: r.end } },
      _sum: { quantityDone: true, quantityTotal: true },
    }),
  ]);

  const rows = new Map<string, CategoryBreakdownRow>();
  const ensure = (categoryId: string | null): CategoryBreakdownRow => {
    const key = categoryId ?? "__none__";
    let row = rows.get(key);
    if (!row) {
      const cat = categories.find((c) => c.id === categoryId);
      row = {
        categoryId,
        name: cat?.name ?? "Uden kategori",
        icon: cat?.icon ?? "📦",
        color: cat?.color ?? "#64748b",
        completedTasks: 0,
        quantityDone: 0,
        quantityTotal: null,
      };
      rows.set(key, row);
    }
    return row;
  };

  for (const g of completedByCat) ensure(g.categoryId).completedTasks += g._count._all;
  for (const g of quantityByCat) {
    const row = ensure(g.categoryId);
    row.quantityDone += g._sum.quantityDone ?? 0;
    row.quantityTotal = (row.quantityTotal ?? 0) + (g._sum.quantityTotal ?? 0);
  }

  return [...rows.values()]
    .filter((row) => row.completedTasks > 0 || row.quantityDone > 0)
    .sort((a, b) => b.completedTasks + b.quantityDone - (a.completedTasks + a.quantityDone));
}

export type RecordRow = { label: string; value: string; dateLabel: string | null };

async function personalRecords(userId: string): Promise<RecordRow[]> {
  const [longestShift, bestGrossDay, bestWashDay, bestQtyDay, earliestCheckIn, latestCheckOut] = await Promise.all([
    prisma.workSession.findFirst({
      where: { userId, checkOutAt: { not: null } },
      orderBy: { paidSeconds: "desc" },
      select: { paidSeconds: true, checkInAt: true },
    }),
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(("checkInAt" AT TIME ZONE 'Europe/Copenhagen')::date, 'YYYY-MM-DD') AS day, SUM("grossAmount")::float AS gross
      FROM "WorkSession" WHERE "userId" = ${userId} AND "checkOutAt" IS NOT NULL
      GROUP BY day ORDER BY gross DESC NULLS LAST LIMIT 1
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(("washedAt" AT TIME ZONE 'Europe/Copenhagen')::date, 'YYYY-MM-DD') AS day, COUNT(*)::bigint AS count
      FROM "TrailerWash" WHERE "userId" = ${userId} GROUP BY day ORDER BY count DESC LIMIT 1
    `,
    prisma.$queryRaw<DayRow[]>`
      SELECT to_char(("createdAt" AT TIME ZONE 'Europe/Copenhagen')::date, 'YYYY-MM-DD') AS day,
             SUM(GREATEST("delta", 0))::bigint AS units
      FROM "QuantityLogEntry" WHERE "userId" = ${userId} GROUP BY day ORDER BY units DESC LIMIT 1
    `,
    prisma.$queryRaw<{ checkInAt: Date }[]>`
      SELECT "checkInAt" FROM "WorkSession" WHERE "userId" = ${userId}
      ORDER BY (EXTRACT(HOUR FROM "checkInAt" AT TIME ZONE 'Europe/Copenhagen') * 60
               + EXTRACT(MINUTE FROM "checkInAt" AT TIME ZONE 'Europe/Copenhagen')) ASC LIMIT 1
    `,
    prisma.$queryRaw<{ checkOutAt: Date }[]>`
      SELECT "checkOutAt" FROM "WorkSession" WHERE "userId" = ${userId} AND "checkOutAt" IS NOT NULL
      ORDER BY (EXTRACT(HOUR FROM "checkOutAt" AT TIME ZONE 'Europe/Copenhagen') * 60
               + EXTRACT(MINUTE FROM "checkOutAt" AT TIME ZONE 'Europe/Copenhagen')) DESC LIMIT 1
    `,
  ]);

  const records: RecordRow[] = [];
  if (longestShift?.paidSeconds) {
    const h = Math.floor(longestShift.paidSeconds / 3600);
    const m = Math.round((longestShift.paidSeconds % 3600) / 60);
    records.push({ label: "Længste vagt", value: `${h}t ${m}min`, dateLabel: dayLabel(longestShift.checkInAt) });
  }
  if (bestGrossDay[0]?.gross) {
    records.push({
      label: "Højeste dagsindtjening",
      value: `${Math.round(bestGrossDay[0].gross)} kr`,
      dateLabel: dayKeyLabel(bestGrossDay[0].day),
    });
  }
  if (bestWashDay[0]?.count) {
    records.push({
      label: "Flest vasker på én dag",
      value: `${Number(bestWashDay[0].count)} trailere`,
      dateLabel: dayKeyLabel(bestWashDay[0].day),
    });
  }
  if (bestQtyDay[0]?.units) {
    records.push({
      label: "Flest optællinger på én dag",
      value: `${Number(bestQtyDay[0].units)} stk`,
      dateLabel: dayKeyLabel(bestQtyDay[0].day),
    });
  }
  if (earliestCheckIn[0]?.checkInAt) {
    records.push({ label: "Tidligste tjek-ind", value: timeLabel(earliestCheckIn[0].checkInAt), dateLabel: dayLabel(earliestCheckIn[0].checkInAt) });
  }
  if (latestCheckOut[0]?.checkOutAt) {
    records.push({ label: "Seneste tjek-ud", value: timeLabel(latestCheckOut[0].checkOutAt), dateLabel: dayLabel(latestCheckOut[0].checkOutAt) });
  }
  return records;
}

function dayLabel(date: Date): string {
  const { year, month, day } = zonedParts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

function dayKeyLabel(key: string): string {
  const [y, m, d] = key.split("-");
  return `${d}/${m}/${y}`;
}

function timeLabel(date: Date): string {
  const { hour, minute } = zonedParts(date);
  return `${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
}

export type TimelineEvent = { timeIso: string; timeLabel: string; type: "task" | "wash" | "quantity" | "driveIn"; label: string };
export type TimelineDay = {
  dateKey: string;
  checkInIso: string | null;
  checkOutIso: string | null;
  isOpen: boolean;
  breakStartMinutes: number;
  breakEndMinutes: number;
  events: TimelineEvent[];
} | null;

async function todayTimeline(userId: string): Promise<TimelineDay> {
  const now = new Date();
  const r = { start: startOfDay(now), end: endOfDay(now) };

  const [session, config, tasks, washes, qty, visits] = await Promise.all([
    prisma.workSession.findFirst({
      where: { userId, checkInAt: { lte: r.end }, OR: [{ checkOutAt: null }, { checkOutAt: { gte: r.start } }] },
      orderBy: { checkInAt: "desc" },
    }),
    getWageSettings(),
    prisma.task.findMany({
      where: { userId, deletedAt: null, completed: true, completedAt: { gte: r.start, lte: r.end } },
      select: { title: true, completedAt: true },
    }),
    prisma.trailerWash.findMany({
      where: { userId, washedAt: { gte: r.start, lte: r.end } },
      include: { trailer: true },
    }),
    prisma.quantityLogEntry.findMany({
      where: { userId, createdAt: { gte: r.start, lte: r.end }, delta: { gt: 0 } },
      include: { task: { include: { category: true } } },
    }),
    prisma.driveInVisit.findMany({
      where: { userId, visitedAt: { gte: r.start, lte: r.end } },
      include: { customer: true },
    }),
  ]);

  const events: TimelineEvent[] = [
    ...tasks.map((t) => ({
      timeIso: t.completedAt!.toISOString(),
      timeLabel: timeLabel(t.completedAt!),
      type: "task" as const,
      label: `Opgave fuldført: ${t.title}`,
    })),
    ...washes.map((w) => ({
      timeIso: w.washedAt.toISOString(),
      timeLabel: timeLabel(w.washedAt),
      type: "wash" as const,
      label: `Vasket trailer #${w.trailer.number}`,
    })),
    ...qty.map((q) => ({
      timeIso: q.createdAt.toISOString(),
      timeLabel: timeLabel(q.createdAt),
      type: "quantity" as const,
      label: `+${q.delta} ${q.task.category?.name ?? q.task.title}`,
    })),
    ...visits.map((v) => ({
      timeIso: v.visitedAt.toISOString(),
      timeLabel: timeLabel(v.visitedAt),
      type: "driveIn" as const,
      label: `Drive-in: ${v.customer.licensePlateDisplay}`,
    })),
  ].sort((a, b) => a.timeIso.localeCompare(b.timeIso));

  if (!session && events.length === 0) return null;

  return {
    dateKey: zonedParts(now).year + "-" + String(zonedParts(now).month).padStart(2, "0") + "-" + String(zonedParts(now).day).padStart(2, "0"),
    checkInIso: session?.checkInAt.toISOString() ?? null,
    checkOutIso: session?.checkOutAt?.toISOString() ?? null,
    isOpen: session ? !session.checkOutAt : false,
    breakStartMinutes: config.breakStartMinutes,
    breakEndMinutes: config.breakEndMinutes,
    events,
  };
}

export type DashboardKpis = {
  hoursWorked: number;
  grossAmount: number;
  netAmount: number;
  tasksTotal: number;
  tasksCompleted: number;
  quantityUnitsDone: number;
  washes: number;
  driveIns: number;
  problemsLogged: number;
  problemsResolved: number;
};

async function kpisFor(userId: string, r: Range): Promise<DashboardKpis> {
  const [sessions, tasksTotal, tasksCompleted, quantityAgg, washes, driveIns, problemsLogged, problemsResolved] =
    await Promise.all([
      prisma.workSession.aggregate({
        where: { userId, checkOutAt: { not: null }, checkInAt: { gte: r.start, lte: r.end } },
        _sum: { paidSeconds: true, grossAmount: true, netAmount: true },
      }),
      prisma.task.count({ where: { userId, deletedAt: null, scheduledFor: { gte: r.start, lte: r.end } } }),
      prisma.task.count({
        where: { userId, deletedAt: null, completed: true, completedAt: { gte: r.start, lte: r.end } },
      }),
      prisma.quantityLogEntry.aggregate({
        where: { userId, createdAt: { gte: r.start, lte: r.end }, delta: { gt: 0 } },
        _sum: { delta: true },
      }),
      prisma.trailerWash.count({ where: { userId, washedAt: { gte: r.start, lte: r.end } } }),
      prisma.driveInVisit.count({ where: { userId, visitedAt: { gte: r.start, lte: r.end } } }),
      prisma.note.count({ where: { userId, isProblem: true, createdAt: { gte: r.start, lte: r.end } } }),
      prisma.note.count({ where: { userId, isProblem: true, resolved: true, resolvedAt: { gte: r.start, lte: r.end } } }),
    ]);

  return {
    hoursWorked: (sessions._sum.paidSeconds ?? 0) / 3600,
    grossAmount: sessions._sum.grossAmount ?? 0,
    netAmount: sessions._sum.netAmount ?? 0,
    tasksTotal,
    tasksCompleted,
    quantityUnitsDone: quantityAgg._sum.delta ?? 0,
    washes,
    driveIns,
    problemsLogged,
    problemsResolved,
  };
}

export type DashboardData = {
  period: StatsPeriod;
  rangeLabel: string;
  rangeStartIso: string;
  rangeEndIso: string;
  kpis: DashboardKpis;
  previousKpis: DashboardKpis;
  dailySeries: DailyPoint[];
  hourOfDay: { hour: number; count: number }[];
  weekdays: WeekdayBucket[];
  categoryBreakdown: CategoryBreakdownRow[];
  washStats: {
    total: number;
    byCompany: { company: string; count: number }[];
    busiestWeekdayLabel: string | null;
  };
  productivity: {
    itemsPerHour: number | null;
    itemsCount: number;
    hoursWorked: number;
  };
  records: RecordRow[];
  timelineToday: TimelineDay;
  insights: string[];
  dataNotes: string[];
};

export async function getStatisticsDashboard(input: PeriodInput): Promise<DashboardData> {
  const userId = await getCurrentUserId();
  const { current, previous, label } = resolveRanges(input);

  const [kpis, previousKpis, series, hours, weekdays, categories, washByCompany, records, timelineToday] =
    await Promise.all([
      kpisFor(userId, current),
      kpisFor(userId, previous),
      dailySeries(userId, current),
      hourBuckets(userId, current),
      weekdayBuckets(userId, current),
      categoryBreakdown(userId, current),
      prisma.trailerWash.groupBy({
        by: ["company"],
        where: { userId, washedAt: { gte: current.start, lte: current.end } },
        _count: { _all: true },
      }),
      personalRecords(userId),
      todayTimeline(userId),
    ]);

  const busiestWeekday = [...weekdays].sort((a, b) => b.activity - a.activity)[0];
  const itemsCount = kpis.tasksCompleted + kpis.quantityUnitsDone + kpis.washes;

  const insights: string[] = [];
  if (kpis.hoursWorked === 0 && itemsCount === 0) {
    insights.push("Ingen aktivitet registreret i denne periode endnu.");
  } else {
    if (previousKpis.hoursWorked > 0) {
      const diffPct = Math.round(((kpis.hoursWorked - previousKpis.hoursWorked) / previousKpis.hoursWorked) * 100);
      if (diffPct !== 0) {
        insights.push(
          `Du har arbejdet ${Math.abs(diffPct)}% ${diffPct > 0 ? "mere" : "mindre"} end forrige periode (${kpis.hoursWorked.toFixed(1)}t mod ${previousKpis.hoursWorked.toFixed(1)}t).`
        );
      }
    }
    const peakHour = [...hours].sort((a, b) => b.count - a.count)[0];
    if (peakHour && peakHour.count > 0) {
      insights.push(`Du er mest aktiv omkring kl. ${String(peakHour.hour).padStart(2, "0")}:00 (${peakHour.count} registreringer).`);
    }
    if (busiestWeekday && busiestWeekday.activity > 0) {
      insights.push(`${capitalize(busiestWeekday.label)} er din mest aktive ugedag i denne periode (${busiestWeekday.activity} registreringer).`);
    }
    const topCategory = [...categories].sort((a, b) => b.completedTasks + b.quantityDone - (a.completedTasks + a.quantityDone))[0];
    if (topCategory) {
      const count = topCategory.completedTasks + topCategory.quantityDone;
      insights.push(`${topCategory.icon} ${topCategory.name} er den kategori du har brugt mest tid på (${count} registreringer).`);
    }
    const topCompany = [...washByCompany].sort((a, b) => b._count._all - a._count._all)[0];
    if (topCompany?.company) {
      insights.push(`${topCompany.company} er den største kunde for vask i denne periode (${topCompany._count._all} trailere).`);
    }
  }

  return {
    period: input.period,
    rangeLabel: label,
    rangeStartIso: current.start.toISOString(),
    rangeEndIso: current.end.toISOString(),
    kpis,
    previousKpis,
    dailySeries: series,
    hourOfDay: hours,
    weekdays,
    categoryBreakdown: categories,
    washStats: {
      total: kpis.washes,
      byCompany: washByCompany.map((w) => ({ company: w.company ?? "Ukendt", count: w._count._all })),
      busiestWeekdayLabel: busiestWeekday && busiestWeekday.activity > 0 ? capitalize(busiestWeekday.label) : null,
    },
    productivity: {
      itemsPerHour: kpis.hoursWorked > 0 ? itemsCount / kpis.hoursWorked : null,
      itemsCount,
      hoursWorked: kpis.hoursWorked,
    },
    records,
    timelineToday,
    insights,
    dataNotes: [
      "Gennemsnitlig tid pr. almindelig opgave kan ikke beregnes — appen registrerer ikke starttidspunkt for almindelige opgaver, kun for optællinger og vagter. Der mangler tidsdata for at beregne dette.",
      "Korteste/længste registrerede vask kan ikke beregnes — der gemmes kun ét tidspunkt pr. vask, ikke start og slut. Der mangler tidsdata for at beregne dette.",
    ],
  };
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}
