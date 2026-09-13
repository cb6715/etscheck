import { RecurrenceType, TaskTemplate } from "@prisma/client";
import { startOfDay, isSameDay } from "@/lib/date";

export function templateAppliesOn(template: TaskTemplate, date: Date): boolean {
  const day = startOfDay(date);
  const weekday = day.getDay();

  switch (template.recurrenceType) {
    case RecurrenceType.DAGLIGT:
      return true;
    case RecurrenceType.HVERDAGE:
      return weekday >= 1 && weekday <= 5;
    case RecurrenceType.UGEDAGE:
      return template.weekdays.includes(weekday);
    case RecurrenceType.UGENTLIGT: {
      const created = startOfDay(template.createdAt);
      if (created > day) return false;
      return created.getDay() === weekday;
    }
    case RecurrenceType.HVER_2_UGE: {
      const created = startOfDay(template.createdAt);
      if (created > day) return false;
      if (created.getDay() !== weekday) return false;
      const diffWeeks = Math.floor((day.getTime() - created.getTime()) / (7 * 24 * 60 * 60 * 1000));
      return diffWeeks % 2 === 0;
    }
    case RecurrenceType.MAANEDLIGT:
      return template.dayOfMonth === day.getDate();
    case RecurrenceType.DATO:
      return template.specificDate ? isSameDay(template.specificDate, day) : false;
    default:
      return false;
  }
}

export const RECURRENCE_LABELS: Record<RecurrenceType, string> = {
  DAGLIGT: "Dagligt",
  HVERDAGE: "Hverdage",
  UGEDAGE: "Bestemte ugedage",
  UGENTLIGT: "Ugentligt",
  HVER_2_UGE: "Hver 2. uge",
  MAANEDLIGT: "Månedligt",
  DATO: "Bestemt dato",
};
