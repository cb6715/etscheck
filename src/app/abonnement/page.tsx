import { redirect } from "next/navigation";
import Link from "next/link";
import { CreditCard, Check, Crown, Gift, AlertTriangle } from "lucide-react";
import { getSessionUserId } from "@/lib/session";
import { getBillingState } from "@/lib/billing-actions";
import { Card, Badge, Button } from "@/components/ui/primitives";
import { CheckoutButton, PortalButton } from "./billing-buttons";
import { RedeemCodeForm } from "./redeem-code-form";

export const dynamic = "force-dynamic";

const FEATURES = [
  "Tjek ind/ud med live løn, der tæller op i realtid",
  "Automatisk overtid, aftentillæg og sygeløn efter dine egne regler",
  "Fuldt overblik: brutto, netto, feriepenge og forventet udbetaling",
  "Ugeoversigt med sygedage og manglende registreringer",
];

export default async function AbonnementPage() {
  const userId = await getSessionUserId();
  if (userId === null) redirect("/login");

  const billing = await getBillingState();

  if (billing.isOwner) {
    return (
      <div className="animate-fade-up space-y-5 pt-4">
        <Card className="space-y-3 p-6 text-center" elevated>
          <Crown className="mx-auto text-[var(--accent)]" size={32} />
          <h1 className="text-xl font-extrabold">Ejer-adgang</h1>
          <p className="text-sm text-[var(--muted)]">
            Din konto har permanent, gratis adgang til alle WageFlow-funktioner — intet abonnement nødvendigt.
          </p>
        </Card>
      </div>
    );
  }

  if (billing.hasFreeAccess) {
    return (
      <div className="animate-fade-up space-y-5 pt-4">
        <Card className="space-y-3 p-6 text-center" elevated>
          <Gift className="mx-auto text-[var(--accent)]" size={32} />
          <h1 className="text-xl font-extrabold">Gratis adgang</h1>
          <p className="text-sm text-[var(--muted)]">
            Du har indløst en kode og har gratis adgang til alle WageFlow-funktioner — intet abonnement nødvendigt.
          </p>
        </Card>
      </div>
    );
  }

  if (billing.hasAccess) {
    return (
      <div className="animate-fade-up space-y-5 pt-4">
        <Card className="space-y-3 p-6 text-center" elevated>
          <Badge tone="success" className="mx-auto">
            <Check size={12} /> Aktivt abonnement
          </Badge>
          <h1 className="text-xl font-extrabold">WageFlow Premium</h1>
          <p className="text-sm text-[var(--muted)]">
            9 kr./måned — fornyes automatisk.
            {billing.cancelAtPeriodEnd && billing.currentPeriodEnd && (
              <>
                {" "}
                Dit abonnement er opsagt og ophører d.{" "}
                {new Date(billing.currentPeriodEnd).toLocaleDateString("da-DK")} — du har adgang indtil da.
              </>
            )}
            {!billing.cancelAtPeriodEnd && billing.currentPeriodEnd && (
              <> Næste betaling: {new Date(billing.currentPeriodEnd).toLocaleDateString("da-DK")}.</>
            )}
          </p>
          <PortalButton />
        </Card>
      </div>
    );
  }

  return (
    <div className="animate-fade-up space-y-5 pt-4">
      <Card className="overflow-hidden p-0" elevated>
        <div className="bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-6 py-7 text-center text-[var(--accent-foreground)]">
          <CreditCard className="mx-auto mb-2" size={28} />
          <h1 className="text-2xl font-extrabold">WageFlow Premium</h1>
          <div className="mt-2 font-mono text-4xl font-extrabold tabular-nums">
            9 kr<span className="text-lg font-bold opacity-80">/måned</span>
          </div>
          <p className="mt-1 text-sm opacity-90">Betales automatisk hver måned — opsig når som helst.</p>
        </div>

        <div className="space-y-4 p-5">
          {billing.status === "past_due" && (
            <p className="flex items-center gap-2 rounded-2xl bg-[var(--warning-bg)] px-4 py-3 text-sm font-semibold text-[var(--warning)]">
              <AlertTriangle size={15} /> Din seneste betaling kunne ikke gennemføres. Opdater din betaling for at
              fortsætte.
            </p>
          )}
          {billing.status === "canceled" && (
            <p className="text-sm text-[var(--muted)]">Dit tidligere abonnement er ophørt.</p>
          )}

          <ul className="space-y-2">
            {FEATURES.map((f) => (
              <li key={f} className="flex items-start gap-2 text-sm">
                <Check size={16} className="mt-0.5 shrink-0 text-[var(--success)]" /> {f}
              </li>
            ))}
          </ul>

          {billing.stripeConfigured ? (
            <CheckoutButton />
          ) : (
            <Button fullWidth size="lg" disabled className="flex items-center justify-center gap-2">
              Betaling er endnu ikke konfigureret
            </Button>
          )}

          <RedeemCodeForm />

          <p className="text-center text-xs text-[var(--muted)]">
            Ved at starte abonnementet accepterer du automatisk, månedlig fornyelse indtil du opsiger. Se{" "}
            <Link href="/vilkaar" className="underline underline-offset-2">
              vilkår
            </Link>{" "}
            og{" "}
            <Link href="/privatliv" className="underline underline-offset-2">
              privatlivspolitik
            </Link>
            .
          </p>
        </div>
      </Card>
    </div>
  );
}
