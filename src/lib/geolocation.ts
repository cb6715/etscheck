"use client";

// Honest, foreground-only "er jeg på arbejde?" distance check. There is NO
// background location tracking here, and there never can be reliably for a
// web app/PWA — iOS and Android only grant a web page's Geolocation API
// access while that page is open and in the foreground (a PWA installed to
// the home screen does not change this). This deliberately does not try to
// pretend otherwise: it's a one-shot check the user explicitly triggers
// (e.g. a button), not a silent watcher.

export type GeoCheckResult =
  | { status: "unsupported" }
  | { status: "denied" }
  | { status: "error"; message: string }
  | { status: "ok"; lat: number; lng: number; accuracyMeters: number };

export function geolocationSupported(): boolean {
  return typeof navigator !== "undefined" && "geolocation" in navigator;
}

/** One-shot read of the browser's current position. Must be called from
 * user-initiated code (a click handler) for the permission prompt to
 * reliably appear on iOS Safari — same transient-activation rule as the
 * push-notification subscribe flow elsewhere in this app. */
export function getCurrentPosition(): Promise<GeoCheckResult> {
  if (!geolocationSupported()) return Promise.resolve({ status: "unsupported" });
  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ status: "ok", lat: pos.coords.latitude, lng: pos.coords.longitude, accuracyMeters: pos.coords.accuracy }),
      (err) => {
        if (err.code === err.PERMISSION_DENIED) resolve({ status: "denied" });
        else resolve({ status: "error", message: err.message });
      },
      { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
    );
  });
}

/** Haversine great-circle distance in meters — accurate enough for a
 * "am I within N meters of this address" check at city scale. */
export function distanceMeters(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371000;
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

export type WorkplaceProximity = {
  workplaceId: number;
  workplaceName: string;
  distanceMeters: number;
  withinRadius: boolean;
};

/** Ranks every workplace that has coordinates saved by distance to
 * `lat`/`lng`, nearest first. Workplaces with no saved coordinates (never
 * captured via "brug min nuværende placering") are left out — there's
 * nothing to compare against. */
export function nearestWorkplaces(
  lat: number,
  lng: number,
  workplaces: { id: number; name: string; lat: number | null; lng: number | null; radius_meters: number }[]
): WorkplaceProximity[] {
  return workplaces
    .filter((w) => w.lat !== null && w.lng !== null)
    .map((w) => {
      const d = distanceMeters(lat, lng, w.lat as number, w.lng as number);
      return { workplaceId: w.id, workplaceName: w.name, distanceMeters: d, withinRadius: d <= w.radius_meters };
    })
    .sort((a, b) => a.distanceMeters - b.distanceMeters);
}
