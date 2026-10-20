import { History } from "lucide-react";
import { requirePageAccess } from "@/lib/auth-guard";
import { getPayPeriodHistory } from "@/lib/actions";
import { Card } from "@/components/ui/primitives";
import { BackfillForm } from "./backfill-form";
import { PeriodList } from "./period-list";

export const dynamic = "force-dynamic";

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
        <PeriodList periods={periods} />
      )}
    </div>
  );
}
