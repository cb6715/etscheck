"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon, Droplets } from "lucide-react";
import clsx from "clsx";
import { Card } from "@/components/ui/primitives";
import { TaskItem } from "@/components/tasks/task-item";
import { getMonthTaskCounts } from "@/lib/actions/calendar";
import { getTasksForDay } from "@/lib/actions/tasks";
import { getBriefingForDate } from "@/lib/actions/briefing";
import { getTrailerWashesForDay } from "@/lib/actions/trailers";
import { formatDayHeading, isSameDay, formatTime } from "@/lib/date";
import type { Prisma, BriefingMessage } from "@prisma/client";

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: { checklistItems: true; category: true };
}>;

type TrailerWashWithTrailer = Prisma.TrailerWashGetPayload<{ include: { trailer: true } }>;

const MONTHS_DA = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];
const WEEKDAY_HEADERS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

// A calendar cell represents a calendar DAY, not a moment in time — building
// it as `new Date(y, m, d)` (the browser's own local timezone) and then
// handing that Date to a server action is what caused "today" to show up
// under the wrong cell: Next.js serializes it to its absolute instant, the
// server (UTC) re-derives its OWN day boundary from that instant, and a
// Danish local midnight lands in the PREVIOUS UTC day. Anchoring every
// calendar-day Date at UTC midnight instead sidesteps that entirely — for
// Denmark's always-positive UTC offset, `.getDate()`/`.getDay()` still read
// back the intended day in the browser, and the server's own UTC-based
// startOfDay() leaves a UTC-midnight instant untouched, exactly matching
// how every task/briefing "day" key is already computed server-side.
function dayKey(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month, day));
}

export function CalendarClient() {
  const today = new Date();
  const todayKey = dayKey(today.getFullYear(), today.getMonth(), today.getDate());
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [counts, setCounts] = useState<Record<string, { total: number; done: number }>>({});
  const [selectedDate, setSelectedDate] = useState(todayKey);
  const [dayTasks, setDayTasks] = useState<TaskWithRelations[]>([]);
  const [dayMessages, setDayMessages] = useState<BriefingMessage[]>([]);
  const [dayWashes, setDayWashes] = useState<TrailerWashWithTrailer[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

  useEffect(() => {
    getMonthTaskCounts(viewDate.getFullYear(), viewDate.getMonth()).then(setCounts);
  }, [viewDate]);

  useEffect(() => {
    setLoadingDay(true);
    Promise.all([
      getTasksForDay(selectedDate),
      getBriefingForDate(selectedDate),
      getTrailerWashesForDay(selectedDate),
    ])
      .then(([t, briefing, washes]) => {
        setDayTasks(t as TaskWithRelations[]);
        setDayMessages(briefing?.messages ?? []);
        setDayWashes(washes);
      })
      .finally(() => setLoadingDay(false));
  }, [selectedDate]);

  const year = viewDate.getFullYear();
  const month = viewDate.getMonth();
  const firstDay = new Date(year, month, 1);
  const startOffset = (firstDay.getDay() + 6) % 7; // Monday-first
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const cells: (Date | null)[] = [
    ...Array(startOffset).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => dayKey(year, month, i + 1)),
  ];

  return (
    <div className="space-y-6 pb-4">
      <header className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <CalendarIcon size={24} /> Kalender
        </h1>
      </header>

      <Card className="p-4 sm:p-5">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={() => setViewDate(new Date(year, month - 1, 1))}
            className="rounded-lg p-2 hover:bg-surface-2"
          >
            <ChevronLeft size={20} />
          </button>
          <p className="text-lg font-bold">
            {MONTHS_DA[month]} {year}
          </p>
          <button
            onClick={() => setViewDate(new Date(year, month + 1, 1))}
            className="rounded-lg p-2 hover:bg-surface-2"
          >
            <ChevronRight size={20} />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center text-xs font-semibold text-muted">
          {WEEKDAY_HEADERS.map((d) => (
            <div key={d} className="py-1">{d}</div>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((date, idx) => {
            if (!date) return <div key={idx} />;
            const key = date.toISOString().slice(0, 10);
            const info = counts[key];
            const isToday = isSameDay(date, todayKey);
            const isSelected = isSameDay(date, selectedDate);
            return (
              <button
                key={idx}
                onClick={() => setSelectedDate(date)}
                className={clsx(
                  "flex aspect-square flex-col items-center justify-center rounded-xl text-sm font-semibold transition",
                  isSelected
                    ? "bg-accent text-accent-foreground"
                    : isToday
                    ? "bg-[var(--accent-a15)] text-accent"
                    : "hover:bg-surface-2"
                )}
              >
                {date.getDate()}
                {info && (
                  <span
                    className={clsx(
                      "mt-0.5 h-1.5 w-1.5 rounded-full",
                      isSelected ? "bg-accent-foreground" : info.done === info.total ? "bg-success" : "bg-warning"
                    )}
                  />
                )}
              </button>
            );
          })}
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          {formatDayHeading(selectedDate)}
        </h2>
        {loadingDay ? (
          <p className="text-sm text-muted">Indlæser...</p>
        ) : dayTasks.length === 0 ? (
          <p className="text-sm text-muted">Ingen opgaver denne dag.</p>
        ) : (
          <div className="space-y-2">
            {dayTasks.map((t) => (
              <TaskItem key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      {dayWashes.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
            <Droplets size={14} /> Vasket denne dag
          </h2>
          <Card className="divide-y divide-border">
            {dayWashes.map((w) => (
              <div key={w.id} className="flex items-center justify-between p-3 text-sm">
                <span className="font-semibold">
                  Trailer #{w.trailer.number}
                  {w.company && <span className="ml-1.5 text-xs font-medium text-muted">{w.company}</span>}
                </span>
                <span className="text-xs text-muted">{formatTime(new Date(w.washedAt))}</span>
              </div>
            ))}
          </Card>
        </section>
      )}

      {dayMessages.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
            ☀️ Dagens briefing
          </h2>
          <Card className="space-y-2 p-4">
            {dayMessages
              .filter((m) => m.role === "USER")
              .map((m) => (
                <p key={m.id} className="text-sm">
                  <span className="mr-1.5 text-xs font-semibold text-muted">
                    {formatTime(new Date(m.createdAt))}
                  </span>
                  {m.text}
                </p>
              ))}
          </Card>
        </section>
      )}
    </div>
  );
}
