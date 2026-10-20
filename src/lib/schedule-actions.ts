"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { requireActiveAccess } from "@/lib/access";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { getUserId } from "@/lib/actions";
import { zonedDateTime, copenhagenWeekday, copenhagenDayKey } from "@/lib/timezone";

// Monthly shift planning: a reusable weekly `schedule_templates` pattern
// that "kopier til måned" stamps across a calendar month into individual
// `scheduled_shifts` rows, which can then be freely edited per-day without
// touching the template or any other day. These are PLANS only — actual
// worked hours still come from work_sessions via check-in/check-out,
// exactly as in the daily-tracking flow; nothing here feeds the wage
// engine directly.

export type TemplateDayRow = {
  weekday: number;
  start_minutes: number | null;
  end_minutes: number | null;
  workplace_id: number | null;
};

async function getOrCreateTemplateId(userId: number): Promise<number> {
  const [existing] = await db().sql<{ id: number }>`SELECT id FROM schedule_templates WHERE user_id = ${userId} LIMIT 1`;
  if (existing) return existing.id;
  const [created] = await db().sql<{ id: number }>`
    INSERT INTO schedule_templates (user_id) VALUES (${userId}) RETURNING id
  `;
  return created.id;
}

export async function getScheduleTemplate(): Promise<TemplateDayRow[]> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const templateId = await getOrCreateTemplateId(userId);
  return db().sql<TemplateDayRow>`
    SELECT weekday, start_minutes, end_minutes, workplace_id
    FROM schedule_template_days WHERE template_id = ${templateId} ORDER BY weekday ASC
  `;
}

export type TemplateDayInput = {
  weekday: number; // 0=søndag..6=lørdag
  startMinutes: number | null;
  endMinutes: number | null;
  workplaceId: number | null;
};

/** Upserts one weekday's row in the user's single reusable template.
 * `startMinutes`/`endMinutes` both null means "fri den dag" in the pattern. */
export async function setTemplateDay(input: TemplateDayInput): Promise<ActionResult> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  if (input.weekday < 0 || input.weekday > 6) return fail("Ugyldig ugedag.");
  const templateId = await getOrCreateTemplateId(userId);

  if (input.workplaceId !== null) {
    const [wp] = await db().sql<{ id: number }>`SELECT id FROM workplaces WHERE id = ${input.workplaceId} AND user_id = ${userId}`;
    if (!wp) return fail("Arbejdsstedet findes ikke.");
  }

  await db().sql`
    INSERT INTO schedule_template_days (template_id, weekday, start_minutes, end_minutes, workplace_id)
    VALUES (${templateId}, ${input.weekday}, ${input.startMinutes}, ${input.endMinutes}, ${input.workplaceId})
    ON CONFLICT (template_id, weekday)
    DO UPDATE SET start_minutes = EXCLUDED.start_minutes, end_minutes = EXCLUDED.end_minutes, workplace_id = EXCLUDED.workplace_id
  `;
  revalidatePath("/planlægning");
  return ok(undefined);
}

export type ScheduledShiftRow = {
  id: number;
  shift_date: Date;
  start_minutes: number | null;
  end_minutes: number | null;
  workplace_id: number | null;
  status: string;
  note: string | null;
};

/** All planned shifts with shift_date in [start, end], inclusive — used by
 * both the calendar/planning UI and the dashboard's "næste planlagte vagt". */
export async function getScheduledShifts(start: Date, end: Date): Promise<ScheduledShiftRow[]> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  return db().sql<ScheduledShiftRow>`
    SELECT id, shift_date, start_minutes, end_minutes, workplace_id, status, note
    FROM scheduled_shifts
    WHERE user_id = ${userId} AND shift_date BETWEEN ${copenhagenDayKey(start)} AND ${copenhagenDayKey(end)}
    ORDER BY shift_date ASC
  `;
}

export type UpsertShiftInput = {
  date: Date;
  startMinutes: number | null;
  endMinutes: number | null;
  workplaceId: number | null;
  status: "planned" | "off" | "sick" | "extra";
  note?: string;
};

/** Creates or edits exactly one calendar day's plan — the single-day editor,
 * also used internally by generateMonthFromTemplate for each day it fills. */
export async function upsertScheduledShift(input: UpsertShiftInput): Promise<ActionResult> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  if (input.workplaceId !== null) {
    const [wp] = await db().sql<{ id: number }>`SELECT id FROM workplaces WHERE id = ${input.workplaceId} AND user_id = ${userId}`;
    if (!wp) return fail("Arbejdsstedet findes ikke.");
  }
  const dayKey = copenhagenDayKey(input.date);
  await db().sql`
    INSERT INTO scheduled_shifts (user_id, shift_date, start_minutes, end_minutes, workplace_id, status, note, updated_at)
    VALUES (${userId}, ${dayKey}, ${input.startMinutes}, ${input.endMinutes}, ${input.workplaceId}, ${input.status}, ${input.note ?? null}, now())
    ON CONFLICT (user_id, shift_date)
    DO UPDATE SET
      start_minutes = EXCLUDED.start_minutes, end_minutes = EXCLUDED.end_minutes,
      workplace_id = EXCLUDED.workplace_id, status = EXCLUDED.status, note = EXCLUDED.note,
      updated_at = now()
  `;
  revalidatePath("/planlægning");
  return ok(undefined);
}

export async function deleteScheduledShift(date: Date): Promise<ActionResult> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  await db().sql`DELETE FROM scheduled_shifts WHERE user_id = ${userId} AND shift_date = ${copenhagenDayKey(date)}`;
  revalidatePath("/planlægning");
  return ok(undefined);
}

/**
 * Stamps the user's weekly template across every day of `year`/`month`
 * (1-12) into scheduled_shifts. Never overwrites a day that already has a
 * plan — "kopier til måned" fills gaps, it doesn't clobber edits you've
 * already made for that month, so running it twice (e.g. after adding a
 * new template day) is always safe.
 */
export async function generateMonthFromTemplate(year: number, month: number): Promise<ActionResult<{ created: number }>> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const templateId = await getOrCreateTemplateId(userId);
  const templateDays = await db().sql<TemplateDayRow>`
    SELECT weekday, start_minutes, end_minutes, workplace_id FROM schedule_template_days WHERE template_id = ${templateId}
  `;
  if (templateDays.length === 0) return fail("Opsæt en ugeskabelon først, under Planlægning.");
  const byWeekday = new Map(templateDays.map((d) => [d.weekday, d]));

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  let created = 0;
  for (let day = 1; day <= daysInMonth; day++) {
    const date = zonedDateTime(year, month, day, 0, 0);
    const weekday = copenhagenWeekday(date);
    const template = byWeekday.get(weekday);
    const dayKey = copenhagenDayKey(date);

    const [existing] = await db().sql<{ id: number }>`
      SELECT id FROM scheduled_shifts WHERE user_id = ${userId} AND shift_date = ${dayKey}
    `;
    if (existing) continue;

    await db().sql`
      INSERT INTO scheduled_shifts (user_id, shift_date, start_minutes, end_minutes, workplace_id, status)
      VALUES (
        ${userId}, ${dayKey}, ${template?.start_minutes ?? null}, ${template?.end_minutes ?? null},
        ${template?.workplace_id ?? null}, ${template && template.start_minutes !== null ? "planned" : "off"}
      )
    `;
    created++;
  }
  revalidatePath("/planlægning");
  return ok({ created });
}
