"use client";

import { useEffect, useRef, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Plus, Truck } from "lucide-react";
import { Button, EmptyState } from "@/components/ui/primitives";
import { TrailerCard } from "@/components/trailers/trailer-card";
import { AddTrailerModal } from "@/components/trailers/add-trailer-modal";
import { WashSummaryModal, WashSummaryButton, type WashSummaryRow } from "@/components/trailers/wash-summary-modal";
import type { Prisma } from "@prisma/client";

type TrailerWithRelations = Prisma.TrailerGetPayload<{
  include: { washes: true; notes: true };
}>;

export function VaskPageClient({ trailers }: { trailers: TrailerWithRelations[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [summaryOpen, setSummaryOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setModalOpen(true);
      router.replace("/vask");
    }
  }, [searchParams, router]);

  const missing = trailers.filter((t) => t.status !== "VASKET").length;
  const washed = trailers.length - missing;

  const washedRows: WashSummaryRow[] = trailers
    .filter((t) => t.status === "VASKET")
    .map((t) => {
      const lastWash = t.washes[0];
      return {
        id: t.id,
        company: lastWash?.company ?? t.company,
        number: t.number,
        licensePlate: t.licensePlate,
        plombeNumber: lastWash?.plombeNumber ?? null,
      };
    });

  // Auto-show the copy-ready list the moment the last trailer of the day
  // gets marked as washed. A manual "Vaskeliste" button covers reopening it
  // later (e.g. after a page reload, when this transition can't be observed).
  const prevMissing = useRef(missing);
  useEffect(() => {
    if (prevMissing.current > 0 && missing === 0 && washedRows.length > 0) {
      setSummaryOpen(true);
    }
    prevMissing.current = missing;
  }, [missing, washedRows.length]);

  return (
    <div className="space-y-6 pb-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Truck size={24} /> Vaskeplan
          </h1>
          <p className="mt-1 text-sm text-muted">
            {washed} vasket · {missing} mangler
          </p>
        </div>
        <div className="flex items-center gap-2">
          {washed > 0 && <WashSummaryButton onClick={() => setSummaryOpen(true)} count={washed} />}
          <Button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5">
            <Plus size={18} strokeWidth={3} /> Tilføj trailer
          </Button>
        </div>
      </header>

      {trailers.length === 0 ? (
        <EmptyState
          icon="🚛"
          title="Ingen trailere i vaskeplanen."
          description="Tilføj den første trailer for at komme i gang."
          action={<Button onClick={() => setModalOpen(true)}>Tilføj trailer</Button>}
        />
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {trailers.map((t) => (
            <TrailerCard key={t.id} trailer={t} />
          ))}
        </div>
      )}

      <AddTrailerModal open={modalOpen} onClose={() => setModalOpen(false)} />
      <WashSummaryModal open={summaryOpen} onClose={() => setSummaryOpen(false)} rows={washedRows} />
    </div>
  );
}
