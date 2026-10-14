import { Card } from "@/components/ui/primitives";

export const dynamic = "force-dynamic";

export default function VilkaarPage() {
  return (
    <div className="space-y-5">
      <h1 className="text-xl font-extrabold">Vilkår</h1>
      <Card className="space-y-3 p-5 text-sm leading-relaxed text-[var(--muted)]">
        <p>
          WageFlow Premium koster 9 kr./måned og fornyes automatisk, indtil du opsiger det. Du kan opsige når som
          helst fra Abonnement-siden — adgangen fortsætter til udgangen af den periode, du allerede har betalt for.
        </p>
        <p>
          Betaling håndteres af Stripe. WageFlow gemmer aldrig dine kortoplysninger — kun en reference til din
          Stripe-kunde og dit abonnements status.
        </p>
        <p>
          De lønberegninger WageFlow viser er et skøn baseret på de indstillinger, du selv har angivet (timeløn,
          tillæg, skatteprocent mv.) — ikke en garanti for den faktiske lønudbetaling eller en erstatning for din
          lønseddel.
        </p>
      </Card>
    </div>
  );
}
