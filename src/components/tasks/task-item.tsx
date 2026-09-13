"use client";

import { useState, useTransition } from "react";
import { Check, Clock, ChevronDown, ChevronUp } from "lucide-react";
import clsx from "clsx";
import { toggleTaskCompleted, toggleChecklistItem } from "@/lib/actions/tasks";
import { PriorityBadge } from "./priority-badge";
import { formatTime } from "@/lib/date";
import type { Prisma } from "@prisma/client";

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: { checklistItems: true; category: true };
}>;

export function TaskItem({ task }: { task: TaskWithRelations }) {
  const [pending, startTransition] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const hasChecklist = task.checklistItems.length > 0;
  const doneCount = task.checklistItems.filter((i) => i.completed).length;

  return (
    <div
      className={clsx(
        "rounded-2xl border border-border bg-surface transition",
        task.completed && "opacity-60"
      )}
    >
      <div className="flex items-center gap-3 p-4">
        <button
          onClick={() =>
            startTransition(() => {
              toggleTaskCompleted(task.id);
            })
          }
          disabled={pending}
          className={clsx(
            "flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 transition",
            task.completed
              ? "animate-check-pop border-success bg-success text-white"
              : "border-border hover:border-accent"
          )}
        >
          {task.completed && <Check size={16} strokeWidth={3} />}
        </button>

        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            {task.category && <span className="text-base">{task.category.icon}</span>}
            <p className={clsx("truncate font-semibold", task.completed && "line-through")}>
              {task.title}
            </p>
          </div>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            {task.priority !== "NORMAL" && <PriorityBadge priority={task.priority} />}
            {task.completed && task.completedAt && (
              <span className="flex items-center gap-1 text-xs text-muted">
                <Clock size={12} /> Færdig kl. {formatTime(new Date(task.completedAt))}
              </span>
            )}
            {hasChecklist && (
              <span className="text-xs font-medium text-muted">
                {doneCount} / {task.checklistItems.length} færdige
              </span>
            )}
          </div>
        </div>

        {hasChecklist && (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="shrink-0 rounded-lg p-1.5 text-muted hover:bg-surface-2"
          >
            {expanded ? <ChevronUp size={18} /> : <ChevronDown size={18} />}
          </button>
        )}
      </div>

      {hasChecklist && expanded && (
        <div className="space-y-1.5 border-t border-border px-4 py-3 pl-14">
          {task.checklistItems
            .sort((a, b) => a.order - b.order)
            .map((item) => (
              <button
                key={item.id}
                onClick={() =>
                  startTransition(() => {
                    toggleChecklistItem(item.id);
                  })
                }
                className="flex w-full items-center gap-2.5 rounded-lg py-1.5 text-left transition hover:bg-surface-2"
              >
                <span
                  className={clsx(
                    "flex h-5 w-5 shrink-0 items-center justify-center rounded-md border-2 transition",
                    item.completed ? "border-success bg-success text-white" : "border-border"
                  )}
                >
                  {item.completed && <Check size={12} strokeWidth={3} />}
                </span>
                <span className={clsx("text-sm", item.completed && "text-muted line-through")}>
                  {item.title}
                </span>
              </button>
            ))}
        </div>
      )}
    </div>
  );
}
