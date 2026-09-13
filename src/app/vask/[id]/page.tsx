import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft, Droplets } from "lucide-react";
import { getTrailerDetail } from "@/lib/actions/trailers";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { TrailerStatusBadge } from "@/components/trailers/trailer-status-badge";
import { formatShortDate, formatTime } from "@/lib/date";
import { TrailerActions } from "./trailer-actions";

export const dynamic = "force-dynamic";

export default async function TrailerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const trailer = await getTrailerDetail(id);
  if (!trailer) notFound();

  const lastWash = trailer.washes[0];
  const openProblems = trailer.notes.filter((n) => n.isProblem && !n.resolved);

  return (
    <div className="space-y-6 pb-4">
      <Link href="/vask" className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-foreground">
        <ChevronLeft size={16} /> Tilbage til vaskeplan
      </Link>

      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Trailer #{trailer.number}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <TrailerStatusBadge status={trailer.status} />
            {trailer.licensePlate && <Badge>{trailer.licensePlate}</Badge>}
            {trailer.type && <Badge>{trailer.type}</Badge>}
          </div>
        </div>
      </header>

      {openProblems.length > 0 && (
        <Card className="border-[var(--danger-a40)] bg-danger-bg p-4">
          <p className="mb-1 font-bold text-danger">⚠️ Åbne problemer</p>
          {openProblems.map((p) => (
            <p key={p.id} className="text-sm">{p.text}</p>
          ))}
        </Card>
      )}

      <TrailerActions trailerId={trailer.id} trailerNumber={trailer.number} note={trailer.note} />

      <Card className="p-5">
        <h2 className="mb-1 text-sm font-bold uppercase tracking-wide text-muted">Seneste vask</h2>
        {lastWash ? (
          <p className="text-lg font-semibold">
            {formatShortDate(new Date(lastWash.washedAt))} kl. {formatTime(new Date(lastWash.washedAt))}
          </p>
        ) : (
          <p className="text-muted">Ikke vasket endnu</p>
        )}
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">
          <Droplets className="mr-1.5 inline" size={16} />
          Vaskehistorik
        </h2>
        {trailer.washes.length === 0 ? (
          <EmptyState icon="🧼" title="Ingen vaskehistorik endnu" />
        ) : (
          <Card className="divide-y divide-border">
            {trailer.washes.map((w) => (
              <div key={w.id} className="flex items-center justify-between p-4">
                <div>
                  <span className="font-medium">
                    {formatShortDate(new Date(w.washedAt))} — Vasket
                  </span>
                  {(w.company || w.plombeNumber) && (
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      {w.company && (
                        <Badge tone={w.company === "DFDS" ? "info" : "default"}>{w.company}</Badge>
                      )}
                      {w.plombeNumber && (
                        <span className="text-xs text-muted">Plombe {w.plombeNumber}</span>
                      )}
                    </div>
                  )}
                </div>
                <span className="text-sm text-muted">{formatTime(new Date(w.washedAt))}</span>
              </div>
            ))}
          </Card>
        )}
      </section>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Noter</h2>
        {trailer.notes.filter((n) => !n.isProblem).length === 0 ? (
          <p className="text-sm text-muted">Ingen noter endnu.</p>
        ) : (
          <div className="space-y-2">
            {trailer.notes
              .filter((n) => !n.isProblem)
              .map((n) => (
                <Card key={n.id} className="p-3 text-sm">
                  {n.text}
                  <p className="mt-1 text-xs text-muted">{formatShortDate(new Date(n.createdAt))}</p>
                </Card>
              ))}
          </div>
        )}
      </section>
    </div>
  );
}
