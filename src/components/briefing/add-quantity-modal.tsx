"use client";

import { useState, useTransition } from "react";
import { Modal, Field, inputClass, Button } from "@/components/ui/primitives";
import { addManualQuantityTask } from "@/lib/actions/briefing";

const QUICK_CATEGORIES = ["Tankninger", "Trailerreparationer", "Vaske", "Paller"];

export function AddQuantityModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [category, setCategory] = useState("");
  const [total, setTotal] = useState("");
  const [error, setError] = useState("");

  function reset() {
    setCategory("");
    setTotal("");
    setError("");
  }

  function submit() {
    const n = Number(total);
    if (!category.trim()) {
      setError("Angiv en kategori.");
      return;
    }
    if (!n || n <= 0) {
      setError("Angiv et antal større end 0.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await addManualQuantityTask(category, n);
        reset();
        onClose();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Kunne ikke gemme. Prøv igen.");
      }
    });
  }

  return (
    <Modal
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Tilføj optælling"
    >
      <Field label="Kategori">
        <input
          className={inputClass}
          value={category}
          onChange={(e) => setCategory(e.target.value)}
          placeholder="F.eks. Tankninger"
          autoFocus
        />
      </Field>
      <div className="mb-4 flex flex-wrap gap-1.5">
        {QUICK_CATEGORIES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => setCategory(c)}
            className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
              category === c
                ? "border-accent bg-[var(--accent-a10)] text-accent"
                : "border-border text-muted hover:bg-surface-2"
            }`}
          >
            {c}
          </button>
        ))}
      </div>
      <Field label="Antal">
        <input
          className={inputClass}
          type="number"
          min={1}
          step="1"
          value={total}
          onChange={(e) => setTotal(e.target.value)}
          placeholder="F.eks. 3"
        />
      </Field>
      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}
      <Button fullWidth size="lg" onClick={submit} disabled={pending}>
        {pending ? "Gemmer..." : "Tilføj"}
      </Button>
    </Modal>
  );
}
