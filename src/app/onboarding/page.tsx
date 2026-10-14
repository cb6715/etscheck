import { redirect } from "next/navigation";
import { getSessionUserId } from "@/lib/session";
import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  if ((await getSessionUserId()) !== null) redirect("/");
  return (
    <div className="space-y-5">
      <OnboardingWizard />
    </div>
  );
}
