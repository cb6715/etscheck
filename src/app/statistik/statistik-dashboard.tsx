"use client";

import { useState, useTransition, type ReactNode } from "react";
import {
  Clock, TrendingUp, TrendingDown, Wallet, ListChecks, Droplets, Car, AlertTriangle,
  ChevronLeft, ChevronRight, Trophy, Lightbulb, Gauge, Info,
} from "lucide-react";
import { Card, Badge, inputClass } from "@/components/ui/primitives";
import { BarChart, LineChart } from "@/components/stats/charts";
import { getStatisticsDashboard, type DashboardData, type StatsPeriod } from "@/lib/actions/statistics";

function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}t ${m}min` : `${h}t`;
}

function formatKr(v: number): string {
  return `${Math.round(v).toLocaleString("da-DK")} kr`;
}

function dateToInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return dateToInputValue(d);
}

const PERIOD_LABELS: Record<StatsPeriod, string> = { day: "Dag", week: "Uge", month: "Måned", custom: "Periode" };

export function StatistikDashboard({ initialData }: { initialData: DashboardData }) {
  const [data, setData] = useState(initialData);
  const [period, setPeriod] = useState<StatsPeriod>("week");
  const [anchor, setAnchor] = useState(dateToInputValue(new Date()));
  const [customStart, setCustomStart] = useState(addDays(dateToInputValue(new Date()), -6));
  const [customEnd, setCustomEnd] = useState(dateToInputValue(new Date()));
  const [pending, startTransition] = useTransition();

  function reload(next: { period?: StatsPeriod; anchor?: string; customStart?: string; customEnd?: string }) {
    const nextPeriod = next.period ?? period;
    const nextAnchor = next.anchor ?? anchor;
    const nextCustomStart = next.customStart ?? customStart;
    const nextCustomEnd = next.customEnd ?? customEnd;
    startTransition(async () => {
      const result = await getStatisticsDashboard({
        period: nextPeriod,
        anchor: nextAnchor,
        customStart: nextCustomStart,
        customEnd: nextCustomEnd,
      });
      setData(result);
    });
  }

  function step(days: number) {
    const nextAnchor = addDays(anchor, days);
    setAnchor(nextAnchor);
    reload({ anchor: nextAnchor });
  }

  const stepSize = period === "day" ? 1 : period === "month" ? 30 : 7;

  return (
    <div className="space-y-6" style={{ opacity: pending ? 0.6 : 1, transition: "opacity 150ms" }}>
      <PeriodSelector
        period={period}
        onPeriodChange={(p) => {
          setPeriod(p);
          reload({ period: p });
        }}
        onPrev={() => step(-stepSize)}
        onNext={() => step(stepSize)}
        customStart={customStart}
        customEnd={customEnd}
        onCustomChange={(s, e) => {
          setCustomStart(s);
          setCustomEnd(e);
          reload({ period: "custom", customStart: s, customEnd: e });
        }}
      />

      <KpiGrid data={data} />

      <Section title="Dag-for-dag" icon={<TrendingUp size={14} />}>
        <Card className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Timer arbejdet pr. dag</p>
          <BarChart
            points={data.dailySeries.map((d) => ({ label: d.label, value: Math.round(d.hours * 10) / 10 }))}
            formatValue={(v) => `${v}t`}
          />
        </Card>
        <Card className="mt-3 p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Bruttoløn pr. dag</p>
          <LineChart
            points={data.dailySeries.map((d) => ({ label: d.label, value: Math.round(d.gross) }))}
            formatValue={(v) => `${v} kr`}
          />
        </Card>
      </Section>

      <Section title="Effektive tidspunkter" icon={<Gauge size={14} />}>
        <Card className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">
            Registreringer pr. time på døgnet (opgaver, optællinger, vasker)
          </p>
          <BarChart
            points={data.hourOfDay.map((h) => ({ label: h.hour % 3 === 0 ? String(h.hour) : "", value: h.count }))}
            height={110}
          />
        </Card>
      </Section>

      <Section title="Ugedage" icon={<Clock size={14} />}>
        <Card className="p-4">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted">Timer pr. ugedag</p>
          <BarChart
            points={reorderMondayFirst(data.weekdays).map((w) => ({ label: w.label, value: Math.round(w.hours * 10) / 10 }))}
            formatValue={(v) => `${v}t`}
            color="var(--info)"
          />
        </Card>
      </Section>

      <Section title="Vask" icon={<Droplets size={14} />}>
        <Card className="p-4">
          {data.washStats.total === 0 ? (
            <p className="text-sm text-muted">Ingen vasker registreret i denne periode.</p>
          ) : (
            <>
              <p className="text-sm">
                <span className="font-bold">{data.washStats.total}</span> trailere vasket i alt
                {data.washStats.busiestWeekdayLabel && (
                  <span className="text-muted"> · travleste ugedag: {data.washStats.busiestWeekdayLabel}</span>
                )}
              </p>
              <div className="mt-3 space-y-1.5">
                {data.washStats.byCompany.map((c) => (
                  <div key={c.company} className="flex items-center justify-between text-sm">
                    <span>{c.company}</span>
                    <span className="font-semibold tabular-nums">{c.count}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </Card>
      </Section>

      <Section title="Opgavetyper" icon={<ListChecks size={14} />}>
        <Card className="divide-y divide-border">
          {data.categoryBreakdown.length === 0 ? (
            <p className="p-4 text-sm text-muted">Ingen registreringer i denne periode.</p>
          ) : (
            data.categoryBreakdown.map((c) => (
              <div key={c.categoryId ?? "none"} className="flex items-center justify-between p-3 text-sm">
                <span className="flex items-center gap-2 font-semibold">
                  <span>{c.icon}</span> {c.name}
                </span>
                <span className="text-right text-xs text-muted">
                  {c.completedTasks > 0 && <span>{c.completedTasks} fuldført</span>}
                  {c.completedTasks > 0 && c.quantityDone > 0 && " · "}
                  {c.quantityDone > 0 && (
                    <span>
                      {c.quantityDone}
                      {c.quantityTotal ? `/${c.quantityTotal}` : ""} stk
                    </span>
                  )}
                </span>
              </div>
            ))
          )}
        </Card>
      </Section>

      <Section title="Produktivitet" icon={<Gauge size={14} />}>
        <Card className="p-4 text-center">
          {data.productivity.itemsPerHour === null ? (
            <p className="text-sm text-muted">Ingen arbejdstimer registreret i denne periode — kan ikke beregne produktivitet pr. time.</p>
          ) : (
            <>
              <div className="text-3xl font-extrabold">{data.productivity.itemsPerHour.toFixed(1)}</div>
              <p className="text-xs font-medium text-muted">
                registreringer pr. arbejdstime ({data.productivity.itemsCount} stk / {formatHours(data.productivity.hoursWorked)})
              </p>
            </>
          )}
        </Card>
      </Section>

      <Section title="Personlige rekorder" icon={<Trophy size={14} />}>
        <Card className="divide-y divide-border">
          {data.records.length === 0 ? (
            <p className="p-4 text-sm text-muted">Ikke nok data endnu til at sætte rekorder.</p>
          ) : (
            data.records.map((r) => (
              <div key={r.label} className="flex items-center justify-between p-3 text-sm">
                <span className="font-medium text-muted">{r.label}</span>
                <span className="text-right">
                  <span className="font-bold">{r.value}</span>
                  {r.dateLabel && <span className="ml-1.5 text-xs text-muted">({r.dateLabel})</span>}
                </span>
              </div>
            ))
          )}
        </Card>
      </Section>

      <TimelineSection data={data} />

      {data.insights.length > 0 && (
        <Section title="Indsigter" icon={<Lightbulb size={14} />}>
          <Card className="space-y-2 p-4">
            {data.insights.map((line, i) => (
              <p key={i} className="text-sm">
                {line}
              </p>
            ))}
          </Card>
        </Section>
      )}

      <Section title="Datadækning" icon={<Info size={14} />}>
        <Card className="space-y-2 p-4">
          {data.dataNotes.map((note, i) => (
            <p key={i} className="text-xs text-muted">
              {note}
            </p>
          ))}
        </Card>
      </Section>
    </div>
  );
}

function reorderMondayFirst<T extends { weekday: number }>(buckets: T[]): T[] {
  const order = [1, 2, 3, 4, 5, 6, 0];
  return order.map((dow) => buckets.find((b) => b.weekday === dow)!).filter(Boolean);
}

function PeriodSelector({
  period,
  onPeriodChange,
  onPrev,
  onNext,
  customStart,
  customEnd,
  onCustomChange,
}: {
  period: StatsPeriod;
  onPeriodChange: (p: StatsPeriod) => void;
  onPrev: () => void;
  onNext: () => void;
  customStart: string;
  customEnd: string;
  onCustomChange: (start: string, end: string) => void;
}) {
  return (
    <Card className="p-3">
      <div className="flex items-center gap-2">
        {(["day", "week", "month", "custom"] as StatsPeriod[]).map((p) => (
          <button
            key={p}
            onClick={() => onPeriodChange(p)}
            className={`flex-1 rounded-lg px-2 py-2 text-sm font-semibold transition ${
              period === p ? "bg-accent text-accent-foreground" : "bg-surface-2 text-muted hover:text-foreground"
            }`}
          >
            {PERIOD_LABELS[p]}
          </button>
        ))}
      </div>
      {period === "custom" ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <input
            type="date"
            className={inputClass}
            value={customStart}
            onChange={(e) => onCustomChange(e.target.value, customEnd)}
          />
          <input
            type="date"
            className={inputClass}
            value={customEnd}
            onChange={(e) => onCustomChange(customStart, e.target.value)}
          />
        </div>
      ) : (
        <div className="mt-2 flex items-center justify-between">
          <button onClick={onPrev} className="rounded-lg p-2 hover:bg-surface-2">
            <ChevronLeft size={18} />
          </button>
          <span className="text-xs font-medium text-muted">Forrige / næste {PERIOD_LABELS[period].toLowerCase()}</span>
          <button onClick={onNext} className="rounded-lg p-2 hover:bg-surface-2">
            <ChevronRight size={18} />
          </button>
        </div>
      )}
    </Card>
  );
}

function KpiGrid({ data }: { data: DashboardData }) {
  const items = [
    { label: "Timer", value: formatHours(data.kpis.hoursWorked), prev: data.previousKpis.hoursWorked, cur: data.kpis.hoursWorked, icon: <Clock size={16} /> },
    { label: "Bruttoløn", value: formatKr(data.kpis.grossAmount), prev: data.previousKpis.grossAmount, cur: data.kpis.grossAmount, icon: <Wallet size={16} /> },
    { label: "Nettoløn", value: formatKr(data.kpis.netAmount), prev: data.previousKpis.netAmount, cur: data.kpis.netAmount, icon: <Wallet size={16} /> },
    { label: "Opgaver fuldført", value: `${data.kpis.tasksCompleted}/${data.kpis.tasksTotal}`, prev: data.previousKpis.tasksCompleted, cur: data.kpis.tasksCompleted, icon: <ListChecks size={16} /> },
    { label: "Optællinger", value: `${data.kpis.quantityUnitsDone} stk`, prev: data.previousKpis.quantityUnitsDone, cur: data.kpis.quantityUnitsDone, icon: <ListChecks size={16} /> },
    { label: "Vasket", value: `${data.kpis.washes} trailere`, prev: data.previousKpis.washes, cur: data.kpis.washes, icon: <Droplets size={16} /> },
    { label: "Drive-in", value: `${data.kpis.driveIns}`, prev: data.previousKpis.driveIns, cur: data.kpis.driveIns, icon: <Car size={16} /> },
    { label: "Problemer", value: `${data.kpis.problemsResolved}/${data.kpis.problemsLogged}`, prev: data.previousKpis.problemsLogged, cur: data.kpis.problemsLogged, icon: <AlertTriangle size={16} /> },
  ];
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {items.map((item) => (
        <Card key={item.label} className="p-3">
          <div className="flex items-center justify-between text-muted">
            {item.icon}
            <DeltaIndicator current={item.cur} previous={item.prev} />
          </div>
          <div className="mt-1.5 text-lg font-extrabold tabular-nums">{item.value}</div>
          <div className="text-xs font-medium text-muted">{item.label}</div>
        </Card>
      ))}
    </div>
  );
}

function DeltaIndicator({ current, previous }: { current: number; previous: number }) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return null;
  const up = pct > 0;
  return (
    <span className={`flex items-center gap-0.5 text-[11px] font-bold ${up ? "text-success" : "text-danger"}`}>
      {up ? <TrendingUp size={12} /> : <TrendingDown size={12} />} {Math.abs(pct)}%
    </span>
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section>
      <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-muted">
        {icon} {title}
      </h2>
      {children}
    </section>
  );
}

function TimelineSection({ data }: { data: DashboardData }) {
  return (
    <Section title="Dagens tidslinje" icon={<Clock size={14} />}>
      {!data.timelineToday ? (
        <Card className="p-4">
          <p className="text-sm text-muted">Ingen vagt eller registreringer i dag endnu.</p>
        </Card>
      ) : (
        <Card className="p-4">
          <div className="mb-3 flex items-center justify-between text-sm">
            <Badge tone={data.timelineToday.isOpen ? "success" : "default"}>
              {data.timelineToday.checkInIso ? timeOf(data.timelineToday.checkInIso) : "—"}
              {" – "}
              {data.timelineToday.checkOutIso ? timeOf(data.timelineToday.checkOutIso) : data.timelineToday.isOpen ? "nu" : "—"}
            </Badge>
            <span className="text-xs text-muted">
              Ulønnet pause {minutesToTime(data.timelineToday.breakStartMinutes)}–{minutesToTime(data.timelineToday.breakEndMinutes)}
            </span>
          </div>
          {data.timelineToday.events.length === 0 ? (
            <p className="text-sm text-muted">Ingen enkeltregistreringer endnu i dag.</p>
          ) : (
            <div className="space-y-2">
              {data.timelineToday.events.map((ev, i) => (
                <div key={i} className="flex items-center gap-2 text-sm">
                  <span className="w-12 shrink-0 font-mono text-xs text-muted">{ev.timeLabel}</span>
                  <span>{ev.label}</span>
                </div>
              ))}
            </div>
          )}
        </Card>
      )}
    </Section>
  );
}

function timeOf(iso: string): string {
  return new Date(iso).toLocaleTimeString("da-DK", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Copenhagen" });
}

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}
