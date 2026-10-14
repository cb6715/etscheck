import { Card } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default function PrivatlivPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold">Privatlivspolitik</h1>
      <Card className="space-y-3 p-5 text-sm leading-relaxed text-[var(--muted)]">
        <p>WageFlow gemmer de oplysninger, der skal til for at beregne og vise din løn:</p>
        <ul className="list-disc space-y-1 pl-5">
          <li>Navn, e-mail og en sikkert hashet adgangskode (aldrig adgangskoden selv).</li>
          <li>Dine lønindstillinger (timeløn, tillæg, skatteprocent, lønperiode mv.).</li>
          <li>Dine tjek ind/ud-tidspunkter og registrerede sygedage.</li>
          <li>
            Ved et aktivt abonnement: et Stripe kunde- og abonnements-id, så vi kan se din betalingsstatus. Selve
            kortoplysningerne opbevares kun hos Stripe, aldrig i WageFlow.
          </li>
        </ul>
        <p>Data deles ikke med andre end Stripe (til betaling) og den hostingplatform, appen kører på.</p>
      </Card>
    </div>
  );
}
