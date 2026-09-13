import { getTodayBriefingData, getPlanVsActual } from "@/lib/actions/briefing";
import { PlanlaegningClient } from "./planlaegning-client";

export const dynamic = "force-dynamic";

export default async function PlanlaegningPage() {
  const [data, planVsActual] = await Promise.all([getTodayBriefingData(), getPlanVsActual()]);

  const existingItems = data.quantityTasks.map((t) => ({
    taskId: t.id,
    category: t.category?.name ?? "Andre opgaver",
    total: t.quantityTotal ?? 0,
    done: t.quantityDone ?? 0,
  }));

  return (
    <PlanlaegningClient
      messages={data.messages}
      quantityTasks={data.quantityTasks}
      plainTasks={data.plainTasks}
      pendingConfirmation={data.pendingConfirmation}
      pendingClarification={data.pendingClarification}
      existingItems={existingItems}
      planVsActual={planVsActual}
    />
  );
}
