"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Settings2, ArrowUp, ArrowDown } from "lucide-react";
import { Button, EmptyState } from "@/components/ui/primitives";
import { TaskItem } from "@/components/tasks/task-item";
import { TaskFormModal } from "@/components/tasks/task-form-modal";
import { reorderTasks } from "@/lib/actions/tasks";
import type { Category, Prisma } from "@prisma/client";

type TaskWithRelations = Prisma.TaskGetPayload<{
  include: { checklistItems: true; category: true };
}>;

export function TasksPageClient({
  tasks,
  categories,
}: {
  tasks: TaskWithRelations[];
  categories: Category[];
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [order, setOrder] = useState(tasks.filter((t) => !t.completed).map((t) => t.id));
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setModalOpen(true);
      router.replace("/opgaver");
    }
  }, [searchParams, router]);

  useEffect(() => {
    setOrder(tasks.filter((t) => !t.completed).map((t) => t.id));
  }, [tasks]);

  const active = order
    .map((id) => tasks.find((t) => t.id === id))
    .filter((t): t is TaskWithRelations => !!t);
  const completed = tasks.filter((t) => t.completed);

  function move(index: number, dir: -1 | 1) {
    const next = [...order];
    const target = index + dir;
    if (target < 0 || target >= next.length) return;
    [next[index], next[target]] = [next[target], next[index]];
    setOrder(next);
    startTransition(() => {
      reorderTasks(next);
    });
  }

  return (
    <div className="space-y-6 pb-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Dagens arbejde</h1>
          <p className="mt-1 text-sm text-muted">
            {active.length} tilbage · {completed.length} færdige
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Link
            href="/indstillinger"
            className="rounded-xl border border-border p-2.5 text-muted hover:bg-surface-2"
            title="Gentagne opgaver"
          >
            <Settings2 size={18} />
          </Link>
          <Button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5">
            <Plus size={18} strokeWidth={3} /> Ny opgave
          </Button>
        </div>
      </header>

      {tasks.length === 0 ? (
        <EmptyState
          icon="📋"
          title="Ingen opgaver endnu"
          description="Opret din første opgave for at komme i gang med dagen."
          action={<Button onClick={() => setModalOpen(true)}>Opret opgave</Button>}
        />
      ) : (
        <>
          {active.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted">
                Prioriteret rækkefølge
              </h2>
              {active.map((task, idx) => (
                <div key={task.id} className="flex items-center gap-2">
                  <div className="flex-1">
                    <TaskItem task={task} />
                  </div>
                  <div className="flex shrink-0 flex-col gap-1">
                    <button
                      onClick={() => move(idx, -1)}
                      disabled={idx === 0}
                      className="rounded-lg border border-border p-1.5 text-muted transition hover:bg-surface-2 disabled:opacity-30"
                    >
                      <ArrowUp size={14} />
                    </button>
                    <button
                      onClick={() => move(idx, 1)}
                      disabled={idx === active.length - 1}
                      className="rounded-lg border border-border p-1.5 text-muted transition hover:bg-surface-2 disabled:opacity-30"
                    >
                      <ArrowDown size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </section>
          )}

          {completed.length > 0 && (
            <section className="space-y-2">
              <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Færdige</h2>
              {completed.map((task) => (
                <TaskItem key={task.id} task={task} />
              ))}
            </section>
          )}
        </>
      )}

      <TaskFormModal open={modalOpen} onClose={() => setModalOpen(false)} categories={categories} />
    </div>
  );
}
