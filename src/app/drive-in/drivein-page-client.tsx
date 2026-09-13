"use client";

import { useEffect, useState } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import Link from "next/link";
import { Plus, Car } from "lucide-react";
import { Button, EmptyState, Card, Badge } from "@/components/ui/primitives";
import { QuickVisitModal } from "@/components/drivein/quick-visit-modal";
import { formatTime } from "@/lib/date";
import type { Prisma } from "@prisma/client";

type VisitWithRelations = Prisma.DriveInVisitGetPayload<{
  include: { customer: true; company: true };
}>;

export function DriveInPageClient({ visits }: { visits: VisitWithRelations[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setModalOpen(true);
      router.replace("/drive-in");
    }
  }, [searchParams, router]);

  return (
    <div className="space-y-6 pb-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Car size={24} /> Drive-in
          </h1>
          <p className="mt-1 text-sm text-muted">{visits.length} kunder i dag</p>
        </div>
        <Button onClick={() => setModalOpen(true)} className="flex items-center gap-1.5">
          <Plus size={18} strokeWidth={3} /> Ny drive-in
        </Button>
      </header>

      <button
        onClick={() => setModalOpen(true)}
        className="flex w-full items-center justify-center gap-3 rounded-2xl border-2 border-dashed border-accent/40 bg-accent/5 p-6 text-accent transition hover:bg-accent/10 active:scale-[0.99]"
      >
        <Car size={28} />
        <span className="text-lg font-bold">Registrer drive-in kunde</span>
      </button>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Dagens drive-in</h2>
        {visits.length === 0 ? (
          <EmptyState icon="🚗" title="Ingen drive-in kunder endnu i dag." />
        ) : (
          <div className="space-y-2">
            {visits.map((v) => (
              <Link key={v.id} href={`/drive-in/kunde/${v.customer.licensePlate}`}>
                <Card className="flex items-center justify-between p-4 transition hover:border-accent/40">
                  <div className="min-w-0">
                    <p className="font-mono text-base font-bold tracking-wide">
                      {v.customer.licensePlateDisplay}
                    </p>
                    <p className="truncate text-sm text-muted">
                      {v.company?.name ?? "Uden firma"}
                      {v.refNumber ? ` · Ref. ${v.refNumber}` : " · Ingen ref.nr."}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-sm text-muted">{formatTime(new Date(v.visitedAt))}</span>
                    <Badge tone="success">✓</Badge>
                  </div>
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>

      <QuickVisitModal open={modalOpen} onClose={() => setModalOpen(false)} />
    </div>
  );
}
