import type { ReactNode } from "react";
import { Users, CreditCard, ShieldCheck } from "lucide-react";
import { Card } from "@/components/ui/primitives";
import type { AdminStats } from "@/lib/redeem-actions";

function StatCard({ icon, label, value }: { icon: ReactNode; label: string; value: number }) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[var(--accent-foreground)]">
        {icon}
      </span>
      <span>
        <span className="block font-mono text-xl font-extrabold tabular-nums">{value}</span>
        <span className="block text-xs text-[var(--muted)]">{label}</span>
      </span>
    </Card>
  );
}

export function AdminStatsCards({ stats }: { stats: AdminStats }) {
  return (
    <div className="grid grid-cols-3 gap-3">
      <StatCard icon={<Users size={18} />} label="Brugere i alt" value={stats.totalUsers} />
      <StatCard icon={<CreditCard size={18} />} label="Betalende" value={stats.paidSubscribers} />
      <StatCard icon={<ShieldCheck size={18} />} label="Med adgang" value={stats.activeAccess} />
    </div>
  );
}
