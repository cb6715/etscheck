import { redirect } from "next/navigation";
import { CalendarDays, History } from "lucide-react";
import Link from "next/link";
import { getSessionUserId } from "@/lib/session";
import { getAccessState } from "@/lib/access";
import { WageCard } from "@/components/wage-card";
import { NextShiftCard } from "@/components/next-shift-card";
import { Card } from "@/components/ui/primitives";
import { greeting } from "@/lib/date";
import { LandingPage } from "@/components/landing/landing-page";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const userId = await getSessionUserId();
  if (userId === null) return <LandingPage />;

  const access = await getAccessState(userId);
  if (!access.hasAccess) redirect("/abonnement");

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-bold text-[var(--muted)]">{greeting(new Date())} 👋</h1>
      <WageCard />
      <NextShiftCard />
      <Link href="/uge">
        <Card className="flex items-center justify-between p-4 transition hover:border-[var(--accent)]">
          <span className="flex items-center gap-2 text-sm font-bold">
            <CalendarDays size={16} /> Se ugen — timer, sygedage
          </span>
          <span className="text-[var(--muted)]">→</span>
        </Card>
      </Link>
      <Link href="/loenhistorik">
        <Card className="flex items-center justify-between p-4 transition hover:border-[var(--accent)]">
          <span className="flex items-center gap-2 text-sm font-bold">
            <History size={16} /> Lønhistorik — tidligere perioder
          </span>
          <span className="text-[var(--muted)]">→</span>
        </Card>
      </Link>
    </div>
  );
}
