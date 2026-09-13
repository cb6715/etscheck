import { getCategories } from "@/lib/actions/misc";
import { getTemplates } from "@/lib/actions/tasks";
import { getWageSettings } from "@/lib/actions/worksessions";
import { SettingsPageClient } from "./settings-page-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [categories, templates, wageSettings] = await Promise.all([
    getCategories(),
    getTemplates(),
    getWageSettings(),
  ]);
  return <SettingsPageClient categories={categories} templates={templates} wageSettings={wageSettings} />;
}
