// Server-only: sends real Web Push notifications via VAPID, so a message
// can reach the user's lock screen even when WageFlow isn't open anywhere.
// The browser Notification API (src/lib/notify.ts) can only show something
// while a tab/PWA instance is actually running — this is the other half,
// triggered from server actions instead of client effects.
import webpush from "web-push";

function vapidConfigured(): boolean {
  return Boolean(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

let vapidReady = false;
function ensureVapid(): void {
  if (vapidReady || !vapidConfigured()) return;
  webpush.setVapidDetails("mailto:support@neurix.dk", process.env.VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  vapidReady = true;
}

export type PushSubscriptionRow = { endpoint: string; p256dh: string; auth: string };
export type PushPayload = { title: string; body: string; tag?: string; url?: string };

/** Sends to one subscription. "gone" means the push service rejected it as
 * expired/revoked (HTTP 404/410) — the caller should delete that row so it
 * doesn't keep failing forever. */
export async function sendToSubscription(sub: PushSubscriptionRow, payload: PushPayload): Promise<"sent" | "gone" | "unconfigured" | "error"> {
  if (!vapidConfigured()) return "unconfigured";
  ensureVapid();
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: { p256dh: sub.p256dh, auth: sub.auth } },
      JSON.stringify(payload)
    );
    return "sent";
  } catch (e: unknown) {
    const statusCode = typeof e === "object" && e !== null && "statusCode" in e ? (e as { statusCode?: number }).statusCode : undefined;
    if (statusCode === 404 || statusCode === 410) return "gone";
    console.error("Web push send failed:", e);
    return "error";
  }
}
