"use client";

import { useState, useTransition } from "react";
import { History, Plus, Trash2, Zap } from "lucide-react";
import { Card, Field, inputClass, Button } from "@/components/ui/primitives";
import {
  logHistoricalWeek,
  deleteHistoricalWeek,
  seedKnownHistoricalWeeks,
  type HistoricalWeek,
} from "@/lib/actions/worksessions";
import { formatShortDate } from "@/lib/date";

function formatKr(n: number): string {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

function dateToInputValue(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inputValueToDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

export function HistoricalWeeksForm({ weeks }: { weeks: HistoricalWeek[] }) {
  const [pending, startTransition] = useTransition();
  const [weekOf, setWeekOf] = useState(dateToInputValue(new Date()));
  const [hours, setHours] = useState("");
  const [error, setError] = useState("");
  const [seedResult, setSeedResult] = useState("");

  function seed() {
    setError("");
    setSeedResult("");
    startTransition(async () => {
      const { inserted, skipped } = await seedKnownHistoricalWeeks();
      setSeedResult(
        inserted > 0
          ? `Tilføjet ${inserted} uge(r)${skipped > 0 ? ` (${skipped} var allerede der)` : ""}.`
          : "Alle 3 uger var allerede registreret."
      );
    });
  }

  function submit() {
    setError("");
    const h = Number(hours);
    if (!h || h <= 0) {
      setError("Angiv et gyldigt antal timer.");
      return;
    }
    startTransition(async () => {
      try {
        await logHistoricalWeek(inputValueToDate(weekOf), h);
        setHours("");
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kunne ikke gemme ugen.");
      }
    });
  }

  function remove(id: string) {
    startTransition(() => deleteHistoricalWeek(id));
  }

  return (
    <Card className="space-y-4 p-4">
      <p className="text-xs text-muted">
        Registrér en tidligere uges samlede timer (fx før du begyndte at tjekke ind/ud), så den tæller korrekt med i
        denne lønperiodes overtid og skattefradrag. Antager kun dagtimer (intet nattillæg) — brug tjek ind/ud til
        fremtidige uger for præcis beregning.
      </p>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-[var(--accent-a30)] bg-[var(--accent-a05)] p-3">
        <Button size="sm" onClick={seed} disabled={pending} className="flex items-center gap-1.5">
          <Zap size={14} /> Tilføj mine 3 uger (24/8: 42,5t · 31/8: 36,5t · 7/9: 46t)
        </Button>
        {seedResult && <span className="text-xs font-medium text-success">{seedResult}</span>}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Uge (vælg en dag i ugen)">
          <input className={inputClass} type="date" value={weekOf} onChange={(e) => setWeekOf(e.target.value)} />
        </Field>
        <Field label="Timer arbejdet den uge">
          <input
            className={inputClass}
            type="number"
            step="0.5"
            placeholder="F.eks. 42,5"
            value={hours}
            onChange={(e) => setHours(e.target.value)}
          />
        </Field>
      </div>
      {error && <p className="text-sm font-medium text-danger">{error}</p>}
      <Button onClick={submit} disabled={pending} className="flex items-center gap-2">
        <Plus size={16} /> {pending ? "Gemmer..." : "Tilføj uge"}
      </Button>

      {weeks.length > 0 && (
        <div className="space-y-2 border-t border-border pt-3">
          {weeks.map((w) => (
            <div key={w.id} className="flex items-center justify-between gap-2 text-sm">
              <span className="flex items-center gap-2 text-muted">
                <History size={14} /> Uge fra {formatShortDate(new Date(w.weekStart))}
              </span>
              <span className="font-semibold">
                {w.hours}t · {formatKr(w.grossAmount)} brutto · {formatKr(w.netAmount)} netto
              </span>
              <button
                onClick={() => remove(w.id)}
                disabled={pending}
                className="rounded-lg p-1.5 text-muted hover:bg-surface-2 hover:text-danger"
              >
                <Trash2 size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
