"use client";

import { useState, useTransition } from "react";
import { Modal, Field, inputClass, Button } from "@/components/ui/primitives";
import { createTrailer, lookupTrailerByPlate } from "@/lib/actions/trailers";
import { WASH_COMPANIES, type WashCompany } from "@/lib/wash-constants";

export function AddTrailerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [number, setNumber] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const [company, setCompany] = useState<WashCompany | "">("");
  const [error, setError] = useState("");
  const [plateNotice, setPlateNotice] = useState("");

  function reset() {
    setNumber("");
    setLicensePlate("");
    setType("");
    setNote("");
    setCompany("");
    setError("");
    setPlateNotice("");
  }

  async function handlePlateBlur() {
    if (!licensePlate.trim() || company) return;
    const match = await lookupTrailerByPlate(licensePlate);
    if (match?.company === "DFDS" || match?.company === "DSV") {
      setCompany(match.company);
      setPlateNotice(`Genkendt fra tidligere: ${match.company}`);
    }
  }

  function submit() {
    if (!number.trim() && !licensePlate.trim()) {
      setError("Angiv enten trailernummer eller nummerplade.");
      return;
    }
    startTransition(async () => {
      try {
        await createTrailer({ number, licensePlate, type, note, company });
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
      <Field label="Trailer nummer">
        <input
          className={inputClass}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="F.eks. 102 — valgfri hvis du har nummerpladen"
          autoFocus
        />
      </Field>
      <Field label="Firma">
        <div className="flex gap-2">
          {WASH_COMPANIES.map((c) => (
            <button
              key={c}
              type="button"
              onClick={() => setCompany((prev) => (prev === c ? "" : c))}
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
      <Field label="Nummerplade">
        <input
          className={inputClass}
          value={licensePlate}
          onChange={(e) => setLicensePlate(e.target.value)}
          onBlur={handlePlateBlur}
          placeholder="Valgfri"
        />
      </Field>
      {plateNotice && <p className="mb-3 text-sm font-medium text-success">{plateNotice}</p>}
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
