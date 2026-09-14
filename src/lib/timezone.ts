// Danish wall-clock time helpers, decoupled from whatever timezone the JS
// runtime executing the code happens to be in. This matters because the
// same code runs on the server (Netlify Functions run in UTC) AND in the
// browser (Danish local time) — without this, "today" or "17:00" would mean
// a different instant depending on which side evaluated it.
export const TIME_ZONE = "Europe/Copenhagen";

function zoneOffsetMs(utcGuess: Date): number {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = fmt.formatToParts(utcGuess);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  const asUTC = Date.UTC(get("year"), get("month") - 1, get("day"), get("hour"), get("minute"), get("second"));
  return asUTC - utcGuess.getTime();
}

/** The Danish wall-clock date/time components for `date`, regardless of
 * what timezone the JS runtime itself is in. */
export function zonedParts(date: Date): { year: number; month: number; day: number; hour: number; minute: number } {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
  const parts = fmt.formatToParts(date);
  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0);
  return { year: get("year"), month: get("month"), day: get("day"), hour: get("hour"), minute: get("minute") };
}

/** The UTC instant corresponding to a given Danish wall-clock date/time,
 * correctly accounting for whichever DST offset is in effect on that date. */
export function zonedDateTime(year: number, month: number, day: number, hour: number, minute: number): Date {
  const naiveUTC = new Date(Date.UTC(year, month - 1, day, hour, minute, 0, 0));
  return new Date(naiveUTC.getTime() - zoneOffsetMs(naiveUTC));
}

/** The instant of Danish local midnight on the calendar day containing `date`. */
export function copenhagenStartOfDay(date: Date): Date {
  const { year, month, day } = zonedParts(date);
  return zonedDateTime(year, month, day, 0, 0);
}

/** `date` shifted by whole Danish calendar days (handles month/year rollover
 * and DST transitions correctly via the underlying Date.UTC normalization). */
export function addCalendarDays(date: Date, days: number): Date {
  const { year, month, day } = zonedParts(date);
  return zonedDateTime(year, month, day + days, 0, 0);
}

/** "YYYY-MM-DD" for the Danish calendar day containing `date` — handy for
 * same-day comparisons without constructing Date objects. */
export function copenhagenDayKey(date: Date): string {
  const { year, month, day } = zonedParts(date);
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}
