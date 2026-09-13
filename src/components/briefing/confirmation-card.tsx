"use client";

import { useTransition } from "react";
import { Check, Pencil } from "lucide-react";
import { Card, Button } from "@/components/ui/primitives";
import { simulateActions } from "@/lib/ai/simulate";
import type { BriefingAction } from "@/lib/ai/briefing-types";
import type { ExistingItemContext } from "@/lib/ai/briefing-types";
import { confirmPendingActions, discardPendingActions } from "@/lib/actions/briefing";

export function ConfirmationCard({
  actions,
  existingItems,
  onResolved,
}: {
  actions: BriefingAction[];
  existingItems: ExistingItemContext[];
  onResolved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const sim = simulateActions(actions, existingItems);
  const catList = sim.touchedCategories
    .map((name) => sim.categories.get(name))
    .filter((c): c is NonNullable<typeof c> => !!c);

  return (
    <Card className="border-accent/40 bg-accent/5 p-4">
      <p className="mb-3 text-sm font-bold text-accent">Jeg tror, du mener:</p>
      <div className="space-y-2">
        {catList.map((c) => (
          <div key={c.category} className="flex items-center justify-between text-sm">
            <span className="font-semibold">
              {c.icon} {c.total} {c.category.toLowerCase()}
            </span>
            {c.natholdDone > 0 && <span className="text-xs text-muted">✓ {c.natholdDone} nathold</span>}
          </div>
        ))}
        {sim.plainTasks.map((t, idx) => (
          <div key={idx} className="text-sm">
            📋 {t.title}
          </div>
        ))}
      </div>

      <div className="mt-4 flex gap-2">
        <Button
          className="flex flex-1 items-center justify-center gap-1.5"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              await confirmPendingActions();
              onResolved();
            })
          }
        >
          <Check size={16} /> Ja, opdater arbejdsplan
        </Button>
        <Button
          variant="secondary"
          disabled={pending}
          className="flex items-center gap-1.5"
          onClick={() =>
            startTransition(async () => {
              await discardPendingActions();
              onResolved();
            })
          }
        >
          <Pencil size={16} /> Rediger
        </Button>
      </div>
    </Card>
  );
}
