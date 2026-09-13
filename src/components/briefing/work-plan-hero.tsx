import Link from "next/link";
import { Sun, ArrowRight } from "lucide-react";
import { Card, EmptyState, Button } from "@/components/ui/primitives";
import type { Prisma } from "@prisma/client";

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: { category: true; quantityLog: true };
}>;

export function WorkPlanHero({ tasks }: { tasks: TaskWithRelations[] }) {
  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="flex items-center gap-2 text-lg font-bold">
          <Sun size={20} /> Dagens arbejdsplan
        </h2>
        <Link href="/planlaegning" className="flex items-center gap-1 text-sm font-semibold text-accent">
          Åbn assistent <ArrowRight size={14} />
        </Link>
      </div>

      {tasks.length === 0 ? (
        <EmptyState
          icon="☀️"
          title="Ingen briefing endnu i dag"
          description="Fortæl din arbejdsassistent hvad der skal ske i dag."
          action={
            <Link href="/planlaegning">
              <Button size="sm">Start dagens briefing</Button>
            </Link>
          }
        />
      ) : (
        <div className="space-y-3">
          {tasks.map((t) => {
            const total = t.quantityTotal ?? 0;
            const done = t.quantityDone ?? 0;
            const percent = total > 0 ? Math.round((done / total) * 100) : 0;
            return (
              <div key={t.id}>
                <div className="mb-1 flex items-center justify-between text-sm">
                  <span className="font-semibold">
                    {t.category?.icon} {t.category?.name}
                  </span>
                  <span className="font-bold text-muted">
                    {done} / {total}
                  </span>
                </div>
                <div className="h-2.5 w-full overflow-hidden rounded-full bg-surface-2">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-accent to-amber-400 transition-all"
                    style={{ width: `${percent}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </Card>
  );
}
