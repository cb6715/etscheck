"use client";

import { useState, useTransition } from "react";
import { Thermometer, Trash2, Check, ChevronLeft, ChevronRight, Clock } from "lucide-react";
import { Card, Badge, Button, inputClass } from "@/components/ui/primitives";
import {
  getWeekAttendance,
  getWeekHours,
  addSickDay,
  deleteSickDay,
  getSickDays,
  type WeekAttendance,
  type SickDayEntry,
  type WeekHoursSummary,
} from "@/lib/actions";
import { formatShortDate, formatTime } from "@/lib/date";
import { HistoricalWeekEntry } from "./historical-week-entry";

function formatKr(n: number): string {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}t ${m}min` : `${h}t`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString();
}

function defaultTimesFor(weekday: number): { start: string; end: string } {
  return { start: "06:30", end: weekday === 5 ? "15:30" : "16:00" };
}

const STATUS_LABEL: Record<WeekAttendance["days"][number]["status"], string> = {
  worked: "Arbejdet",
  sick: "Syg",
  open: "I gang",
  none: "Ingen registrering",
};

export function UgeClient({
  initialAttendance,
  initialSickDays,
  initialWeekHours,
}: {
  initialAttendance: WeekAttendance;
  initialSickDays: SickDayEntry[];
  initialWeekHours: WeekHoursSummary;
}) {
  const [attendance, setAttendance] = useState(initialAttendance);
  const [sickDays, setSickDays] = useState(initialSickDays);
  const [weekHours, setWeekHours] = useState(initialWeekHours);
  const [editingDay, setEditingDay] = useState<string | null>(null);
  const [startTime, setStartTime] = useState("06:30");
  const [endTime, setEndTime] = useState("16:00");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function reloadAll(weekAnchorIso: string) {
    startTransition(async () => {
      const anchor = new Date(weekAnchorIso);
      const [a, h] = await Promise.all([getWeekAttendance(anchor), getWeekHours(anchor)]);
      setAttendance(a);
      setWeekHours(h);
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
      const result = await addSickDay(dateKey, startTime, endTime);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      const anchor = new Date(attendance.weekStart);
      const [a, h, days] = await Promise.all([getWeekAttendance(anchor), getWeekHours(anchor), getSickDays()]);
      setAttendance(a);
      setWeekHours(h);
      setSickDays(days);
      setEditingDay(null);
    });
  }

  function remove(id: number) {
    startTransition(async () => {
      await deleteSickDay(id);
      const anchor = new Date(attendance.weekStart);
      const [a, h, days] = await Promise.all([getWeekAttendance(anchor), getWeekHours(anchor), getSickDays()]);
      setAttendance(a);
      setWeekHours(h);
      setSickDays(days);
    });
  }

  return (
    <div className="space-y-5" style={{ opacity: pending ? 0.7 : 1, transition: "opacity 150ms" }}>
      <Card className="p-4">
        <div className="mb-3 flex items-center justify-between">
          <button onClick={() => reloadAll(addDays(attendance.weekStart, -7))} className="rounded-xl p-2 hover:bg-[var(--surface-2)]">
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs font-bold text-[var(--muted)]">
            {formatShortDate(new Date(attendance.weekStart))} – {formatShortDate(new Date(attendance.weekEnd))}
          </span>
          <button onClick={() => reloadAll(addDays(attendance.weekStart, 7))} className="rounded-xl p-2 hover:bg-[var(--surface-2)]">
            <ChevronRight size={18} />
          </button>
        </div>
        <div className="flex items-center justify-between rounded-2xl bg-gradient-to-r from-[var(--accent)] to-[var(--accent-2)] px-4 py-3 text-[var(--accent-foreground)]">
          <span className="flex items-center gap-1.5 text-sm font-bold">
            <Clock size={15} /> Timer denne uge
          </span>
          <span className="font-mono text-lg font-extrabold">{formatHours(weekHours.totalHours)}</span>
        </div>
        {weekHours.sickHours > 0 && (
          <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-[var(--muted)]">
            <Thermometer size={12} /> + {formatHours(weekHours.sickHours)} betalt sygetid (talt ikke med ovenfor)
          </p>
        )}
      </Card>

      <div className="space-y-2">
        {attendance.days
          .filter((d) => !d.isWeekend)
          .map((day) => (
            <Card key={day.dateKey} className="p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-bold">
                  {day.label} {formatShortDate(new Date(day.dateKey))}
                </span>
                <Badge tone={day.status === "worked" ? "success" : day.status === "sick" ? "warning" : day.status === "open" ? "info" : "default"}>
                  {STATUS_LABEL[day.status]}
                </Badge>
              </div>

              {day.checkInAt && (
                <p className="mt-1.5 flex items-center gap-1.5 text-sm font-semibold text-[var(--muted)]">
                  <Clock size={13} />
                  {formatTime(new Date(day.checkInAt))}
                  {" – "}
                  {day.checkOutAt ? formatTime(new Date(day.checkOutAt)) : "i gang"}
                </p>
              )}

              {day.status === "none" && (
                <div className="mt-2">
                  {editingDay === day.dateKey ? (
                    <div className="flex flex-wrap items-end gap-2">
                      <div className="min-w-[110px] flex-1">
                        <input type="time" className={inputClass} value={startTime} onChange={(e) => setStartTime(e.target.value)} />
                      </div>
                      <div className="min-w-[110px] flex-1">
                        <input type="time" className={inputClass} value={endTime} onChange={(e) => setEndTime(e.target.value)} />
                      </div>
                      <Button size="sm" onClick={() => confirmSickDay(day.dateKey)} disabled={pending} className="flex shrink-0 items-center gap-1.5">
                        <Check size={14} /> Bekræft
                      </Button>
                    </div>
                  ) : (
                    <Button size="sm" variant="secondary" onClick={() => openEditor(day)} disabled={pending} className="flex items-center gap-1.5">
                      <Thermometer size={14} /> Marker som syg
                    </Button>
                  )}
                </div>
              )}
            </Card>
          ))}
      </div>

      {attendance.days.filter((d) => !d.isWeekend).every((d) => d.status === "none") && (
        <HistoricalWeekEntry weekStart={attendance.weekStart} onLogged={() => reloadAll(attendance.weekStart)} />
      )}

      {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}

      {sickDays.length > 0 && (
        <Card className="divide-y divide-[var(--border)] p-1">
          {sickDays.map((s) => (
            <div key={s.id} className="flex flex-wrap items-center justify-between gap-2 p-3 text-sm">
              <span className="flex items-center gap-2 text-[var(--muted)]">
                <Thermometer size={14} /> {formatShortDate(new Date(s.checkInAt))}
                <span className="font-mono text-xs">
                  {formatTime(new Date(s.checkInAt))} – {formatTime(new Date(s.checkOutAt))}
                </span>
              </span>
              <span className="font-bold">
                {s.hours.toFixed(1)}t · {formatKr(s.grossAmount)} brutto · {formatKr(s.netAmount)} netto
              </span>
              <button onClick={() => remove(s.id)} disabled={pending} className="rounded-xl p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]">
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
