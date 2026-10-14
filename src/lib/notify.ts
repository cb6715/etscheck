"use client";

// Thin wrapper around the browser Notification API. Native OS notifications
// only fire with the user's explicit permission and only while the app is
// running somewhere (a foreground or backgrounded tab/PWA instance) — this
// is NOT push-from-a-closed-app; that needs a service worker + a server
// that can wake it, which this app doesn't have. The in-app toast (see
// ToastProvider) is the reliable fallback that always works regardless of
// permission state.
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
