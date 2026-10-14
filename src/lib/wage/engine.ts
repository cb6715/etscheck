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
  /** Salary advance (forskud) already paid out for the current pay period,
   * in kr — subtracted from the period's net total so what's shown matches
   * what's actually still outstanding. Reset manually in settings whenever
   * a new pay period starts, same as the period dates. */
  advanceAmount: number;
  /** Current pay period — the skattefradrag threshold is tracked across
   * this window, not the calendar month (pay periods don't necessarily
   * run 1st-to-last). Updated manually in settings when a new period starts. */
  payPeriodStart: Date;
  payPeriodEnd: Date;
  /** Flat kr/time paid for a registered sygedag — no overtime or night
   * tillæg, and the hours don't count as "worked" for the overtime
   * threshold, but they still count toward the period's gross/ATP like
   * any other paid hours. */
  sickPayHourlyRate: number;
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
  advanceAmount: 0,
  payPeriodStart: new Date(2026, 7, 24),
  payPeriodEnd: new Date(2026, 8, 20),
  sickPayHourlyRate: 132,
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
 * Gross pay for a registered sygedag spanning [start, end) (the scheduled
 * shift the person would otherwise have worked) — a flat `sickHourlyRate`
 * per hour, minus the configured unpaid break if it falls inside the span.
 * Deliberately has no overtime or night-tillæg concept: a sick day is paid
 * at a single flat rate regardless of which hours it covers.
 */
export function computeSickDayEarnings(
  start: Date,
  end: Date,
  sickHourlyRate: number,
  config: Pick<WageConfig, "breakStartMinutes" | "breakEndMinutes">
): IntervalEarnings {
  if (end <= start) return { paidSeconds: 0, grossAmount: 0 };

  const breakStart = atMinuteOfDay(start, config.breakStartMinutes);
  const breakEnd = atMinuteOfDay(start, config.breakEndMinutes);
  const overlapStart = new Date(Math.max(start.getTime(), breakStart.getTime()));
  const overlapEnd = new Date(Math.min(end.getTime(), breakEnd.getTime()));
  const breakSeconds = overlapEnd > overlapStart ? (overlapEnd.getTime() - overlapStart.getTime()) / 1000 : 0;

  const paidSeconds = (end.getTime() - start.getTime()) / 1000 - breakSeconds;
  const grossAmount = (paidSeconds / 3600) * sickHourlyRate;
  return { paidSeconds, grossAmount };
}

/**
 * The 37-timers overtime threshold is pro-rated for a work week shorter
 * than 5 days: the configured threshold assumes a 5-day week, i.e.
 * `overtimeThresholdHours / 5` "normal" hours per worked day. A week where
 * only 4 distinct calendar days end up having a shift therefore has a
 * threshold of round(37/5 × 4) = 30 timer, not the full 37 — a 5th day
 * worked later in that same week still only brings it back up to the full
 * 37, it never grows past that. `workedDaysThisWeek` should count distinct
 * calendar days with at least one shift so far this ISO week, including
 * today.
 */
export function weeklyOvertimeThresholdHours(
  workedDaysThisWeek: number,
  config: Pick<WageConfig, "overtimeThresholdHours">
): number {
  if (workedDaysThisWeek >= 5) return config.overtimeThresholdHours;
  const perDay = config.overtimeThresholdHours / 5;
  return Math.round(perDay * Math.max(1, workedDaysThisWeek));
}

/**
 * Gross pay for the interval [start, end), given how many seconds of
 * ELAPSED shift time (not paid time — see below) already happened earlier
 * this week, so the overtime threshold can be crossed mid-interval. Handles
 * a chunk straddling the threshold by splitting it into a normal-rate part
 * and an overtime-rate part. `thresholdHours` is the ALREADY pro-rated
 * weekly threshold for this specific week (see weeklyOvertimeThresholdHours
 * above) — this function itself has no opinion on day-count pro-rating, it
 * just applies whatever threshold it's given.
 *
 * The threshold is measured against ELAPSED clock time (the full shift
 * span, including the unpaid break), not against paid seconds. An unpaid
 * break doesn't stop your clock towards overtime — you're still "on the
 * clock" time-wise for that half hour, you just don't get paid kr for it.
 * Concretely: the break segment below still contributes 0 kr and 0
 * paidSeconds, but its duration still advances `cumulativeElapsedSeconds`,
 * so a shift with a 30-min unpaid break reaches its first overtime second
 * exactly 30 minutes later in the clock than it otherwise would — not 30
 * minutes later than "hours actually paid so far", which is what the
 * previous, wrong implementation compared against.
 */
export function computeIntervalEarnings(
  start: Date,
  end: Date,
  priorWeekElapsedSeconds: number,
  thresholdHours: number,
  config: WageConfig
): IntervalEarnings {
  if (end <= start) return { paidSeconds: 0, grossAmount: 0 };

  const boundaries = collectBoundaries(start, end, config);
  const thresholdSeconds = thresholdHours * 3600;

  let cumulativeElapsedSeconds = priorWeekElapsedSeconds;
  let paidSeconds = 0;
  let grossAmount = 0;

  const addSegment = (durationSeconds: number, isNight: boolean, isOvertime: boolean) => {
    const rate =
      config.hourlyRate * (isOvertime ? 1 + config.overtimeBonusPct : 1) +
      (isNight ? config.nightSupplement : 0);
    grossAmount += (rate / 3600) * durationSeconds;
    paidSeconds += durationSeconds;
  };

  for (let i = 0; i < boundaries.length - 1; i++) {
    const t0 = boundaries[i];
    const t1 = boundaries[i + 1];
    const durationSeconds = (t1.getTime() - t0.getTime()) / 1000;
    if (durationSeconds <= 0) continue;

    const midpoint = new Date((t0.getTime() + t1.getTime()) / 2);
    if (isBreakMoment(midpoint, config)) {
      cumulativeElapsedSeconds += durationSeconds; // unpaid, but still counts towards the overtime clock
      continue;
    }

    const isNight = isNightMoment(midpoint, config);
    let remaining = durationSeconds;

    if (cumulativeElapsedSeconds < thresholdSeconds) {
      const normalPart = Math.min(remaining, thresholdSeconds - cumulativeElapsedSeconds);
      addSegment(normalPart, isNight, false);
      cumulativeElapsedSeconds += normalPart;
      remaining -= normalPart;
    }
    if (remaining > 0) {
      addSegment(remaining, isNight, true);
      cumulativeElapsedSeconds += remaining;
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
  priorWeekElapsedSeconds: number,
  config: WageConfig
): IntervalEarnings {
  const paidSeconds = Math.round(hours * 3600);
  const thresholdSeconds = config.overtimeThresholdHours * 3600;
  const normalSeconds = Math.max(0, Math.min(paidSeconds, thresholdSeconds - priorWeekElapsedSeconds));
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
  // Subtracting a flat advance here (rather than per session) cancels out in
  // netForIncrement's subtraction of two netForCumulative calls, so stored
  // per-session net amounts are unaffected — only an absolute total (the
  // wage bar's period total) reflects the advance already paid out.
  return cumulativeGross - atp - amBidrag - tax - config.advanceAmount;
}

/**
 * Net kr attributable to an increment of `incrementGross` kr /
 * `incrementPaidSeconds` seconds, given what already came before it in the
 * period — correctly prorates across the skattefradrag threshold if the
 * increment straddles it.
 */
export type FeriepengeAmount = { brutto: number; netto: number };

/**
 * Optjente feriepenge for `cumulativeGross` kr brutto optjent i perioden —
 * 12,5% af bruttolønnen (feriepenge-berettiget løn = brutto FØR ATP er
 * trukket fra), beskattet for sig selv med samme AM-bidrag/A-skat satser
 * som den øvrige løn. Feriepenge deler ikke skattefradraget med den
 * løbende løn, og der trækkes ikke ATP af feriepenge — kun af den
 * udbetalte timeløn. Kalibreret mod en rigtig lønseddel: 15.372,50 kr
 * brutto → 1.921,56 kr feriepenge brutto → 989,56 kr netto.
 */
export function feriepengeForGross(
  cumulativeGross: number,
  config: Pick<WageConfig, "amBidragPct" | "taxRatePct">
): FeriepengeAmount {
  const FERIEPENGE_PCT = 0.125;
  const brutto = cumulativeGross * FERIEPENGE_PCT;
  const amBidrag = brutto * config.amBidragPct;
  const askat = (brutto - amBidrag) * config.taxRatePct;
  return { brutto, netto: brutto - amBidrag - askat };
}

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
