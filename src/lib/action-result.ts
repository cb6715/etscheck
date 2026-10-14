// Next.js redacts the .message of a thrown Error that crosses the Server
// Function boundary in production (replaced with a generic "An error
// occurred..." sentence — by design, to avoid leaking server internals).
// That's correct for genuinely unexpected errors, but it also silently
// swallows our own deliberate, user-facing validation messages ("Forkert
// adgangskode", "Der er allerede en registrering denne dag", ...).
// Expected/validation failures are therefore modeled as a return value
// instead of a throw, per Next's own guidance — only a true throw (a bug,
// a DB outage) should ever hit that generic fallback.
export type ActionResult<T = void> = { ok: true; data: T } | { ok: false; error: string };

export function ok<T>(data: T): ActionResult<T> {
  return { ok: true, data };
}

export function fail(error: string): ActionResult<never> {
  return { ok: false, error };
}
