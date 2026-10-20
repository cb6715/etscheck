"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getWeekRange, startOfDay, endOfDay } from "@/lib/date";
import { copenhagenDayKey, copenhagenWeekday, zonedDateTime, addCalendarDays } from "@/lib/timezone";
import { createSession, destroySession, getSessionUserId, hashPassword, verifyPassword } from "@/lib/session";
import { requireActiveAccess } from "@/lib/access";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import {
  computeIntervalEarnings,
  computeSickDayEarnings,
  computeWeekGrossFromHours,
  netForIncrement,
  netForCumulative,
  expectedPayout,
  getPayPeriodRange,
  weeklyOvertimeThresholdHours,
  type WageConfig,
} from "@/lib/engine";
import {
  toConfig,
  priorWeekElapsedSeconds,
  priorTodayPaidSeconds,
  priorPeriodTotals,
  sendPushToUser,
  type WageSettingsRow,
} from "@/lib/wage-internal";

function formatKr(n: number): string {
  return n.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) + " kr";
}

type SessionRow = {
  id: number;
  check_in_at: Date;
  check_out_at: Date | null;
  paid_seconds: number | null;
  gross_amount: number | null;
  net_amount: number | null;
  is_sick_day: boolean;
  is_manual_entry: boolean;
};

// ─────────────────────────────────────────────────────────────
// USER / SETTINGS / AUTH
// ─────────────────────────────────────────────────────────────

// Resolves to whoever is logged in (via the session cookie) — every other
// function in this file goes through this, so access control enforced here
// (and in requireActiveAccess) protects every data operation, not just the
// pages that happen to redirect unauthenticated visitors.
export async function getUserId(): Promise<number> {
  const userId = await getSessionUserId();
  if (userId === null) throw new Error("Ikke logget ind.");
  return userId;
}

export type SignUpInput = {
  name: string;
  email: string;
  password: string;
  hourlyRate: number;
  overtimeThresholdHours: number;
  overtimeBonusPct: number;
  weekendSupplement: number;
  holidaySupplement: number;
  breakStartMinutes: number;
  breakEndMinutes: number;
  monthlyTaxDeduction: number;
  amBidragPct: number;
  taxRatePct: number;
  atpRatePerHour: number;
  sickPayHourlyRate: number;
  payPeriodStart: Date;
  payPeriodEnd: Date;
  trackingMode?: TrackingMode;
};

// Creates a new user + their wage settings, then logs them in. Multi-tenant:
// anyone can sign up — access to the app itself (beyond login/signup/the
// subscription page) is gated separately by requireActiveAccess, not by
// whether an account exists.
export async function signUp(input: SignUpInput): Promise<ActionResult> {
  if (input.password.length < 8) return fail("Adgangskoden skal være mindst 8 tegn.");

  const existing = await db().sql<{ id: number }>`SELECT id FROM users WHERE email = ${input.email}`;
  if (existing.length > 0) return fail("Der findes allerede en konto med den e-mail.");

  const passwordHash = hashPassword(input.password);
  const [user] = await db().sql<{ id: number }>`
    INSERT INTO users (name, email, password_hash) VALUES (${input.name}, ${input.email}, ${passwordHash}) RETURNING id
  `;
  await db().sql`
    INSERT INTO wage_settings (
      user_id, hourly_rate, overtime_threshold_hours, overtime_bonus_pct,
      weekend_supplement, holiday_supplement,
      break_start_minutes, break_end_minutes, monthly_tax_deduction,
      am_bidrag_pct, tax_rate_pct, atp_rate_per_hour, sick_pay_hourly_rate,
      pay_period_start, pay_period_end, tracking_mode
    ) VALUES (
      ${user.id}, ${input.hourlyRate}, ${input.overtimeThresholdHours}, ${input.overtimeBonusPct},
      ${input.weekendSupplement}, ${input.holidaySupplement},
      ${input.breakStartMinutes}, ${input.breakEndMinutes}, ${input.monthlyTaxDeduction},
      ${input.amBidragPct}, ${input.taxRatePct}, ${input.atpRatePerHour}, ${input.sickPayHourlyRate},
      ${copenhagenDayKey(input.payPeriodStart)}, ${copenhagenDayKey(input.payPeriodEnd)}, ${input.trackingMode ?? "daily"}
    )
  `;
  await db().sql`INSERT INTO subscriptions (user_id, status) VALUES (${user.id}, 'none')`;
  await createSession(user.id);
  revalidatePath("/");
  return ok(undefined);
}

export async function signIn(email: string, password: string): Promise<ActionResult> {
  const rows = await db().sql<{ id: number; password_hash: string | null }>`
    SELECT id, password_hash FROM users WHERE email = ${email}
  `;
  const user = rows[0];
  if (!user?.password_hash || !verifyPassword(password, user.password_hash)) {
    return fail("Forkert e-mail eller adgangskode.");
  }
  await createSession(user.id);
  revalidatePath("/");
  return ok(undefined);
}

export async function signOut(): Promise<void> {
  await destroySession();
  redirect("/login");
}

export async function changePassword(currentPassword: string, newPassword: string): Promise<ActionResult> {
  if (newPassword.length < 8) return fail("Den nye adgangskode skal være mindst 8 tegn.");
  const userId = await getUserId();
  const [user] = await db().sql<{ password_hash: string | null }>`SELECT password_hash FROM users WHERE id = ${userId}`;
  if (!user?.password_hash || !verifyPassword(currentPassword, user.password_hash)) {
    return fail("Forkert nuværende adgangskode.");
  }
  await db().sql`UPDATE users SET password_hash = ${hashPassword(newPassword)} WHERE id = ${userId}`;
  return ok(undefined);
}

async function getOrCreateWageSettingsRow(userId: number): Promise<WageSettingsRow> {
  const rows = await db().sql<WageSettingsRow>`SELECT * FROM wage_settings WHERE user_id = ${userId}`;
  if (rows.length > 0) return rows[0];
  const [row] = await db().sql<WageSettingsRow>`
    INSERT INTO wage_settings (user_id) VALUES (${userId}) RETURNING *
  `;
  return row;
}

export async function getWageSettings(): Promise<WageConfig> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  return toConfig(await getOrCreateWageSettingsRow(userId));
}

export type WageSettingsInput = Partial<WageConfig>;

const COLUMN_BY_FIELD: Record<keyof WageConfig, string> = {
  hourlyRate: "hourly_rate",
  overtimeThresholdHours: "overtime_threshold_hours",
  overtimeBonusPct: "overtime_bonus_pct",
  nightSupplement: "night_supplement",
  nightStartHour: "night_start_hour",
  nightEndHour: "night_end_hour",
  weekendSupplement: "weekend_supplement",
  holidaySupplement: "holiday_supplement",
  breakStartMinutes: "break_start_minutes",
  breakEndMinutes: "break_end_minutes",
  monthlyTaxDeduction: "monthly_tax_deduction",
  amBidragPct: "am_bidrag_pct",
  taxRatePct: "tax_rate_pct",
  atpRatePerHour: "atp_rate_per_hour",
  sickPayHourlyRate: "sick_pay_hourly_rate",
  advanceAmount: "advance_amount",
  payPeriodStart: "pay_period_start",
  payPeriodEnd: "pay_period_end",
  workDaysPerWeek: "work_days_per_week",
};

export async function updateWageSettings(input: WageSettingsInput): Promise<void> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  await getOrCreateWageSettingsRow(userId);

  const entries = Object.entries(input) as [keyof WageConfig, WageConfig[keyof WageConfig]][];
  for (const [field, value] of entries) {
    const column = COLUMN_BY_FIELD[field];
    const client = db();
    // pay_period_start/end are DATE columns (no time component). Passing a
    // raw Date object lets the driver/Postgres reinterpret its UTC instant
    // and store the PREVIOUS calendar day — a Danish-midnight instant is
    // still "yesterday" in UTC — silently shifting the period boundary back
    // one day on every save. A plain "YYYY-MM-DD" string sidesteps any
    // timezone reinterpretation entirely.
    const dbValue = value instanceof Date ? copenhagenDayKey(value) : value;
    await client.sql`UPDATE wage_settings SET ${client.sql.identifier(column)} = ${dbValue}, updated_at = now() WHERE user_id = ${userId}`;
  }

  const config = toConfig(await getOrCreateWageSettingsRow(userId));
  await rebalancePeriodNetAmounts(userId, config);
  revalidatePath("/indstillinger");
  revalidatePath("/");
}

export type TrackingMode = "daily" | "monthly";

// Which of the two shift-registration flows the onboarding wizard sent the
// user down: 'daily' is the original tjek-ind/tjek-ud flow, 'monthly' plans
// a whole month of shifts up front (see src/lib/schedule-actions.ts). Both
// feed the SAME wage engine via work_sessions — this only changes which UI
// the dashboard shows, never the underlying løn-beregning.
export async function getTrackingMode(): Promise<TrackingMode> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const [row] = await db().sql<{ tracking_mode: TrackingMode }>`SELECT tracking_mode FROM wage_settings WHERE user_id = ${userId}`;
  return row?.tracking_mode ?? "daily";
}

export async function setTrackingMode(mode: TrackingMode): Promise<void> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  await getOrCreateWageSettingsRow(userId);
  await db().sql`UPDATE wage_settings SET tracking_mode = ${mode} WHERE user_id = ${userId}`;
  revalidatePath("/");
}

// Advances the pay period in one step: the new period starts the Danish
// calendar day right after the old one ended (so nothing is skipped or
// double-counted), runs until the caller-supplied `newPeriodEnd`, and
// `advanceAmount` resets to 0 — a forskud belongs to the period it was paid
// against, not the next one. Existing sessions aren't touched: once they
// fall outside the new [start, end) window, recomputePeriodSessions/
// rebalancePeriodNetAmounts simply stop recalculating them, so their
// stored paid_seconds/gross/net amounts stay frozen as of the close.
export async function closePayPeriod(newPeriodEnd: Date): Promise<ActionResult<WageConfig>> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const config = toConfig(await getOrCreateWageSettingsRow(userId));

  const newStart = addCalendarDays(startOfDay(config.payPeriodEnd), 1);
  const newEnd = startOfDay(newPeriodEnd);
  if (!(newEnd > newStart)) return fail("Den nye periode skal slutte efter den starter.");

  const finalTotals = await priorPeriodTotals(userId, newStart, config);
  const finalPayout = expectedPayout(netForCumulative(finalTotals.gross, finalTotals.paidSeconds, config), config);

  await updateWageSettings({ payPeriodStart: newStart, payPeriodEnd: newEnd, advanceAmount: 0 });
  await sendPushToUser(userId, {
    title: "📅 Lønperiode lukket",
    body: `${formatKr(finalPayout)} klar til udbetaling. Ny periode er startet.`,
    tag: "period",
  });

  return ok({ ...config, payPeriodStart: newStart, payPeriodEnd: newEnd, advanceAmount: 0 });
}

// ─────────────────────────────────────────────────────────────
// PUSH-NOTIFIKATIONER
// ─────────────────────────────────────────────────────────────
//
// The browser Notification API (src/lib/notify.ts) only works while the
// app is actually running somewhere — close the tab/PWA and it's gone.
// Reaching the lock screen with the app fully closed requires a real Web
// Push subscription stored here, delivered by sendPushToUser from a server
// action that already knows something notification-worthy just happened
// (checkOut crossing a milestone or into overtime, closePayPeriod).

export async function savePushSubscription(subscription: { endpoint: string; keys: { p256dh: string; auth: string } }): Promise<ActionResult> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  await db().sql`
    INSERT INTO push_subscriptions (user_id, endpoint, p256dh, auth)
    VALUES (${userId}, ${subscription.endpoint}, ${subscription.keys.p256dh}, ${subscription.keys.auth})
    ON CONFLICT (endpoint) DO UPDATE SET user_id = ${userId}, p256dh = ${subscription.keys.p256dh}, auth = ${subscription.keys.auth}
  `;
  return ok(undefined);
}

export async function deletePushSubscription(endpoint: string): Promise<void> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  await db().sql`DELETE FROM push_subscriptions WHERE user_id = ${userId} AND endpoint = ${endpoint}`;
}

// Lets the UI show real state ("1 enhed tilsluttet") instead of a blind
// "Aktivér" button with no way to tell afterward whether it actually
// worked — genuinely useful status, not a click-to-test gimmick.
export async function getPushSubscriptionCount(): Promise<number> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const rows = await db().sql<{ count: string }>`SELECT count(*)::text as count FROM push_subscriptions WHERE user_id = ${userId}`;
  return Number(rows[0]?.count ?? 0);
}


// wage-card.tsx's live toast effects (hour-milestone, kr-milestone,
// overtime) can only ever detect a crossing while the app is actually open
// — that's the only place the live elapsed-time math runs. Previously that
// meant a real Web Push (the one that reaches the lock screen) only went
// out from checkOut(), i.e. AFTER you eventually check out, which could be
// hours after the threshold was actually crossed while still checked in.
// This lets the client fire the real push at the exact moment it notices
// the crossing, while the app still happens to be open to notice it at
// all — the same "has to be open to detect it, but can push the instant it
// does" trade-off the push-permission flow itself already lives with.
// Takes only a `kind` + numeric milestone, never free text from the
// client, so there's no way to push arbitrary notification content through
// this endpoint — the wording is generated here, same as the checkOut path.
export async function pushLiveMilestone(kind: "hour-milestone" | "kr-milestone" | "overtime", milestone: number): Promise<void> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  if (kind === "hour-milestone") {
    await sendPushToUser(userId, {
      title: `⏱️ Du har nu arbejdet ${milestone} timer denne uge`,
      body: `Du runder ${milestone} timer denne uge, lige nu.`,
      tag: "hour-milestone",
    });
  } else if (kind === "kr-milestone") {
    await sendPushToUser(userId, {
      title: `🎉 Du er over ${milestone.toLocaleString("da-DK")} kr netto`,
      body: `Du har nu optjent over ${milestone.toLocaleString("da-DK")} kr netto i denne lønperiode.`,
      tag: "milestone",
    });
  } else {
    await sendPushToUser(userId, {
      title: "⏱️ Du er gået i overtid",
      body: "Du har krydset ugens overtidsgrænse, lige nu.",
      tag: "overtime",
    });
  }
}

// ─────────────────────────────────────────────────────────────
// OVERTIME / ELAPSED-TIME HELPERS
// ─────────────────────────────────────────────────────────────

async function recomputePeriodSessions(userId: number, config: WageConfig): Promise<void> {
  const { start, end } = getPayPeriodRange(config);
  const sessions = await db().sql<SessionRow>`
    SELECT * FROM work_sessions
    WHERE user_id = ${userId} AND check_out_at IS NOT NULL AND is_sick_day = false AND is_manual_entry = false
      AND check_in_at >= ${start} AND check_in_at < ${end}
    ORDER BY check_in_at ASC
  `;
  if (sessions.length === 0) return;

  const weeks = new Map<string, SessionRow[]>();
  for (const s of sessions) {
    const key = getWeekRange(new Date(s.check_in_at)).start.toISOString();
    const list = weeks.get(key);
    if (list) list.push(s);
    else weeks.set(key, [s]);
  }

  // Fixed per the configured work_days_per_week, not derived from how many
  // days happen to have shifts logged — so it's the same for every session
  // in the week, computed once rather than re-derived per session.
  const thresholdHours = weeklyOvertimeThresholdHours(config);

  for (const [, weekSessions] of weeks) {
    let elapsedThisWeek = 0;
    for (const s of weekSessions) {
      const checkInAt = new Date(s.check_in_at);
      const checkOutAt = new Date(s.check_out_at!);
      const { paidSeconds, grossAmount } = computeIntervalEarnings(checkInAt, checkOutAt, elapsedThisWeek, thresholdHours, config);
      elapsedThisWeek += (checkOutAt.getTime() - checkInAt.getTime()) / 1000;
      if (paidSeconds !== s.paid_seconds || Math.abs(grossAmount - (s.gross_amount ?? 0)) > 0.001) {
        await db().sql`UPDATE work_sessions SET paid_seconds = ${Math.round(paidSeconds)}, gross_amount = ${grossAmount} WHERE id = ${s.id}`;
      }
    }
  }
}

async function rebalancePeriodNetAmounts(userId: number, config: WageConfig): Promise<void> {
  const { start, end } = getPayPeriodRange(config);
  const sessions = await db().sql<SessionRow>`
    SELECT * FROM work_sessions
    WHERE user_id = ${userId} AND check_out_at IS NOT NULL AND check_in_at >= ${start} AND check_in_at < ${end}
    ORDER BY check_in_at ASC
  `;

  let cumulativeGross = 0;
  let cumulativePaidSeconds = 0;
  for (const s of sessions) {
    const gross = s.gross_amount ?? 0;
    const seconds = s.paid_seconds ?? 0;
    const net = netForIncrement(cumulativeGross, cumulativePaidSeconds, gross, seconds, config);
    cumulativeGross += gross;
    cumulativePaidSeconds += seconds;
    if (Math.abs((s.net_amount ?? 0) - net) > 0.001) {
      await db().sql`UPDATE work_sessions SET net_amount = ${net} WHERE id = ${s.id}`;
    }
  }
}

// ─────────────────────────────────────────────────────────────
// TJEK IND/UD
// ─────────────────────────────────────────────────────────────

const UNDO_CHECKOUT_WINDOW_MS = 30 * 60 * 1000;

export type WageContext = {
  config: WageConfig;
  openSession: { id: number; checkInAt: string } | null;
  priorWeekElapsedSeconds: number;
  thisWeekThresholdHours: number;
  priorPeriodGross: number;
  priorPeriodPaidSeconds: number;
  priorTodayPaidSeconds: number;
  canUndoCheckout: boolean;
};

export async function getWageContext(): Promise<WageContext> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const config = toConfig(await getOrCreateWageSettingsRow(userId));

  const [openRows, lastClosedRows] = await Promise.all([
    db().sql<SessionRow>`SELECT * FROM work_sessions WHERE user_id = ${userId} AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1`,
    db().sql<{ check_out_at: Date }>`
      SELECT check_out_at FROM work_sessions
      WHERE user_id = ${userId} AND check_out_at IS NOT NULL AND is_sick_day = false
      ORDER BY check_out_at DESC LIMIT 1
    `,
  ]);
  const openSession = openRows[0] ?? null;

  const referenceTime = openSession ? new Date(openSession.check_in_at) : new Date();
  await recomputePeriodSessions(userId, config);
  const [weekSeconds, periodTotals, todaySeconds] = await Promise.all([
    priorWeekElapsedSeconds(userId, referenceTime),
    priorPeriodTotals(userId, referenceTime, config),
    priorTodayPaidSeconds(userId, referenceTime),
  ]);

  const lastClosed = lastClosedRows[0];
  return {
    config,
    openSession: openSession ? { id: openSession.id, checkInAt: new Date(openSession.check_in_at).toISOString() } : null,
    priorWeekElapsedSeconds: weekSeconds,
    thisWeekThresholdHours: weeklyOvertimeThresholdHours(config),
    priorPeriodGross: periodTotals.gross,
    priorPeriodPaidSeconds: periodTotals.paidSeconds,
    priorTodayPaidSeconds: todaySeconds,
    canUndoCheckout: Boolean(
      lastClosed?.check_out_at && Date.now() - new Date(lastClosed.check_out_at).getTime() < UNDO_CHECKOUT_WINDOW_MS
    ),
  };
}

// Postgres error code for a unique-constraint violation — thrown by the
// partial unique index on (user_id) WHERE check_out_at IS NULL (see the
// 20261016_one_open_session migration). Caught as "already checked in"
// rather than surfaced, so a double-tap/double-submit of the check-in
// button can never create two open shifts for the same user.
const UNIQUE_VIOLATION = "23505";

function isUniqueViolation(e: unknown): boolean {
  return typeof e === "object" && e !== null && "code" in e && (e as { code?: unknown }).code === UNIQUE_VIOLATION;
}

export async function checkIn(): Promise<WageContext> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  try {
    await db().sql`INSERT INTO work_sessions (user_id, check_in_at) VALUES (${userId}, now())`;
  } catch (e) {
    if (!isUniqueViolation(e)) throw e;
  }
  revalidatePath("/");
  return getWageContext();
}

export async function checkOut(): Promise<WageContext> {
  const userId = await getUserId();
  await requireActiveAccess(userId);

  // Atomically claim the open session: only one concurrent call can match
  // `check_out_at IS NULL` and flip it, so a double-tap of "tjek ud" can
  // never compute/store earnings twice for the same shift.
  const claimed = await db().sql<{ id: number; check_in_at: Date; check_out_at: Date }>`
    UPDATE work_sessions SET check_out_at = now()
    WHERE user_id = ${userId} AND check_out_at IS NULL
      AND id = (SELECT id FROM work_sessions WHERE user_id = ${userId} AND check_out_at IS NULL ORDER BY check_in_at DESC LIMIT 1)
    RETURNING id, check_in_at, check_out_at
  `;
  const session = claimed[0];

  if (session) {
    const config = toConfig(await getOrCreateWageSettingsRow(userId));
    await recomputePeriodSessions(userId, config);
    const checkInAt = new Date(session.check_in_at);
    const checkOutAt = new Date(session.check_out_at);
    const [weekSecondsBefore, periodBefore] = await Promise.all([
      priorWeekElapsedSeconds(userId, checkInAt),
      priorPeriodTotals(userId, checkInAt, config),
    ]);
    const thresholdHours = weeklyOvertimeThresholdHours(config);
    const { paidSeconds, grossAmount } = computeIntervalEarnings(checkInAt, checkOutAt, weekSecondsBefore, thresholdHours, config);
    const netAmount = netForIncrement(periodBefore.gross, periodBefore.paidSeconds, grossAmount, paidSeconds, config);

    await db().sql`
      UPDATE work_sessions SET paid_seconds = ${Math.round(paidSeconds)}, gross_amount = ${grossAmount}, net_amount = ${netAmount}
      WHERE id = ${session.id}
    `;
    await rebalancePeriodNetAmounts(userId, config);

    // Real Web Push, fired from the server so it reaches the lock screen
    // even with the app fully closed — the in-app toast/Notification-API
    // path in wage-card.tsx can't do that, it only runs while a tab/PWA
    // instance is actually open. Checked here (server-side, at checkout)
    // rather than client-side live, since that's the only place the app
    // reliably runs regardless of whether anyone has it open.
    const MILESTONE_STEP_KR = 1000;
    const nettoBefore = netForCumulative(periodBefore.gross, periodBefore.paidSeconds, config);
    const nettoAfter = netForCumulative(periodBefore.gross + grossAmount, periodBefore.paidSeconds + paidSeconds, config);
    const milestoneBefore = Math.floor(nettoBefore / MILESTONE_STEP_KR);
    const milestoneAfter = Math.floor(nettoAfter / MILESTONE_STEP_KR);
    if (milestoneAfter > milestoneBefore) {
      await sendPushToUser(userId, {
        title: `🎉 Du er over ${(milestoneAfter * MILESTONE_STEP_KR).toLocaleString("da-DK")} kr netto`,
        body: `Du har nu optjent ${formatKr(nettoAfter)} netto i denne lønperiode.`,
        tag: "milestone",
      });
    }

    // Weekly hour-count milestones (10t, 20t, 30t…) — same elapsed-seconds
    // basis the overtime threshold itself is measured against (includes the
    // unpaid break, excludes sygedage), so "du er på Xt" always lines up
    // with "ugens grænse er Yt" in the overtime message below.
    const HOUR_MILESTONE_STEP = 10;
    const shiftElapsedSeconds = (checkOutAt.getTime() - checkInAt.getTime()) / 1000;
    const weekHoursBefore = weekSecondsBefore / 3600;
    const weekHoursAfter = (weekSecondsBefore + shiftElapsedSeconds) / 3600;
    const hourMilestoneBefore = Math.floor(weekHoursBefore / HOUR_MILESTONE_STEP);
    const hourMilestoneAfter = Math.floor(weekHoursAfter / HOUR_MILESTONE_STEP);
    if (hourMilestoneAfter > hourMilestoneBefore) {
      for (let m = hourMilestoneBefore + 1; m <= hourMilestoneAfter; m++) {
        await sendPushToUser(userId, {
          title: `⏱️ Du har nu arbejdet ${m * HOUR_MILESTONE_STEP} timer denne uge`,
          body: `Du er på ${weekHoursAfter.toFixed(1)}t ud af ugens grænse på ${thresholdHours}t.`,
          tag: "hour-milestone",
        });
      }
    }

    const wasInOvertimeBefore = weekHoursBefore > thresholdHours;
    const isInOvertimeAfter = weekHoursAfter > thresholdHours;
    if (isInOvertimeAfter && !wasInOvertimeBefore) {
      const overtimeRate = config.hourlyRate * (1 + config.overtimeBonusPct);
      await sendPushToUser(userId, {
        title: "⏱️ Du gik i overtid",
        body: `Din seneste vagt krydsede ugens grænse på ${thresholdHours}t. Timelønnen i overtid er ${formatKr(overtimeRate)}/time.`,
        tag: "overtime",
      });
    }
  }

  revalidatePath("/");
  return getWageContext();
}

export async function undoLastCheckOut(): Promise<ActionResult<WageContext>> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const rows = await db().sql<SessionRow>`
    SELECT * FROM work_sessions
    WHERE user_id = ${userId} AND check_out_at IS NOT NULL AND is_sick_day = false
    ORDER BY check_out_at DESC LIMIT 1
  `;
  const lastClosed = rows[0];
  if (!lastClosed?.check_out_at || Date.now() - new Date(lastClosed.check_out_at).getTime() > UNDO_CHECKOUT_WINDOW_MS) {
    return fail("Der er ikke noget nyligt tjek ud at fortryde.");
  }

  const reopenRows = await db().sql<{ id: number }>`
    SELECT id FROM work_sessions WHERE user_id = ${userId} AND check_out_at IS NULL AND id != ${lastClosed.id}
    ORDER BY check_in_at DESC LIMIT 1
  `;
  if (reopenRows[0]) {
    await db().sql`DELETE FROM work_sessions WHERE id = ${reopenRows[0].id}`;
  }
  await db().sql`UPDATE work_sessions SET check_out_at = NULL, paid_seconds = NULL, gross_amount = NULL, net_amount = NULL WHERE id = ${lastClosed.id}`;

  const config = toConfig(await getOrCreateWageSettingsRow(userId));
  await rebalancePeriodNetAmounts(userId, config);
  revalidatePath("/");
  return ok(await getWageContext());
}

export async function updateCheckInTime(newCheckInAt: Date): Promise<WageContext> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const rows = await db().sql<{ id: number }>`SELECT id FROM work_sessions WHERE user_id = ${userId} AND check_out_at IS NULL LIMIT 1`;
  if (rows[0]) {
    const now = new Date();
    const clamped = newCheckInAt > now ? now : newCheckInAt;
    await db().sql`UPDATE work_sessions SET check_in_at = ${clamped} WHERE id = ${rows[0].id}`;
  }
  revalidatePath("/");
  return getWageContext();
}

// ─────────────────────────────────────────────────────────────
// SYGEDAGE
// ─────────────────────────────────────────────────────────────

export type DayAttendance = {
  dateKey: string;
  weekday: number;
  label: string;
  isWeekend: boolean;
  status: "worked" | "sick" | "open" | "none";
  sessionId: number | null;
  checkInAt: string | null;
  checkOutAt: string | null;
};

export type WeekAttendance = { weekStart: string; weekEnd: string; days: DayAttendance[] };

export async function getWeekAttendance(referenceDate: Date = new Date()): Promise<WeekAttendance> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const { start, end } = getWeekRange(referenceDate);
  const sessions = await db().sql<SessionRow>`
    SELECT * FROM work_sessions WHERE user_id = ${userId} AND check_in_at >= ${start} AND check_in_at <= ${end}
    ORDER BY check_in_at ASC
  `;

  const byDay = new Map<string, SessionRow>();
  for (const s of sessions) {
    const key = copenhagenDayKey(new Date(s.check_in_at));
    if (!byDay.has(key)) byDay.set(key, s);
  }

  const WEEKDAYS_SHORT_DA = ["søn", "man", "tir", "ons", "tor", "fre", "lør"];
  const days: DayAttendance[] = [];
  for (let i = 0; i < 7; i++) {
    // addCalendarDays, not `d.setDate(start.getDate() + i)` — that reads/
    // writes the day-of-month in the server runtime's own timezone (UTC),
    // which only happens to agree with the Danish calendar day here because
    // Danish DST always flips on a Sunday, late enough that a Monday-start
    // week's boundary day is never split across the transition. Still worth
    // using the zone-aware helper so this doesn't quietly break if the week
    // start convention or DST rules ever change.
    const d = addCalendarDays(start, i);
    const key = copenhagenDayKey(d);
    const session = byDay.get(key);
    const weekday = copenhagenWeekday(d);
    let status: DayAttendance["status"] = "none";
    if (session) status = session.is_sick_day ? "sick" : session.check_out_at ? "worked" : "open";
    days.push({
      dateKey: key,
      weekday,
      label: WEEKDAYS_SHORT_DA[weekday],
      isWeekend: weekday === 0 || weekday === 6,
      status,
      sessionId: session?.id ?? null,
      checkInAt: session ? new Date(session.check_in_at).toISOString() : null,
      checkOutAt: session?.check_out_at ? new Date(session.check_out_at).toISOString() : null,
    });
  }

  return { weekStart: start.toISOString(), weekEnd: end.toISOString(), days };
}

export async function addSickDay(dateKey: string, startTime: string, endTime: string): Promise<ActionResult> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const [y, m, d] = dateKey.split("-").map(Number);
  const [sh, sm] = startTime.split(":").map(Number);
  const [eh, em] = endTime.split(":").map(Number);
  // zonedDateTime, not `new Date(y, m-1, d, h, m)` — this runs as a server
  // action, and a plain Date constructor reads h/m in the server runtime's
  // own timezone (UTC on Netlify), not Danish local, which would store the
  // sick shift 1-2 hours later than the time actually picked in the UI.
  const checkInAt = zonedDateTime(y, m, d, sh, sm);
  const checkOutAt = zonedDateTime(y, m, d, eh, em);
  if (!(checkOutAt > checkInAt)) return fail("Sluttid skal være efter starttid.");

  const dayStart = startOfDay(checkInAt);
  const dayEnd = endOfDay(checkInAt);
  const existing = await db().sql<{ id: number }>`
    SELECT id FROM work_sessions WHERE user_id = ${userId} AND check_in_at >= ${dayStart} AND check_in_at <= ${dayEnd}
  `;
  if (existing.length > 0) return fail("Der er allerede en registrering denne dag — slet den først, hvis den er forkert.");

  const config = toConfig(await getOrCreateWageSettingsRow(userId));
  const { paidSeconds, grossAmount } = computeSickDayEarnings(checkInAt, checkOutAt, config.sickPayHourlyRate, config);
  const periodBefore = await priorPeriodTotals(userId, checkInAt, config);
  const netAmount = netForIncrement(periodBefore.gross, periodBefore.paidSeconds, grossAmount, paidSeconds, config);

  await db().sql`
    INSERT INTO work_sessions (user_id, check_in_at, check_out_at, paid_seconds, gross_amount, net_amount, is_sick_day)
    VALUES (${userId}, ${checkInAt}, ${checkOutAt}, ${Math.round(paidSeconds)}, ${grossAmount}, ${netAmount}, true)
  `;
  await rebalancePeriodNetAmounts(userId, config);
  revalidatePath("/uge");
  revalidatePath("/");
  return ok(undefined);
}

export type SickDayEntry = { id: number; checkInAt: string; checkOutAt: string; hours: number; grossAmount: number; netAmount: number };

export async function getSickDays(): Promise<SickDayEntry[]> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const rows = await db().sql<SessionRow>`
    SELECT * FROM work_sessions WHERE user_id = ${userId} AND is_sick_day = true ORDER BY check_in_at DESC
  `;
  return rows.map((r) => ({
    id: r.id,
    checkInAt: new Date(r.check_in_at).toISOString(),
    checkOutAt: new Date(r.check_out_at!).toISOString(),
    hours: (r.paid_seconds ?? 0) / 3600,
    grossAmount: r.gross_amount ?? 0,
    netAmount: r.net_amount ?? 0,
  }));
}

export async function deleteSickDay(id: number): Promise<void> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  await db().sql`DELETE FROM work_sessions WHERE id = ${id} AND user_id = ${userId} AND is_sick_day = true`;
  const config = toConfig(await getOrCreateWageSettingsRow(userId));
  await rebalancePeriodNetAmounts(userId, config);
  revalidatePath("/uge");
  revalidatePath("/");
}

// ─────────────────────────────────────────────────────────────
// UGE-OVERBLIK
// ─────────────────────────────────────────────────────────────

export type WeekHoursDay = { id: number; checkInAt: string; checkOutAt: string | null; hours: number; isSickDay: boolean; isOpen: boolean };
export type WeekHoursSummary = { weekStart: string; weekEnd: string; days: WeekHoursDay[]; totalHours: number; sickHours: number };

export async function getWeekHours(referenceDate: Date = new Date()): Promise<WeekHoursSummary> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const { start, end } = getWeekRange(referenceDate);
  const sessions = await db().sql<SessionRow>`
    SELECT * FROM work_sessions WHERE user_id = ${userId} AND check_in_at >= ${start} AND check_in_at <= ${end}
    ORDER BY check_in_at ASC
  `;

  const now = Date.now();
  const days: WeekHoursDay[] = sessions.map((s) => {
    const isOpen = !s.check_out_at;
    const hours = isOpen ? (now - new Date(s.check_in_at).getTime()) / 3600000 : (s.paid_seconds ?? 0) / 3600;
    return {
      id: s.id,
      checkInAt: new Date(s.check_in_at).toISOString(),
      checkOutAt: s.check_out_at ? new Date(s.check_out_at).toISOString() : null,
      hours,
      isSickDay: s.is_sick_day,
      isOpen,
    };
  });

  // "Timer denne uge" skal afspejle faktisk ARBEJDET tid, ikke betalte
  // sygetimer — ellers ser ugen ud til at have flere arbejdstimer, end man
  // reelt har stået op og arbejdet. Sygetimer holdes adskilt i sickHours,
  // de vises allerede for sig i sygedage-listen på "Din uge".
  const worked = days.filter((d) => !d.isSickDay);
  const sick = days.filter((d) => d.isSickDay);
  return {
    weekStart: start.toISOString(),
    weekEnd: end.toISOString(),
    days,
    totalHours: worked.reduce((sum, d) => sum + d.hours, 0),
    sickHours: sick.reduce((sum, d) => sum + d.hours, 0),
  };
}

// ─────────────────────────────────────────────────────────────
// TIDLIGERE TIMER (opsamling fra før du skiftede til denne app)
// ─────────────────────────────────────────────────────────────

export type HistoricalWeek = {
  id: number;
  weekStart: string;
  hours: number;
  grossAmount: number;
  netAmount: number;
  inPeriod: boolean;
};

// Allerede-arbejdede, fuldt afsluttede uger logget som ét samlet timetal (uden
// tjek-ind/ud) — til at bygge bro fra "jeg skiftede app midt i en lønperiode"
// til nu. Holdt adskilt (is_manual_entry) så den er synlig/slettelig for sig.
// Log kun uger der allerede er helt færdige — den igangværende uge skal du
// tjekke ind/ud til som normalt.
export async function getHistoricalWeeks(): Promise<HistoricalWeek[]> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const [rows, config] = await Promise.all([
    db().sql<SessionRow>`SELECT * FROM work_sessions WHERE user_id = ${userId} AND is_manual_entry = true ORDER BY check_in_at ASC`,
    getWageSettings(),
  ]);
  const { start, end } = getPayPeriodRange(config);
  return rows.map((r) => ({
    id: r.id,
    weekStart: new Date(r.check_in_at).toISOString(),
    hours: (r.paid_seconds ?? 0) / 3600,
    grossAmount: r.gross_amount ?? 0,
    netAmount: r.net_amount ?? 0,
    inPeriod: new Date(r.check_in_at) >= start && new Date(r.check_in_at) < end,
  }));
}

export async function logHistoricalWeek(weekOf: Date, hours: number): Promise<ActionResult> {
  if (!(hours > 0)) return fail("Antal timer skal være positivt.");
  const userId = await getUserId();
  await requireActiveAccess(userId);
  const { start, end } = getWeekRange(weekOf);

  const existing = await db().sql<{ id: number }>`
    SELECT id FROM work_sessions WHERE user_id = ${userId} AND check_in_at >= ${start} AND check_in_at <= ${end}
  `;
  if (existing.length > 0) return fail("Der er allerede registreret arbejde i denne uge.");

  const config = toConfig(await getOrCreateWageSettingsRow(userId));
  const [weekSecondsBefore, periodBefore] = await Promise.all([
    priorWeekElapsedSeconds(userId, start),
    priorPeriodTotals(userId, start, config),
  ]);
  const { paidSeconds, grossAmount } = computeWeekGrossFromHours(hours, weekSecondsBefore, config);
  const netAmount = netForIncrement(periodBefore.gross, periodBefore.paidSeconds, grossAmount, paidSeconds, config);

  await db().sql`
    INSERT INTO work_sessions (user_id, check_in_at, check_out_at, paid_seconds, gross_amount, net_amount, is_manual_entry)
    VALUES (${userId}, ${start}, ${new Date(start.getTime() + paidSeconds * 1000)}, ${Math.round(paidSeconds)}, ${grossAmount}, ${netAmount}, true)
  `;
  await rebalancePeriodNetAmounts(userId, config);
  revalidatePath("/indstillinger");
  revalidatePath("/");
  return ok(undefined);
}

export async function deleteHistoricalWeek(id: number): Promise<void> {
  const userId = await getUserId();
  await requireActiveAccess(userId);
  await db().sql`DELETE FROM work_sessions WHERE id = ${id} AND user_id = ${userId} AND is_manual_entry = true`;
  const config = toConfig(await getOrCreateWageSettingsRow(userId));
  await rebalancePeriodNetAmounts(userId, config);
  revalidatePath("/indstillinger");
  revalidatePath("/");
}
