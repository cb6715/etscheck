// The piece that was actually missing for "notify me the moment I cross
// 10 timer, even with my phone locked": every previous version of the
// hour/kr-milestone and overtime push only ever fired from code that ran
// because SOMETHING ELSE was already happening — checkOut(), or the client
// noticing a live change while the app itself was open. Neither runs while
// you're mid-shift with the app closed, so nothing could ever fire then.
//
// This is the server-side equivalent of the sibling app's push-tick.mts —
// a Netlify Scheduled Function (see netlify/functions/push-tick.mts) calls
// runLiveMilestoneTick() on a timer, completely independent of whether
// anyone, anywhere, has the app open. It loops every currently OPEN shift
// across every account, recomputes the same live weekHoursNow/netto/
// overtime figures the dashboard itself shows, and compares them against
// live_hour_milestone/live_kr_milestone/live_overtime_notified on
// wage_settings (see the live_milestone_state migration) to tell a
// genuinely NEW crossing apart from one it already pushed for.
// Relative imports, not "@/lib/..." — see engine.ts's import comment: this
// whole module is reachable from the standalone Netlify Scheduled Function,
// bundled outside Next's own build.
import { db } from "./db";
import { weeklyOvertimeThresholdHours, computeIntervalEarnings, netForCumulative } from "./engine";
import { toConfig, priorWeekElapsedSeconds, priorPeriodTotals, sendPushToUser, type WageSettingsRow } from "./wage-internal";

const HOUR_MILESTONE_STEP = 10;
const KR_MILESTONE_STEP = 1000;

type OpenSessionRow = { user_id: number; check_in_at: Date };
type LiveWageSettingsRow = WageSettingsRow & {
  live_hour_milestone: number;
  live_kr_milestone: number;
  live_overtime_notified: boolean;
};

export type TickResult = { openSessions: number; notificationsSent: number };

export async function runLiveMilestoneTick(): Promise<TickResult> {
  // One client for the whole tick — every open session's queries below
  // reuse this same connection instead of each opening its own, same
  // reasoning as actions.ts's per-request client.
  const client = db();
  const now = new Date();
  const openSessions = await client.sql<OpenSessionRow>`
    SELECT user_id, check_in_at FROM work_sessions WHERE check_out_at IS NULL
  `;

  let notificationsSent = 0;

  for (const session of openSessions) {
    const checkInAt = new Date(session.check_in_at);
    const [settingsRow] = await client.sql<LiveWageSettingsRow>`SELECT * FROM wage_settings WHERE user_id = ${session.user_id}`;
    if (!settingsRow) continue;

    const config = toConfig(settingsRow);
    const thresholdHours = weeklyOvertimeThresholdHours(config);
    const [weekSecondsBefore, periodBefore] = await Promise.all([
      priorWeekElapsedSeconds(client, session.user_id, checkInAt),
      priorPeriodTotals(client, session.user_id, checkInAt, config),
    ]);

    const { paidSeconds: liveShiftPaidSeconds, grossAmount: liveShiftGross } = computeIntervalEarnings(
      checkInAt,
      now,
      weekSecondsBefore,
      thresholdHours,
      config
    );
    const weekHoursNow = (weekSecondsBefore + (now.getTime() - checkInAt.getTime()) / 1000) / 3600;
    const nettoNow = netForCumulative(
      periodBefore.gross + liveShiftGross,
      periodBefore.paidSeconds + liveShiftPaidSeconds,
      config
    );
    const isOvertimeNow = weekHoursNow > thresholdHours;

    const currentHourMilestone = Math.floor(weekHoursNow / HOUR_MILESTONE_STEP);
    const currentKrMilestone = Math.floor(nettoNow / KR_MILESTONE_STEP);

    if (currentHourMilestone > settingsRow.live_hour_milestone) {
      for (let m = settingsRow.live_hour_milestone + 1; m <= currentHourMilestone; m++) {
        await sendPushToUser(client, session.user_id, {
          title: `⏱️ Du har nu arbejdet ${m * HOUR_MILESTONE_STEP} timer denne uge`,
          body: `Du er på ${weekHoursNow.toFixed(1)}t ud af ugens grænse på ${thresholdHours}t.`,
          tag: "hour-milestone",
        });
        notificationsSent++;
      }
    }

    if (currentKrMilestone > settingsRow.live_kr_milestone) {
      for (let m = settingsRow.live_kr_milestone + 1; m <= currentKrMilestone; m++) {
        await sendPushToUser(client, session.user_id, {
          title: `🎉 Du er over ${(m * KR_MILESTONE_STEP).toLocaleString("da-DK")} kr netto`,
          body: `Du har nu optjent over ${(m * KR_MILESTONE_STEP).toLocaleString("da-DK")} kr netto i denne lønperiode.`,
          tag: "milestone",
        });
        notificationsSent++;
      }
    }

    if (isOvertimeNow && !settingsRow.live_overtime_notified) {
      const overtimeRate = config.hourlyRate * (1 + config.overtimeBonusPct);
      await sendPushToUser(client, session.user_id, {
        title: "⏱️ Du er gået i overtid",
        body: `Din timeløn er nu ${overtimeRate.toLocaleString("da-DK", { minimumFractionDigits: 2, maximumFractionDigits: 2 })} kr/time.`,
        tag: "overtime",
      });
      notificationsSent++;
    }

    // Always written back, not just on a crossing — this is also what lets
    // a new week/period "reset" the counters down without that downward
    // transition itself being treated as a crossing worth notifying about.
    await client.sql`
      UPDATE wage_settings
      SET live_hour_milestone = ${currentHourMilestone}, live_kr_milestone = ${currentKrMilestone}, live_overtime_notified = ${isOvertimeNow}
      WHERE user_id = ${session.user_id}
    `;
  }

  return { openSessions: openSessions.length, notificationsSent };
}
