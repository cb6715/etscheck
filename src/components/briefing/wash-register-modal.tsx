"use client";

import { useState, useTransition } from "react";
import { Droplets } from "lucide-react";
import { Modal, Field, inputClass, Button } from "@/components/ui/primitives";
import { registerWashUnit } from "@/lib/actions/briefing";
import { WASH_COMPANIES, type WashCompany } from "@/lib/wash-constants";

export function WashRegisterModal({
  open,
  onClose,
  taskId,
}: {
  open: boolean;
  onClose: () => void;
  taskId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [trailerNumber, setTrailerNumber] = useState("");
  const [company, setCompany] = useState<WashCompany | "">("");
  const [plombeNumber, setPlombeNumber] = useState("");
  const [error, setError] = useState("");

  function reset() {
    setTrailerNumber("");
    setCompany("");
    setPlombeNumber("");
    setError("");
  }

  function submit() {
    if (!trailerNumber.trim()) {
      setError("Trailernummer mangler.");
      return;
    }
    if (!company) {
      setError("Vælg firma.");
      return;
    }
    startTransition(async () => {
      try {
        await registerWashUnit(taskId, { trailerNumber, company, plombeNumber });
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
      title="Registrer vask"
    >
      <Field label="Trailer nr." required>
        <input
          className={inputClass}
          value={trailerNumber}
          onChange={(e) => setTrailerNumber(e.target.value)}
          placeholder="F.eks. 4521"
          autoFocus
        />
      </Field>

      <Field label="Firma" required>
        <div className="flex gap-2">
          {WASH_COMPANIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCompany(c)}
              className={`flex-1 rounded-xl border-2 py-3 text-sm font-bold transition ${
                company === c
                  ? "border-accent bg-[var(--accent-a10)] text-accent"
                  : "border-border text-muted hover:bg-surface-2"
              }`}
            >
              {c}
            </button>
          ))}
        </div>
      </Field>

      {company === "DFDS" && (
        <Field label="Plombe nr.">
          <input
            className={inputClass}
            value={plombeNumber}
            onChange={(e) => setPlombeNumber(e.target.value)}
            placeholder="Valgfri"
          />
        </Field>
      )}

      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

      <Button
        fullWidth
        size="lg"
        onClick={submit}
        disabled={pending}
        className="flex items-center justify-center gap-2"
      >
        <Droplets size={18} /> {pending ? "Gemmer..." : "Registrer vask"}
      </Button>
    </Modal>
  );
}
