// startOfDay/endOfDay/getWeekRange are used as DB range boundaries (gte/lte)
// for "today"/"this week" queries, so they MUST resolve to the Danish
// calendar day/week, not whatever timezone the executing JS runtime happens
// to be in. Netlify Functions run with TZ=UTC, which is 1-2 hours behind
// Danish local time (CET/CEST) — a naive `date.setHours(0,0,0,0)` would
// therefore compute UTC midnight, not Copenhagen midnight, silently
// misfiling any shift that starts between 00:00-02:00 Danish time into
// "yesterday". These delegate to the explicitly zone-aware helpers in
// timezone.ts so the result is correct regardless of server TZ. Everything
// DISPLAYED to a human (formatTime, formatDayHeading, weekdayShort) also
// goes through zonedParts for the same reason.
import { zonedParts, copenhagenStartOfDay, addCalendarDays, copenhagenWeekday } from "./timezone";

const WEEKDAYS_SHORT_DA = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS_DA = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

export function startOfDay(date: Date): Date {
  return copenhagenStartOfDay(date);
}

export function endOfDay(date: Date): Date {
  return new Date(addCalendarDays(copenhagenStartOfDay(date), 1).getTime() - 1);
}

export function formatShortDate(date: Date): string {
  const { day, month, year } = zonedParts(date);
  return `${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("da-DK", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: "Europe/Copenhagen",
  });
}

export function formatDayHeading(date: Date): string {
  const { day, month } = zonedParts(date);
  return `${day}. ${MONTHS_DA[month - 1]}`;
}

export function weekdayShort(index: number): string {
  return WEEKDAYS_SHORT_DA[index];
}

export function greeting(date: Date): string {
  const { hour } = zonedParts(date);
  if (hour < 10) return "God morgen";
  if (hour < 17) return "God dag";
  return "God aften";
}

export function getWeekRange(date: Date): { start: Date; end: Date } {
  const dayStart = copenhagenStartOfDay(date);
  const weekday = copenhagenWeekday(dayStart);
  const diffToMonday = weekday === 0 ? -6 : 1 - weekday;
  const start = addCalendarDays(dayStart, diffToMonday);
  const end = new Date(addCalendarDays(start, 7).getTime() - 1);
  return { start, end };
}
