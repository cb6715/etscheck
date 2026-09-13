"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Calendar as CalendarIcon } from "lucide-react";
import clsx from "clsx";
import { Card } from "@/components/ui/primitives";
import { TaskItem } from "@/components/tasks/task-item";
import { getMonthTaskCounts } from "@/lib/actions/calendar";
import { getTasksForDay } from "@/lib/actions/tasks";
import { getBriefingForDate } from "@/lib/actions/briefing";
import { formatDayHeading, isSameDay, formatTime } from "@/lib/date";
import type { Prisma, BriefingMessage } from "@prisma/client";

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: { checklistItems: true; category: true };
}>;

const MONTHS_DA = [
  "Januar", "Februar", "Marts", "April", "Maj", "Juni",
  "Juli", "August", "September", "Oktober", "November", "December",
];
const WEEKDAY_HEADERS = ["Man", "Tir", "Ons", "Tor", "Fre", "Lør", "Søn"];

export function CalendarClient() {
  const today = new Date();
  const [viewDate, setViewDate] = useState(new Date(today.getFullYear(), today.getMonth(), 1));
  const [counts, setCounts] = useState<Record<string, { total: number; done: number }>>({});
  const [selectedDate, setSelectedDate] = useState(today);
  const [dayTasks, setDayTasks] = useState<TaskWithRelations[]>([]);
  const [dayMessages, setDayMessages] = useState<BriefingMessage[]>([]);
  const [loadingDay, setLoadingDay] = useState(false);

  useEffect(() => {
    getMonthTaskCounts(viewDate.getFullYear(), viewDate.getMonth()).then(setCounts);
  }, [viewDate]);

  useEffect(() => {
    setLoadingDay(true);
    Promise.all([
      getTasksForDay(selectedDate),
      getBriefingForDate(selectedDate),
    ])
      .then(([t, briefing]) => {
        setDayTasks(t as TaskWithRelations[]);
        setDayMessages(briefing?.messages ?? []);
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
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(year, month, i + 1)),
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
            const isToday = isSameDay(date, today);
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
                    ? "bg-accent/15 text-accent"
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
