// Danish-audience date formatting for TEXT DISPLAY is anchored to Europe/
// Copenhagen wall-clock time via src/lib/timezone.ts (see formatTime etc.
// below) — a checkInAt stored as 04:33 UTC is 06:33 in Denmark, and naive
// date.getHours() would show the wrong one depending on whether the browser
// or a UTC server rendered it.
//
// startOfDay/getWeekRange/getMonthRange are deliberately NOT timezone-
// corrected: they're used throughout the app as exact-match DB keys
// (Task.scheduledFor, DailyBriefing.date) against rows already stored using
// this runtime-local convention. Changing their boundary shifts every
// lookup by the local UTC offset and instantly orphans all of today's
// existing data behind a key that no longer matches anything in the
// database — this happened once already and must not happen again.
// Fixing that properly needs a data migration (re-key existing rows to a
// new Copenhagen-anchored boundary), not a change to these functions alone.
import { zonedParts } from "./timezone";

const WEEKDAYS_DA = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const WEEKDAYS_SHORT_DA = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS_DA = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

export function startOfDay(date: Date): Date {
  const d = new Date(date);
  d.setHours(0, 0, 0, 0);
  return d;
}

export function isSameDay(a: Date, b: Date): boolean {
  return startOfDay(a).getTime() === startOfDay(b).getTime();
}

export function formatLongDate(date: Date): string {
  const { day, month } = zonedParts(date);
  const weekday = WEEKDAYS_DA[zonedWeekday(date)];
  return `${capitalize(weekday)} · ${day}. ${MONTHS_DA[month - 1]}`;
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

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function greeting(date: Date): string {
  const { hour } = zonedParts(date);
  if (hour < 10) return "God morgen";
  if (hour < 17) return "God dag";
  return "God aften";
}

/** 0 (søndag) - 6 (lørdag) for the Danish calendar day containing `date` —
 * used only for display text (formatLongDate), never for DB boundaries. */
function zonedWeekday(date: Date): number {
  const { year, month, day } = zonedParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function getWeekRange(date: Date): { start: Date; end: Date } {
  const d = startOfDay(date);
  const day = d.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = new Date(d);
  start.setDate(d.getDate() + diffToMonday);
  const end = new Date(start);
  end.setDate(start.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return { start, end };
}

export function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}
