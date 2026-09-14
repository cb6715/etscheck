// Pure wage-calculation math, kept free of Prisma/DB access so it can be
// unit-tested and reused identically on both the server (checkout) and the
// client (the live per-second counter).

// All break/overtime/night clock-time logic is anchored to Danish wall-clock
// time explicitly, rather than the executing JS runtime's local timezone.
// That matters because this same code runs on the server (Netlify Functions
// run in UTC) AND in the browser (Danish local time) — without this, "12:00
// pause" would mean a different instant depending on which side evaluated
// it, and the two could disagree on gross/net for the same shift.
import { zonedParts, zonedDateTime, copenhagenStartOfDay as startOfLocalDay, addCalendarDays } from "@/lib/timezone";

export type WageConfig = {
  hourlyRate: number;
  overtimeThresholdHours: number;
  overtimeBonusPct: number;
  nightSupplement: number;
  nightStartHour: number;
  nightEndHour: number;
  breakStartMinutes: number;
  breakEndMinutes: number;
  monthlyTaxDeduction: number;
  amBidragPct: number;
  taxRatePct: number;
  /** ATP-bidrag kr/time — a small mandatory pension contribution deducted
   * from gross BEFORE AM-bidrag is calculated on what's left. */
  atpRatePerHour: number;
  /** Current pay period — the skattefradrag threshold is tracked across
   * this window, not the calendar month (pay periods don't necessarily
   * run 1st-to-last). Updated manually in settings when a new period starts. */
  payPeriodStart: Date;
  payPeriodEnd: Date;
};

export const DEFAULT_WAGE_CONFIG: WageConfig = {
  hourlyRate: 150,
  overtimeThresholdHours: 37,
  overtimeBonusPct: 0.6,
  nightSupplement: 25,
  nightStartHour: 17,
  nightEndHour: 5,
  breakStartMinutes: 12 * 60,
  breakEndMinutes: 12 * 60 + 30,
  monthlyTaxDeduction: 5100,
  amBidragPct: 0.08,
  taxRatePct: 0.44,
  atpRatePerHour: 0.6822,
  payPeriodStart: new Date(2026, 7, 24),
  payPeriodEnd: new Date(2026, 8, 20),
};

function atMinuteOfDay(day: Date, minutes: number): Date {
  const { year, month, day: d } = zonedParts(day);
  return zonedDateTime(year, month, d, Math.floor(minutes / 60), minutes % 60);
}

/** [start, end) of the configured pay period — end is exclusive, i.e. the
 * instant right after the last (inclusive) calendar day of the period. */
export function getPayPeriodRange(config: Pick<WageConfig, "payPeriodStart" | "payPeriodEnd">): {
  start: Date;
  end: Date;
} {
  const start = startOfLocalDay(config.payPeriodStart);
  const end = addCalendarDays(startOfLocalDay(config.payPeriodEnd), 1);
  return { start, end };
}

/** Last weekday (Mon-Fri) of the given date's month — an approximation of
 * "sidste business dag i måneden" that doesn't account for helligdage. */
export function lastWeekdayOfMonth(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth() + 1, 0);
  while (d.getDay() === 0 || d.getDay() === 6) {
    d.setDate(d.getDate() - 1);
  }
  return d;
}

/**
 * Every clock-time boundary (break start/end, night start/end) that falls
 * strictly inside (start, end), across every calendar day the interval
 * spans — plus start/end themselves. Splitting on these first means every
 * resulting chunk has a single, unambiguous break/night status throughout.
 */
function collectBoundaries(start: Date, end: Date, config: WageConfig): Date[] {
  const times = new Set<number>([start.getTime(), end.getTime()]);
  let dayCursor = startOfLocalDay(start);
  const markers = [
    config.nightEndHour * 60,
    config.breakStartMinutes,
    config.breakEndMinutes,
    config.nightStartHour * 60,
  ];
  let guard = 0;
  while (dayCursor.getTime() <= end.getTime() && guard < 400) {
    for (const minutes of markers) {
      const t = atMinuteOfDay(dayCursor, minutes);
      if (t.getTime() > start.getTime() && t.getTime() < end.getTime()) {
        times.add(t.getTime());
      }
    }
    dayCursor = addCalendarDays(dayCursor, 1);
    guard++;
  }
  return [...times].sort((a, b) => a - b).map((t) => new Date(t));
}

function isBreakMoment(date: Date, config: WageConfig): boolean {
  const { hour, minute } = zonedParts(date);
  const minuteOfDay = hour * 60 + minute;
  return minuteOfDay >= config.breakStartMinutes && minuteOfDay < config.breakEndMinutes;
}

function isNightMoment(date: Date, config: WageConfig): boolean {
  const { hour } = zonedParts(date);
  return hour >= config.nightStartHour || hour < config.nightEndHour;
}

export type IntervalEarnings = {
  /** Paid seconds elapsed in [start, end), i.e. excluding the unpaid break. */
  paidSeconds: number;
  /** Gross kr earned in [start, end), given what came before it this week. */
  grossAmount: number;
};

/**
 * Gross pay for the interval [start, end), given how many paid seconds were
 * already worked earlier this week (so the 37-timers-overtime threshold can
 * be crossed mid-interval). Handles a chunk straddling the threshold by
 * splitting it into a normal-rate part and an overtime-rate part.
 */
export function computeIntervalEarnings(
  start: Date,
  end: Date,
  priorWeekPaidSeconds: number,
  config: WageConfig
): IntervalEarnings {
  if (end <= start) return { paidSeconds: 0, grossAmount: 0 };

  const boundaries = collectBoundaries(start, end, config);
  const thresholdSeconds = config.overtimeThresholdHours * 3600;

  let cumulativePaidSeconds = priorWeekPaidSeconds;
  let paidSeconds = 0;
  let grossAmount = 0;

  const addSegment = (durationSeconds: number, isNight: boolean, isOvertime: boolean) => {
    const rate =
      config.hourlyRate * (isOvertime ? 1 + config.overtimeBonusPct : 1) +
      (isNight ? config.nightSupplement : 0);
    grossAmount += (rate / 3600) * durationSeconds;
    paidSeconds += durationSeconds;
    cumulativePaidSeconds += durationSeconds;
  };

  for (let i = 0; i < boundaries.length - 1; i++) {
    const t0 = boundaries[i];
    const t1 = boundaries[i + 1];
    const durationSeconds = (t1.getTime() - t0.getTime()) / 1000;
    if (durationSeconds <= 0) continue;

    const midpoint = new Date((t0.getTime() + t1.getTime()) / 2);
    if (isBreakMoment(midpoint, config)) continue; // unpaid, doesn't count towards paidSeconds either

    const isNight = isNightMoment(midpoint, config);
    let remaining = durationSeconds;

    if (cumulativePaidSeconds < thresholdSeconds) {
      const normalPart = Math.min(remaining, thresholdSeconds - cumulativePaidSeconds);
      addSegment(normalPart, isNight, false);
      remaining -= normalPart;
    }
    if (remaining > 0) {
      addSegment(remaining, isNight, true);
    }
  }

  return { paidSeconds, grossAmount };
}

/**
 * Gross pay for a week given only its total hours (no time-of-day detail),
 * used for backfilling a week retroactively — assumes every hour is a day
 * hour (no nattillæg), only the 37-timers overtime split is applied.
 */
export function computeWeekGrossFromHours(
  hours: number,
  priorWeekPaidSeconds: number,
  config: WageConfig
): IntervalEarnings {
  const paidSeconds = Math.round(hours * 3600);
  const thresholdSeconds = config.overtimeThresholdHours * 3600;
  const normalSeconds = Math.max(0, Math.min(paidSeconds, thresholdSeconds - priorWeekPaidSeconds));
  const overtimeSeconds = paidSeconds - normalSeconds;
  const grossAmount =
    (normalSeconds / 3600) * config.hourlyRate + (overtimeSeconds / 3600) * config.hourlyRate * (1 + config.overtimeBonusPct);
  return { paidSeconds, grossAmount };
}

/**
 * Absolute net kr for a given cumulative period gross (kr) and cumulative
 * paid seconds — ATP is deducted from gross first (it scales with hours,
 * not kr), THEN AM-bidrag is calculated on what's left, matching the order
 * a real lønseddel uses (AM-indkomst = gross - ATP).
 */
export function netForCumulative(cumulativeGross: number, cumulativePaidSeconds: number, config: WageConfig): number {
  const atp = (cumulativePaidSeconds / 3600) * config.atpRatePerHour;
  const amBase = cumulativeGross - atp;
  const amBidrag = amBase * config.amBidragPct;
  const taxableIncome = Math.max(0, amBase - amBidrag - config.monthlyTaxDeduction);
  const tax = taxableIncome * config.taxRatePct;
  return cumulativeGross - atp - amBidrag - tax;
}

/**
 * Net kr attributable to an increment of `incrementGross` kr /
 * `incrementPaidSeconds` seconds, given what already came before it in the
 * period — correctly prorates across the skattefradrag threshold if the
 * increment straddles it.
 */
export function netForIncrement(
  priorGross: number,
  priorPaidSeconds: number,
  incrementGross: number,
  incrementPaidSeconds: number,
  config: WageConfig
): number {
  return (
    netForCumulative(priorGross + incrementGross, priorPaidSeconds + incrementPaidSeconds, config) -
    netForCumulative(priorGross, priorPaidSeconds, config)
  );
}
