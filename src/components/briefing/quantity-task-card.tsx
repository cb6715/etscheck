"use client";

import { useState, useTransition } from "react";
import { Minus, Plus, Moon, ChevronDown, ChevronUp, Truck } from "lucide-react";
import { Card, ProgressBar, Badge } from "@/components/ui/primitives";
import { adjustQuantityDone } from "@/lib/actions/briefing";
import { WashRegisterModal } from "./wash-register-modal";
import { formatTime } from "@/lib/date";
import type { Prisma } from "@prisma/client";

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: { category: true; quantityLog: true };
}>;

export function QuantityTaskCard({ task }: { task: TaskWithRelations }) {
  const [pending, startTransition] = useTransition();
  const [washModalOpen, setWashModalOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);

  const total = task.quantityTotal ?? 0;
  const done = task.quantityDone ?? 0;
  const remaining = Math.max(total - done, 0);
  const percent = total > 0 ? Math.round((done / total) * 100) : 0;
  const natholdDone = task.quantityLog
    .filter((l) => l.shift === "NATHOLD")
    .reduce((sum, l) => sum + l.delta, 0);

  const isWash = task.category?.name === "Vaske";
  const washEntries = task.quantityLog
    .filter((l) => l.trailerNumber)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  function handlePlusClick() {
    if (isWash) {
      setWashModalOpen(true);
    } else {
      startTransition(() => adjustQuantityDone(task.id, 1));
    }
  }

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
          {isWash && washEntries.length > 0 && (
            <button
              onClick={() => setExpanded((e) => !e)}
              className="flex h-8 w-8 items-center justify-center rounded-full text-muted transition hover:bg-surface-2 hover:text-foreground"
            >
              {expanded ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
            </button>
          )}
          <button
            onClick={() => startTransition(() => adjustQuantityDone(task.id, -1))}
            disabled={pending || done <= 0}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-surface-2 text-muted transition hover:text-foreground disabled:opacity-30"
          >
            <Minus size={14} />
          </button>
          <button
            onClick={handlePlusClick}
            disabled={pending || done >= total}
            className="flex h-8 w-8 items-center justify-center rounded-full bg-accent/15 text-accent transition hover:bg-accent/25 disabled:opacity-30"
          >
            <Plus size={14} />
          </button>
        </div>
      </div>

      {isWash && expanded && washEntries.length > 0 && (
        <div className="mt-3 space-y-1.5 border-t border-border pt-3">
          {washEntries.map((entry) => (
            <div key={entry.id} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-1.5 font-medium">
                <Truck size={12} className="text-muted" />
                #{entry.trailerNumber}
                <Badge tone={entry.company === "DFDS" ? "info" : "default"}>{entry.company}</Badge>
                {entry.plombeNumber && <span className="text-muted">Plombe {entry.plombeNumber}</span>}
              </span>
              <span className="text-muted">{formatTime(new Date(entry.createdAt))}</span>
            </div>
          ))}
        </div>
      )}

      {isWash && (
        <WashRegisterModal open={washModalOpen} onClose={() => setWashModalOpen(false)} taskId={task.id} />
      )}
    </Card>
  );
}
