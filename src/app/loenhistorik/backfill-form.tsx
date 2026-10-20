"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { PlusCircle } from "lucide-react";
import { Card, Field, inputClass, Button } from "@/components/ui/primitives";
import { backfillPeriodHistory } from "@/lib/actions";

function todayInputValue(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

export function BackfillForm() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState("");
  const [end, setEnd] = useState(todayInputValue());
  const [advance, setAdvance] = useState("0");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function submit() {
    if (!start || !end) {
      setError("Udfyld begge datoer.");
      return;
    }
    setError("");
    const [y1, m1, d1] = start.split("-").map(Number);
    const [y2, m2, d2] = end.split("-").map(Number);
    startTransition(async () => {
      const result = await backfillPeriodHistory(
        new Date(y1, m1 - 1, d1),
        new Date(y2, m2 - 1, d2),
        Number(advance) || 0
      );
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setOpen(false);
      setStart("");
      setAdvance("0");
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)} fullWidth className="flex items-center justify-center gap-2">
        <PlusCircle size={16} /> Tilføj en periode, du lukkede før dette virkede
      </Button>
    );
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="text-sm font-extrabold">Tilføj tidligere periode</h2>
      <p className="text-xs text-[var(--muted)]">
        Beløbet regnes ud fra dine faktiske gemte vagter i perioden — ikke et gæt. Brug det til en periode, du
        lukkede, før lønhistorik fandtes, eller en periode fra før du begyndte at bruge appen.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Periode fra">
          <input className={inputClass} type="date" value={start} onChange={(e) => setStart(e.target.value)} />
        </Field>
        <Field label="Periode til">
          <input className={inputClass} type="date" value={end} onChange={(e) => setEnd(e.target.value)} />
        </Field>
        <Field label="Forskud udbetalt i perioden (kr, valgfri)">
          <input className={inputClass} type="number" value={advance} onChange={(e) => setAdvance(e.target.value)} />
        </Field>
      </div>
      {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <div className="flex gap-2">
        <Button variant="secondary" onClick={() => setOpen(false)} disabled={pending}>
          Annullér
        </Button>
        <Button onClick={submit} disabled={pending} className="flex-1">
          {pending ? "Gemmer..." : "Gem periode"}
        </Button>
      </div>
    </Card>
  );
}
