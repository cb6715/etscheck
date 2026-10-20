import { CalendarRange } from "lucide-react";
import { requirePageAccess } from "@/lib/auth-guard";
import { getScheduleTemplate, getScheduledShifts } from "@/lib/schedule-actions";
import { getWorkplaces } from "@/lib/workplace-actions";
import { PlanlaegningClient } from "./planlaegning-client";

export const dynamic = "force-dynamic";

export default async function PlanlaegningPage() {
  await requirePageAccess();
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth() + 1;
  const monthStart = new Date(year, month - 1, 1);
  const monthEnd = new Date(year, month, 0);

  const [template, workplaces, shifts] = await Promise.all([
    getScheduleTemplate(),
    getWorkplaces(),
    getScheduledShifts(monthStart, monthEnd),
  ]);

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <CalendarRange size={22} /> Planlægning
      </h1>
      <PlanlaegningClient
        initialYear={year}
        initialMonth={month}
        initialTemplate={template}
        initialShifts={shifts}
        workplaces={workplaces}
      />
    </div>
  );
}
