import { Settings } from "lucide-react";
import { getWageSettings } from "@/lib/actions";
import { SettingsForm } from "./settings-form";

export const dynamic = "force-dynamic";

export default async function IndstillingerPage() {
  const settings = await getWageSettings();
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <Settings size={22} /> Indstillinger
      </h1>
      <SettingsForm settings={settings} />
    </div>
  );
}
