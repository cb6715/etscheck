"use client";

import { useMemo, useState, useTransition } from "react";
import { Copy, Save, ChevronLeft, ChevronRight, X } from "lucide-react";
import { Card, Field, inputClass, Button, Badge } from "@/components/ui/primitives";
import { weekdayShort } from "@/lib/date";
import {
  setTemplateDay,
  upsertScheduledShift,
  deleteScheduledShift,
  generateMonthFromTemplate,
  getScheduledShifts,
  type TemplateDayRow,
  type ScheduledShiftRow,
} from "@/lib/schedule-actions";
import type { WorkplaceRow } from "@/lib/workplace-actions";

// scheduled_shifts.shift_date comes back as a plain DATE column, parsed by
// the pg driver into a Date at UTC MIDNIGHT of that exact calendar day (no
// timezone shift applied for DATE columns) — so reading its UTC getters
// directly gives the right calendar day, with no Copenhagen-zone detour
// needed (unlike a TIMESTAMP, which really is a specific instant).
function dateColumnKey(d: Date): string {
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`;
}

const WEEKDAY_ORDER = [1, 2, 3, 4, 5, 6, 0]; // Mandag..søndag, for a Danish-habit template editor
const STATUS_LABEL: Record<string, string> = { planned: "Planlagt", off: "Fri", sick: "Sygedag", extra: "Ekstravagt" };
const STATUS_TONE: Record<string, "default" | "success" | "warning" | "danger" | "info"> = {
  planned: "info",
  off: "default",
  sick: "warning",
  extra: "success",
};

function minutesToTime(m: number | null): string {
  if (m === null) return "";
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

function timeToMinutes(t: string): number | null {
  if (!t) return null;
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
}

type TemplateDraft = { startMinutes: number | null; endMinutes: number | null; workplaceId: number | null };

export function PlanlaegningClient({
  initialYear,
  initialMonth,
  initialTemplate,
  initialShifts,
  workplaces,
}: {
  initialYear: number;
  initialMonth: number;
  initialTemplate: TemplateDayRow[];
  initialShifts: ScheduledShiftRow[];
  workplaces: WorkplaceRow[];
}) {
  const [, startTransition] = useTransition();
  const [pending, setPending] = useState(false);
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [shifts, setShifts] = useState(initialShifts);
  const [selectedDay, setSelectedDay] = useState<string | null>(null);
  const [notice, setNotice] = useState("");

  const [template, setTemplate] = useState<Record<number, TemplateDraft>>(() => {
    const byWeekday: Record<number, TemplateDraft> = {};
    for (const day of initialTemplate) {
      byWeekday[day.weekday] = { startMinutes: day.start_minutes, endMinutes: day.end_minutes, workplaceId: day.workplace_id };
    }
    return byWeekday;
  });

  const shiftsByDate = useMemo(() => {
    const map = new Map<string, ScheduledShiftRow>();
    for (const s of shifts) map.set(dateColumnKey(s.shift_date), s);
    return map;
  }, [shifts]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const monthDays = Array.from({ length: daysInMonth }, (_, i) => new Date(year, month - 1, i + 1));

  function workplaceName(id: number | null): string | null {
    if (id === null) return null;
    return workplaces.find((w) => w.id === id)?.name ?? null;
  }

  async function reloadMonth(y: number, m: number) {
    const start = new Date(y, m - 1, 1);
    const end = new Date(y, m, 0);
    const fresh = await getScheduledShifts(start, end);
    setShifts(fresh);
  }

  function changeMonth(delta: number) {
    let y = year;
    let m = month + delta;
    if (m < 1) {
      m = 12;
      y -= 1;
    } else if (m > 12) {
      m = 1;
      y += 1;
    }
    setYear(y);
    setMonth(m);
    setSelectedDay(null);
    startTransition(() => {
      reloadMonth(y, m);
    });
  }

  const emptyDraft: TemplateDraft = { startMinutes: null, endMinutes: null, workplaceId: null };

  function updateTemplateDraft(weekday: number, patch: Partial<TemplateDraft>) {
    setTemplate((t) => ({ ...t, [weekday]: { ...emptyDraft, ...t[weekday], ...patch } }));
  }

  function saveTemplate() {
    setPending(true);
    setNotice("");
    startTransition(async () => {
      for (const weekday of WEEKDAY_ORDER) {
        const draft = template[weekday] ?? { startMinutes: null, endMinutes: null, workplaceId: null };
        await setTemplateDay({ weekday, ...draft });
      }
      setPending(false);
      setNotice("Ugeskabelon gemt.");
      setTimeout(() => setNotice(""), 2500);
    });
  }

  function generateMonth() {
    setPending(true);
    setNotice("");
    startTransition(async () => {
      const result = await generateMonthFromTemplate(year, month);
      setPending(false);
      if (!result.ok) {
        setNotice(result.error);
        return;
      }
      setNotice(`${result.data.created} dag(e) planlagt fra skabelonen.`);
      await reloadMonth(year, month);
      setTimeout(() => setNotice(""), 3500);
    });
  }

  function saveDay(dateKey: string, input: { startMinutes: number | null; endMinutes: number | null; workplaceId: number | null; status: "planned" | "off" | "sick" | "extra" }) {
    const [y, m, d] = dateKey.split("-").map(Number);
    setPending(true);
    startTransition(async () => {
      await upsertScheduledShift({ date: new Date(y, m - 1, d), ...input });
      setPending(false);
      setSelectedDay(null);
      await reloadMonth(year, month);
    });
  }

  function removeDay(dateKey: string) {
    const [y, m, d] = dateKey.split("-").map(Number);
    setPending(true);
    startTransition(async () => {
      await deleteScheduledShift(new Date(y, m - 1, d));
      setPending(false);
      setSelectedDay(null);
      await reloadMonth(year, month);
    });
  }

  return (
    <div className="space-y-5">
      <Card className="space-y-3 p-5">
        <h2 className="text-sm font-extrabold">Ugeskabelon</h2>
        <p className="text-xs text-[var(--muted)]">
          Dit normale mønster for en uge. &quot;Kopier til måned&quot; nedenfor stempler den ud over en hel
          kalendermåned i ét hug — enkelte dage kan altid redigeres bagefter uden at det ændrer skabelonen.
        </p>
        <div className="space-y-2">
          {WEEKDAY_ORDER.map((weekday) => {
            const draft = template[weekday] ?? { startMinutes: null, endMinutes: null, workplaceId: null };
            const isOff = draft.startMinutes === null;
            return (
              <div key={weekday} className="glass grid grid-cols-[3.5rem_1fr_1fr_1fr] items-center gap-2 rounded-xl p-2.5">
                <span className="text-sm font-bold capitalize">{weekdayShort(weekday)}</span>
                <label className="flex items-center gap-1.5 text-xs text-[var(--muted)]">
                  <input
                    type="checkbox"
                    checked={!isOff}
                    onChange={(e) =>
                      updateTemplateDraft(weekday, e.target.checked ? { startMinutes: 8 * 60, endMinutes: 16 * 60 } : { startMinutes: null, endMinutes: null })
                    }
                  />
                  Arbejdsdag
                </label>
                <input
                  className={inputClass}
                  type="time"
                  disabled={isOff}
                  value={minutesToTime(draft.startMinutes)}
                  onChange={(e) => updateTemplateDraft(weekday, { startMinutes: timeToMinutes(e.target.value) })}
                />
                <input
                  className={inputClass}
                  type="time"
                  disabled={isOff}
                  value={minutesToTime(draft.endMinutes)}
                  onChange={(e) => updateTemplateDraft(weekday, { endMinutes: timeToMinutes(e.target.value) })}
                />
              </div>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={saveTemplate} disabled={pending} className="flex items-center gap-2">
            <Save size={16} /> Gem skabelon
          </Button>
          <Button variant="secondary" onClick={generateMonth} disabled={pending} className="flex items-center gap-2">
            <Copy size={16} /> Kopier til denne måned
          </Button>
        </div>
        {notice && <p className="text-sm font-semibold text-[var(--accent)]">{notice}</p>}
      </Card>

      <Card className="space-y-3 p-5">
        <div className="flex items-center justify-between">
          <button onClick={() => changeMonth(-1)} className="rounded-full p-2 hover:bg-[var(--surface-2)]" aria-label="Forrige måned">
            <ChevronLeft size={18} />
          </button>
          <h2 className="text-sm font-extrabold">
            {new Date(year, month - 1, 1).toLocaleDateString("da-DK", { month: "long", year: "numeric" })}
          </h2>
          <button onClick={() => changeMonth(1)} className="rounded-full p-2 hover:bg-[var(--surface-2)]" aria-label="Næste måned">
            <ChevronRight size={18} />
          </button>
        </div>

        <ul className="space-y-1.5">
          {monthDays.map((date) => {
            const dateKey = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
            const shift = shiftsByDate.get(dateKey);
            const open = selectedDay === dateKey;
            return (
              <li key={dateKey}>
                <button
                  type="button"
                  onClick={() => setSelectedDay(open ? null : dateKey)}
                  className="glass flex w-full items-center justify-between gap-2 rounded-xl p-2.5 text-left"
                >
                  <span className="text-sm font-semibold">
                    {date.getDate()}. {weekdayShort(date.getDay() === 0 ? 0 : date.getDay())}
                  </span>
                  <span className="flex items-center gap-2 text-xs text-[var(--muted)]">
                    {shift && shift.start_minutes !== null && (
                      <span>
                        {minutesToTime(shift.start_minutes)}-{minutesToTime(shift.end_minutes)}
                        {workplaceName(shift.workplace_id) ? ` · ${workplaceName(shift.workplace_id)}` : ""}
                      </span>
                    )}
                    {shift && <Badge tone={STATUS_TONE[shift.status] ?? "default"}>{STATUS_LABEL[shift.status] ?? shift.status}</Badge>}
                    {!shift && <span className="italic">Ikke planlagt</span>}
                  </span>
                </button>
                {open && (
                  <DayEditor
                    dateKey={dateKey}
                    shift={shift}
                    workplaces={workplaces}
                    onSave={(input) => saveDay(dateKey, input)}
                    onDelete={() => removeDay(dateKey)}
                    onClose={() => setSelectedDay(null)}
                    pending={pending}
                  />
                )}
              </li>
            );
          })}
        </ul>
      </Card>
    </div>
  );
}

function DayEditor({
  dateKey,
  shift,
  workplaces,
  onSave,
  onDelete,
  onClose,
  pending,
}: {
  dateKey: string;
  shift: ScheduledShiftRow | undefined;
  workplaces: WorkplaceRow[];
  onSave: (input: { startMinutes: number | null; endMinutes: number | null; workplaceId: number | null; status: "planned" | "off" | "sick" | "extra" }) => void;
  onDelete: () => void;
  onClose: () => void;
  pending: boolean;
}) {
  const [status, setStatus] = useState<"planned" | "off" | "sick" | "extra">((shift?.status as "planned" | "off" | "sick" | "extra") ?? "planned");
  const [start, setStart] = useState(minutesToTime(shift?.start_minutes ?? 8 * 60));
  const [end, setEnd] = useState(minutesToTime(shift?.end_minutes ?? 16 * 60));
  const [workplaceId, setWorkplaceId] = useState<string>(shift?.workplace_id ? String(shift.workplace_id) : "");

  const needsHours = status === "planned" || status === "extra";

  return (
    <div className="glass-strong mt-1.5 space-y-3 rounded-xl p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-xs font-bold text-[var(--muted)]">{dateKey}</p>
        <button onClick={onClose} className="text-[var(--muted)]">
          <X size={16} />
        </button>
      </div>
      <Field label="Status">
        <select className={inputClass} value={status} onChange={(e) => setStatus(e.target.value as typeof status)}>
          <option value="planned">Planlagt vagt</option>
          <option value="off">Fri</option>
          <option value="sick">Sygedag</option>
          <option value="extra">Ekstravagt</option>
        </select>
      </Field>
      {needsHours && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="Fra">
            <input className={inputClass} type="time" value={start} onChange={(e) => setStart(e.target.value)} />
          </Field>
          <Field label="Til">
            <input className={inputClass} type="time" value={end} onChange={(e) => setEnd(e.target.value)} />
          </Field>
        </div>
      )}
      {needsHours && workplaces.length > 0 && (
        <Field label="Arbejdssted">
          <select className={inputClass} value={workplaceId} onChange={(e) => setWorkplaceId(e.target.value)}>
            <option value="">Ingen valgt</option>
            {workplaces.map((w) => (
              <option key={w.id} value={w.id}>
                {w.name}
              </option>
            ))}
          </select>
        </Field>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          disabled={pending}
          onClick={() =>
            onSave({
              startMinutes: needsHours ? timeToMinutes(start) : null,
              endMinutes: needsHours ? timeToMinutes(end) : null,
              workplaceId: needsHours && workplaceId ? Number(workplaceId) : null,
              status,
            })
          }
        >
          Gem
        </Button>
        {shift && (
          <Button variant="danger" disabled={pending} onClick={onDelete}>
            Fjern planlagt dag
          </Button>
        )}
      </div>
    </div>
  );
}
