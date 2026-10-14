"use client";

import { useMemo, useState, useTransition } from "react";
import { Wallet } from "lucide-react";
import { Card, Field, inputClass, Button } from "@/components/ui/primitives";
import { updateWageSettings } from "@/lib/actions/worksessions";
import { lastWeekdayOfMonth, type WageConfig } from "@/lib/wage/engine";
import { notifyWageContextChanged } from "@/lib/wage/events";
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
      notifyWageContextChanged();
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
        <Field label="Aftentillæg (kr/time)">
          <input
            className={inputClass}
            type="number"
            value={nightSupplement}
            onChange={(e) => setNightSupplement(e.target.value)}
          />
        </Field>
        <Field label="Aftentillæg fra kl.">
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
        <Field label="Aftentillæg til kl.">
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
        <Field label="Skattefradrag (kr/lønperiode)">
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
        <Field label="ATP-bidrag (kr/time)">
          <input
            className={inputClass}
            type="number"
            step="0.0001"
            value={atpRatePerHour}
            onChange={(e) => setAtpRatePerHour(e.target.value)}
          />
        </Field>
        <Field label="Sygeløn (kr/time)">
          <input
            className={inputClass}
            type="number"
            value={sickPayHourlyRate}
            onChange={(e) => setSickPayHourlyRate(e.target.value)}
          />
        </Field>
        <Field label="Forskud udbetalt (kr)">
          <input
            className={inputClass}
            type="number"
            value={advanceAmount}
            onChange={(e) => setAdvanceAmount(e.target.value)}
            placeholder="0"
          />
        </Field>
        <Field label="Lønperiode fra">
          <input
            className={inputClass}
            type="date"
            value={payPeriodStart}
            onChange={(e) => setPayPeriodStart(e.target.value)}
          />
        </Field>
        <Field label="Lønperiode til">
          <input className={inputClass} type="date" value={payPeriodEnd} onChange={(e) => setPayPeriodEnd(e.target.value)} />
        </Field>
      </div>
      <p className="text-xs text-muted">
        Forskud trækkes fra den samlede nettoløn der vises i toppen af appen for denne periode — nulstil den til 0,
        når en ny lønperiode starter (ligesom periodedatoerne).
      </p>
      <p className="text-xs text-muted">
        Skattefradraget spores hen over denne periode, ikke kalendermåneden. Opdatér datoerne her, når en ny
        lønperiode starter.
        {payoutDate && (
          <> Udbetales (skøn): sidste hverdag i den måned perioden slutter i — {formatShortDate(payoutDate)}.</>
        )}
      </p>
      <Button onClick={save} disabled={pending} className="flex items-center gap-2">
        <Wallet size={16} /> {pending ? "Gemmer..." : saved ? "Gemt!" : "Gem lønindstillinger"}
      </Button>
      <p className="text-xs text-muted">
        Bruges af den live løn-tæller i toppen af appen. Ændringer til satser (grundløn, tillæg osv.) gælder fra
        næste tjek-ind — allerede afsluttede vagters brutto beregnes ikke om. Skat/AM-bidrag/ATP på tværs af perioden
        genberegnes derimod altid ud fra de aktuelle satser her.
      </p>
    </Card>
  );
}
