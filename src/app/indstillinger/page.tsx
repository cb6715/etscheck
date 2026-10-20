import { Settings } from "lucide-react";
import { requirePageAccess } from "@/lib/auth-guard";
import { getWageSettings } from "@/lib/actions";
import { getContracts } from "@/lib/contracts";
import { getPayslips } from "@/lib/payslips";
import { SettingsForm, AccountSettings } from "./settings-form";
import { ContractsSection } from "./contracts-section";
import { PayslipsSection } from "./payslips-section";

export const dynamic = "force-dynamic";

export default async function IndstillingerPage() {
  await requirePageAccess();
  const [settings, contracts, payslips] = await Promise.all([getWageSettings(), getContracts(), getPayslips()]);
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <Settings size={22} /> Indstillinger
      </h1>
      <SettingsForm settings={settings} />
      <PayslipsSection initialPayslips={payslips} />
      <ContractsSection initialContracts={contracts} />
      <AccountSettings />
    </div>
  );
}
