import { CalendarClock, AlertTriangle } from "lucide-react";
import { Card, Badge } from "@/components/ui/primitives";
import { getTrackingMode, getWeekAttendance } from "@/lib/actions";
import { getScheduledShifts } from "@/lib/schedule-actions";
import { getWorkplaces } from "@/lib/workplace-actions";
import { zonedParts, addCalendarDays, copenhagenDayKey } from "@/lib/timezone";
import { weekdayShort } from "@/lib/date";

// scheduled_shifts.shift_date is a plain DATE column — the pg driver parses
// it as a Date at UTC midnight of that exact calendar day, so its UTC
// getters already give the right day with no Copenhagen-zone conversion
// needed (same reasoning as planlaegning-client.tsx's dateColumnKey).
function dateColumnKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

function minutesToTime(m: number | null): string {
  if (m === null) return "";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/**
 * Only renders anything for someone who chose "planlæg en hel måned" during
 * onboarding (see src/lib/schedule-actions.ts) — the daily tjek-ind/ud flow
 * has no concept of a "planned" shift to show here. Surfaces the next
 * upcoming planned/ekstra shift, plus a plain warning (never a push/toast,
 * just text on the dashboard) if today had a planned shift whose end time
 * has already passed with nothing registered in work_sessions for today.
 */
export async function NextShiftCard() {
  const trackingMode = await getTrackingMode();
  if (trackingMode !== "monthly") return null;

  const now = new Date();
  const todayKey = copenhagenDayKey(now);
  const horizonEnd = addCalendarDays(now, 14);

  const [shifts, weekAttendance, workplaces] = await Promise.all([
    getScheduledShifts(now, horizonEnd),
    getWeekAttendance(now),
    getWorkplaces(),
  ]);

  const todayShift = shifts.find((s) => dateColumnKey(s.shift_date) === todayKey);
  const upcoming = shifts
    .filter((s) => dateColumnKey(s.shift_date) >= todayKey && (s.status === "planned" || s.status === "extra"))
    .sort((a, b) => a.shift_date.getTime() - b.shift_date.getTime());
  const next = upcoming[0];

  const { hour, minute } = zonedParts(now);
  const minuteOfDay = hour * 60 + minute;
  const todayAttendance = weekAttendance.days.find((d) => d.dateKey === todayKey);
  const missedToday = Boolean(
    todayShift &&
      (todayShift.status === "planned" || todayShift.status === "extra") &&
      todayShift.end_minutes !== null &&
      minuteOfDay > todayShift.end_minutes &&
      (todayAttendance?.status === "none" || !todayAttendance)
  );

  function workplaceName(id: number | null): string | null {
    if (id === null) return null;
    return workplaces.find((w) => w.id === id)?.name ?? null;
  }

  if (!next && !missedToday) return null;

  return (
    <Card className="space-y-2.5 p-4">
      {missedToday && todayShift && (
        <p className="flex items-center gap-2 text-sm font-semibold text-[var(--warning)]">
          <AlertTriangle size={15} /> Du havde en planlagt vagt i dag ({minutesToTime(todayShift.start_minutes)}-
          {minutesToTime(todayShift.end_minutes)}), men der er ikke registreret nogen tjek-ind/ud for i dag.
        </p>
      )}
      {next && (
        <p className="flex items-center gap-2 text-sm font-bold">
          <CalendarClock size={15} /> Næste planlagte vagt:{" "}
          {new Date(next.shift_date.getUTCFullYear(), next.shift_date.getUTCMonth(), next.shift_date.getUTCDate()).getDate()}.{" "}
          {weekdayShort(next.shift_date.getUTCDay())} {minutesToTime(next.start_minutes)}-{minutesToTime(next.end_minutes)}
          {workplaceName(next.workplace_id) && (
            <Badge tone="info" className="ml-1">
              {workplaceName(next.workplace_id)}
            </Badge>
          )}
        </p>
      )}
    </Card>
  );
}
