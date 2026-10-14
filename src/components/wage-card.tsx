"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  LogIn,
  LogOut,
  Wallet,
  AlertTriangle,
  Check,
  X,
  Undo2,
  Gift,
  Clock,
  CalendarRange,
  Banknote,
  TrendingUp,
  ChevronDown,
  Info,
} from "lucide-react";
import { Card, Button, Badge } from "@/components/ui/primitives";
import { TiltWrapper } from "@/components/tilt-wrapper";
import {
  checkIn,
  checkOut,
  getWageContext,
  updateCheckInTime,
  undoLastCheckOut,
  type WageContext,
} from "@/lib/actions";
import { computeIntervalEarnings, breakdownForCumulative, expectedPayout, feriepengeForGross } from "@/lib/engine";
import { zonedParts } from "@/lib/timezone";

function formatKr(n: number): string {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

function formatHours(hours: number): string {
  const totalMinutes = Math.round(hours * 60);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  return m > 0 ? `${h}t ${m}min` : `${h}t`;
}

function timeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

function StatChip({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string; sub?: string }) {
  return (
    <div className="glass min-w-0 rounded-2xl px-3.5 py-3">
      <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted)]">
        {icon} {label}
      </span>
      {/* A kr amount is never truncated with an ellipsis — hiding digits
          from a money value would be actively misleading. It wraps onto a
          second line instead if the box is too narrow for it. */}
      <div className="mt-1 break-words font-mono text-base font-extrabold leading-tight tabular-nums">{value}</div>
      {sub && <div className="mt-0.5 break-words text-[11px] font-semibold text-[var(--muted)]">{sub}</div>}
    </div>
  );
}

function BreakdownRow({ label, value, strong, hint }: { label: string; value: string; strong?: boolean; hint?: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5 py-1.5">
      <span className={`min-w-0 flex-1 text-sm ${strong ? "font-extrabold" : hint ? "text-[var(--muted)]" : "font-semibold"}`}>
        {label}
      </span>
      <span className={`shrink-0 font-mono text-sm tabular-nums ${strong ? "font-extrabold" : "font-bold"}`}>{value}</span>
    </div>
  );
}

export function WageCard() {
  const [context, setContext] = useState<WageContext | null>(null);
  const [now, setNow] = useState<Date | null>(() => new Date());
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [editingCheckIn, setEditingCheckIn] = useState(false);
  const [checkInTimeInput, setCheckInTimeInput] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [pending, startTransition] = useTransition();

  function loadContext() {
    getWageContext()
      .then((c) => {
        setContext(c);
        setLoadError(false);
      })
      .catch((e) => {
        console.error("Wage context fetch failed:", e);
        setLoadError(true);
      });
  }

  useEffect(() => {
    loadContext();
  }, []);

  useEffect(() => {
    if (!context?.openSession) return;
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [context?.openSession]);

  const live = useMemo(() => {
    if (!context?.openSession || !now) return null;
    try {
      const checkInAt = new Date(context.openSession.checkInAt);
      return computeIntervalEarnings(checkInAt, now, context.priorWeekElapsedSeconds, context.thisWeekThresholdHours, context.config);
    } catch (e) {
      console.error("Wage live calc failed:", e);
      return null;
    }
  }, [context, now]);

  const onBreak = useMemo(() => {
    if (!context?.openSession || !now) return false;
    const { hour, minute } = zonedParts(now);
    const minuteOfDay = hour * 60 + minute;
    return minuteOfDay >= context.config.breakStartMinutes && minuteOfDay < context.config.breakEndMinutes;
  }, [context, now]);

  const cumulativeGross = useMemo(() => {
    if (!context) return null;
    return context.priorPeriodGross + (live?.grossAmount ?? 0);
  }, [context, live]);

  const cumulativeSeconds = useMemo(() => {
    if (!context) return null;
    return context.priorPeriodPaidSeconds + (live?.paidSeconds ?? 0);
  }, [context, live]);

  const breakdown = useMemo(() => {
    if (!context || cumulativeGross === null || cumulativeSeconds === null) return null;
    try {
      return breakdownForCumulative(cumulativeGross, cumulativeSeconds, context.config);
    } catch (e) {
      console.error("Wage breakdown calc failed:", e);
      return null;
    }
  }, [context, cumulativeGross, cumulativeSeconds]);

  const payout = useMemo(() => {
    if (!context || !breakdown) return null;
    return expectedPayout(breakdown.netto, context.config);
  }, [context, breakdown]);

  const totalFeriepenge = useMemo(() => {
    if (!context || cumulativeGross === null) return null;
    try {
      return feriepengeForGross(cumulativeGross, context.config);
    } catch (e) {
      console.error("Feriepenge calc failed:", e);
      return null;
    }
  }, [context, cumulativeGross]);

  const hoursToday = useMemo(() => {
    if (!context) return null;
    return (context.priorTodayPaidSeconds + (live?.paidSeconds ?? 0)) / 3600;
  }, [context, live]);

  const hoursThisPeriod = useMemo(() => {
    if (!context) return null;
    return (context.priorPeriodPaidSeconds + (live?.paidSeconds ?? 0)) / 3600;
  }, [context, live]);

  function handleCheckIn() {
    setActionError("");
    startTransition(async () => {
      try {
        setContext(await checkIn());
      } catch {
        setActionError("Kunne ikke tjekke ind. Prøv igen.");
      }
    });
  }

  function handleCheckOut() {
    setActionError("");
    startTransition(async () => {
      try {
        setContext(await checkOut());
      } catch {
        setActionError("Kunne ikke tjekke ud. Prøv igen.");
      }
    });
  }

  function handleUndoCheckout() {
    setActionError("");
    startTransition(async () => {
      try {
        setContext(await undoLastCheckOut());
      } catch (e) {
        setActionError(e instanceof Error ? e.message : "Kunne ikke fortryde.");
      }
    });
  }

  function openCheckInEditor() {
    if (context?.openSession) setCheckInTimeInput(timeInputValue(new Date(context.openSession.checkInAt)));
    setActionError("");
    setEditingCheckIn(true);
  }

  function saveCheckInTime() {
    const [h, m] = checkInTimeInput.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const target = new Date();
    target.setHours(h, m, 0, 0);
    if (target.getTime() > Date.now()) target.setDate(target.getDate() - 1);
    startTransition(async () => {
      try {
        setContext(await updateCheckInTime(target));
        setEditingCheckIn(false);
      } catch {
        setActionError("Kunne ikke rette tidspunktet. Prøv igen.");
      }
    });
  }

  if (loadError) {
    return (
      <Card className="flex items-center justify-between p-5">
        <span className="flex items-center gap-1.5 text-sm text-[var(--danger)]">
          <AlertTriangle size={16} /> Løn kunne ikke indlæses
        </span>
        <button onClick={loadContext} className="text-xs font-bold text-[var(--accent)] underline underline-offset-2">
          Prøv igen
        </button>
      </Card>
    );
  }

  if (!context || !breakdown || payout === null || totalFeriepenge === null) {
    return <Card className="h-56 animate-pulse p-5" />;
  }

  const checkedIn = Boolean(context.openSession && live);

  return (
    <TiltWrapper className="animate-fade-up">
      <Card className="overflow-hidden p-0" elevated>
        <button
          type="button"
          onClick={() => setShowBreakdown((v) => !v)}
          className="relative w-full overflow-hidden bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-6 py-7 text-left text-[var(--accent-foreground)]"
        >
          <div className="float-blob absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-sm" />
          <div className="float-blob-slow absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10 blur-sm" />
          <div className="relative flex items-center justify-between gap-2">
            <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-80">
              <Wallet size={14} /> Forventet lønudbetaling
            </span>
            <span className="flex items-center gap-2">
              {checkedIn && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    openCheckInEditor();
                  }}
                  className="flex items-center gap-1.5 text-xs font-bold opacity-90"
                >
                  <span className={`glow-ring inline-block h-2 w-2 rounded-full ${onBreak ? "bg-amber-300" : "bg-white"}`} />
                  {onBreak ? "Pause" : "Kører"}
                </span>
              )}
              <ChevronDown size={16} className={`opacity-70 transition-transform ${showBreakdown ? "rotate-180" : ""}`} />
            </span>
          </div>
          <div className="relative mt-2 break-words font-mono text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl">
            {formatKr(payout)}
          </div>
          <div className="relative mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-sm font-semibold opacity-90">
            <span>Netto optjent {formatKr(breakdown.netto)}</span>
            <span className="flex items-center gap-1">
              <Gift size={13} /> {formatKr(totalFeriepenge.netto)} feriepenge
            </span>
          </div>
        </button>

        {showBreakdown && (
          <div className="border-b border-[var(--border)] bg-[var(--surface-2)] px-5 py-4">
            <BreakdownRow label="Optjent brutto" value={formatKr(breakdown.gross)} />
            <BreakdownRow label="− ATP-bidrag" value={"− " + formatKr(breakdown.atp)} hint />
            <BreakdownRow label="= AM-indkomst" value={formatKr(breakdown.amIncome)} hint />
            <BreakdownRow label="− AM-bidrag" value={"− " + formatKr(breakdown.amBidrag)} hint />
            <BreakdownRow label="− Skattefradrag (periode)" value={"− " + formatKr(breakdown.taxDeduction)} hint />
            <BreakdownRow label="= Skattepligtig indkomst" value={formatKr(breakdown.taxableIncome)} hint />
            <BreakdownRow label="− A-skat" value={"− " + formatKr(breakdown.tax)} hint />
            <div className="my-1.5 h-px bg-[var(--border)]" />
            <BreakdownRow label="Netto optjent" value={formatKr(breakdown.netto)} strong />
            <BreakdownRow label="− Forskud udbetalt" value={"− " + formatKr(context.config.advanceAmount)} hint />
            <BreakdownRow label="Forventet lønudbetaling" value={formatKr(payout)} strong />
            <p className="mt-3 flex items-start gap-1.5 text-xs text-[var(--muted)]">
              <Info size={13} className="mt-0.5 shrink-0" />
              Skøn baseret på dine egne lønindstillinger — ikke en garanti for den faktiske udbetaling. Reel dansk
              skat afhænger også af dit skattekort.
            </p>
          </div>
        )}

        <div className="space-y-3 p-5">
          <div className="grid grid-cols-2 gap-3">
            <StatChip icon={<Banknote size={13} />} label="Optjent brutto" value={formatKr(breakdown.gross)} />
            <StatChip icon={<Wallet size={13} />} label="Estimeret netto" value={formatKr(breakdown.netto)} />
            <StatChip
              icon={<Gift size={13} />}
              label="Feriepenge"
              value={formatKr(totalFeriepenge.netto)}
              sub={`${formatKr(totalFeriepenge.brutto)} brutto`}
            />
            <StatChip icon={<TrendingUp size={13} />} label="Timer i perioden" value={formatHours(hoursThisPeriod ?? 0)} />
          </div>

          <div className="glass flex items-center justify-between rounded-2xl px-4 py-3">
            <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted)]">
              <Clock size={13} /> Timer i dag
            </span>
            <span className="flex items-center gap-1.5 font-mono text-sm font-extrabold tabular-nums">
              {formatHours(hoursToday ?? 0)}
              <CalendarRange size={12} className="ml-2 text-[var(--muted)]" />
              <span className="text-[var(--muted)]">denne uges grænse {context.thisWeekThresholdHours}t</span>
            </span>
          </div>

          {actionError && <p className="text-sm font-semibold text-[var(--danger)]">{actionError}</p>}

          {!editingCheckIn ? (
            checkedIn ? (
              <Button fullWidth size="lg" variant="secondary" onClick={handleCheckOut} disabled={pending} className="flex items-center justify-center gap-2">
                <LogOut size={18} /> Tjek ud
              </Button>
            ) : (
              <Button fullWidth size="lg" onClick={handleCheckIn} disabled={pending} className="flex items-center justify-center gap-2">
                <LogIn size={18} /> Tjek ind
              </Button>
            )
          ) : (
            <div className="flex flex-wrap items-center gap-2">
              <input
                type="time"
                value={checkInTimeInput}
                onChange={(e) => setCheckInTimeInput(e.target.value)}
                className="glass min-w-0 flex-1 rounded-2xl px-3 py-2.5 text-sm font-bold"
              />
              <div className="flex shrink-0 gap-2">
                <Button size="md" onClick={saveCheckInTime} disabled={pending} className="flex items-center gap-1">
                  <Check size={16} />
                </Button>
                <Button size="md" variant="ghost" onClick={() => setEditingCheckIn(false)} className="flex items-center gap-1">
                  <X size={16} />
                </Button>
              </div>
            </div>
          )}

          {context.canUndoCheckout && !editingCheckIn && (
            <button
              onClick={handleUndoCheckout}
              disabled={pending}
              className="flex w-full items-center justify-center gap-1.5 glass rounded-2xl py-2 text-xs font-bold text-[var(--accent)] disabled:opacity-60"
            >
              <Undo2 size={14} /> Fortryd sidste tjek ud
            </button>
          )}

          {checkedIn && live && (
            <div className="flex items-center justify-between glass rounded-2xl px-4 py-3">
              <span className="text-xs font-semibold text-[var(--muted)]">Denne vagt</span>
              <span className="flex items-center gap-2">
                <Badge>{formatHours(live.paidSeconds / 3600)}</Badge>
                <span className="font-mono text-sm font-bold">{formatKr(live.grossAmount)}</span>
              </span>
            </div>
          )}
        </div>
      </Card>
    </TiltWrapper>
  );
}
