import { Badge } from "@/components/ui/primitives";
import { Priority } from "@prisma/client";

export function PriorityBadge({ priority }: { priority: Priority }) {
  if (priority === "HASTER") return <Badge tone="danger">🔴 Haster</Badge>;
  if (priority === "VIGTIG") return <Badge tone="warning">🟡 Vigtig</Badge>;
  return <Badge tone="success">🟢 Normal</Badge>;
}
