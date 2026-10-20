// Shared, session-free DB helpers reused by BOTH actions.ts (the "use
// server" action file, where every export becomes a client-callable RPC
// endpoint) and netlify/functions/push-tick.mts (a Netlify Scheduled
// Function, which has no request/cookie context at all — it can't call
// getUserId()/requireActiveAccess the way a normal action does, and it has
// to loop over EVERY user with an open shift, not just "the current
// session's user").
//
// None of these take a request context; `userId` is passed in explicitly
// by whichever caller already knows who it's asking about. That's exactly
// why none of them may ever be exported from actions.ts itself: an
// exported async function in a "use server" file becomes a public RPC any
// client can call with an arbitrary userId, and none of these do their own
// ownership check — priorWeekElapsedSeconds/priorPeriodTotals would leak
// another user's hours, and sendPushToUser would let anyone push arbitrary
// notification text to any other user's devices. They're safe ONLY because
// nothing in this file is reachable from the client — every real caller
// (actions.ts's own exports, the scheduled function) does its own
// userId resolution/ownership check before ever reaching these.
// Relative imports throughout this file, not "@/lib/..." — see the
// comment on engine.ts's own import for why: this file is reachable from
// the standalone Netlify Scheduled Function, bundled outside Next's build.
import type { DbClient } from "./db";
import { getWeekRange, startOfDay } from "./date";
import { getPayPeriodRange, type WageConfig } from "./engine";
import { sendToSubscription, type PushSubscriptionRow } from "./push";

export type WageSettingsRow = {
  hourly_rate: number;
  overtime_threshold_hours: number;
  overtime_bonus_pct: number;
  night_supplement: number;
  night_start_hour: number;
  night_end_hour: number;
  weekend_supplement: number;
  holiday_supplement: number;
  break_start_minutes: number;
  break_end_minutes: number;
  monthly_tax_deduction: number;
  am_bidrag_pct: number;
  tax_rate_pct: number;
  atp_rate_per_hour: number;
  sick_pay_hourly_rate: number;
  advance_amount: number;
  pay_period_start: Date;
  pay_period_end: Date;
  work_days_per_week: number;
};

export function toConfig(row: WageSettingsRow): WageConfig {
  return {
    hourlyRate: row.hourly_rate,
    overtimeThresholdHours: row.overtime_threshold_hours,
    overtimeBonusPct: row.overtime_bonus_pct,
    nightSupplement: row.night_supplement,
    nightStartHour: row.night_start_hour,
    nightEndHour: row.night_end_hour,
    weekendSupplement: row.weekend_supplement,
    holidaySupplement: row.holiday_supplement,
    breakStartMinutes: row.break_start_minutes,
    breakEndMinutes: row.break_end_minutes,
    monthlyTaxDeduction: row.monthly_tax_deduction,
    amBidragPct: row.am_bidrag_pct,
    taxRatePct: row.tax_rate_pct,
    atpRatePerHour: row.atp_rate_per_hour,
    sickPayHourlyRate: row.sick_pay_hourly_rate,
    advanceAmount: row.advance_amount,
    payPeriodStart: new Date(row.pay_period_start),
    payPeriodEnd: new Date(row.pay_period_end),
    workDaysPerWeek: row.work_days_per_week,
  };
}

export async function priorWeekElapsedSeconds(client: DbClient, userId: number, before: Date): Promise<number> {
  const { start } = getWeekRange(before);
  const rows = await client.sql<{ check_in_at: Date; check_out_at: Date }>`
    SELECT check_in_at, check_out_at FROM work_sessions
    WHERE user_id = ${userId} AND check_out_at IS NOT NULL AND is_sick_day = false
      AND check_in_at >= ${start} AND check_in_at < ${before}
  `;
  return rows.reduce((sum, r) => sum + (new Date(r.check_out_at).getTime() - new Date(r.check_in_at).getTime()) / 1000, 0);
}

// Paid seconds already worked TODAY (Danish calendar day), from closed,
// real sessions strictly before `before` — the baseline the live "timer i
// dag" display adds the open session's live ticking seconds to, same
// pattern as priorPeriodTotals for the kr figure.
export async function priorTodayPaidSeconds(client: DbClient, userId: number, before: Date): Promise<number> {
  const dayStart = startOfDay(before);
  const rows = await client.sql<{ paid_seconds: number | null }>`
    SELECT paid_seconds FROM work_sessions
    WHERE user_id = ${userId} AND check_out_at IS NOT NULL AND is_sick_day = false
      AND check_in_at >= ${dayStart} AND check_in_at < ${before}
  `;
  return rows.reduce((sum, r) => sum + (r.paid_seconds ?? 0), 0);
}

export async function priorPeriodTotals(
  client: DbClient,
  userId: number,
  before: Date,
  config: WageConfig
): Promise<{ gross: number; paidSeconds: number }> {
  const { start, end } = getPayPeriodRange(config);
  const windowEnd = before < end ? before : end;
  const rows = await client.sql<{ gross_amount: number | null; paid_seconds: number | null }>`
    SELECT gross_amount, paid_seconds FROM work_sessions
    WHERE user_id = ${userId} AND check_out_at IS NOT NULL
      AND check_in_at >= ${start} AND check_in_at < ${windowEnd}
  `;
  return rows.reduce(
    (acc, r) => ({ gross: acc.gross + (r.gross_amount ?? 0), paidSeconds: acc.paidSeconds + (r.paid_seconds ?? 0) }),
    { gross: 0, paidSeconds: 0 }
  );
}

export async function sendPushToUser(
  client: DbClient,
  userId: number,
  payload: { title: string; body: string; tag?: string; url?: string }
): Promise<void> {
  const subs = await client.sql<PushSubscriptionRow>`SELECT endpoint, p256dh, auth FROM push_subscriptions WHERE user_id = ${userId}`;
  for (const sub of subs) {
    const result = await sendToSubscription(sub, payload);
    if (result === "gone") {
      await client.sql`DELETE FROM push_subscriptions WHERE endpoint = ${sub.endpoint}`;
    }
  }
}
