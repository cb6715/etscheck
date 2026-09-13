import { BarChart3 } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { getCurrentUserId } from "@/lib/current-user";
import { getWeekRange, getMonthRange } from "@/lib/date";
import { Card } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

async function getStats(userId: string, start: Date, end: Date) {
  const [tasksTotal, tasksDone, washes, visits, problems] = await Promise.all([
    prisma.task.count({ where: { userId, deletedAt: null, scheduledFor: { gte: start, lte: end } } }),
    prisma.task.count({ where: { userId, deletedAt: null, completed: true, scheduledFor: { gte: start, lte: end } } }),
    prisma.trailerWash.count({ where: { userId, washedAt: { gte: start, lte: end } } }),
    prisma.driveInVisit.count({ where: { userId, visitedAt: { gte: start, lte: end } } }),
    prisma.note.count({ where: { userId, isProblem: true, createdAt: { gte: start, lte: end } } }),
  ]);
  return { tasksTotal, tasksDone, washes, visits, problems };
}

export default async function StatistikPage() {
  const userId = await getCurrentUserId();
  const now = new Date();
  const week = getWeekRange(now);
  const month = getMonthRange(now);

  const [weekStats, monthStats] = await Promise.all([
    getStats(userId, week.start, week.end),
    getStats(userId, month.start, month.end),
  ]);

  return (
    <div className="space-y-8 pb-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 size={24} /> Statistik
        </h1>
      </header>

      <StatBlock title="Denne uge" stats={weekStats} />
      <StatBlock title="Denne måned" stats={monthStats} />
    </div>
  );
}

function StatBlock({
  title,
  stats,
}: {
  title: string;
  stats: { tasksTotal: number; tasksDone: number; washes: number; visits: number; problems: number };
}) {
  return (
    <section>
      <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">{title}</h2>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Opgaver" value={stats.tasksTotal} emoji="📋" />
        <Stat label="Færdige" value={stats.tasksDone} emoji="✅" />
        <Stat label="Drive-in" value={stats.visits} emoji="🚗" />
        <Stat label="Trailere vasket" value={stats.washes} emoji="🧼" />
        <Stat label="Problemer" value={stats.problems} emoji="⚠️" />
      </div>
    </section>
  );
}

function Stat({ label, value, emoji }: { label: string; value: number; emoji: string }) {
  return (
    <Card className="p-4 text-center">
      <div className="text-xl">{emoji}</div>
      <div className="mt-1 text-2xl font-extrabold">{value}</div>
      <div className="text-xs font-medium text-muted">{label}</div>
    </Card>
  );
}
