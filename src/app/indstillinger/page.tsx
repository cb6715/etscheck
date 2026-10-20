import { Settings } from "lucide-react";
import { requirePageAccess } from "@/lib/auth-guard";
import { getWageSettings } from "@/lib/actions";
import { getContracts } from "@/lib/contracts";
import { SettingsForm, AccountSettings } from "./settings-form";
import { ContractsSection } from "./contracts-section";

export const dynamic = "force-dynamic";

export default async function IndstillingerPage() {
  await requirePageAccess();
  const [settings, contracts] = await Promise.all([getWageSettings(), getContracts()]);
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <Settings size={22} /> Indstillinger
      </h1>
      <SettingsForm settings={settings} />
      <ContractsSection initialContracts={contracts} />
      <AccountSettings />
    </div>
  );
}
