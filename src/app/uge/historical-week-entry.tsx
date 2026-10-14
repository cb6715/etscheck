"use client";

import { useState, useTransition } from "react";
import { History, Check } from "lucide-react";
import { Button, inputClass } from "@/components/ui/primitives";
import { logHistoricalWeek } from "@/lib/actions";

// Shown only when the week being viewed is fully empty (no sessions at
// all) — a quick way to log a whole already-completed week as one number,
// for catching up on hours worked before switching to this app. Lives here
// (not Indstillinger) because it's a data entry for a specific week, same
// as sygedag-markering right above it.
export function HistoricalWeekEntry({ weekStart, onLogged }: { weekStart: string; onLogged: () => void }) {
  const [open, setOpen] = useState(false);
  const [hours, setHours] = useState("");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    setError("");
    const h = Number(hours);
    if (!h || h <= 0) {
      setError("Angiv et gyldigt antal timer.");
      return;
    }
    startTransition(async () => {
      try {
        await logHistoricalWeek(new Date(weekStart), h);
        setHours("");
        setOpen(false);
        onLogged();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kunne ikke gemme ugen.");
      }
    });
  }

  if (!open) {
    return (
      <button
        onClick={() => setOpen(true)}
        className="flex w-full items-center justify-center gap-1.5 rounded-2xl border border-dashed border-[var(--border)] py-2.5 text-xs font-bold text-[var(--muted)] hover:border-[var(--accent)] hover:text-[var(--accent)]"
      >
        <History size={13} /> Log denne uge som ét samlet timetal (fra din gamle app)
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-end gap-2 rounded-2xl bg-[var(--surface-2)] p-3">
      <div className="min-w-[140px] flex-1">
        <input
          type="number"
          step="0.5"
          placeholder="Timer i alt"
          className={inputClass}
          value={hours}
          onChange={(e) => setHours(e.target.value)}
        />
      </div>
      <Button size="sm" onClick={submit} disabled={pending} className="flex shrink-0 items-center gap-1.5">
        <Check size={14} /> Gem
      </Button>
      {error && <p className="w-full text-xs font-semibold text-[var(--danger)]">{error}</p>}
    </div>
  );
}
