"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
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
  BellRing,
  CalendarCheck,
  ArrowRight,
} from "lucide-react";
import { Card, Button, Badge, inputClass } from "@/components/ui/primitives";
import { TiltWrapper } from "@/components/tilt-wrapper";
import {
  checkIn,
  checkOut,
  getWageContext,
  updateCheckInTime,
  undoLastCheckOut,
  closePayPeriod,
  savePushSubscription,
  getPushSubscriptionCount,
  pushLiveMilestone,
  getLastClosedPeriod,
  type WageContext,
  type LastClosedPeriod,
} from "@/lib/actions";
import { computeIntervalEarnings, breakdownForCumulative, expectedPayout, feriepengeForGross, lastWeekdayOfMonth } from "@/lib/engine";
import { zonedParts, addCalendarDays } from "@/lib/timezone";
import { startOfDay, formatDayHeading } from "@/lib/date";
import { useToast } from "@/components/toast-provider";
import { notificationPermission, requestNotificationPermission, subscribeToPush } from "@/lib/notify";

const MILESTONE_STEP_KR = 1000;
const HOUR_MILESTONE_STEP = 10;

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
  const { notify } = useToast();
  const [context, setContext] = useState<WageContext | null>(null);
  const [now, setNow] = useState<Date | null>(() => new Date());
  const [loadError, setLoadError] = useState(false);
  const [actionError, setActionError] = useState("");
  const [editingCheckIn, setEditingCheckIn] = useState(false);
  const [checkInTimeInput, setCheckInTimeInput] = useState("");
  const [showBreakdown, setShowBreakdown] = useState(false);
  const [notifPermission, setNotifPermission] = useState<ReturnType<typeof notificationPermission>>(() =>
    notificationPermission()
  );
  const [periodBannerDismissed, setPeriodBannerDismissed] = useState(true);
  // Read once at mount rather than calling Date.now() during render (which
  // React's purity rules disallow) — accurate enough for a once-per-period banner.
  const [mountedAt] = useState(() => Date.now());
  const [closingPeriod, setClosingPeriod] = useState(false);
  const [newPeriodEndInput, setNewPeriodEndInput] = useState("");
  const [closeError, setCloseError] = useState("");
  const [pushCount, setPushCount] = useState<number | null>(null);
  const [lastClosedPeriod, setLastClosedPeriod] = useState<LastClosedPeriod | null>(null);
  const [pending, startTransition] = useTransition();

  const lastMilestoneRef = useRef<number | null>(null);
  const lastHourMilestoneRef = useRef<number | null>(null);
  const wasOvertimeRef = useRef<boolean | null>(null);

  // A cold server (e.g. the first request after the backend has been idle
  // for a while) occasionally fails its very first database query. Retrying
  // once, automatically, after a short pause means that transient hiccup
  // resolves itself instead of forcing the user to notice and click "Prøv
  // igen" themselves — the manual button below still covers a real,
  // persistent failure.
  const loadContext = useCallback(() => {
    function attempt(isRetry: boolean) {
      getWageContext()
        .then((c) => {
          setContext(c);
          setLoadError(false);
        })
        .catch((e) => {
          console.error("Wage context fetch failed:", e);
          if (isRetry) {
            setLoadError(true);
          } else {
            setTimeout(() => attempt(true), 1200);
          }
        });
    }
    attempt(false);
  }, []);

  useEffect(() => {
    loadContext();
  }, [loadContext]);

  function refreshPushCount() {
    getPushSubscriptionCount()
      .then(setPushCount)
      .catch((e) => console.error("Push count fetch failed:", e));
  }

  function refreshLastClosedPeriod() {
    getLastClosedPeriod()
      .then(setLastClosedPeriod)
      .catch((e) => console.error("Last closed period fetch failed:", e));
  }

  useEffect(() => {
    refreshPushCount();
    refreshLastClosedPeriod();
  }, []);

  // Covers a returning user who granted Notification permission in an
  // EARLIER session, before Web Push subscriptions existed — the "Aktivér"
  // button below only shows while permission is still "default", so without
  // this they'd never see it again and would stay stuck on the old
  // foreground-only path forever. subscribeToPush() itself no-ops if a
  // subscription already exists, so this is cheap to just always attempt.
  useEffect(() => {
    if (notifPermission !== "granted") return;
    subscribeToPush()
      .then((subscription) => {
        if (subscription) return savePushSubscription(subscription);
      })
      .then(() => refreshPushCount())
      .catch((e) => console.error("Push re-subscribe failed:", e));
  }, [notifPermission]);

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

  // RAW elapsed seconds of the currently open shift (including the unpaid
  // break) — deliberately NOT live.paidSeconds, which excludes the break.
  // Only feeds the "Timer" displays below; every kr figure keeps using
  // live.paidSeconds/grossAmount via cumulativeSeconds/cumulativeGross above.
  const liveElapsedSeconds = useMemo(() => {
    if (!context?.openSession || !now) return 0;
    const checkInAt = new Date(context.openSession.checkInAt);
    return (now.getTime() - checkInAt.getTime()) / 1000;
  }, [context, now]);

  // "Timer i dag"/"Timer i perioden" show the full worked time INCLUDING
  // the unpaid break — only the kr/wage figures above exclude it.
  const hoursToday = useMemo(() => {
    if (!context) return null;
    return (context.priorTodayElapsedSeconds + liveElapsedSeconds) / 3600;
  }, [context, liveElapsedSeconds]);

  const hoursThisPeriod = useMemo(() => {
    if (!context) return null;
    return (context.priorPeriodElapsedSeconds + liveElapsedSeconds) / 3600;
  }, [context, liveElapsedSeconds]);

  // Measured against ELAPSED clock time since check-in (not paid seconds),
  // same basis computeIntervalEarnings itself splits normal/overtime on —
  // an unpaid break still counts towards reaching the threshold.
  const inOvertime = useMemo(() => {
    if (!context?.openSession || !now) return false;
    const checkInAt = new Date(context.openSession.checkInAt);
    const elapsedThisSession = (now.getTime() - checkInAt.getTime()) / 1000;
    const totalElapsedThisWeek = context.priorWeekElapsedSeconds + elapsedThisSession;
    return totalElapsedThisWeek > context.thisWeekThresholdHours * 3600;
  }, [context, now]);

  // Same elapsed-seconds basis as inOvertime (includes the unpaid break,
  // excludes sygedage) but kept live between shifts too, not just while
  // checked in — "hvor mange timer har jeg arbejdet denne uge" shouldn't
  // go blank the moment you tap "Tjek ud".
  const weekHoursElapsed = useMemo(() => {
    if (!context) return null;
    const elapsedThisSession =
      context.openSession && now ? (now.getTime() - new Date(context.openSession.checkInAt).getTime()) / 1000 : 0;
    return (context.priorWeekElapsedSeconds + elapsedThisSession) / 3600;
  }, [context, now]);

  const periodEndKey = context ? new Date(context.config.payPeriodEnd).toISOString().slice(0, 10) : null;
  const periodHasEnded = useMemo(() => {
    if (!context) return false;
    const end = new Date(context.config.payPeriodEnd);
    // addCalendarDays, not native getFullYear()/getMonth()/getDate() — this
    // runs in the browser so it was never actually wrong (Danish-local IS
    // the runtime's own timezone here), but kept consistent with the rest
    // of the zone-aware codebase now that this file touches period dates
    // more directly.
    const exclusiveEnd = addCalendarDays(startOfDay(end), 1);
    return mountedAt >= exclusiveEnd.getTime();
  }, [context, mountedAt]);

  const payoutDate = useMemo(() => {
    if (!context) return null;
    return lastWeekdayOfMonth(new Date(context.config.payPeriodEnd));
  }, [context]);

  // The last CLOSED period's own payout — separate from the live, current
  // period above. Shown until its own payout date has passed, then this
  // whole block just stops rendering (see JSX below), since by then it's
  // old news and the current period's own numbers are what matter again.
  const lastClosedPayoutDate = useMemo(() => {
    if (!lastClosedPeriod) return null;
    return lastWeekdayOfMonth(new Date(lastClosedPeriod.periodEnd));
  }, [lastClosedPeriod]);
  const lastClosedPayout = useMemo(() => {
    if (!lastClosedPeriod) return null;
    return expectedPayout(lastClosedPeriod.netAmount, { advanceAmount: lastClosedPeriod.advanceAmount });
  }, [lastClosedPeriod]);
  const showLastClosedPeriod = Boolean(
    lastClosedPeriod && lastClosedPayoutDate && now && now.getTime() <= addCalendarDays(startOfDay(lastClosedPayoutDate), 1).getTime()
  );

  const newPeriodStart = useMemo(() => {
    if (!context) return null;
    return addCalendarDays(startOfDay(new Date(context.config.payPeriodEnd)), 1);
  }, [context]);

  // Milestone toasts ("du er over 2.000 kr") — tracks NETTO, not brutto,
  // since that's the number people actually care about. Fires once per
  // crossed multiple of MILESTONE_STEP_KR. The first render just records
  // the current milestone as the baseline so re-opening the app doesn't
  // re-announce every threshold already passed in an earlier session.
  const netto = breakdown?.netto ?? null;
  useEffect(() => {
    if (netto === null) return;
    const currentMilestone = Math.floor(netto / MILESTONE_STEP_KR);
    if (lastMilestoneRef.current === null) {
      lastMilestoneRef.current = currentMilestone;
      return;
    }
    if (currentMilestone > lastMilestoneRef.current) {
      for (let m = lastMilestoneRef.current + 1; m <= currentMilestone; m++) {
        notify(
          `🎉 Du er over ${(m * MILESTONE_STEP_KR).toLocaleString("da-DK")} kr netto`,
          `Du har nu optjent ${formatKr(netto)} netto i denne lønperiode.`,
          "milestone"
        );
        // Fires the REAL push (lock screen) the instant this is noticed, not
        // just the in-app/foreground toast above — see pushLiveMilestone's
        // own comment for why this used to only happen at checkout.
        pushLiveMilestone("kr-milestone", m * MILESTONE_STEP_KR).catch((e) => console.error("Live milestone push failed:", e));
      }
      lastMilestoneRef.current = currentMilestone;
    }
  }, [netto, notify]);

  // Hour-count toasts ("du har nu arbejdet 10/20/30 timer denne uge") —
  // same HOUR_MILESTONE_STEP and elapsed-seconds basis as the server-side
  // push version fired from checkOut in actions.ts, so the two agree.
  useEffect(() => {
    if (weekHoursElapsed === null) return;
    const currentMilestone = Math.floor(weekHoursElapsed / HOUR_MILESTONE_STEP);
    if (lastHourMilestoneRef.current === null) {
      lastHourMilestoneRef.current = currentMilestone;
      return;
    }
    if (currentMilestone > lastHourMilestoneRef.current) {
      for (let m = lastHourMilestoneRef.current + 1; m <= currentMilestone; m++) {
        notify(
          `⏱️ Du har nu arbejdet ${m * HOUR_MILESTONE_STEP} timer denne uge`,
          `Du er på ${weekHoursElapsed.toFixed(1)}t ud af ugens grænse på ${context?.thisWeekThresholdHours}t.`,
          "hour-milestone"
        );
        // Real push, not just the foreground toast above — this is what was
        // missing: previously an hour-milestone crossed WHILE still checked
        // in only reached the lock screen retroactively, at checkout.
        pushLiveMilestone("hour-milestone", m * HOUR_MILESTONE_STEP).catch((e) => console.error("Live milestone push failed:", e));
      }
      lastHourMilestoneRef.current = currentMilestone;
    }
  }, [weekHoursElapsed, notify, context]);

  // Overtime toast — fires once on the false→true transition.
  useEffect(() => {
    if (!context) return;
    if (wasOvertimeRef.current === null) {
      wasOvertimeRef.current = inOvertime;
      return;
    }
    if (inOvertime && !wasOvertimeRef.current) {
      const overtimeRate = context.config.hourlyRate * (1 + context.config.overtimeBonusPct);
      notify(
        "⏱️ Du er gået i overtid",
        `Din timeløn er nu ${formatKr(overtimeRate)}/time.`,
        "overtime"
      );
      pushLiveMilestone("overtime", 0).catch((e) => console.error("Live overtime push failed:", e));
    }
    wasOvertimeRef.current = inOvertime;
  }, [inOvertime, context, notify]);

  // Period-ended banner + one-time toast — remembered per period-end date
  // in localStorage so it doesn't repeat on every reload, but does come
  // back the next time the configured period actually changes.
  useEffect(() => {
    if (!periodHasEnded || !periodEndKey || payout === null) return;
    const storageKey = `wf_period_ack_${periodEndKey}`;
    let alreadySeen = false;
    try {
      alreadySeen = localStorage.getItem(storageKey) !== null;
    } catch {
      // localStorage unavailable (private mode etc.) — just show the banner every time, no notification spam risk since it's a one-shot effect per mount.
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- genuinely syncing with an external system (localStorage) gated on periodEndKey/payout changing, not derivable from props/state alone.
    setPeriodBannerDismissed(alreadySeen);
    if (!alreadySeen) {
      notify(
        "📅 Din lønperiode er slut",
        `${formatKr(payout)} klar til udbetaling.`,
        "period"
      );
    }
  }, [periodHasEnded, periodEndKey, payout, notify]);

  function dismissPeriodBanner() {
    setPeriodBannerDismissed(true);
    if (periodEndKey) {
      try {
        localStorage.setItem(`wf_period_ack_${periodEndKey}`, "1");
      } catch {
        // ignore
      }
    }
  }

  // Everything here runs inline, synchronously chained off the click that
  // called it — NOT split into "request permission, let a useEffect pick
  // up the resulting state change and subscribe later". iOS Safari ties
  // both Notification.requestPermission() AND pushManager.subscribe() to
  // the original user-gesture's transient activation window; once that
  // call chain gets interrupted by a React state update + re-render +
  // effect (a separate task, no longer "from a click" as far as WebKit is
  // concerned), subscribe() silently does nothing on iOS — permission
  // shows "granted" but no subscription ever gets created. Confirmed by
  // comparing against Forge (cb6715/forge), a working sibling app, whose
  // enablePush() does permission + subscribe + save in one unbroken chain
  // for exactly this reason.
  function enableNotifications() {
    requestNotificationPermission()
      .then(async (permission) => {
        setNotifPermission(permission);
        if (permission !== "granted") return;
        const subscription = await subscribeToPush();
        if (subscription) await savePushSubscription(subscription);
        refreshPushCount();
      })
      .catch((e) => console.error("Enable notifications failed:", e));
  }

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
      const result = await undoLastCheckOut();
      if (!result.ok) {
        setActionError(result.error);
        return;
      }
      setContext(result.data);
    });
  }

  function confirmClosePeriod() {
    if (!newPeriodEndInput) return;
    setCloseError("");
    const [y, m, d] = newPeriodEndInput.split("-").map(Number);
    const newEnd = new Date(y, m - 1, d);
    startTransition(async () => {
      const result = await closePayPeriod(newEnd);
      if (!result.ok) {
        setCloseError(result.error);
        return;
      }
      setClosingPeriod(false);
      setNewPeriodEndInput("");
      dismissPeriodBanner();
      loadContext();
      refreshLastClosedPeriod();
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
        <button onClick={() => loadContext()} className="text-xs font-bold text-[var(--accent)] underline underline-offset-2">
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
    <div className="space-y-3">
      {periodHasEnded && !periodBannerDismissed && (
        <Card className="animate-fade-up flex flex-col gap-3 p-4">
          <div className="flex items-start gap-3">
            <span className="glass-strong flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-[var(--accent)]">
              <CalendarCheck size={16} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-extrabold">Din lønperiode er slut</p>
              <p className="mt-0.5 text-sm text-[var(--muted)]">
                {formatKr(payout)} klar til udbetaling. Luk perioden her, eller ret den manuelt i{" "}
                <Link href="/indstillinger" className="font-bold text-[var(--accent)] underline underline-offset-2">
                  Indstillinger
                </Link>
                .
              </p>
            </div>
            <button
              onClick={dismissPeriodBanner}
              className="shrink-0 rounded-full p-1 text-[var(--muted)] hover:bg-[var(--surface-2)]"
              aria-label="Luk"
            >
              <X size={15} />
            </button>
          </div>

          {!closingPeriod ? (
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setClosingPeriod(true)}
              className="flex w-fit items-center gap-1.5"
            >
              <CalendarCheck size={14} /> Luk periode og start ny
            </Button>
          ) : (
            <div className="flex flex-wrap items-end gap-2">
              <div className="min-w-[160px] flex-1">
                <label className="mb-1 block text-xs font-semibold text-[var(--muted)]">
                  Ny periode slutter {newPeriodStart && <>(starter {formatDayHeading(newPeriodStart)})</>}
                </label>
                <input
                  type="date"
                  className={inputClass}
                  value={newPeriodEndInput}
                  onChange={(e) => setNewPeriodEndInput(e.target.value)}
                />
              </div>
              <Button size="sm" onClick={confirmClosePeriod} disabled={pending || !newPeriodEndInput} className="flex shrink-0 items-center gap-1.5">
                <Check size={14} /> Bekræft
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setClosingPeriod(false)} className="shrink-0">
                <X size={14} />
              </Button>
            </div>
          )}
          {closeError && <p className="text-xs font-semibold text-[var(--danger)]">{closeError}</p>}
        </Card>
      )}

      {notifPermission === "default" && (
        <button
          onClick={enableNotifications}
          className="glass flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-left text-xs font-bold text-[var(--muted)] transition hover:text-[var(--foreground)]"
        >
          <span className="flex items-center gap-1.5">
            <BellRing size={14} className="text-[var(--accent)]" /> Få besked om løn-milepæle og overtid
          </span>
          <span className="flex items-center gap-1 text-[var(--accent)]">
            Aktivér <ArrowRight size={12} />
          </span>
        </button>
      )}

      {/* Real state, not a guess — lets you tell whether a subscription
          actually exists without needing to wait for a real notification to
          test it. "granted" + 0 enheder means the browser said yes but no
          push subscription ever made it to the server (worth reloading the
          app once, or re-tapping below if it stays at 0). */}
      {notifPermission === "granted" && (
        <div className="glass flex w-full items-center justify-between gap-2 rounded-2xl px-4 py-2.5 text-xs font-bold text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <BellRing size={14} className={pushCount ? "text-[var(--success)]" : "text-[var(--danger)]"} />
            {pushCount === null
              ? "Tjekker notifikationsstatus…"
              : pushCount > 0
                ? `Notifikationer aktive (${pushCount} ${pushCount === 1 ? "enhed" : "enheder"})`
                : "Tilladelse givet, men intet abonnement endnu"}
          </span>
          {pushCount === 0 && (
            <button onClick={enableNotifications} className="flex items-center gap-1 text-[var(--accent)]">
              Prøv igen <ArrowRight size={12} />
            </button>
          )}
        </div>
      )}

      {notifPermission === "denied" && (
        <div className="glass flex w-full items-center gap-1.5 rounded-2xl px-4 py-2.5 text-xs font-bold text-[var(--muted)]">
          <BellRing size={14} className="text-[var(--danger)]" />
          Notifikationer er blokeret for appen — slå dem til i din telefons indstillinger for at få besked.
        </div>
      )}

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
            {showLastClosedPeriod && lastClosedPayout !== null && lastClosedPayoutDate ? (
              <span className="flex items-center gap-1">
                <CalendarCheck size={13} /> Sidste løn: {formatKr(lastClosedPayout)} — udbetales {formatDayHeading(lastClosedPayoutDate)}
              </span>
            ) : (
              <span>Netto optjent {formatKr(breakdown.netto)}</span>
            )}
            <span className="flex items-center gap-1">
              <Gift size={13} /> {formatKr(totalFeriepenge.netto)} feriepenge
            </span>
            {payoutDate && (
              <span className="flex items-center gap-1">
                <CalendarCheck size={13} /> Udbetales {formatDayHeading(payoutDate)} (skøn)
              </span>
            )}
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
    </div>
  );
}
