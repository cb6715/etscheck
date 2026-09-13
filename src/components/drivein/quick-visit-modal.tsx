"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import { Modal, Field, inputClass, Button } from "@/components/ui/primitives";
import { createDriveInVisit, lookupPlate } from "@/lib/actions/drivein";
import { formatPlate } from "@/lib/plate";
import { formatShortDate } from "@/lib/date";
import type { Prisma } from "@prisma/client";

type CustomerMatch = Prisma.DriveInCustomerGetPayload<{
  include: { company: true; visits: true };
}>;

export function QuickVisitModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [pending, startTransition] = useTransition();
  const [plate, setPlate] = useState("");
  const [company, setCompany] = useState("");
  const [refNumber, setRefNumber] = useState("");
  const [service, setService] = useState("");
  const [note, setNote] = useState("");
  const [match, setMatch] = useState<CustomerMatch | null>(null);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (plate.trim().length < 4) {
      setMatch(null);
      return;
    }
    debounceRef.current = setTimeout(async () => {
      const result = await lookupPlate(plate);
      setMatch(result as CustomerMatch | null);
    }, 350);
  }, [plate]);

  function reset() {
    setPlate("");
    setCompany("");
    setRefNumber("");
    setService("");
    setNote("");
    setMatch(null);
    setError("");
    setSuccess(false);
  }

  function applyMatch() {
    if (!match) return;
    if (match.company) setCompany(match.company.name);
    const lastRef = (match.visits[0] as { refNumber?: string | null })?.refNumber;
    if (lastRef) setRefNumber(lastRef);
  }

  function submit() {
    if (!plate.trim()) {
      setError("Nummerplade mangler.");
      return;
    }
    setError("");
    startTransition(async () => {
      try {
        await createDriveInVisit({ licensePlate: plate, companyName: company, refNumber, service, note });
        setSuccess(true);
        setTimeout(() => {
          reset();
          onClose();
        }, 700);
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
      title="Ny drive-in"
    >
      {success ? (
        <div className="flex flex-col items-center gap-3 py-8">
          <div className="animate-check-pop flex h-16 w-16 items-center justify-center rounded-full bg-success text-white">
            <Check size={32} strokeWidth={3} />
          </div>
          <p className="font-bold text-success">Kunde registreret</p>
        </div>
      ) : (
        <div>
          <Field label="Nummerplade" required>
            <input
              className={`${inputClass} text-lg font-bold tracking-wide uppercase`}
              value={plate}
              onChange={(e) => setPlate(e.target.value)}
              placeholder="AB 12 345"
              autoFocus
            />
          </Field>

          {match && (
            <button
              onClick={applyMatch}
              className="mb-3 w-full rounded-xl border border-[var(--accent-a40)] bg-[var(--accent-a10)] p-3 text-left text-sm transition hover:bg-[var(--accent-a15)]"
            >
              <p className="font-semibold text-accent">
                Kendt kunde: {formatPlate(match.licensePlate)}
              </p>
              {match.company && <p className="text-foreground">{match.company.name}</p>}
              {match.visits[0] && (
                <p className="text-xs text-muted">
                  Seneste besøg: {formatShortDate(new Date(match.visits[0].visitedAt))}
                </p>
              )}
              <p className="mt-1 text-xs font-semibold text-accent">Tryk for at genbruge oplysninger →</p>
            </button>
          )}

          <Field label="Firma">
            <input
              className={inputClass}
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              placeholder="Valgfrit"
            />
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="Ref.nr.">
              <input
                className={inputClass}
                value={refNumber}
                onChange={(e) => setRefNumber(e.target.value)}
                placeholder="Valgfrit"
              />
            </Field>
            <Field label="Ydelse">
              <input
                className={inputClass}
                value={service}
                onChange={(e) => setService(e.target.value)}
                placeholder="F.eks. Trailer vask"
              />
            </Field>
          </div>

          <Field label="Bemærkning">
            <textarea
              className={inputClass}
              rows={2}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Valgfri"
            />
          </Field>

          {error && <p className="mb-3 text-sm font-medium text-danger">{error}</p>}

          <Button fullWidth size="lg" onClick={submit} disabled={pending}>
            {pending ? "Gemmer..." : "Gem kunde"}
          </Button>
        </div>
      )}
    </Modal>
  );
}
