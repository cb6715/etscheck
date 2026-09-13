import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { prisma } from "@/lib/prisma";
import { normalizePlate } from "@/lib/plate";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { formatShortDate, formatTime } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function CustomerDetailPage({
  params,
}: {
  params: Promise<{ plate: string }>;
}) {
  const { plate } = await params;
  const customer = await prisma.driveInCustomer.findUnique({
    where: { licensePlate: normalizePlate(plate) },
    include: {
      company: true,
      visits: { orderBy: { visitedAt: "desc" } },
    },
  });
  if (!customer) notFound();

  return (
    <div className="space-y-6 pb-4">
      <Link href="/drive-in" className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-foreground">
        <ChevronLeft size={16} /> Tilbage til drive-in
      </Link>

      <header>
        <h1 className="font-mono text-3xl font-bold tracking-wide">{customer.licensePlateDisplay}</h1>
        {customer.company && (
          <Link href={`/drive-in/firma/${customer.company.id}`} className="mt-1 inline-block text-sm font-semibold text-accent">
            {customer.company.name} →
          </Link>
        )}
      </header>

      <Card className="grid grid-cols-2 divide-x divide-border p-0">
        <div className="p-4 text-center">
          <p className="text-2xl font-extrabold">{customer.visits.length}</p>
          <p className="text-xs font-medium text-muted">besøg i alt</p>
        </div>
        <div className="p-4 text-center">
          <p className="text-lg font-bold">
            {customer.visits[0] ? formatShortDate(new Date(customer.visits[0].visitedAt)) : "—"}
          </p>
          <p className="text-xs font-medium text-muted">seneste besøg</p>
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Historik</h2>
        {customer.visits.length === 0 ? (
          <EmptyState icon="🔎" title="Ingen tidligere besøg" />
        ) : (
          <div className="space-y-2">
            {customer.visits.map((v) => (
              <Card key={v.id} className="p-4">
                <div className="flex items-center justify-between">
                  <span className="font-semibold">{formatShortDate(new Date(v.visitedAt))}</span>
                  <span className="text-sm text-muted">{formatTime(new Date(v.visitedAt))}</span>
                </div>
                <div className="mt-1 flex flex-wrap gap-2">
                  {v.service && <Badge tone="info">{v.service}</Badge>}
                  {v.refNumber && <Badge>Ref. {v.refNumber}</Badge>}
                </div>
                {v.note && <p className="mt-2 text-sm text-muted">{v.note}</p>}
              </Card>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
