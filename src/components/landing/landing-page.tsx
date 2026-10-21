import Link from "next/link";
import {
  ArrowRight,
  Sparkles,
  Zap,
  TrendingUp,
  Thermometer,
  PieChart,
  ShieldCheck,
  Smartphone,
  Check,
  LogIn,
  UserPlus,
  CreditCard,
} from "lucide-react";
import { Card, Button } from "@/components/ui/primitives";
import { TiltWrapper } from "@/components/tilt-wrapper";
import { ScrollReveal } from "./scroll-reveal";
import { LiveDemoCard } from "./live-demo-card";
import { VideoAd } from "./video-ad";

const FEATURES = [
  {
    icon: Zap,
    title: "Løn, der tæller op live",
    body: "Tjek ind — og se din løn stige i realtid, sekund for sekund, helt frem til udbetaling.",
  },
  {
    icon: TrendingUp,
    title: "Overtid & tillæg uden regnefejl",
    body: "Ugentlig overtidsgrænse, aftentillæg og nattimer beregnes automatisk efter dine egne regler.",
  },
  {
    icon: Thermometer,
    title: "Sygedage uden besvær",
    body: "Marker en sygedag på sekunder — den tæller korrekt med i lønnen, uden at skulle noteres manuelt.",
  },
  {
    icon: PieChart,
    title: "Fuldt overblik, hele tiden",
    body: "Brutto, netto, feriepenge og forventet udbetaling — adskilt, tydeligt, og med hele beregningen åben for dig.",
  },
];

const STEPS = [
  { icon: UserPlus, title: "Opret din konto", body: "Indtast din timeløn og dine satser — tager under et minut." },
  { icon: LogIn, title: "Tjek ind på vagten", body: "Ét tryk, og WageFlow holder styr på resten af vagten for dig." },
  { icon: Zap, title: "Se lønnen tælle op", body: "Live, hele vagten — og et klart overblik, når du tjekker ud." },
];

const PRICING_FEATURES = [
  "Tjek ind/ud med live løn, der tæller op i realtid",
  "Automatisk overtid, aftentillæg og sygeløn",
  "Brutto, netto, feriepenge og forventet udbetaling",
  "Installerbar som app — ingen App Store nødvendig",
];

export function LandingPage() {
  return (
    <div className="space-y-24 pb-8">
      {/* Hero */}
      <section className="breakout px-4 pt-8 sm:px-6">
        <div className="mx-auto max-w-5xl">
          <div className="grid items-center gap-10 lg:grid-cols-2">
            <div className="animate-fade-up text-center lg:text-left">
              <span className="glass mx-auto inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold text-[var(--accent)] lg:mx-0">
                <Sparkles size={13} /> Ny løn-app til timelønnede
              </span>
              <h1 className="mt-4 text-4xl font-extrabold leading-[1.05] tracking-tight sm:text-5xl lg:text-6xl">
                Se din løn <span className="gradient-text">tælle op</span> — mens du arbejder
              </h1>
              <p className="mx-auto mt-4 max-w-md text-base text-[var(--muted)] sm:text-lg lg:mx-0">
                Tjek ind, og WageFlow regner brutto, netto, overtid, tillæg og feriepenge live — så du altid ved,
                hvad du har tjent lige nu.
              </p>
              <div className="mt-7 flex flex-col items-center gap-3 sm:flex-row sm:justify-center lg:justify-start">
                <Button href="/onboarding" size="lg" fullWidth className="gap-2 sm:w-auto">
                  Kom i gang — 9 kr/md <ArrowRight size={18} />
                </Button>
                <Button href="/login" size="lg" variant="secondary" fullWidth className="gap-2 sm:w-auto">
                  <LogIn size={16} /> Log ind
                </Button>
              </div>
            </div>
            <div className="animate-fade-up" style={{ animationDelay: "0.15s" }}>
              <LiveDemoCard />
            </div>
          </div>
        </div>
      </section>

      {/* Ad video — click to play, sits right under the hero so the CTA stays above and repeats beside it */}
      <ScrollReveal>
        <section className="breakout px-4 sm:px-6" aria-labelledby="ad-heading">
          <div className="mx-auto grid max-w-5xl items-center gap-8 md:grid-cols-2">
            <div className="text-center md:text-left">
              <h2 id="ad-heading" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
                Du arbejder for dine penge — <span className="gradient-text">hold styr på dem</span>
              </h2>
              <p className="mx-auto mt-3 max-w-md text-base text-[var(--muted)] md:mx-0">
                Se på 22 sekunder, hvordan WageFlow giver dig overblik over dine timer og din løn.
              </p>
              <div className="mt-6 flex justify-center md:justify-start">
                <Button href="/onboarding" size="lg" className="gap-2">
                  Opret konto <ArrowRight size={18} />
                </Button>
              </div>
            </div>
            <VideoAd />
          </div>
        </section>
      </ScrollReveal>

      {/* Features */}
      <ScrollReveal>
        <section className="px-1">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">
              Alt, din løn har brug for — <span className="gradient-text">ét sted</span>
            </h2>
            <div className="mt-8 grid grid-cols-1 gap-4 sm:grid-cols-2">
              {FEATURES.map((f, i) => (
                <ScrollReveal key={f.title} delayMs={i * 80}>
                  <TiltWrapper maxTilt={6}>
                    <Card className="h-full p-5">
                      <div className="glass-strong flex h-11 w-11 items-center justify-center rounded-2xl text-[var(--accent)]">
                        <f.icon size={20} />
                      </div>
                      <h3 className="mt-3 text-base font-extrabold">{f.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-[var(--muted)]">{f.body}</p>
                    </Card>
                  </TiltWrapper>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* How it works */}
      <ScrollReveal>
        <section className="breakout px-4 sm:px-6">
          <div className="mx-auto max-w-5xl">
            <h2 className="text-center text-2xl font-extrabold tracking-tight sm:text-3xl">Sådan virker det</h2>
            <div className="relative mt-10 grid grid-cols-1 gap-8 sm:grid-cols-3">
              <div className="absolute left-0 right-0 top-6 hidden h-px bg-[var(--border)] sm:block" aria-hidden="true" />
              {STEPS.map((s, i) => (
                <ScrollReveal key={s.title} delayMs={i * 100} className="relative text-center">
                  <div className="glass-strong relative z-10 mx-auto flex h-12 w-12 items-center justify-center rounded-full text-[var(--accent)]">
                    <s.icon size={20} />
                  </div>
                  <h3 className="mt-4 text-base font-extrabold">{s.title}</h3>
                  <p className="mx-auto mt-1.5 max-w-xs text-sm leading-relaxed text-[var(--muted)]">{s.body}</p>
                </ScrollReveal>
              ))}
            </div>
          </div>
        </section>
      </ScrollReveal>

      {/* Pricing */}
      <ScrollReveal>
        <section className="px-1">
          <div className="mx-auto max-w-lg">
            <TiltWrapper maxTilt={5}>
              <Card className="overflow-hidden p-0" elevated>
                <div className="bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-6 py-7 text-center text-[var(--accent-foreground)]">
                  <CreditCard className="mx-auto mb-2" size={26} />
                  <h2 className="text-xl font-extrabold">WageFlow Premium</h2>
                  <div className="mt-2 font-mono text-4xl font-extrabold tabular-nums">
                    9 kr<span className="text-base font-bold opacity-80">/måned</span>
                  </div>
                  <p className="mt-1 text-sm opacity-90">Opsig når som helst — ingen binding.</p>
                </div>
                <div className="space-y-4 p-6">
                  <ul className="space-y-2.5">
                    {PRICING_FEATURES.map((f) => (
                      <li key={f} className="flex items-start gap-2 text-sm">
                        <Check size={16} className="mt-0.5 shrink-0 text-[var(--success)]" /> {f}
                      </li>
                    ))}
                  </ul>
                  <Button href="/onboarding" fullWidth size="lg" className="gap-2">
                    Opret konto <ArrowRight size={18} />
                  </Button>
                  <div className="flex items-center justify-center gap-4 pt-1 text-xs text-[var(--muted)]">
                    <span className="flex items-center gap-1">
                      <ShieldCheck size={13} /> Sikker betaling via Stripe
                    </span>
                    <span className="flex items-center gap-1">
                      <Smartphone size={13} /> Installeres som app
                    </span>
                  </div>
                </div>
              </Card>
            </TiltWrapper>
          </div>
        </section>
      </ScrollReveal>

      {/* Footer */}
      <footer className="px-1 pb-4 text-center text-xs text-[var(--muted)]">
        <p className="font-bold text-[var(--foreground)]">WageFlow</p>
        <p className="mt-1">
          <Link href="/vilkaar" className="underline underline-offset-2">
            Vilkår
          </Link>{" "}
          ·{" "}
          <Link href="/privatliv" className="underline underline-offset-2">
            Privatlivspolitik
          </Link>
        </p>
      </footer>
    </div>
  );
}
