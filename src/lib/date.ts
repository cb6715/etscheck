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
  const weekday = WEEKDAYS_DA[date.getDay()];
  const day = date.getDate();
  const month = MONTHS_DA[date.getMonth()];
  return `${capitalize(weekday)} · ${day}. ${month}`;
}

export function formatShortDate(date: Date): string {
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatTime(date: Date): string {
  return date.toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit" });
}

export function formatDayHeading(date: Date): string {
  const day = date.getDate();
  const month = MONTHS_DA[date.getMonth()];
  return `${day}. ${month}`;
}

export function weekdayShort(index: number): string {
  return WEEKDAYS_SHORT_DA[index];
}

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function greeting(date: Date): string {
  const hour = date.getHours();
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

export function getMonthRange(date: Date): { start: Date; end: Date } {
  const start = new Date(date.getFullYear(), date.getMonth(), 1);
  const end = new Date(date.getFullYear(), date.getMonth() + 1, 0, 23, 59, 59, 999);
  return { start, end };
}
