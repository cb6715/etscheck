"use client";

import { useState, useTransition } from "react";
import { KeyRound, Plus, Trash2 } from "lucide-react";
import { Card, Field, inputClass, Button, Badge } from "@/components/ui/primitives";
import { createRedeemCode, deleteRedeemCode, type RedeemCodeRow } from "@/lib/redeem-actions";

export function RedeemCodesSection({ initialCodes }: { initialCodes: RedeemCodeRow[] }) {
  const [codes, setCodes] = useState(initialCodes);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const [newCode, setNewCode] = useState("");
  const [maxUses, setMaxUses] = useState("10");
  const [note, setNote] = useState("");

  function add() {
    if (!newCode.trim()) {
      setError("Koden må ikke være tom.");
      return;
    }
    setError("");
    startTransition(async () => {
      const result = await createRedeemCode(newCode, Number(maxUses) || 1, note || undefined);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setCodes((c) => [{ id: result.data.id, code: newCode.trim().toUpperCase(), max_uses: Number(maxUses) || 1, use_count: 0, note: note || null }, ...c]);
      setNewCode("");
      setNote("");
    });
  }

  function remove(id: number) {
    setCodes((c) => c.filter((x) => x.id !== id));
    startTransition(async () => {
      await deleteRedeemCode(id);
    });
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-extrabold">
        <KeyRound size={16} /> Kode-administration (kun dig)
      </h2>
      <p className="text-xs text-[var(--muted)]">
        Indløses fra Abonnement-siden — en gyldig kode giver permanent gratis adgang (samme som ejer-status).
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Field label="Kode">
          <input className={inputClass} value={newCode} onChange={(e) => setNewCode(e.target.value)} placeholder="f.eks. VENNER2026" />
        </Field>
        <Field label="Maks antal brug">
          <input className={inputClass} type="number" value={maxUses} onChange={(e) => setMaxUses(e.target.value)} />
        </Field>
        <Field label="Note (valgfri)">
          <input className={inputClass} value={note} onChange={(e) => setNote(e.target.value)} placeholder="f.eks. Beta-testere" />
        </Field>
      </div>
      {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <Button onClick={add} disabled={pending} size="sm" className="flex items-center gap-1.5">
        <Plus size={14} /> Opret kode
      </Button>

      {codes.length > 0 && (
        <ul className="space-y-1.5 pt-2">
          {codes.map((c) => (
            <li key={c.id} className="glass flex items-center justify-between gap-2 rounded-xl p-2.5">
              <div className="min-w-0">
                <p className="font-mono text-sm font-bold">{c.code}</p>
                {c.note && <p className="text-xs text-[var(--muted)]">{c.note}</p>}
              </div>
              <div className="flex shrink-0 items-center gap-2">
                <Badge tone={c.use_count >= c.max_uses ? "danger" : "default"}>
                  {c.use_count}/{c.max_uses} brugt
                </Badge>
                <button type="button" onClick={() => remove(c.id)} className="text-[var(--danger)]">
                  <Trash2 size={14} />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
