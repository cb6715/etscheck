"use client";

import { useState, useTransition } from "react";
import { Modal, Field, inputClass, Button } from "@/components/ui/primitives";
import { createTrailer } from "@/lib/actions/trailers";

export function AddTrailerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [number, setNumber] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  function reset() {
    setNumber("");
    setLicensePlate("");
    setType("");
    setNote("");
    setError("");
  }

  function submit() {
    if (!number.trim()) {
      setError("Trailernummer mangler.");
      return;
    }
    startTransition(async () => {
      try {
        await createTrailer({ number, licensePlate, type, note });
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
      title="Tilføj trailer"
    >
      <Field label="Trailer nummer" required>
        <input
          className={inputClass}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="F.eks. 102"
          autoFocus
        />
      </Field>
      <Field label="Nummerplade">
        <input
          className={inputClass}
          value={licensePlate}
          onChange={(e) => setLicensePlate(e.target.value)}
          placeholder="Valgfri"
        />
      </Field>
      <Field label="Type">
        <input
          className={inputClass}
          value={type}
          onChange={(e) => setType(e.target.value)}
          placeholder="F.eks. Kølertrailer"
        />
      </Field>
      <Field label="Bemærkning">
        <textarea
          className={inputClass}
          rows={2}
          value={note}
          onChange={(e) => setNote(e.target.value)}
        />
      </Field>
      {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}
      <Button fullWidth size="lg" onClick={submit} disabled={pending}>
        {pending ? "Gemmer..." : "Tilføj trailer"}
      </Button>
    </Modal>
  );
}
