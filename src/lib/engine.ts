// Pure wage-calculation math, kept free of Prisma/DB access so it can be
// unit-tested and reused identically on both the server (checkout) and the
// client (the live per-second counter).

// All break/overtime/night clock-time logic is anchored to Danish wall-clock
// time explicitly, rather than the executing JS runtime's local timezone.
// That matters because this same code runs on the server (Netlify Functions
// run in UTC) AND in the browser (Danish local time) — without this, "12:00
// pause" would mean a different instant depending on which side evaluated
// it, and the two could disagree on gross/net for the same shift.
// Relative, not "@/lib/timezone" — this file is also imported, via
// live-push-tick.ts, by the standalone Netlify Scheduled Function in
// netlify/functions/push-tick.mts, which is bundled by Netlify's own
// function bundler rather than Next.js's. A relative import resolves
// identically under both, so it's the only version safe to rely on here;
// the "@/" alias is only guaranteed to resolve inside Next's own build.
import { zonedParts, zonedDateTime, copenhagenStartOfDay as startOfLocalDay, addCalendarDays, copenhagenWeekday } from "./timezone";

export type WageConfig = {
  hourlyRate: number;
  overtimeThresholdHours: number;
  overtimeBonusPct: number;
  nightSupplement: number;
  nightStartHour: number;
  nightEndHour: number;
  /** kr/time tillæg for timer på lørdag/søndag, der ikke falder på en dansk
   * helligdag (helligdagstillægget har forrang — se holidaySupplement).
   * Default 0: ikke alle kontrakter har et weekendtillæg. */
  weekendSupplement: number;
  /** kr/time tillæg for timer på en dansk helligdag (nytårsdag, skærtorsdag,
   * langfredag, påske, Kristi himmelfartsdag, pinse, juledagene) — tager
   * forrang over weekendSupplement, hvis en helligdag falder i en weekend.
   * Default 0: skal sættes efter den faktiske kontrakt. */
  holidaySupplement: number;
  breakStartMinutes: number;
  breakEndMinutes: number;
  monthlyTaxDeduction: number;
  amBidragPct: number;
  taxRatePct: number;
  /** No longer used by `breakdownForCumulative` — real ATP-bidrag isn't
   * linear per hour, see `atpEmployeeShareForHours` below. Kept in the
   * config/DB so existing settings rows don't need a migration; the
   * settings UI no longer exposes it. */
  atpRatePerHour: number;
  /** Salary advance (forskud) already paid out for the current pay period,
   * in kr — subtracted from netto exactly once, by `expectedPayout`, to get
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
  /** How many days a normal work week has for this person — used only to
   * pro-rate the weekly overtime threshold (see weeklyOvertimeThresholdHours
   * below). 5 means the full overtimeThresholdHours applies; fewer days
   * pro-rates it down proportionally. Fixed in settings, not inferred from
   * how many days have actually been worked so far in a given week. */
  workDaysPerWeek: number;
};

export const DEFAULT_WAGE_CONFIG: WageConfig = {
  hourlyRate: 150,
  overtimeThresholdHours: 37,
  overtimeBonusPct: 0.6,
  nightSupplement: 25,
  nightStartHour: 17,
  nightEndHour: 5,
  weekendSupplement: 0,
  holidaySupplement: 0,
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
  workDaysPerWeek: 5,
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
 * "sidste business dag i måneden" that doesn't account for helligdage.
 * Danish-zone-aware (not `date.getFullYear()`/`getMonth()`/native
 * `setDate()`, which read/write in the EXECUTING RUNTIME's own timezone) so
 * this is safe even if ever called server-side, not just from the browser. */
export function lastWeekdayOfMonth(date: Date): Date {
  const { year, month } = zonedParts(date);
  let d = zonedDateTime(year, month + 1, 0, 0, 0); // day 0 of next month = last day of this month
  while (copenhagenWeekday(d) === 0 || copenhagenWeekday(d) === 6) {
    d = addCalendarDays(d, -1);
  }
  return d;
}

/**
 * Every clock-time boundary (break start/end, night start/end, midnight)
 * that falls strictly inside (start, end), across every calendar day the
 * interval spans — plus start/end themselves. Splitting on these first means
 * every resulting chunk has a single, unambiguous break/night/day-type
 * status throughout. The midnight marker (minute 0) specifically exists so
 * weekend/helligdag tillæg (see dayTypeSupplementFor) can be computed from a
 * segment's midpoint — unlike night status, day-type depends on the calendar
 * day, so a shift straddling e.g. Friday→Saturday midnight needs an explicit
 * split there, or the midpoint of one combined chunk would wrongly pick a
 * single day's status for the whole thing.
 */
function collectBoundaries(start: Date, end: Date, config: WageConfig): Date[] {
  const times = new Set<number>([start.getTime(), end.getTime()]);
  let dayCursor = startOfLocalDay(start);
  const markers = [
    0,
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

/** Easter Sunday (Gregorian) for a given year, via the Anonymous Gregorian
 * algorithm (Meeus/Jones/Butcher) — several Danish helligdage are counted
 * relative to it (skærtorsdag, langfredag, 2. påskedag, Kristi himmelfarts-
 * dag, pinse). */
function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31);
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}

/** The Danish helligdage commonly carrying a lønoverenskomst-tillæg, for a
 * given year, as "YYYY-MM-DD" keys. This is a best-effort list for TILLÆG
 * purposes — it only affects anything once holidaySupplement is actually
 * configured away from its 0-kr default, same estimat caveat as the rest
 * of this engine. Deliberately excludes Store Bededag, abolished as a
 * public holiday from 2024 — some overenskomster may still pay a tillæg
 * for it, in which case log it as a manual sick/adjustment entry instead. */
function danishPublicHolidays(year: number): Set<string> {
  const { month: em, day: ed } = easterSunday(year);
  const easter = new Date(Date.UTC(year, em - 1, ed));
  const addDays = (d: Date, n: number) => new Date(d.getTime() + n * 86400000);
  const key = (d: Date) => `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
  return new Set(
    [
      new Date(Date.UTC(year, 0, 1)), // Nytårsdag
      addDays(easter, -3), // Skærtorsdag
      addDays(easter, -2), // Langfredag
      easter, // Påskedag
      addDays(easter, 1), // 2. påskedag
      addDays(easter, 39), // Kristi himmelfartsdag
      addDays(easter, 49), // Pinsedag
      addDays(easter, 50), // 2. pinsedag
      new Date(Date.UTC(year, 11, 25)), // Juledag
      new Date(Date.UTC(year, 11, 26)), // 2. juledag
    ].map(key)
  );
}

function isDanishHoliday(date: Date): boolean {
  const { year, month, day } = zonedParts(date);
  return danishPublicHolidays(year).has(`${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`);
}

/** kr/time tillæg for `date`'s Danish calendar day: helligdagstillæg takes
 * precedence over weekendtillæg if a holiday falls on a Saturday/Sunday. */
function dayTypeSupplementFor(date: Date, config: WageConfig): number {
  if (isDanishHoliday(date)) return config.holidaySupplement;
  const weekday = copenhagenWeekday(date);
  if (weekday === 0 || weekday === 6) return config.weekendSupplement;
  return 0;
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
 * The 37-timers overtime threshold, pro-rated for a configured work week
 * shorter than 5 days: `overtimeThresholdHours / 5` "normal" hours per day,
 * times `workDaysPerWeek`. This is a FIXED setting from indstillinger, not
 * derived from how many days happen to have been worked so far this week —
 * an earlier version computed it from "distinct days worked so far", which
 * meant front-loading long shifts into the first few days of the week
 * tripped "overtid" well before anywhere near the real weekly hours, since
 * day 3 of a 5-day week was (wrongly) treated as if the week only had 3
 * days in it. Using the configured day count keeps the threshold stable
 * all week, regardless of which days you've actually worked yet.
 */
export function weeklyOvertimeThresholdHours(
  config: Pick<WageConfig, "overtimeThresholdHours" | "workDaysPerWeek">
): number {
  if (config.workDaysPerWeek >= 5) return config.overtimeThresholdHours;
  const perDay = config.overtimeThresholdHours / 5;
  return Math.round(perDay * Math.max(1, config.workDaysPerWeek));
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

  const addSegment = (durationSeconds: number, isNight: boolean, isOvertime: boolean, daySupplement: number) => {
    const rate =
      config.hourlyRate * (isOvertime ? 1 + config.overtimeBonusPct : 1) +
      (isNight ? config.nightSupplement : 0) +
      daySupplement;
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
    // Safe to read off this one segment's midpoint: the midnight boundary
    // marker in collectBoundaries guarantees no segment straddles two
    // calendar days, so "this chunk's day type" is always unambiguous.
    const daySupplement = dayTypeSupplementFor(midpoint, config);
    let remaining = durationSeconds;

    if (cumulativeElapsedSeconds < thresholdSeconds) {
      const normalPart = Math.min(remaining, thresholdSeconds - cumulativeElapsedSeconds);
      addSegment(normalPart, isNight, false, daySupplement);
      cumulativeElapsedSeconds += normalPart;
      remaining -= normalPart;
    }
    if (remaining > 0) {
      addSegment(remaining, isNight, true, daySupplement);
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
  const thresholdSeconds = weeklyOvertimeThresholdHours(config) * 3600;
  const normalSeconds = Math.max(0, Math.min(paidSeconds, thresholdSeconds - priorWeekElapsedSeconds));
  const overtimeSeconds = paidSeconds - normalSeconds;
  const grossAmount =
    (normalSeconds / 3600) * config.hourlyRate + (overtimeSeconds / 3600) * config.hourlyRate * (1 + config.overtimeBonusPct);
  return { paidSeconds, grossAmount };
}

/**
 * The employee's (lønmodtagerens) share of ATP-bidrag, in kr, for a
 * calendar-month A-ordning member in a private virksomhed — a fixed,
 * STEPPED amount based on total paid hours in the month, not a linear
 * kr/time rate. Source: borger.dk's "ATP-satser for 2026 i privat
 * virksomhed" table. Verified against a real lønseddel in this app's
 * account: 153,50 timer → 99,00 kr trukket, matching the ≥117-timer
 * bracket exactly (a linear-rate estimate gave ~105 kr instead).
 *
 * This app's "lønperiode" isn't always exactly a calendar month (it's
 * whatever you set in Indstillinger), so applying the monthly table
 * straight to however many hours fall in your configured period is itself
 * an approximation — closer to reality than a linear rate, but still an
 * estimat, same as the rest of this breakdown.
 */
function atpEmployeeShareForHours(hours: number): number {
  if (hours >= 117) return 99;
  if (hours >= 78) return 66;
  if (hours >= 39) return 33;
  return 0;
}

/**
 * The full step-by-step breakdown behind a cumulative net figure, in the
 * same order a real lønseddel uses: ATP is deducted from gross first (it
 * scales with hours, not kr) to get AM-indkomst, THEN AM-bidrag is taken
 * from that, THEN the pay-period skattefradrag, THEN A-skat on what's left.
 * This is estimat-math off the settings you configured — not a guarantee of
 * the actual lønseddel, since real dansk skat also depends on your
 * skattekort/forskudsopgørelse, which this app has no access to.
 *
 * Deliberately does NOT subtract `advanceAmount` — that's a separate,
 * explicit step (see `expectedPayout` below) so "hvad jeg har tjent netto"
 * and "hvad jeg reelt får udbetalt" never get silently conflated into one
 * number, and forskud is only ever subtracted in that one place.
 */
export type NetBreakdown = {
  gross: number;
  atp: number;
  amIncome: number;
  amBidrag: number;
  taxDeduction: number;
  taxableIncome: number;
  tax: number;
  netto: number;
};

export function breakdownForCumulative(cumulativeGross: number, cumulativePaidSeconds: number, config: WageConfig): NetBreakdown {
  const atp = atpEmployeeShareForHours(cumulativePaidSeconds / 3600);
  const amIncome = cumulativeGross - atp;
  const amBidrag = amIncome * config.amBidragPct;
  const taxDeduction = config.monthlyTaxDeduction;
  const taxableIncome = Math.max(0, amIncome - amBidrag - taxDeduction);
  const tax = taxableIncome * config.taxRatePct;
  const netto = cumulativeGross - atp - amBidrag - tax;
  return { gross: cumulativeGross, atp, amIncome, amBidrag, taxDeduction, taxableIncome, tax, netto };
}

/** Estimeret netto for a given cumulative period gross (kr) and cumulative
 * paid seconds — see `breakdownForCumulative` for the full step-by-step. */
export function netForCumulative(cumulativeGross: number, cumulativePaidSeconds: number, config: WageConfig): number {
  return breakdownForCumulative(cumulativeGross, cumulativePaidSeconds, config).netto;
}

/** What's actually left to be paid out: netto optjent minus any forskud
 * already paid out this period. Subtracted exactly once, here — never
 * inside `netForCumulative`/`netForIncrement`, so a stored per-session net
 * amount is never the place forskud gets deducted from. Can go negative if
 * more was advanced than has been earned so far; that's shown as-is rather
 * than clamped, since it's real information ("du skylder X kr tilbage").
 */
export function expectedPayout(netto: number, config: Pick<WageConfig, "advanceAmount">): number {
  return netto - config.advanceAmount;
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
