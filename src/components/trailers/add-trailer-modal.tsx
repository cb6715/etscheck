"use client";

import { useRef, useState, useTransition } from "react";
import { Camera, Loader2 } from "lucide-react";
import { Modal, Field, inputClass, Button } from "@/components/ui/primitives";
import { createTrailer, lookupTrailerByPlate } from "@/lib/actions/trailers";
import { loadImageToCanvas, recognizeTrailerImage } from "@/lib/trailer-ocr";
import { WASH_COMPANIES, type WashCompany } from "@/lib/wash-constants";

export function AddTrailerModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [scanning, setScanning] = useState(false);
  const [number, setNumber] = useState("");
  const [licensePlate, setLicensePlate] = useState("");
  const [type, setType] = useState("");
  const [note, setNote] = useState("");
  const [company, setCompany] = useState<WashCompany | "">("");
  const [error, setError] = useState("");
  const [scanNotice, setScanNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function reset() {
    setNumber("");
    setLicensePlate("");
    setType("");
    setNote("");
    setCompany("");
    setError("");
    setScanNotice("");
  }

  async function handlePhoto(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // never keep a reference to the captured photo
    if (!file) return;

    setScanning(true);
    setError("");
    setScanNotice("");
    try {
      // Runs entirely in the browser (Tesseract.js/WASM) — the photo is
      // never uploaded anywhere, just read into a canvas and discarded.
      const canvas = await loadImageToCanvas(file);
      const result = await recognizeTrailerImage(canvas);

      const found: string[] = [];
      if (result.trailerNumber) {
        setNumber(result.trailerNumber);
        found.push(`nr. ${result.trailerNumber}`);
      }
      if (result.licensePlate) {
        setLicensePlate(result.licensePlate);
        found.push(`plade ${result.licensePlate}`);
      }
      if (result.company) {
        setCompany(result.company);
        found.push(result.company);
      }
      setScanNotice(
        found.length > 0
          ? `Genkendt: ${found.join(" · ")} — tjek og ret hvis nødvendigt.`
          : "Kunne ikke genkende noget på billedet — udfyld manuelt."
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Kunne ikke læse billedet.");
    } finally {
      setScanning(false);
    }
  }

  async function handlePlateBlur() {
    if (!licensePlate.trim() || company) return;
    const match = await lookupTrailerByPlate(licensePlate);
    if (match?.company === "DFDS" || match?.company === "DSV") {
      setCompany(match.company);
      setScanNotice(`Genkendt fra tidligere: ${match.company}`);
    }
  }

  function submit() {
    if (!number.trim()) {
      setError("Trailernummer mangler.");
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
      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="hidden"
        onChange={handlePhoto}
      />
      <button
        type="button"
        onClick={() => fileInputRef.current?.click()}
        disabled={scanning}
        className="mb-4 flex w-full items-center justify-center gap-2 rounded-xl border-2 border-dashed border-[var(--accent-a40)] bg-[var(--accent-a05)] py-3 text-sm font-bold text-accent transition hover:bg-[var(--accent-a10)] disabled:opacity-60"
      >
        {scanning ? (
          <>
            <Loader2 size={18} className="animate-spin" /> Læser billede...
          </>
        ) : (
          <>
            <Camera size={18} /> Tag billede af trailer
          </>
        )}
      </button>
      {scanNotice && <p className="mb-3 text-sm font-medium text-success">{scanNotice}</p>}

      <Field label="Trailer nummer" required>
        <input
          className={inputClass}
          value={number}
          onChange={(e) => setNumber(e.target.value)}
          placeholder="F.eks. 102"
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
