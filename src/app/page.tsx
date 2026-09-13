import Link from "next/link";
import { AlertTriangle, ArrowRight, Car, ClipboardList, Truck } from "lucide-react";
import { ensureTodayTasksGenerated, getTasksForDay } from "@/lib/actions/tasks";
import { getTrailers } from "@/lib/actions/trailers";
import { getTodayVisits } from "@/lib/actions/drivein";
import { getOpenProblems } from "@/lib/actions/misc";
import { getQuantityTasksForDay } from "@/lib/actions/briefing";
import { Card, Badge, ProgressBar, EmptyState, Button } from "@/components/ui/primitives";
import { TaskItem } from "@/components/tasks/task-item";
import { WorkPlanHero } from "@/components/briefing/work-plan-hero";
import { formatLongDate, greeting, formatTime } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function DashboardPage() {
  const now = new Date();
  await ensureTodayTasksGenerated(now);

  const [tasks, trailers, visits, problems, quantityTasks] = await Promise.all([
    getTasksForDay(now),
    getTrailers(),
    getTodayVisits(),
    getOpenProblems(),
    getQuantityTasksForDay(now),
  ]);

  const doneTasks = tasks.filter((t) => t.completed).length;
  const missingTasks = tasks.length - doneTasks;
  const washedTrailers = trailers.filter((t) => t.status === "VASKET").length;
  const missingTrailers = trailers.filter((t) => t.status === "MANGLER").length;
  const percent = tasks.length ? Math.round((doneTasks / tasks.length) * 100) : 0;

  const sortedTasks = [...tasks].sort((a, b) => {
    if (a.completed !== b.completed) return a.completed ? 1 : -1;
    return a.order - b.order;
  });

  return (
    <div className="space-y-6 pb-4">
      <header>
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {greeting(now)} 👋
        </h1>
        <p className="mt-1 font-medium text-muted">{formatLongDate(now)}</p>
      </header>

      {problems.length > 0 && (
        <Card className="border-[var(--danger-a40)] bg-danger-bg p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 shrink-0 text-danger" size={20} />
            <div className="min-w-0 flex-1">
              <p className="font-bold text-danger">
                {problems.length} {problems.length === 1 ? "problem" : "problemer"} kræver opmærksomhed
              </p>
              <ul className="mt-1 space-y-0.5 text-sm text-foreground/80">
                {problems.slice(0, 3).map((p) => (
                  <li key={p.id} className="truncate">
                    {p.trailer ? `Trailer #${p.trailer.number}: ` : ""}
                    {p.text}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </Card>
      )}

      <WorkPlanHero tasks={quantityTasks} />

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          Dagens status
        </h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <StatChip emoji="🟢" value={doneTasks} label="færdige" />
          <StatChip emoji="🟡" value={missingTasks} label="mangler" />
          <StatChip emoji="🚛" value={visits.length} label="drive-in kunder" />
          <StatChip emoji="🧼" value={washedTrailers} label="trailere vasket" />
        </div>
      </section>

      <Card className="p-5">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
            Dagens fremgang
          </h2>
          <span className="text-lg font-extrabold text-accent">{percent}%</span>
        </div>
        <ProgressBar percent={percent} />
      </Card>

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-lg font-bold">
            <ClipboardList size={20} /> Dagens arbejde
          </h2>
          <Link href="/opgaver" className="flex items-center gap-1 text-sm font-semibold text-accent">
            Se alle <ArrowRight size={14} />
          </Link>
        </div>
        {sortedTasks.length === 0 ? (
          <EmptyState
            icon="📋"
            title="Ingen opgaver i dag"
            description="Opret en opgave for at komme i gang."
            action={
              <Link href="/opgaver?new=1">
                <Button size="sm">Ny opgave</Button>
              </Link>
            }
          />
        ) : (
          <div className="space-y-2">
            {sortedTasks.slice(0, 6).map((task) => (
              <TaskItem key={task.id} task={task} />
            ))}
          </div>
        )}
      </section>

      <div className="grid gap-4 sm:grid-cols-2">
        <Link href="/drive-in">
          <Card className="p-5 transition hover:border-[var(--accent-a40)]">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold">
                <Car size={18} /> Drive-in
              </h3>
              <Badge tone="warning">{visits.length} i dag</Badge>
            </div>
            {visits.length === 0 ? (
              <p className="text-sm text-muted">Ingen drive-in kunder registreret endnu i dag.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {visits.slice(0, 3).map((v) => (
                  <li key={v.id} className="flex items-center justify-between text-muted">
                    <span className="font-medium text-foreground">{v.customer.licensePlateDisplay}</span>
                    <span>{formatTime(new Date(v.visitedAt))}</span>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Link>

        <Link href="/vask">
          <Card className="p-5 transition hover:border-[var(--accent-a40)]">
            <div className="mb-2 flex items-center justify-between">
              <h3 className="flex items-center gap-2 font-bold">
                <Truck size={18} /> Vaskeplan
              </h3>
              <Badge tone={missingTrailers > 0 ? "warning" : "success"}>
                {missingTrailers} mangler
              </Badge>
            </div>
            {trailers.length === 0 ? (
              <p className="text-sm text-muted">Ingen trailere i vaskeplanen endnu.</p>
            ) : (
              <ul className="space-y-1.5 text-sm">
                {trailers.slice(0, 3).map((t) => (
                  <li key={t.id} className="flex items-center justify-between">
                    <span className="font-medium">Trailer #{t.number}</span>
                    <TrailerStatusDot status={t.status} />
                  </li>
                ))}
              </ul>
            )}
          </Card>
        </Link>
      </div>
    </div>
  );
}

function StatChip({ emoji, value, label }: { emoji: string; value: number; label: string }) {
  return (
    <Card className="p-4 text-center">
      <div className="text-2xl">{emoji}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
      <div className="text-xs font-medium text-muted">{label}</div>
    </Card>
  );
}

function TrailerStatusDot({ status }: { status: string }) {
  const map: Record<string, { tone: "success" | "warning" | "danger" | "info"; label: string }> = {
    VASKET: { tone: "success", label: "🟢 Vasket" },
    MANGLER: { tone: "warning", label: "🟡 Mangler" },
    I_GANG: { tone: "info", label: "🔵 I gang" },
    AFVENTER: { tone: "default" as never, label: "⚪ Afventer" },
    PROBLEM: { tone: "danger", label: "🔴 Problem" },
  };
  const s = map[status] ?? map.MANGLER;
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
