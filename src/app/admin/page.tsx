import { redirect } from "next/navigation";
import { ShieldCheck } from "lucide-react";
import { requirePageAccess } from "@/lib/auth-guard";
import { getAdminStats, getRedeemCodes } from "@/lib/redeem-actions";
import { AdminStatsCards } from "./admin-stats";
import { InviteSection } from "./invite-section";
import { RedeemCodesSection } from "../indstillinger/redeem-codes-section";

export const dynamic = "force-dynamic";

export default async function AdminPage() {
  const { access } = await requirePageAccess();
  if (!access.isOwner) redirect("/");

  const [stats, codes] = await Promise.all([getAdminStats(), getRedeemCodes()]);

  return (
    <div className="space-y-5">
      <h1 className="flex items-center gap-2 text-xl font-extrabold tracking-tight">
        <ShieldCheck size={22} /> Admin
      </h1>
      <AdminStatsCards stats={stats} />
      <InviteSection />
      <RedeemCodesSection initialCodes={codes} />
    </div>
  );
}
