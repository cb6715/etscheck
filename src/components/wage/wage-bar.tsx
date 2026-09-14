"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { usePathname } from "next/navigation";
import { LogIn, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { checkIn, checkOut, getWageContext, type WageContext } from "@/lib/actions/worksessions";
import { computeIntervalEarnings, netForCumulative } from "@/lib/wage/engine";
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

export function WageBar() {
  const pathname = usePathname();
  const [context, setContext] = useState<WageContext | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();

  // Refetch on every route change, and whenever something elsewhere on the
  // current page changed wage data (see WAGE_CONTEXT_CHANGED_EVENT) — the
  // bar stays mounted across navigation (it lives in the app shell, not a
  // page), so nothing would otherwise tell it e.g. a historical week was
  // just logged on Indstillinger.
  useEffect(() => {
    getWageContext().then(setContext);
  }, [pathname]);

  useEffect(() => {
    function refetch() {
      getWageContext().then(setContext);
    }
    window.addEventListener(WAGE_CONTEXT_CHANGED_EVENT, refetch);
    return () => window.removeEventListener(WAGE_CONTEXT_CHANGED_EVENT, refetch);
  }, []);

  useEffect(() => {
    if (!context?.openSession) return;
    setNow(new Date());
    const id = setInterval(() => setNow(new Date()), 1000);
    return () => clearInterval(id);
  }, [context?.openSession]);

  const live = useMemo(() => {
    if (!context?.openSession || !now) return null;
    const checkInAt = new Date(context.openSession.checkInAt);
    return computeIntervalEarnings(checkInAt, now, context.priorWeekPaidSeconds, context.config);
  }, [context, now]);

  // Total netto optjent i hele lønperioden til dato — vises altid, også når
  // man ikke er tjekket ind, og tikker op i takt med den åbne vagt.
  const totalNet = useMemo(() => {
    if (!context) return null;
    const cumulativeGross = context.priorPeriodGross + (live?.grossAmount ?? 0);
    const cumulativePaidSeconds = context.priorPeriodPaidSeconds + (live?.paidSeconds ?? 0);
    return netForCumulative(cumulativeGross, cumulativePaidSeconds, context.config);
  }, [context, live]);

  function handleCheckIn() {
    startTransition(async () => {
      const next = await checkIn();
      setContext(next);
    });
  }

  function handleCheckOut() {
    startTransition(async () => {
      const next = await checkOut();
      setContext(next);
    });
  }

  if (!context || totalNet === null) {
    return <div className="h-14 shrink-0 border-b border-border bg-surface" />;
  }

  const checkedIn = Boolean(context.openSession && live);

  return (
    <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
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
        <span className="hidden shrink-0 text-xs text-muted sm:inline">
          netto denne periode{checkedIn && live ? ` · ${formatHMS(live.paidSeconds)} på arbejde nu` : ""}
        </span>
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
  );
}
