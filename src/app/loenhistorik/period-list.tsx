"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { CalendarCheck, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import { expectedPayout, lastWeekdayOfMonth } from "@/lib/engine";
import { formatShortDate, formatDayHeading } from "@/lib/date";
import { deletePayPeriodHistory, type LastClosedPeriod } from "@/lib/actions";

function formatKr(n: number): string {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

export function PeriodList({ periods }: { periods: LastClosedPeriod[] }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function remove(id: number) {
    startTransition(async () => {
      await deletePayPeriodHistory(id);
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {periods.map((p) => {
        const payout = expectedPayout(p.netAmount, { advanceAmount: p.advanceAmount });
        const payoutDate = lastWeekdayOfMonth(new Date(p.periodEnd));
        return (
          <Card key={p.id} className="space-y-1.5 p-4">
            <div className="flex items-start justify-between gap-2">
              <p className="text-xs font-bold text-[var(--muted)]">
                {formatShortDate(new Date(p.periodStart))} – {formatShortDate(new Date(p.periodEnd))}
              </p>
              <button
                onClick={() => remove(p.id)}
                disabled={pending}
                aria-label="Slet lønperiode"
                className="rounded-xl p-1.5 text-[var(--muted)] hover:bg-[var(--surface-2)] hover:text-[var(--danger)]"
              >
                <Trash2 size={14} />
              </button>
            </div>
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
  );
}
