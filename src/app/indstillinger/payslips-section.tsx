"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Receipt, Upload, Trash2, Info, Check } from "lucide-react";
import { Card, Button, Field, inputClass } from "@/components/ui/primitives";
import { uploadPayslip, deletePayslip, confirmPayslipFields, type PayslipRow } from "@/lib/payslips";

function formatSize(bytes: number): string {
  return bytes < 1024 * 1024 ? `${Math.round(bytes / 1024)} KB` : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

type DraftFields = {
  taxRatePct: string;
  amBidragPct: string;
  monthlyTaxDeduction: string;
  atpRatePerHour: string;
  hourlyRate: string;
};

function toDraft(p: PayslipRow): DraftFields {
  const f = p.extracted_fields;
  return {
    taxRatePct: f?.taxRatePct != null ? String(f.taxRatePct) : "",
    amBidragPct: f?.amBidragPct != null ? String(f.amBidragPct) : "",
    monthlyTaxDeduction: f?.monthlyTaxDeduction != null ? String(f.monthlyTaxDeduction) : "",
    atpRatePerHour: f?.atpRatePerHour != null ? String(f.atpRatePerHour) : "",
    hourlyRate: f?.hourlyRate != null ? String(f.hourlyRate) : "",
  };
}

function ReviewForm({ payslip, onDone }: { payslip: PayslipRow; onDone: () => void }) {
  const router = useRouter();
  const [draft, setDraft] = useState<DraftFields>(toDraft(payslip));
  const [pending, startTransition] = useTransition();
  const f = payslip.extracted_fields;

  function set(key: keyof DraftFields, value: string) {
    setDraft((d) => ({ ...d, [key]: value }));
  }

  function apply() {
    const fields: Record<string, number> = {};
    for (const [key, value] of Object.entries(draft)) {
      const n = Number(value.replace(",", "."));
      if (value.trim() !== "" && !Number.isNaN(n)) fields[key] = n;
    }
    startTransition(async () => {
      await confirmPayslipFields(payslip.id, fields);
      router.refresh();
      onDone();
    });
  }

  return (
    <div className="space-y-3 rounded-2xl bg-[var(--surface-2)] p-3">
      {payslip.extraction_status === "extracted" ? (
        <p className="text-xs text-[var(--muted)]">
          Fundet på lønsedlen — ret de tal, der er forkerte eller tomme, og brug dem så.
          {f?.grossAmount != null && f?.netAmount != null && (
            <> ({f.grossAmount.toLocaleString("da-DK")} kr brutto, {f.netAmount.toLocaleString("da-DK")} kr netto fundet.)</>
          )}
          {f?.notes && <> {f.notes}</>}
        </p>
      ) : (
        <p className="text-xs text-[var(--muted)]">
          {payslip.extraction_status === "unsupported_format"
            ? "Automatisk læsning virker kun for PDF'er — for et billede skal du selv indtaste tallene."
            : "Kunne ikke finde tallene automatisk på denne lønseddel — indtast dem selv."}
        </p>
      )}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Skatteprocent (%)">
          <input className={inputClass} value={draft.taxRatePct} onChange={(e) => set("taxRatePct", e.target.value)} placeholder="fx 37.1" />
        </Field>
        <Field label="AM-bidrag (%)">
          <input className={inputClass} value={draft.amBidragPct} onChange={(e) => set("amBidragPct", e.target.value)} placeholder="fx 8" />
        </Field>
        <Field label="Månedligt fradrag (kr)">
          <input className={inputClass} value={draft.monthlyTaxDeduction} onChange={(e) => set("monthlyTaxDeduction", e.target.value)} placeholder="fx 900" />
        </Field>
        <Field label="ATP (kr/time)">
          <input className={inputClass} value={draft.atpRatePerHour} onChange={(e) => set("atpRatePerHour", e.target.value)} placeholder="fx 1.5" />
        </Field>
        <Field label="Timeløn (kr/time)">
          <input className={inputClass} value={draft.hourlyRate} onChange={(e) => set("hourlyRate", e.target.value)} placeholder="fx 150" />
        </Field>
      </div>
      <div className="flex gap-2">
        <Button variant="secondary" onClick={onDone} disabled={pending}>
          Luk
        </Button>
        <Button onClick={apply} disabled={pending} className="flex flex-1 items-center justify-center gap-1.5">
          <Check size={14} /> {pending ? "Gemmer..." : "Brug disse tal"}
        </Button>
      </div>
    </div>
  );
}

export function PayslipsSection({ initialPayslips }: { initialPayslips: PayslipRow[] }) {
  const router = useRouter();
  const [payslips, setPayslips] = useState(initialPayslips);
  const [reviewingId, setReviewingId] = useState<number | null>(null);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);

  function upload() {
    const file = fileInputRef.current?.files?.[0];
    if (!file) {
      setError("Vælg en fil først.");
      return;
    }
    setError("");
    const formData = new FormData();
    formData.append("file", file);
    startTransition(async () => {
      const result = await uploadPayslip(formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (fileInputRef.current) fileInputRef.current.value = "";
      router.refresh();
    });
  }

  function remove(id: number) {
    setPayslips((p) => p.filter((x) => x.id !== id));
    if (reviewingId === id) setReviewingId(null);
    startTransition(async () => {
      await deletePayslip(id);
    });
  }

  return (
    <Card className="space-y-3 p-5">
      <h2 className="flex items-center gap-2 text-sm font-extrabold">
        <Receipt size={16} /> Lønseddel
      </h2>
      <p className="flex items-start gap-2 text-xs text-[var(--muted)]">
        <Info size={14} className="mt-0.5 shrink-0" />
        Upload en lønseddel som PDF, og vi forsøger at læse skatteprocent, AM-bidrag, fradrag, ATP og timeløn direkte
        fra den. Du ser altid tallene og kan rette dem, før de bruges — intet ændres i dine lønindstillinger, før du
        trykker &quot;Brug disse tal&quot;.
      </p>
      <div className="flex flex-wrap items-center gap-2">
        <input ref={fileInputRef} type="file" accept="application/pdf,image/png,image/jpeg" className="text-sm" />
        <Button onClick={upload} disabled={pending} size="sm" className="flex items-center gap-1.5">
          <Upload size={14} /> Upload
        </Button>
      </div>
      {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
      {payslips.length > 0 && (
        <ul className="space-y-1.5">
          {payslips.map((p) => (
            <li key={p.id} className="space-y-2">
              <div className="glass flex items-center justify-between gap-2 rounded-xl p-2.5">
                <button
                  type="button"
                  onClick={() => setReviewingId(reviewingId === p.id ? null : p.id)}
                  className="min-w-0 flex-1 truncate text-left text-sm font-semibold"
                >
                  {p.filename}
                  {p.extraction_status === "pending" && <span className="text-[var(--muted)]"> — læser...</span>}
                </button>
                <span className="flex shrink-0 items-center gap-2 text-xs text-[var(--muted)]">
                  {formatSize(p.size_bytes)}
                  <button type="button" onClick={() => remove(p.id)} className="text-[var(--danger)]">
                    <Trash2 size={14} />
                  </button>
                </span>
              </div>
              {reviewingId === p.id && p.extraction_status !== "pending" && (
                <ReviewForm payslip={p} onDone={() => setReviewingId(null)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  );
}
