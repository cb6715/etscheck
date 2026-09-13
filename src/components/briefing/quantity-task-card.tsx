"use client";

import { useTransition } from "react";
import { Minus, Plus, Moon } from "lucide-react";
import { Card, ProgressBar } from "@/components/ui/primitives";
import { adjustQuantityDone } from "@/lib/actions/briefing";
import type { Prisma } from "@prisma/client";

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: { category: true; quantityLog: true };
}>;

export function QuantityTaskCard({ task }: { task: TaskWithRelations }) {
  const [pending, startTransition] = useTransition();

  const total = task.quantityTotal ?? 0;
  const done = task.quantityDone ?? 0;
  const remaining = Math.max(total - done, 0);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const natholdDone = task.quantityLog
    .filter((l) => l.shift === "NATHOLD")
    .reduce((sum, l) => sum + l.delta, 0);

  return (
    <Card className="p-4">
      <div className="mb-2 flex items-center justify-between">
        <p className="flex items-center gap-2 font-bold">
          <span className="text-lg">{task.category?.icon ?? "📋"}</span>
          {task.category?.name ?? task.title}
        </p>
        <span className="text-sm font-semibold text-muted">
          {done} / {total}
        </span>
      </div>

      <ProgressBar percent={percent} />

      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs text-muted">
          {natholdDone > 0 && (
            <span className="flex items-center gap-1">
              <Moon size={12} /> {natholdDone} nathold
            </span>
          )}
          {remaining === 0 && total > 0 && <span className="font-semibold text-success">✓ Færdig</span>}
        </div>
        <div className="flex items-center gap-1.5">
          <button
            onClick={() => startTransition(() => adjustQuantityDone(task.id, -1))}
            disabled={pending || done <= 0}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted transition hover:text-foreground disabled:opacity-30"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={() => startTransition(() => adjustQuantityDone(task.id, 1))}
            disabled={pending || done >= total}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-[var(--accent-a15)] text-accent transition hover:bg-[var(--accent-a25)] disabled:opacity-30"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>
    </Card>
  );
}
