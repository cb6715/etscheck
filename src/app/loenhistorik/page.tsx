import { History, CalendarCheck } from "lucide-react";
import { requirePageAccess } from "@/lib/auth-guard";
import { getPayPeriodHistory } from "@/lib/actions";
import { expectedPayout, lastWeekdayOfMonth } from "@/lib/engine";
import { formatShortDate, formatDayHeading } from "@/lib/date";
import { Card } from "@/components/ui/primitives";
import { BackfillForm } from "./backfill-form";

export const dynamic = "force-dynamic";

function formatKr(n: number): string {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

export default async function LoenhistorikPage() {
  await requirePageAccess();
  const periods = await getPayPeriodHistory();

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <History size={22} /> Lønhistorik
      </h1>

      <BackfillForm />

      {periods.length === 0 ? (
        <Card className="p-5 text-sm text-[var(--muted)]">
          Ingen lukkede lønperioder endnu — de dukker op her, hver gang du lukker en periode på forsiden.
        </Card>
      ) : (
        <div className="space-y-3">
          {periods.map((p) => {
            const payout = expectedPayout(p.netAmount, { advanceAmount: p.advanceAmount });
            const payoutDate = lastWeekdayOfMonth(new Date(p.periodEnd));
            return (
              <Card key={`${p.periodStart}-${p.periodEnd}`} className="space-y-1.5 p-4">
                <p className="text-xs font-bold text-[var(--muted)]">
                  {formatShortDate(new Date(p.periodStart))} – {formatShortDate(new Date(p.periodEnd))}
                </p>
                <p className="font-mono text-2xl font-extrabold tabular-nums">{formatKr(payout)}</p>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[var(--muted)]">
                  <span>Netto optjent {formatKr(p.netAmount)}</span>
                  <span>Brutto {formatKr(p.grossAmount)}</span>
                  {p.advanceAmount > 0 && <span>− {formatKr(p.advanceAmount)} forskud</span>}
                  <span className="flex items-center gap-1">
                    <CalendarCheck size={12} /> Udbetalt {formatDayHeading(payoutDate)}
                  </span>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
