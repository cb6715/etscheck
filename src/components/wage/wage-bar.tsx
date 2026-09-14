"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { LogIn, LogOut, Wallet, AlertTriangle, Pencil, Check, X } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import {
  checkIn,
  checkOut,
  getWageContext,
  updateCheckInTime,
  type WageContext,
} from "@/lib/actions/worksessions";
import { computeIntervalEarnings, netForCumulative, feriepengeForGross } from "@/lib/wage/engine";
import { WAGE_CONTEXT_CHANGED_EVENT } from "@/lib/wage/events";

function formatKr(n: number): string {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

function formatHMS(totalSeconds: number): string {
  const s = Math.max(0, Math.floor(totalSeconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function timeInputValue(date: Date): string {
  return `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export function WageBar() {
  const pathname = usePathname();
  const [context, setContext] = useState<WageContext | null>(null);
  const [now, setNow] = useState<Date | null>(null);
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

  // Refetch on every route change, and whenever something elsewhere on the
  // current page changed wage data (see WAGE_CONTEXT_CHANGED_EVENT) — the
  // bar stays mounted across navigation (it lives in the app shell, not a
  // page), so nothing would otherwise tell it e.g. a historical week was
  // just logged on Indstillinger.
  useEffect(() => {
    loadContext();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    window.addEventListener(WAGE_CONTEXT_CHANGED_EVENT, loadContext);
    return () => window.removeEventListener(WAGE_CONTEXT_CHANGED_EVENT, loadContext);
  }, []);

  useEffect(() => {
    if (!context?.openSession) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [context?.openSession]);

  // Never let a bad clock/config value crash the whole app (this component
  // lives in the root layout, outside any page-level error boundary) —
  // fall back to showing nothing live rather than throwing during render.
  const live = useMemo(() => {
    if (!context?.openSession || !now) return null;
    try {
      const checkInAt = new Date(context.openSession.checkInAt);
      return computeIntervalEarnings(checkInAt, now, context.priorWeekPaidSeconds, context.config);
    } catch (e) {
      console.error("Wage live calc failed:", e);
      return null;
    }
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

  // Optjente feriepenge (netto) for perioden så langt — vist ved siden af
  // nettobeløbet. 12,5% af bruttolønnen optjent indtil nu, beskattet for
  // sig selv — penge der bliver stående til senere (ferie/jobskifte), ikke
  // en del af "til udbetaling"-tallet, men stadig noget man har optjent.
  const totalFeriepenge = useMemo(() => {
    if (!context) return null;
    try {
      const cumulativeGross = context.priorPeriodGross + (live?.grossAmount ?? 0);
      return feriepengeForGross(cumulativeGross, context.config).netto;
    } catch (e) {
      console.error("Wage feriepenge calc failed:", e);
      return null;
    }
  }, [context, live]);

  function handleCheckIn() {
    setActionError("");
    startTransition(async () => {
      try {
        const next = await checkIn();
        setContext(next);
      } catch (e) {
        console.error("Check-in failed:", e);
        setActionError("Kunne ikke tjekke ind. Prøv igen.");
      }
    });
  }

  function handleCheckOut() {
    setActionError("");
    startTransition(async () => {
      try {
        const next = await checkOut();
        setContext(next);
      } catch (e) {
        console.error("Check-out failed:", e);
        setActionError("Kunne ikke tjekke ud. Prøv igen.");
      }
    });
  }

  function openCheckInEditor() {
    if (context?.openSession) {
      setCheckInTimeInput(timeInputValue(new Date(context.openSession.checkInAt)));
    }
    setActionError("");
    setEditingCheckIn(true);
  }

  function saveCheckInTime() {
    const [h, m] = checkInTimeInput.split(":").map(Number);
    if (Number.isNaN(h) || Number.isNaN(m)) return;
    const target = new Date();
    target.setHours(h, m, 0, 0);
    // A time-of-day later than right now can only mean the check-in was
    // actually yesterday (an overnight shift), not that it's in the future.
    if (target.getTime() > Date.now()) {
      target.setDate(target.getDate() - 1);
    }
    startTransition(async () => {
      try {
        const next = await updateCheckInTime(target);
        setContext(next);
        setEditingCheckIn(false);
      } catch (e) {
        console.error("Updating check-in time failed:", e);
        setActionError("Kunne ikke rette tidspunktet. Prøv igen.");
      }
    });
  }

  if (loadError) {
    return (
      <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-2 border-b border-border bg-surface px-4 sm:px-6">
        <span className="flex items-center gap-1.5 text-sm text-danger">
          <AlertTriangle size={14} /> Løn kunne ikke indlæses
        </span>
        <button onClick={loadContext} className="text-xs font-bold text-accent underline underline-offset-2">
          Prøv igen
        </button>
      </div>
    );
  }

  if (!context || totalNet === null) {
    return <div className="h-14 shrink-0 border-b border-border bg-surface" />;
  }

  const checkedIn = Boolean(context.openSession && live);

  return (
    <div className="sticky top-0 z-30 flex flex-col border-b border-border bg-surface">
      <div className="flex h-14 shrink-0 items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-2">
          {checkedIn ? (
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
          ) : (
            <Wallet size={16} className="shrink-0 text-muted" />
          )}
          <span
            className={`truncate font-mono text-base font-bold tabular-nums tracking-tight sm:text-lg ${checkedIn ? "text-success" : "text-foreground"}`}
          >
            {formatKr(totalNet)}
          </span>
          {totalFeriepenge !== null && (
            <span
              className="shrink-0 font-mono text-xs font-medium tabular-nums text-muted"
              title="Optjente feriepenge (netto) denne periode — 12,5% af bruttolønnen, beskattet for sig selv. Udbetales ikke nu, men står til gode til ferie/jobskifte."
            >
              Feriepenge {formatKr(totalFeriepenge)}
            </span>
          )}
          <span className="hidden shrink-0 items-center gap-1 text-xs text-muted sm:flex">
            netto denne periode
            {checkedIn && live && (
              <>
                {" "}
                · tjekket ind kl. {context.openSession && timeInputValue(new Date(context.openSession.checkInAt))} ·{" "}
                {formatHMS(live.paidSeconds)} på arbejde nu
                <button
                  onClick={openCheckInEditor}
                  className="ml-1 shrink-0 rounded p-0.5 text-muted hover:bg-surface-2 hover:text-accent"
                  title="Ret tjek-ind tidspunkt"
                >
                  <Pencil size={12} />
                </button>
              </>
            )}
          </span>
          {checkedIn && live && (
            <button
              onClick={openCheckInEditor}
              className="shrink-0 rounded p-1 text-muted hover:bg-surface-2 hover:text-accent sm:hidden"
              title="Ret tjek-ind tidspunkt"
            >
              <Pencil size={13} />
            </button>
          )}
          {actionError && <span className="shrink-0 text-xs font-medium text-danger">{actionError}</span>}
        </div>
        {checkedIn ? (
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCheckOut}
            disabled={pending}
            className="flex shrink-0 items-center gap-1.5"
          >
            <LogOut size={14} /> Tjek ud
          </Button>
        ) : (
          <Button size="sm" onClick={handleCheckIn} disabled={pending} className="flex shrink-0 items-center gap-1.5">
            <LogIn size={14} /> Tjek ind
          </Button>
        )}
      </div>

      {editingCheckIn && (
        <div className="flex items-center gap-2 border-t border-border bg-surface-2 px-4 py-2 sm:px-6">
          <span className="text-xs font-semibold text-muted">Tjekkede du ind kl.</span>
          <input
            type="time"
            value={checkInTimeInput}
            onChange={(e) => setCheckInTimeInput(e.target.value)}
            className="rounded-lg border border-border bg-surface px-2 py-1 text-sm font-bold"
          />
          <button
            onClick={saveCheckInTime}
            disabled={pending}
            className="flex items-center gap-1 rounded-lg bg-accent px-2 py-1 text-xs font-bold text-accent-foreground disabled:opacity-60"
          >
            <Check size={13} /> Gem
          </button>
          <button
            onClick={() => setEditingCheckIn(false)}
            className="flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold text-muted hover:bg-surface"
          >
            <X size={13} /> Annullér
          </button>
        </div>
      )}
    </div>
  );
}
