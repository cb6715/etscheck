// Danish-audience date formatting/boundaries — all anchored to Europe/
// Copenhagen wall-clock time via src/lib/timezone.ts, NOT the executing
// runtime's local timezone. This matters because these functions run both
// in the browser (Danish local time) AND on the server (Netlify runs UTC):
// a checkInAt stored as 04:33 UTC is 06:33 in Denmark, and naive
// date.getHours()/.getDate() would silently show the wrong one depending on
// which side rendered it.
import { zonedParts, copenhagenStartOfDay, addCalendarDays } from "./timezone";

const WEEKDAYS_DA = ["søndag", "mandag", "tirsdag", "onsdag", "torsdag", "fredag", "lørdag"];
const WEEKDAYS_SHORT_DA = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
const MONTHS_DA = [
  "januar", "februar", "marts", "april", "maj", "juni",
  "juli", "august", "september", "oktober", "november", "december",
];

/** 0 (søndag) - 6 (lørdag) for the Danish calendar day containing `date`. */
function zonedWeekday(date: Date): number {
  const { year, month, day } = zonedParts(date);
  return new Date(Date.UTC(year, month - 1, day)).getUTCDay();
}

export function startOfDay(date: Date): Date {
  return copenhagenStartOfDay(date);
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

export function getWeekRange(date: Date): { start: Date; end: Date } {
  const day = zonedWeekday(date);
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const start = addCalendarDays(copenhagenStartOfDay(date), diffToMonday);
  const end = new Date(addCalendarDays(start, 7).getTime() - 1);
  return { start, end };
}

export function getMonthRange(date: Date): { start: Date; end: Date } {
  const { year, month } = zonedParts(date);
  const start = copenhagenStartOfDay(new Date(Date.UTC(year, month - 1, 1)));
  // Adding a month via UTC Date math and letting startOfDay re-anchor it in
  // Copenhagen time correctly lands on the 1st of next month even when the
  // UTC month-length arithmetic doesn't exactly match the local calendar.
  const nextMonthStart = copenhagenStartOfDay(new Date(Date.UTC(year, month, 1)));
  const end = new Date(nextMonthStart.getTime() - 1);
  return { start, end };
}
