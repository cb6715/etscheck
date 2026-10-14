"use client";

import { useState, useTransition } from "react";
import { Thermometer, Trash2, Check, ChevronLeft, ChevronRight } from "lucide-react";
import { Card, Badge, Button, inputClass } from "@/components/ui/primitives";
import {
  getWeekAttendance,
  addSickDay,
  deleteSickDay,
  getSickDays,
  type WeekAttendance,
  type SickDayEntry,
} from "@/lib/actions/worksessions";
import { notifyWageContextChanged } from "@/lib/wage/events";
import { formatShortDate } from "@/lib/date";

function formatKr(n: number): string {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

// Default skema: man-tor 6:30-16:00, fredag 6:30-15:30 — udfyldt automatisk,
// men altid til at redigere, hvis en bestemt sygedag havde andre timer.
function defaultTimesFor(weekday: number): { start: string; end: string } {
  return { start: "06:30", end: weekday === 5 ? "15:30" : "16:00" };
}

const STATUS_LABEL: Record<WeekAttendance["days"][number]["status"], string> = {
  worked: "Arbejdet",
  sick: "Syg",
  manual: "Registreret",
  open: "I gang",
  none: "Ingen registrering",
};

export function SickDaysForm({
  initialAttendance,
  initialSickDays,
}: {
  initialAttendance: WeekAttendance;
  initialSickDays: SickDayEntry[];
}) {
  const [attendance, setAttendance] = useState(initialAttendance);
  const [sickDays, setSickDays] = useState(initialSickDays);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("06:30");
  const [endTime, setEndTime] = useState("16:00");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function loadWeek(weekAnchorIso: string) {
    startTransition(async () => {
      const result = await getWeekAttendance(new Date(weekAnchorIso));
      setAttendance(result);
    });
  }

  function openEditor(day: WeekAttendance["days"][number]) {
    const { start, end } = defaultTimesFor(day.weekday);
    setStartTime(start);
    setEndTime(end);
    setError("");
    setEditingDay(day.dateKey);
  }

  function confirmSickDay(dateKey: string) {
    setError("");
    startTransition(async () => {
      try {
        await addSickDay(dateKey, startTime, endTime);
        notifyWageContextChanged();
        const [result, days] = await Promise.all([getWeekAttendance(new Date(attendance.weekStart)), getSickDays()]);
        setAttendance(result);
        setSickDays(days);
        setEditingDay(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kunne ikke registrere sygedagen.");
      }
    });
  }

  function remove(id: string) {
    startTransition(async () => {
      await deleteSickDay(id);
      notifyWageContextChanged();
      const [result, days] = await Promise.all([getWeekAttendance(new Date(attendance.weekStart)), getSickDays()]);
      setAttendance(result);
      setSickDays(days);
    });
  }

  return (
    <Card className="space-y-4 p-4">
      <p className="text-xs text-muted">
        Marker en dag som syg, hvis du ikke har tjekket ind — den betales med en fast sats pr. time (se
        lønindstillinger ovenfor) og tæller ikke som en arbejdsdag ift. overarbejdsgrænsen.
      </p>

      <div className="flex items-center justify-between">
        <button
          onClick={() => loadWeek(addDays(attendance.weekStart, -7))}
          disabled={pending}
          className="rounded-lg p-2 hover:bg-surface-2"
        >
          <ChevronLeft size={18} />
        </button>
        <span className="text-xs font-semibold text-muted">
          {formatShortDate(new Date(attendance.weekStart))} – {formatShortDate(new Date(attendance.weekEnd))}
        </span>
        <button
          onClick={() => loadWeek(addDays(attendance.weekStart, 7))}
          disabled={pending}
          className="rounded-lg p-2 hover:bg-surface-2"
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div className="space-y-2">
        {attendance.days
          .filter((d) => !d.isWeekend)
          .map((day) => (
            <div key={day.dateKey} className="rounded-xl border border-border p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold">
                  {day.label} {formatShortDate(new Date(day.dateKey))}
                </span>
                <Badge
                  tone={
                    day.status === "worked" || day.status === "manual"
                      ? "success"
                      : day.status === "sick"
                      ? "warning"
                      : day.status === "open"
                      ? "info"
                      : "default"
                  }
                >
                  {STATUS_LABEL[day.status]}
                </Badge>
              </div>

              {day.status === "none" && (
                <div className="mt-2">
                  {editingDay === day.dateKey ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <input
                        type="time"
                        className={inputClass}
                        value={startTime}
                        onChange={(e) => setStartTime(e.target.value)}
                      />
                      <input
                        type="time"
                        className={inputClass}
                        value={endTime}
                        onChange={(e) => setEndTime(e.target.value)}
                      />
                      <Button
                        size="sm"
                        onClick={() => confirmSickDay(day.dateKey)}
                        disabled={pending}
                        className="flex items-center gap-1.5"
                      >
                        <Check size={14} /> Bekræft
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => openEditor(day)} disabled={pending}>
                      <Thermometer size={14} className="mr-1.5 inline" /> Marker som syg
                    </Button>
                  )}
                </div>
              )}
            </div>
          ))}
      </div>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}

      {sickDays.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          {sickDays.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 text-muted">
                <Thermometer size={14} /> {formatShortDate(new Date(s.checkInAt))}
              </span>
              <span className="font-semibold">
                {s.hours.toFixed(1)}t · {formatKr(s.grossAmount)} brutto · {formatKr(s.netAmount)} netto
              </span>
              <button
                onClick={() => remove(s.id)}
                disabled={pending}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
