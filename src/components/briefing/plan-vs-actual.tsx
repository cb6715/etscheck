import { Card } from "@/components/ui/primitives";
import type { PlanVsActual } from "@/lib/actions/briefing";

export function PlanVsActualCard({ data }: { data: PlanVsActual }) {
  if (!data || data.planned.length === 0) return null;

  const rows = data.planned.map((p) => {
    const actual = data.actual.find((a) => a.category === p.category);
    const done = actual?.done ?? 0;
    const total = actual?.total ?? p.total;
    const missing = Math.max(p.total - done, 0);
    return { category: p.category, icon: p.icon, planned: p.total, total, done, missing };
  });

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-bold uppercase tracking-wide text-muted">Plan vs. faktisk</h2>
      <div className="space-y-3">
        {rows.map((r) => (
          <div key={r.category} className="flex items-center justify-between text-sm">
            <span className="font-semibold">
              {r.icon} {r.category}
            </span>
            <span className="flex items-center gap-3 text-xs">
              <span className="text-muted">Planlagt {r.planned}</span>
              <span className={r.done >= r.total ? "font-bold text-success" : "font-bold text-warning"}>
                Faktisk {r.done}/{r.total}
              </span>
              {r.missing > 0 && <span className="font-bold text-danger">Mangler {r.missing}</span>}
            </span>
          </div>
        ))}
      </div>
    </Card>
  );
}
