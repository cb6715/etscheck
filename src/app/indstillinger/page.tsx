import { getCategories } from "@/lib/actions/misc";
import { getTemplates } from "@/lib/actions/tasks";
import {
  getWageSettings,
  getHistoricalWeeks,
  getWeekAttendance,
  getSickDays,
} from "@/lib/actions/worksessions";
import { SettingsPageClient } from "./settings-page-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [categories, templates, wageSettings, historicalWeeks, weekAttendance, sickDays] = await Promise.all([
    getCategories(),
    getTemplates(),
    getWageSettings(),
    getHistoricalWeeks(),
    getWeekAttendance(),
    getSickDays(),
  ]);
  return (
    <SettingsPageClient
      categories={categories}
      templates={templates}
      wageSettings={wageSettings}
      historicalWeeks={historicalWeeks}
      weekAttendance={weekAttendance}
      sickDays={sickDays}
    />
  );
}
