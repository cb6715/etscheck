"use client";

// Thin wrapper around the browser Notification API. Native OS notifications
// from THIS file only fire with the user's explicit permission and only
// while the app is running somewhere (a foreground or backgrounded tab/PWA
// instance) — this is NOT push-from-a-closed-app. For that, see the Web
// Push section further down (subscribeToPush), backed by public/sw.js and
// sendPushToUser in actions.ts. The in-app toast (see ToastProvider) is the
// reliable fallback that always works regardless of permission state.
export function notificationsSupported(): boolean {
  return typeof window !== "undefined" && "Notification" in window;
}

export function notificationPermission(): NotificationPermission | "unsupported" {
  if (!notificationsSupported()) return "unsupported";
  return Notification.permission;
}

export async function requestNotificationPermission(): Promise<NotificationPermission | "unsupported"> {
  if (!notificationsSupported()) return "unsupported";
  if (Notification.permission !== "default") return Notification.permission;
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function fireNativeNotification(title: string, body: string): void {
  if (!notificationsSupported() || Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/icon-192.png", badge: "/icon-192.png", tag: title });
  } catch {
    // Some mobile browsers only allow this via a service worker registration
    // even with permission granted — fail silently, the in-app toast already covered it.
  }
}

// ─────────────────────────────────────────────────────────────
// WEB PUSH — reaches the lock screen with the app fully closed, unlike
// everything above this line. Requires a service worker (public/sw.js)
// registered and a subscription saved server-side (see savePushSubscription
// in actions.ts); the server then sends through that subscription whenever
// something notification-worthy happens (see sendPushToUser in actions.ts).
// On iOS this additionally requires the app to be installed to the home
// screen (Safari share sheet → "Føj til hjemmeskærm") — Safari does not
// support Web Push for an ordinary browser tab, only for an installed PWA,
// and only from iOS 16.4 onward. That step can only be done by the person
// on their own device; nothing server-side can skip it.
function urlBase64ToUint8Array(base64String: string): Uint8Array {
  const padding = "=".repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = atob(base64);
  return Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)));
}

export function pushSupported(): boolean {
  return typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window;
}

/** Registers the service worker, subscribes to push, and returns a plain
 * object ready to hand to the savePushSubscription server action — or null
 * if push isn't supported here (desktop-without-SW, or VAPID key missing). */
export async function subscribeToPush(): Promise<{ endpoint: string; keys: { p256dh: string; auth: string } } | null> {
  const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
  if (!pushSupported() || !vapidKey) return null;

  const registration = await navigator.serviceWorker.register("/sw.js");
  await navigator.serviceWorker.ready;

  let subscription = await registration.pushManager.getSubscription();
  if (!subscription) {
    subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidKey) as BufferSource,
    });
  }

  const json = subscription.toJSON();
  if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) return null;
  return { endpoint: json.endpoint, keys: { p256dh: json.keys.p256dh, auth: json.keys.auth } };
}
