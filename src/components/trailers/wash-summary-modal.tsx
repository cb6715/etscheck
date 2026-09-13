"use client";

import { useState } from "react";
import { Check, Copy, ClipboardList } from "lucide-react";
import { Modal, Button } from "@/components/ui/primitives";

export type WashSummaryRow = {
  id: string;
  company: string | null;
  number: string;
  licensePlate: string | null;
  plombeNumber: string | null;
};

function toClipboardText(rows: WashSummaryRow[]) {
  const header = ["Firma", "Trailer nr.", "Plombe nr.", "Nummerplade"];
  const lines = rows.map((r) => [r.company ?? "", r.number, r.plombeNumber ?? "", r.licensePlate ?? ""]);
  return [header, ...lines].map((cols) => cols.join("\t")).join("\n");
}

export function WashSummaryModal({
  open,
  onClose,
  rows,
}: {
  open: boolean;
  onClose: () => void;
  rows: WashSummaryRow[];
}) {
  const [copied, setCopied] = useState(false);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(toClipboardText(rows));
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API unavailable — the table below can still be read/typed manually.
    }
  }

  return (
    <Modal open={open} onClose={onClose} title="Vaskeliste — til indtastning">
      <p className="mb-4 text-sm text-muted">
        Alle {rows.length} trailere er vasket. Kopiér listen, eller skriv den af herfra.
      </p>

      <div className="mb-4 overflow-x-auto rounded-xl border border-border">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-surface-2 text-left text-xs font-bold uppercase tracking-wide text-muted">
              <th className="px-3 py-2">Firma</th>
              <th className="px-3 py-2">Trailer nr.</th>
              <th className="px-3 py-2">Plombe nr.</th>
              <th className="px-3 py-2">Nummerplade</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id} className="border-b border-border last:border-0">
                <td className="px-3 py-2 font-semibold">{r.company ?? "—"}</td>
                <td className="px-3 py-2">{r.number}</td>
                <td className="px-3 py-2">{r.plombeNumber ?? "—"}</td>
                <td className="px-3 py-2">{r.licensePlate ?? "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Button fullWidth size="lg" onClick={handleCopy} className="flex items-center justify-center gap-2">
        {copied ? (
          <>
            <Check size={18} /> Kopieret!
          </>
        ) : (
          <>
            <Copy size={18} /> Kopiér liste
          </>
        )}
      </Button>
    </Modal>
  );
}

export function WashSummaryButton({ onClick, count }: { onClick: () => void; count: number }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-1.5 rounded-xl border-2 border-accent bg-[var(--accent-a10)] px-3 py-2 text-sm font-bold text-accent transition hover:bg-[var(--accent-a20)]"
    >
      <ClipboardList size={18} /> Vaskeliste ({count})
    </button>
  );
}
