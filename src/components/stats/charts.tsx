"use client";

// Small, dependency-free SVG charts for the statistics dashboard — no new
// npm package, themed with the app's existing CSS variables so it matches
// dark/light mode automatically.

export type ChartPoint = { label: string; value: number };

export function BarChart({
  points,
  height = 140,
  color = "var(--accent)",
  formatValue,
  emptyLabel = "Ingen data i denne periode",
}: {
  points: ChartPoint[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
  emptyLabel?: string;
}) {
  const max = Math.max(1, ...points.map((p) => p.value));
  const hasData = points.some((p) => p.value > 0);

  if (!hasData) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-sm text-muted">
        {emptyLabel}
      </div>
    );
  }

  return (
    <div className="flex items-end gap-1.5" style={{ height }}>
      {points.map((p, i) => {
        const barHeight = Math.max(2, (p.value / max) * (height - 28));
        return (
          <div key={i} className="flex flex-1 flex-col items-center gap-1" title={`${p.label}: ${formatValue ? formatValue(p.value) : p.value}`}>
            <span className="text-[10px] font-semibold tabular-nums text-muted">
              {p.value > 0 ? (formatValue ? formatValue(p.value) : p.value) : ""}
            </span>
            <div
              className="w-full rounded-t-md transition-all"
              style={{ height: barHeight, background: color, minHeight: 2, opacity: p.value > 0 ? 1 : 0.15 }}
            />
            <span className="text-[10px] font-medium text-muted whitespace-nowrap">{p.label}</span>
          </div>
        );
      })}
    </div>
  );
}

export function LineChart({
  points,
  height = 140,
  color = "var(--accent)",
  formatValue,
  emptyLabel = "Ingen data i denne periode",
}: {
  points: ChartPoint[];
  height?: number;
  color?: string;
  formatValue?: (v: number) => string;
  emptyLabel?: string;
}) {
  const hasData = points.some((p) => p.value > 0);
  if (!hasData || points.length === 0) {
    return (
      <div style={{ height }} className="flex items-center justify-center text-sm text-muted">
        {emptyLabel}
      </div>
    );
  }

  const width = 100;
  const max = Math.max(1, ...points.map((p) => p.value));
  const stepX = points.length > 1 ? width / (points.length - 1) : 0;
  const coords = points.map((p, i) => ({
    x: points.length > 1 ? i * stepX : width / 2,
    y: 100 - (p.value / max) * 90,
    ...p,
  }));
  const path = coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x} ${c.y}`).join(" ");

  return (
    <div style={{ height }}>
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-[calc(100%-18px)] w-full overflow-visible">
        <path d={path} fill="none" stroke={color} strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
        {coords.map((c, i) => (
          <circle key={i} cx={c.x} cy={c.y} r={1.4} fill={color} vectorEffect="non-scaling-stroke">
            <title>{`${c.label}: ${formatValue ? formatValue(c.value) : c.value}`}</title>
          </circle>
        ))}
      </svg>
      <div className="mt-1 flex justify-between text-[10px] font-medium text-muted">
        <span>{points[0]?.label}</span>
        {points.length > 1 && <span>{points[points.length - 1]?.label}</span>}
      </div>
    </div>
  );
}

export function DeltaBadge({ current, previous, suffix = "" }: { current: number; previous: number; suffix?: string }) {
  if (previous <= 0) return null;
  const pct = Math.round(((current - previous) / previous) * 100);
  if (pct === 0) return <span className="text-xs font-semibold text-muted">±0%</span>;
  const up = pct > 0;
  return (
    <span className={`text-xs font-bold ${up ? "text-success" : "text-danger"}`}>
      {up ? "▲" : "▼"} {Math.abs(pct)}%{suffix}
    </span>
  );
}
