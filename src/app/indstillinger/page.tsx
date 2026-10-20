import { Settings } from "lucide-react";
import { requirePageAccess } from "@/lib/auth-guard";
import { getWageSettings } from "@/lib/actions";
import { getContracts } from "@/lib/contracts";
import { getRedeemCodes } from "@/lib/redeem-actions";
import { SettingsForm, AccountSettings } from "./settings-form";
import { ContractsSection } from "./contracts-section";
import { RedeemCodesSection } from "./redeem-codes-section";

export const dynamic = "force-dynamic";

export default async function IndstillingerPage() {
  const { access } = await requirePageAccess();
  const [settings, contracts, redeemCodes] = await Promise.all([
    getWageSettings(),
    getContracts(),
    access.isOwner ? getRedeemCodes() : Promise.resolve(null),
  ]);
  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <Settings size={22} /> Indstillinger
      </h1>
      <SettingsForm settings={settings} />
      <ContractsSection initialContracts={contracts} />
      {access.isOwner && redeemCodes && <RedeemCodesSection initialCodes={redeemCodes} />}
      <AccountSettings />
    </div>
  );
}
