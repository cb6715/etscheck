import { BarChart3 } from "lucide-react";
import { getStatisticsDashboard } from "@/lib/actions/statistics";
import { StatistikDashboard } from "./statistik-dashboard";

export const dynamic = "force-dynamic";

export default async function StatistikPage() {
  const initialData = await getStatisticsDashboard({ period: "week" });

  return (
    <div className="space-y-6 pb-4">
      <header>
        <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
          <BarChart3 size={24} /> Statistik
        </h1>
      </header>
      <StatistikDashboard initialData={initialData} />
    </div>
  );
}
