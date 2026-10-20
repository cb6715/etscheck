import { AlertTriangle } from "lucide-react";
import Link from "next/link";
import { getPeriodGap } from "@/lib/actions";
import { formatShortDate } from "@/lib/date";
import { Card } from "@/components/ui/primitives";

// Stays visible on every dashboard load — not a one-time onboarding nudge
// — for as long as getPeriodGap() finds unfilled days at the start of the
// current pay period. Disappears the moment those days are logged (via
// "Tidligere timer" on Din uge), since that's exactly what closes the gap
// getPeriodGap() is checking for.
export async function PeriodGapBanner() {
  const gap = await getPeriodGap();
  if (!gap) return null;

  return (
    <Link href="/uge">
      <Card className="flex items-start gap-3 border-[var(--danger)]/40 bg-[var(--danger)]/5 p-4 transition hover:border-[var(--danger)]">
        <AlertTriangle size={18} className="mt-0.5 shrink-0 text-[var(--danger)]" />
        <div className="space-y-0.5">
          <p className="text-sm font-bold text-[var(--danger)]">
            {gap.days} {gap.days === 1 ? "dag" : "dage"} mangler at blive udfyldt
          </p>
          <p className="text-xs text-[var(--muted)]">
            Din lønperiode startede {formatShortDate(new Date(gap.gapStart))}, men du har endnu ikke registreret noget
            før {formatShortDate(new Date(gap.gapEnd))}. Gå til Din uge, find ugen, og log den som ét samlet timetal.
          </p>
        </div>
      </Card>
    </Link>
  );
}
