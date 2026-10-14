"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { LogIn, LogOut, Wallet, AlertTriangle, Check, X, Undo2, Gift, Clock, CalendarRange } from "lucide-react";
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
import { computeIntervalEarnings, netForCumulative, feriepengeForGross } from "@/lib/engine";
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

export function WageCard() {
  const [context, setContext] = useState<WageContext | null>(null);
  const [now, setNow] = useState<Date | null>(() => new Date());
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [editingCheckIn, setEditingCheckIn] = useState(false);
  const [checkInTimeInput, setCheckInTimeInput] = useState("");
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

  const totalNet = useMemo(() => {
    if (!context) return null;
    try {
      const cumulativeGross = context.priorPeriodGross + (live?.grossAmount ?? 0);
      const cumulativePaidSeconds = context.priorPeriodPaidSeconds + (live?.paidSeconds ?? 0);
      return netForCumulative(cumulativeGross, cumulativePaidSeconds, context.config);
    } catch (e) {
      console.error("Wage total calc failed:", e);
      return null;
    }
  }, [context, live]);

  const totalFeriepenge = useMemo(() => {
    if (!context) return null;
    try {
      const cumulativeGross = context.priorPeriodGross + (live?.grossAmount ?? 0);
      return feriepengeForGross(cumulativeGross, context.config).netto;
    } catch (e) {
      console.error("Feriepenge calc failed:", e);
      return null;
    }
  }, [context, live]);

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

  if (!context || totalNet === null) {
    return <Card className="h-56 animate-pulse p-5" />;
  }

  const checkedIn = Boolean(context.openSession && live);

  return (
    <TiltWrapper className="animate-fade-up">
      <Card className="overflow-hidden p-0" elevated>
      <div className="relative overflow-hidden bg-gradient-to-br from-[var(--accent)] to-[var(--accent-2)] px-6 py-7 text-[var(--accent-foreground)]">
        <div className="float-blob absolute -right-10 -top-10 h-40 w-40 rounded-full bg-white/10 blur-sm" />
        <div className="float-blob-slow absolute -bottom-12 -left-8 h-32 w-32 rounded-full bg-white/10 blur-sm" />
        <div className="relative flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider opacity-80">
            <Wallet size={14} /> Netto denne periode
          </span>
          {checkedIn && (
            <button onClick={openCheckInEditor} className="flex items-center gap-1.5 text-xs font-bold opacity-90">
              <span className={`glow-ring inline-block h-2 w-2 rounded-full ${onBreak ? "bg-amber-300" : "bg-white"}`} />
              {onBreak ? "Pause" : "Kører"}
            </button>
          )}
        </div>
        <div className="relative mt-2 font-mono text-4xl font-extrabold tabular-nums tracking-tight sm:text-5xl">
          {formatKr(totalNet)}
        </div>
        {totalFeriepenge !== null && (
          <div className="relative mt-1.5 flex items-center gap-1.5 text-sm font-semibold opacity-90">
            <Gift size={14} /> {formatKr(totalFeriepenge)} i feriepenge optjent
          </div>
        )}
      </div>

      <div className="space-y-3 p-5">
        {(hoursToday !== null || hoursThisPeriod !== null) && (
          <div className="grid grid-cols-2 gap-3">
            <div className="glass rounded-2xl px-4 py-3">
              <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted)]">
                <Clock size={13} /> I dag
              </span>
              <div className="mt-1 font-mono text-lg font-extrabold tabular-nums">{formatHours(hoursToday ?? 0)}</div>
            </div>
            <div className="glass rounded-2xl px-4 py-3">
              <span className="flex items-center gap-1.5 text-xs font-bold text-[var(--muted)]">
                <CalendarRange size={13} /> Denne periode
              </span>
              <div className="mt-1 font-mono text-lg font-extrabold tabular-nums">{formatHours(hoursThisPeriod ?? 0)}</div>
            </div>
          </div>
        )}

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
          <div className="flex items-center gap-2">
            <input
              type="time"
              value={checkInTimeInput}
              onChange={(e) => setCheckInTimeInput(e.target.value)}
              className="flex-1 glass rounded-2xl px-3 py-2.5 text-sm font-bold"
            />
            <Button size="md" onClick={saveCheckInTime} disabled={pending} className="flex items-center gap-1">
              <Check size={16} />
            </Button>
            <Button size="md" variant="ghost" onClick={() => setEditingCheckIn(false)} className="flex items-center gap-1">
              <X size={16} />
            </Button>
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
