"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { Save, KeyRound, CreditCard, ArrowRight } from "lucide-react";
import { Card, Field, inputClass, Button } from "@/components/ui/primitives";
import { updateWageSettings, changePassword } from "@/lib/actions";
import { lastWeekdayOfMonth, type WageConfig } from "@/lib/engine";
import { formatShortDate } from "@/lib/date";

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

function dateToInputValue(date: Date): string {
  const d = new Date(date);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function inputValueToDate(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(y, m - 1, d);
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export function SettingsForm({ settings }: { settings: WageConfig }) {
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  const [hourlyRate, setHourlyRate] = useState(String(settings.hourlyRate));
  const [overtimeThresholdHours, setOvertimeThresholdHours] = useState(String(settings.overtimeThresholdHours));
  const [overtimeBonusPct, setOvertimeBonusPct] = useState(String(settings.overtimeBonusPct * 100));
  const [nightSupplement, setNightSupplement] = useState(String(settings.nightSupplement));
  const [nightStartHour, setNightStartHour] = useState(settings.nightStartHour);
  const [nightEndHour, setNightEndHour] = useState(settings.nightEndHour);
  const [breakStart, setBreakStart] = useState(minutesToTime(settings.breakStartMinutes));
  const [breakEnd, setBreakEnd] = useState(minutesToTime(settings.breakEndMinutes));
  const [monthlyTaxDeduction, setMonthlyTaxDeduction] = useState(String(settings.monthlyTaxDeduction));
  const [amBidragPct, setAmBidragPct] = useState(String(settings.amBidragPct * 100));
  const [taxRatePct, setTaxRatePct] = useState(String(settings.taxRatePct * 100));
  const [atpRatePerHour, setAtpRatePerHour] = useState(String(settings.atpRatePerHour));
  const [sickPayHourlyRate, setSickPayHourlyRate] = useState(String(settings.sickPayHourlyRate));
  const [advanceAmount, setAdvanceAmount] = useState(String(settings.advanceAmount));
  const [payPeriodStart, setPayPeriodStart] = useState(dateToInputValue(settings.payPeriodStart));
  const [payPeriodEnd, setPayPeriodEnd] = useState(dateToInputValue(settings.payPeriodEnd));

  const payoutDate = useMemo(() => {
    const end = inputValueToDate(payPeriodEnd);
    if (Number.isNaN(end.getTime())) return null;
    return lastWeekdayOfMonth(end);
  }, [payPeriodEnd]);

  function save() {
    setSaved(false);
    startTransition(async () => {
      await updateWageSettings({
        hourlyRate: Number(hourlyRate) || 0,
        overtimeThresholdHours: Number(overtimeThresholdHours) || 0,
        overtimeBonusPct: (Number(overtimeBonusPct) || 0) / 100,
        nightSupplement: Number(nightSupplement) || 0,
        nightStartHour,
        nightEndHour,
        breakStartMinutes: timeToMinutes(breakStart),
        breakEndMinutes: timeToMinutes(breakEnd),
        monthlyTaxDeduction: Number(monthlyTaxDeduction) || 0,
        amBidragPct: (Number(amBidragPct) || 0) / 100,
        taxRatePct: (Number(taxRatePct) || 0) / 100,
        atpRatePerHour: Number(atpRatePerHour) || 0,
        sickPayHourlyRate: Number(sickPayHourlyRate) || 0,
        advanceAmount: Number(advanceAmount) || 0,
        payPeriodStart: inputValueToDate(payPeriodStart),
        payPeriodEnd: inputValueToDate(payPeriodEnd),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <Card className="space-y-4 p-5">
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
        <Field label="Aftentillæg (kr/time)">
          <input className={inputClass} type="number" value={nightSupplement} onChange={(e) => setNightSupplement(e.target.value)} />
        </Field>
        <Field label="Aftentillæg fra kl.">
          <select className={inputClass} value={nightStartHour} onChange={(e) => setNightStartHour(Number(e.target.value))}>
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
            ))}
          </select>
        </Field>
        <Field label="Aftentillæg til kl.">
          <select className={inputClass} value={nightEndHour} onChange={(e) => setNightEndHour(Number(e.target.value))}>
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>{String(h).padStart(2, "0")}:00</option>
            ))}
          </select>
        </Field>
        <Field label="Ulønnet pause fra">
          <input className={inputClass} type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} />
        </Field>
        <Field label="Ulønnet pause til">
          <input className={inputClass} type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} />
        </Field>
        <Field label="Skattefradrag (kr/lønperiode)">
          <input className={inputClass} type="number" value={monthlyTaxDeduction} onChange={(e) => setMonthlyTaxDeduction(e.target.value)} />
        </Field>
        <Field label="AM-bidrag (%)">
          <input className={inputClass} type="number" value={amBidragPct} onChange={(e) => setAmBidragPct(e.target.value)} />
        </Field>
        <Field label="Skatteprocent (%)">
          <input className={inputClass} type="number" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />
        </Field>
        <Field label="ATP-bidrag (kr/time)">
          <input className={inputClass} type="number" step="0.0001" value={atpRatePerHour} onChange={(e) => setAtpRatePerHour(e.target.value)} />
        </Field>
        <Field label="Sygeløn (kr/time)">
          <input className={inputClass} type="number" value={sickPayHourlyRate} onChange={(e) => setSickPayHourlyRate(e.target.value)} />
        </Field>
        <Field label="Forskud udbetalt (kr)">
          <input className={inputClass} type="number" value={advanceAmount} onChange={(e) => setAdvanceAmount(e.target.value)} placeholder="0" />
        </Field>
        <Field label="Lønperiode fra">
          <input className={inputClass} type="date" value={payPeriodStart} onChange={(e) => setPayPeriodStart(e.target.value)} />
        </Field>
        <Field label="Lønperiode til">
          <input className={inputClass} type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-[var(--muted)]">
        Skattefradraget spores hen over denne periode, ikke kalendermåneden. Opdatér datoerne her, når en ny
        lønperiode starter.
        {payoutDate && <> Udbetales (skøn): sidste hverdag i den måned perioden slutter i — {formatShortDate(payoutDate)}.</>}
      </p>
      <Button onClick={save} disabled={pending} className="flex items-center gap-2">
        <Save size={16} /> {pending ? "Gemmer..." : saved ? "Gemt!" : "Gem lønindstillinger"}
      </Button>
    </Card>
  );
}

export function AccountSettings() {
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [status, setStatus] = useState<"idle" | "saved" | "error">("idle");
  const [error, setError] = useState("");
  const [pending, startTransition] = useTransition();

  function save() {
    setStatus("idle");
    setError("");
    startTransition(async () => {
      const result = await changePassword(currentPassword, newPassword);
      if (!result.ok) {
        setStatus("error");
        setError(result.error);
        return;
      }
      setCurrentPassword("");
      setNewPassword("");
      setStatus("saved");
      setTimeout(() => setStatus("idle"), 2000);
    });
  }

  return (
    <Card className="space-y-4 p-5">
      <h2 className="flex items-center gap-2 text-sm font-extrabold">
        <KeyRound size={16} /> Skift adgangskode
      </h2>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <Field label="Nuværende adgangskode">
          <input
            className={inputClass}
            type="password"
            autoComplete="current-password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
          />
        </Field>
        <Field label="Ny adgangskode">
          <input
            className={inputClass}
            type="password"
            autoComplete="new-password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="Mindst 8 tegn"
          />
        </Field>
      </div>
      {status === "error" && <p className="text-sm font-semibold text-[var(--danger)]">{error}</p>}
      <Button onClick={save} disabled={pending || !currentPassword || !newPassword} className="flex items-center gap-2">
        <KeyRound size={16} /> {pending ? "Gemmer..." : status === "saved" ? "Skiftet!" : "Skift adgangskode"}
      </Button>

      <div className="border-t border-[var(--border)] pt-4">
        <Link href="/abonnement" className="flex items-center justify-between text-sm font-bold text-[var(--accent)]">
          <span className="flex items-center gap-2">
            <CreditCard size={16} /> Abonnement
          </span>
          <ArrowRight size={14} />
        </Link>
      </div>
    </Card>
  );
}
