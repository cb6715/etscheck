"use client";

import { useState, useTransition } from "react";
import { Minus, Plus } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { bumpDailyCounter } from "@/lib/actions/briefing";

export function DailyCounterTile({
  category,
  icon,
  initialCount,
}: {
  category: string;
  icon: string;
  initialCount: number;
}) {
  const [count, setCount] = useState(initialCount);
  const [pending, startTransition] = useTransition();

  function bump(delta: number) {
    setCount((c) => Math.max(0, c + delta));
    startTransition(async () => {
      const next = await bumpDailyCounter(category, delta);
      setCount(next);
    });
  }

  return (
    <Card className="flex flex-col gap-2 p-3">
      <p className="flex items-center gap-1.5 text-xs font-bold leading-tight text-muted">
        <span className="text-base">{icon}</span> {category}
      </p>
      <div className="flex items-center justify-between">
        <p className="text-2xl font-extrabold tabular-nums">{count}</p>
        <div className="flex shrink-0 items-center gap-1.5">
          <button
            onClick={() => bump(-1)}
            disabled={pending || count <= 0}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-surface-2 text-muted transition hover:text-foreground disabled:opacity-30"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={() => bump(1)}
            disabled={pending}
            className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-a15)] text-accent transition hover:bg-[var(--accent-a25)] disabled:opacity-40"
          >
            <Plus size={16} />
          </button>
        </div>
      </div>
    </Card>
  );
}
