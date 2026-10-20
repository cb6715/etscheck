"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, ArrowLeft, Sparkles, Upload, FileText, CalendarDays, Clock3, Check } from "lucide-react";
import { Card, Field, inputClass, Button } from "@/components/ui/primitives";
import { signUp, type TrackingMode } from "@/lib/actions";
import { uploadContract } from "@/lib/contracts";

function dateToInputValue(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function firstOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

function lastOfMonth(): Date {
  const d = new Date();
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

const STEPS = ["Konto", "Løn", "Skat & pause", "Kontrakt", "Vagtregistrering"];

function ChoiceCard({
  active,
  onClick,
  icon: Icon,
  title,
  description,
}: {
  active: boolean;
  onClick: () => void;
  icon: typeof Upload;
  title: string;
  description: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`glass flex w-full items-start gap-3 rounded-2xl p-4 text-left transition ${
        active ? "ring-2 ring-[var(--accent)]" : "hover:brightness-95"
      }`}
    >
      <span
        className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${
          active ? "bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] text-[var(--accent-foreground)]" : "bg-[var(--surface-2)] text-[var(--muted)]"
        }`}
      >
        {active ? <Check size={16} /> : <Icon size={16} />}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-extrabold">{title}</span>
        <span className="mt-0.5 block text-xs text-[var(--muted)]">{description}</span>
      </span>
    </button>
  );
}

export function OnboardingWizard() {
  const router = useRouter();
  const [step, setStep] = useState(0);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState("");

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [hourlyRate, setHourlyRate] = useState("150");
  const [overtimeThresholdHours, setOvertimeThresholdHours] = useState("37");
  const [overtimeBonusPct, setOvertimeBonusPct] = useState("60");
  const [weekendSupplement, setWeekendSupplement] = useState("0");
  const [holidaySupplement, setHolidaySupplement] = useState("0");
  const [breakStart, setBreakStart] = useState("12:00");
  const [breakEnd, setBreakEnd] = useState("12:30");
  const [monthlyTaxDeduction, setMonthlyTaxDeduction] = useState("5100");
  const [amBidragPct, setAmBidragPct] = useState("8");
  const [taxRatePct, setTaxRatePct] = useState("44");
  const [sickPayHourlyRate, setSickPayHourlyRate] = useState("132");
  const [payPeriodStart, setPayPeriodStart] = useState(dateToInputValue(firstOfMonth()));
  const [payPeriodEnd, setPayPeriodEnd] = useState(dateToInputValue(lastOfMonth()));

  const [wantsContractUpload, setWantsContractUpload] = useState<boolean | null>(null);
  const [contractFile, setContractFile] = useState<File | null>(null);
  const [trackingMode, setTrackingModeState] = useState<TrackingMode | null>(null);

  function timeToMinutes(time: string): number {
    const [h, m] = time.split(":").map(Number);
    return h * 60 + m;
  }

  function next() {
    if (step === 0) {
      if (!name.trim() || !email.trim()) {
        setError("Udfyld navn og e-mail.");
        return;
      }
      if (password.length < 8) {
        setError("Adgangskoden skal være mindst 8 tegn.");
        return;
      }
    }
    if (step === 3 && wantsContractUpload === null) {
      setError("Vælg om du vil uploade din kontrakt, eller springe det over.");
      return;
    }
    if (step === 4 && trackingMode === null) {
      setError("Vælg hvordan du vil registrere dine timer.");
      return;
    }
    setError("");
    setStep((s) => Math.min(s + 1, STEPS.length - 1));
  }

  function submit() {
    if (trackingMode === null) {
      setError("Vælg hvordan du vil registrere dine timer.");
      return;
    }
    setError("");
    startTransition(async () => {
      const [y1, m1, d1] = payPeriodStart.split("-").map(Number);
      const [y2, m2, d2] = payPeriodEnd.split("-").map(Number);
      const result = await signUp({
        name: name.trim(),
        email: email.trim(),
        password,
        hourlyRate: Number(hourlyRate) || 0,
        overtimeThresholdHours: Number(overtimeThresholdHours) || 0,
        overtimeBonusPct: (Number(overtimeBonusPct) || 0) / 100,
        weekendSupplement: Number(weekendSupplement) || 0,
        holidaySupplement: Number(holidaySupplement) || 0,
        breakStartMinutes: timeToMinutes(breakStart),
        breakEndMinutes: timeToMinutes(breakEnd),
        monthlyTaxDeduction: Number(monthlyTaxDeduction) || 0,
        amBidragPct: (Number(amBidragPct) || 0) / 100,
        taxRatePct: (Number(taxRatePct) || 0) / 100,
        atpRatePerHour: 0, // unused by the wage engine — see breakdownForCumulative's ATP bracket table
        sickPayHourlyRate: Number(sickPayHourlyRate) || 0,
        payPeriodStart: new Date(y1, m1 - 1, d1),
        payPeriodEnd: new Date(y2, m2 - 1, d2),
        trackingMode,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }

      // The account now exists and the session cookie is set, so an
      // optional contract upload can run as its own authenticated action
      // right after — failing it never blocks account creation, since the
      // wage terms above are already saved either way.
      if (contractFile) {
        const formData = new FormData();
        formData.append("file", contractFile);
        await uploadContract(formData);
      }

      router.push("/");
      router.refresh();
    });
  }

  return (
    <Card className="animate-fade-up overflow-hidden p-0">
      <div className="bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-6 py-6 text-[var(--accent-foreground)]">
        <p className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-80">
          <Sparkles size={14} /> Velkommen
        </p>
        <h1 className="mt-1 text-2xl font-extrabold">Opret din WageFlow-konto</h1>
        <p className="mt-1 text-sm opacity-90">Tager et par minutter — du kan altid ændre det senere.</p>
        <div className="mt-4 flex gap-1.5">
          {STEPS.map((label, i) => (
            <div key={label} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-white" : "bg-white/30"}`} />
          ))}
        </div>
      </div>

      <div className="space-y-4 p-5">
        <p className="text-sm font-bold text-[var(--muted)]">
          Trin {step + 1} af {STEPS.length}: {STEPS[step]}
        </p>

        {step === 0 && (
          <>
            <Field label="Navn" required>
              <input className={inputClass} value={name} onChange={(e) => setName(e.target.value)} placeholder="Dit navn" />
            </Field>
            <Field label="E-mail" required>
              <input
                className={inputClass}
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="dig@firma.dk"
              />
            </Field>
            <Field label="Adgangskode" required>
              <input
                className={inputClass}
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Mindst 8 tegn"
              />
            </Field>
          </>
        )}

        {step === 1 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Grundløn (kr/time)">
              <input className={inputClass} type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
            </Field>
            <Field label="Overtid efter (timer/uge)">
              <input className={inputClass} type="number" value={overtimeThresholdHours} onChange={(e) => setOvertimeThresholdHours(e.target.value)} />
            </Field>
            <Field label="Overtidstillæg (%)">
              <input className={inputClass} type="number" value={overtimeBonusPct} onChange={(e) => setOvertimeBonusPct(e.target.value)} />
            </Field>
            <Field label="Sygeløn (kr/time)">
              <input className={inputClass} type="number" value={sickPayHourlyRate} onChange={(e) => setSickPayHourlyRate(e.target.value)} />
            </Field>
            <Field label="Weekendtillæg (kr/time)">
              <input className={inputClass} type="number" value={weekendSupplement} onChange={(e) => setWeekendSupplement(e.target.value)} />
            </Field>
            <Field label="Helligdagstillæg (kr/time)">
              <input className={inputClass} type="number" value={holidaySupplement} onChange={(e) => setHolidaySupplement(e.target.value)} />
            </Field>
            <Field label="Ulønnet pause fra">
              <input className={inputClass} type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} />
            </Field>
            <Field label="Ulønnet pause til">
              <input className={inputClass} type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} />
            </Field>
            <p className="col-span-full text-xs text-[var(--muted)]">
              Kender du ikke tillæggene udenad? Lad dem stå på 0 — du kan rette dem senere under Indstillinger, også hvis du uploader din kontrakt i næste trin.
            </p>
          </div>
        )}

        {step === 2 && (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            <Field label="Skattefradrag (kr/periode)">
              <input className={inputClass} type="number" value={monthlyTaxDeduction} onChange={(e) => setMonthlyTaxDeduction(e.target.value)} />
            </Field>
            <Field label="AM-bidrag (%)">
              <input className={inputClass} type="number" value={amBidragPct} onChange={(e) => setAmBidragPct(e.target.value)} />
            </Field>
            <Field label="Skatteprocent (%)">
              <input className={inputClass} type="number" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />
            </Field>
            <Field label="Lønperiode fra">
              <input className={inputClass} type="date" value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)} />
            </Field>
            <Field label="Lønperiode til">
              <input className={inputClass} type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} />
            </Field>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <ChoiceCard
              active={wantsContractUpload === true}
              onClick={() => setWantsContractUpload(true)}
              icon={Upload}
              title="Upload min ansættelseskontrakt"
              description="Gemmes sikkert og privat. Ingen automatisk AI-læsning er sat op endnu, så du skal stadig selv have indtastet lønvilkårene i de foregående trin — uploadet er et bekvemt sted at have kontrakten liggende, ikke en genvej."
            />
            <ChoiceCard
              active={wantsContractUpload === false}
              onClick={() => {
                setWantsContractUpload(false);
                setContractFile(null);
              }}
              icon={FileText}
              title="Spring over — jeg har allerede indtastet det selv"
              description="Du kan altid uploade kontrakten senere under Indstillinger."
            />
            {wantsContractUpload && (
              <Field label="Vælg fil (PDF, PNG eller JPG, maks 10 MB)">
                <input
                  className={inputClass}
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(e) => setContractFile(e.target.files?.[0] ?? null)}
                />
              </Field>
            )}
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <ChoiceCard
              active={trackingMode === "daily"}
              onClick={() => setTrackingModeState("daily")}
              icon={Clock3}
              title="Tjek ind/ud hver dag"
              description="Du trykker tjek ind, når du starter en vagt, og tjek ud, når du er færdig — timer og løn regnes live, dag for dag."
            />
            <ChoiceCard
              active={trackingMode === "monthly"}
              onClick={() => setTrackingModeState("monthly")}
              icon={CalendarDays}
              title="Planlæg en hel måned ad gangen"
              description="Du lægger en ugeskabelon og kopierer den ud over måneden, så alle dine planlagte vagter ligger klar i kalenderen. Du kan stadig redigere enkelte dage bagefter."
            />
          </div>
        )}

        {error && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}

        <div className="flex gap-2">
          {step > 0 && (
            <Button variant="secondary" onClick={() => setStep((s) => s - 1)} disabled={pending} className="flex items-center gap-1.5">
              <ArrowLeft size={16} /> Tilbage
            </Button>
          )}
          {step < STEPS.length - 1 ? (
            <Button fullWidth onClick={next} className="flex items-center justify-center gap-1.5">
              Næste <ArrowRight size={16} />
            </Button>
          ) : (
            <Button fullWidth onClick={submit} disabled={pending} className="flex items-center justify-center gap-1.5">
              {pending ? "Opretter..." : "Kom i gang"} <ArrowRight size={16} />
            </Button>
          )}
        </div>

        <p className="text-center text-sm text-[var(--muted)]">
          Har du allerede en konto?{" "}
          <a href="/login" className="font-bold text-[var(--accent)] underline underline-offset-2">
            Log ind
          </a>
        </p>
      </div>
    </Card>
  );
}
