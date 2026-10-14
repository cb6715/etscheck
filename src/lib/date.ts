// Same split as the rest of this app's wage logic: startOfDay/getWeekRange
// are naive-local and used as DB range boundaries (gte/lte), never an
// exact-match key, so there's no orphaned-data risk from them staying
// naive. Everything DISPLAYED to a human (formatTime, formatDayHeading,
// weekdayShort) goes through zonedParts so it's always Copenhagen-correct
// regardless of which timezone the server process itself runs in.
import { zonedParts } from "./timezone";

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

export function endOfDay(date: Date): Date {
  const d = startOfDay(date);
  d.setHours(23, 59, 59, 999);
  return d;
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
