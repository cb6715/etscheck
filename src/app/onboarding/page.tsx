import { redirect } from "next/navigation";
import { hasUser } from "@/lib/actions";
import { OnboardingWizard } from "./onboarding-wizard";

export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  if (await hasUser()) redirect("/");
  return (
    <div className="space-y-5">
      <OnboardingWizard />
    </div>
  );
}
