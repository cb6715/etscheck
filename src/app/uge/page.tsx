import { CalendarDays } from "lucide-react";
import { requirePageAccess } from "@/lib/auth-guard";
import { getWeekAttendance, getSickDays, getWeekHours } from "@/lib/actions";
import { UgeClient } from "./uge-client";

export const dynamic = "force-dynamic";

export default async function UgePage() {
  await requirePageAccess();
  const [attendance, sickDays, weekHours] = await Promise.all([getWeekAttendance(), getSickDays(), getWeekHours()]);

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <CalendarDays size={22} /> Din uge
      </h1>
      <UgeClient initialAttendance={attendance} initialSickDays={sickDays} initialWeekHours={weekHours} />
    </div>
  );
}
