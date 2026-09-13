import { getCategories } from "@/lib/actions/misc";
import { getTemplates } from "@/lib/actions/tasks";
import { SettingsPageClient } from "./settings-page-client";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const [categories, templates] = await Promise.all([getCategories(), getTemplates()]);
  return <SettingsPageClient categories={categories} templates={templates} />;
}
