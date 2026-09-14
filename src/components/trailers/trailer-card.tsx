"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { Droplets, AlertTriangle, MoreVertical, Trash2 } from "lucide-react";
import { Card, Badge } from "@/components/ui/primitives";
import { TrailerStatusBadge } from "./trailer-status-badge";
import { MarkWashedModal } from "./mark-washed-modal";
import { updateTrailerStatus, deleteTrailer } from "@/lib/actions/trailers";
import type { Prisma, TrailerStatus } from "@prisma/client";

type TrailerWithRelations = Prisma.TrailerGetPayload<{
  include: { washes: true; notes: true };
}>;

const STATUS_OPTIONS: { value: TrailerStatus; label: string }[] = [
  { value: "MANGLER", label: "🟡 Mangler" },
  { value: "I_GANG", label: "🔵 I gang" },
  { value: "VASKET", label: "🟢 Vasket" },
  { value: "AFVENTER", label: "⚪ Afventer" },
  { value: "PROBLEM", label: "🔴 Problem" },
];

export function TrailerCard({ trailer }: { trailer: TrailerWithRelations }) {
  const [pending, startTransition] = useTransition();
  const [menuOpen, setMenuOpen] = useState(false);
  const [washModalOpen, setWashModalOpen] = useState(false);
  const hasProblem = trailer.notes.length > 0;

  function setStatus(status: TrailerStatus) {
    setMenuOpen(false);
    if (status === "VASKET") {
      setWashModalOpen(true);
      return;
    }
    if (status === "PROBLEM") {
      const note = prompt("Beskriv problemet:");
      if (!note) return;
      startTransition(() => updateTrailerStatus(trailer.id, status, note));
      return;
    }
    startTransition(() => updateTrailerStatus(trailer.id, status));
  }

  function handleDelete() {
    setMenuOpen(false);
    if (!confirm(`Slet Trailer #${trailer.number}? Vaskehistorikken bevares, men traileren forsvinder fra listen.`)) return;
    startTransition(() => deleteTrailer(trailer.id));
  }

  return (
    <Card className="relative p-4">
      <div className="flex items-start justify-between gap-2">
        <Link href={`/vask/${trailer.id}`} className="min-w-0 flex-1">
          <p className="text-lg font-bold">Trailer #{trailer.number}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2 text-xs text-muted">
            {trailer.licensePlate && <span>{trailer.licensePlate}</span>}
            {trailer.type && <span>· {trailer.type}</span>}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <TrailerStatusBadge status={trailer.status} />
            {trailer.company && (
              <Badge tone={trailer.company === "DFDS" ? "info" : "default"}>{trailer.company}</Badge>
            )}
            {hasProblem && (
              <span className="flex items-center gap-1 text-xs font-semibold text-danger">
                <AlertTriangle size={12} /> Problem
              </span>
            )}
          </div>
        </Link>

        <div className="relative shrink-0">
          <button
            onClick={() => setMenuOpen((o) => !o)}
            className="rounded-lg p-2 text-muted hover:bg-surface-2"
          >
            <MoreVertical size={18} />
          </button>
          {menuOpen && (
            <>
              <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
              <div className="absolute right-0 top-full z-20 mt-1 w-44 overflow-hidden rounded-xl border border-border bg-surface shadow-xl">
                {STATUS_OPTIONS.map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setStatus(opt.value)}
                    className="block w-full px-4 py-2.5 text-left text-sm font-medium hover:bg-surface-2"
                  >
                    {opt.label}
                  </button>
                ))}
                <div className="border-t border-border" />
                <button
                  onClick={handleDelete}
                  className="flex w-full items-center gap-2 px-4 py-2.5 text-left text-sm font-medium text-danger hover:bg-danger-bg"
                >
                  <Trash2 size={14} /> Slet trailer
                </button>
              </div>
            </>
          )}
        </div>
      </div>

      {trailer.status !== "VASKET" && (
        <button
          onClick={() => setWashModalOpen(true)}
          disabled={pending}
          className="mt-3 flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--success-a15)] py-2.5 text-sm font-bold text-success transition hover:bg-[var(--success-a25)]"
        >
          <Droplets size={16} /> Marker som vasket
        </button>
      )}

      <MarkWashedModal
        open={washModalOpen}
        onClose={() => setWashModalOpen(false)}
        trailerId={trailer.id}
        trailerNumber={trailer.number}
        defaultCompany={trailer.company}
      />
    </Card>
  );
}
