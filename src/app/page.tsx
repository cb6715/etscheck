import { CalendarDays } from "lucide-react";
import Link from "next/link";
import { requirePageAccess } from "@/lib/auth-guard";
import { WageCard } from "@/components/wage-card";
import { Card } from "@/components/ui/primitives";
import { greeting } from "@/lib/date";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  await requirePageAccess();

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-[var(--muted)]">{greeting(new Date())} 👋</h1>
      <WageCard />
      <Link href="/uge">
        <Card className="flex items-center justify-between p-4 transition hover:border-[var(--accent)]">
          <span className="flex items-center gap-2 text-sm font-bold">
            <CalendarDays size={16} /> Se ugen — timer, sygedage
          </span>
          <span className="text-[var(--muted)]">→</span>
        </Card>
      </Link>
    </div>
  );
}
