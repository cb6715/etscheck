"use client";

import { useState, useTransition } from "react";
import { Wallet } from "lucide-react";
import { Card, Field, inputClass, Button } from "@/components/ui/primitives";
import { updateWageSettings } from "@/lib/actions/worksessions";
import type { WageConfig } from "@/lib/wage/engine";

function minutesToTime(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

function timeToMinutes(time: string): number {
  const [h, m] = time.split(":").map(Number);
  return h * 60 + m;
}

const HOUR_OPTIONS = Array.from({ length: 24 }, (_, i) => i);

export function WageSettingsForm({ settings }: { settings: WageConfig }) {
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
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    });
  }

  return (
    <Card className="space-y-4 p-4">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Grundløn (kr/time)">
          <input className={inputClass} type="number" value={hourlyRate} onChange={(e) => setHourlyRate(e.target.value)} />
        </Field>
        <Field label="Overtid efter (timer/uge)">
          <input
            className={inputClass}
            type="number"
            value={overtimeThresholdHours}
            onChange={(e) => setOvertimeThresholdHours(e.target.value)}
          />
        </Field>
        <Field label="Overtidstillæg (%)">
          <input
            className={inputClass}
            type="number"
            value={overtimeBonusPct}
            onChange={(e) => setOvertimeBonusPct(e.target.value)}
          />
        </Field>
        <Field label="Nattillæg (kr/time)">
          <input
            className={inputClass}
            type="number"
            value={nightSupplement}
            onChange={(e) => setNightSupplement(e.target.value)}
          />
        </Field>
        <Field label="Nattillæg fra kl.">
          <select
            className={inputClass}
            value={nightStartHour}
            onChange={(e) => setNightStartHour(Number(e.target.value))}
          >
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </Field>
        <Field label="Nattillæg til kl.">
          <select className={inputClass} value={nightEndHour} onChange={(e) => setNightEndHour(Number(e.target.value))}>
            {HOUR_OPTIONS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
        </Field>
        <Field label="Ulønnet pause fra">
          <input className={inputClass} type="time" value={breakStart} onChange={(e) => setBreakStart(e.target.value)} />
        </Field>
        <Field label="Ulønnet pause til">
          <input className={inputClass} type="time" value={breakEnd} onChange={(e) => setBreakEnd(e.target.value)} />
        </Field>
        <Field label="Skattefradrag (kr/måned)">
          <input
            className={inputClass}
            type="number"
            value={monthlyTaxDeduction}
            onChange={(e) => setMonthlyTaxDeduction(e.target.value)}
          />
        </Field>
        <Field label="AM-bidrag (%)">
          <input className={inputClass} type="number" value={amBidragPct} onChange={(e) => setAmBidragPct(e.target.value)} />
        </Field>
        <Field label="Skatteprocent (%)">
          <input className={inputClass} type="number" value={taxRatePct} onChange={(e) => setTaxRatePct(e.target.value)} />
        </Field>
      </div>
      <Button onClick={save} disabled={pending} className="flex items-center gap-2">
        <Wallet size={16} /> {pending ? "Gemmer..." : saved ? "Gemt!" : "Gem lønindstillinger"}
      </Button>
      <p className="text-xs text-muted">
        Bruges af den live løn-tæller i toppen af appen. Ændringer gælder fra næste tjek-ind — allerede afsluttede
        vagter beregnes ikke om.
      </p>
    </Card>
  );
}
