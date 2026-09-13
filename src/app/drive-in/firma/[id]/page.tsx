import Link from "next/link";
import { notFound } from "next/navigation";
import { ChevronLeft } from "lucide-react";
import { getCompanyDetail } from "@/lib/actions/drivein";
import { Card, Badge, EmptyState } from "@/components/ui/primitives";
import { formatShortDate, formatTime } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function CompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const company = await getCompanyDetail(id);
  if (!company) notFound();

  return (
    <div className="space-y-6 pb-4">
      <Link href="/drive-in" className="flex items-center gap-1 text-sm font-semibold text-muted hover:text-foreground">
        <ChevronLeft size={16} /> Tilbage til drive-in
      </Link>

      <header>
        <h1 className="text-2xl font-bold tracking-tight">{company.name}</h1>
      </header>

      <Card className="grid grid-cols-2 divide-x divide-border p-0">
        <div className="p-4 text-center">
          <p className="text-2xl font-extrabold">{company.visits.length}</p>
          <p className="text-xs font-medium text-muted">besøg</p>
        </div>
        <div className="p-4 text-center">
          <p className="text-lg font-bold">
            {company.visits[0] ? formatShortDate(new Date(company.visits[0].visitedAt)) : "—"}
          </p>
          <p className="text-xs font-medium text-muted">seneste besøg</p>
        </div>
      </Card>

      <section>
        <h2 className="mb-3 text-sm font-bold uppercase tracking-wide text-muted">Alle besøg</h2>
        {company.visits.length === 0 ? (
          <EmptyState icon="🏢" title="Ingen besøg endnu" />
        ) : (
          <div className="space-y-2">
            {company.visits.map((v) => (
              <Link key={v.id} href={`/drive-in/kunde/${v.customer.licensePlate}`}>
                <Card className="p-4 transition hover:border-accent/40">
                  <div className="flex items-center justify-between">
                    <span className="font-mono font-bold">{v.customer.licensePlateDisplay}</span>
                    <span className="text-sm text-muted">
                      {formatShortDate(new Date(v.visitedAt))} · {formatTime(new Date(v.visitedAt))}
                    </span>
                  </div>
                  {v.service && (
                    <Badge tone="info" className="mt-2">
                      {v.service}
                    </Badge>
                  )}
                </Card>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
