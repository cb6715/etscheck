"use client";

import { useEffect, useState, useTransition } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Plus, StickyNote, AlertTriangle, Check } from "lucide-react";
import { Button, Card, Badge, EmptyState } from "@/components/ui/primitives";
import { NoteFormModal } from "@/components/notes/note-form-modal";
import { resolveProblem } from "@/lib/actions/trailers";
import { formatShortDate, formatTime } from "@/lib/date";
import type { Prisma } from "@prisma/client";

type NoteWithRelations = Prisma.NoteGetPayload<{
  include: { task: true; trailer: true; customer: true };
}>;

export function NoterPageClient({ notes }: { notes: NoteWithRelations[] }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [defaultProblem, setDefaultProblem] = useState(false);
  const [, startTransition] = useTransition();

  useEffect(() => {
    if (searchParams.get("new") === "1") {
      setDefaultProblem(searchParams.get("problem") === "1");
      setModalOpen(true);
      router.replace("/noter");
    }
  }, [searchParams, router]);

  const problems = notes.filter((n) => n.isProblem);
  const openProblems = problems.filter((n) => !n.resolved);
  const regular = notes.filter((n) => !n.isProblem);

  return (
    <div className="space-y-6 pb-4">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <StickyNote size={24} /> Noter & problemer
          </h1>
          <p className="mt-1 text-sm text-muted">
            {openProblems.length} åbne problemer · {regular.length} noter
          </p>
        </div>
        <Button onClick={() => { setDefaultProblem(false); setModalOpen(true); }} className="flex items-center gap-1.5">
          <Plus size={18} strokeWidth={3} /> Ny note
        </Button>
      </header>

      {openProblems.length > 0 && (
        <section>
          <h2 className="mb-3 flex items-center gap-1.5 text-sm font-bold uppercase tracking-wide text-danger">
            <AlertTriangle size={14} /> Åbne problemer
          </h2>
          <div className="space-y-2">
            {openProblems.map((n) => (
              <Card key={n.id} className="border-[var(--danger-a40)] bg-danger-bg p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-semibold">{n.text}</p>
                    <p className="mt-1 text-xs text-muted">
                      {n.trailer ? `Trailer #${n.trailer.number} · ` : ""}
                      {formatShortDate(new Date(n.createdAt))} kl. {formatTime(new Date(n.createdAt))}
                    </p>
                  </div>
                  <button
                    onClick={() => startTransition(() => resolveProblem(n.id))}
                    className="flex shrink-0 items-center gap-1 rounded-lg bg-[var(--success-a15)] px-3 py-1.5 text-xs font-bold text-success hover:bg-[var(--success-a25)]"
                  >
                    <Check size={14} /> Løst
                  </button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Alle noter</h2>
        {regular.length === 0 ? (
          <EmptyState icon="📝" title="Ingen noter endnu" description="Skriv din første note." />
        ) : (
          <div className="space-y-2">
            {regular.map((n) => (
              <Card key={n.id} className="p-4">
                <p>{n.text}</p>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {n.trailer && <Badge>Trailer #{n.trailer.number}</Badge>}
                  {n.task && <Badge>{n.task.title}</Badge>}
                  {n.customer && <Badge>{n.customer.licensePlateDisplay}</Badge>}
                  <span className="text-xs text-muted">{formatShortDate(new Date(n.createdAt))}</span>
                </div>
              </Card>
            ))}
          </div>
        )}
      </section>

      <NoteFormModal open={modalOpen} onClose={() => setModalOpen(false)} defaultProblem={defaultProblem} />
    </div>
  );
}
