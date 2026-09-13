"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { LogIn, LogOut, Wallet } from "lucide-react";
import { Button } from "@/components/ui/primitives";
import { checkIn, checkOut, getWageContext, type WageContext } from "@/lib/actions/worksessions";
import { computeIntervalEarnings, netForIncrement } from "@/lib/wage/engine";

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
  const [context, setContext] = useState<WageContext | null>(null);
  const [now, setNow] = useState<Date | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    getWageContext().then(setContext);
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
    const { paidSeconds, grossAmount } = computeIntervalEarnings(
      checkInAt,
      now,
      context.priorWeekPaidSeconds,
      context.config
    );
    const netAmount = netForIncrement(context.priorMonthGross, grossAmount, context.config);
    return { paidSeconds, grossAmount, netAmount };
  }, [context, now]);

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

  if (!context) {
    return <div className="h-14 shrink-0 border-b border-border bg-surface" />;
  }

  return (
    <div className="sticky top-0 z-30 flex h-14 shrink-0 items-center justify-between gap-3 border-b border-border bg-surface px-4 sm:px-6">
      {context.openSession && live ? (
        <>
          <div className="flex min-w-0 items-center gap-2">
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-success opacity-75" />
              <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-success" />
            </span>
            <Wallet size={16} className="shrink-0 text-muted" />
            <span className="truncate font-mono text-base font-bold tabular-nums tracking-tight text-success sm:text-lg">
              {formatKr(live.netAmount)}
            </span>
            <span className="hidden shrink-0 text-xs text-muted sm:inline">
              netto · {formatHMS(live.paidSeconds)} på arbejde
            </span>
          </div>
          <Button
            size="sm"
            variant="secondary"
            onClick={handleCheckOut}
            disabled={pending}
            className="flex shrink-0 items-center gap-1.5"
          >
            <LogOut size={14} /> Tjek ud
          </Button>
        </>
      ) : (
        <>
          <span className="text-sm text-muted">Ikke tjekket ind</span>
          <Button size="sm" onClick={handleCheckIn} disabled={pending} className="flex shrink-0 items-center gap-1.5">
            <LogIn size={14} /> Tjek ind
          </Button>
        </>
      )}
    </div>
  );
}
