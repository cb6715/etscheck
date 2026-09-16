"use client";

import { useState } from "react";
import { Sun, Moon, Plus } from "lucide-react";
import { Button, EmptyState } from "@/components/ui/primitives";
import { AssistantPanel } from "@/components/briefing/assistant-panel";
import { QuantityTaskCard } from "@/components/briefing/quantity-task-card";
import { AddQuantityModal } from "@/components/briefing/add-quantity-modal";
import { PlanVsActualCard } from "@/components/briefing/plan-vs-actual";
import { EndOfDayModal } from "@/components/briefing/end-of-day-modal";
import type { BriefingAction, ExistingItemContext } from "@/lib/ai/briefing-types";
import type { PlanVsActual } from "@/lib/actions/briefing";
import type { BriefingMessage, Prisma } from "@prisma/client";

type QuantityTask = Prisma.TaskGetPayload<{ include: { category: true; quantityLog: true } }>;
type PlainTask = Prisma.TaskGetPayload<{ include: { category: true } }>;

export function PlanlaegningClient({
  messages,
  quantityTasks,
  plainTasks,
  pendingConfirmation,
  pendingClarification,
  existingItems,
  planVsActual,
}: {
  messages: BriefingMessage[];
  quantityTasks: QuantityTask[];
  plainTasks: PlainTask[];
  pendingConfirmation: BriefingAction[] | null;
  pendingClarification: { question: string } | null;
  existingItems: ExistingItemContext[];
  planVsActual: PlanVsActual;
}) {
  const [endOfDayOpen, setEndOfDayOpen] = useState(false);
  const [addQuantityOpen, setAddQuantityOpen] = useState(false);

  return (
    <div className="space-y-6 pb-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Sun size={24} /> Arbejdsplan
          </h1>
          <p className="mt-1 text-sm text-muted">Godmorgen-briefing, arbejdsassistent og dagens forløb</p>
        </div>
        <Button
          variant="secondary"
          onClick={() => setEndOfDayOpen(true)}
          className="flex items-center gap-1.5"
        >
          <Moon size={16} /> Afslut dag
        </Button>
      </header>

      <AssistantPanel
        initialMessages={messages}
        initialPendingConfirmation={pendingConfirmation}
        initialPendingClarification={pendingClarification}
        existingItems={existingItems}
      />

      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-bold uppercase tracking-wide text-muted">Dagens arbejdsemner</h2>
          <button
            onClick={() => setAddQuantityOpen(true)}
            className="flex items-center gap-1 text-sm font-semibold text-accent"
          >
            <Plus size={14} /> Tilføj optælling
          </button>
        </div>
        {quantityTasks.length === 0 ? (
          <EmptyState
            icon="🚿"
            title="Ingen opgaver fra briefing endnu"
            description="Skriv til assistenten ovenfor, eller tilføj en optælling direkte."
            action={<Button size="sm" onClick={() => setAddQuantityOpen(true)}>Tilføj optælling</Button>}
          />
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {quantityTasks.map((t) => (
              <QuantityTaskCard key={t.id} task={t} />
            ))}
          </div>
        )}
      </section>

      {plainTasks.length > 0 && (
        <section>
          <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Andre opgaver fra briefing</h2>
          <div className="space-y-2">
            {plainTasks.map((t) => (
              <div key={t.id} className="rounded-xl border border-border bg-surface p-3 text-sm font-medium">
                {t.category?.icon} {t.title}
              </div>
            ))}
          </div>
        </section>
      )}

      <PlanVsActualCard data={planVsActual} />

      <EndOfDayModal open={endOfDayOpen} onClose={() => setEndOfDayOpen(false)} />
      <AddQuantityModal open={addQuantityOpen} onClose={() => setAddQuantityOpen(false)} />
    </div>
  );
}
