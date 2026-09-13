import { Badge } from "@/components/ui/primitives";
import type { TrailerStatus } from "@prisma/client";

const MAP: Record<TrailerStatus, { tone: "success" | "warning" | "danger" | "info" | "default"; label: string }> = {
  VASKET: { tone: "success", label: "🟢 Vasket" },
  MANGLER: { tone: "warning", label: "🟡 Mangler" },
  I_GANG: { tone: "info", label: "🔵 I gang" },
  AFVENTER: { tone: "default", label: "⚪ Afventer" },
  PROBLEM: { tone: "danger", label: "🔴 Problem" },
};

export function TrailerStatusBadge({ status }: { status: TrailerStatus }) {
  const s = MAP[status];
  return <Badge tone={s.tone}>{s.label}</Badge>;
}
