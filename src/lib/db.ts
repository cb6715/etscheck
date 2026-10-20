import { getDatabase } from "@netlify/database";

// On Netlify, @netlify/database auto-resolves NETLIFY_DB_URL. Locally (or
// anywhere NETLIFY_DB_URL isn't injected) we fall back to a plain
// DATABASE_URL, same convention as every other app in this account.
//
// A PREVIOUS version of this file cached a single getDatabase() client for
// the whole lifetime of the server process, to avoid opening a fresh
// pg.Pool on every query. That traded one bug for a worse one in
// production: Netlify's serverless functions reuse a "warm" process across
// requests, and Neon's Postgres closes idle connections after a period of
// inactivity — so after any quiet stretch, the FIRST query on that cached,
// now-stale connection failed outright (surfacing as the dashboard's "Kunne
// ikke indlæse løndata" state, which is why it only ever worked after
// clicking the manual reload). A fresh client per call avoids that
// entirely; the "too many clients" issue this was trying to fix only ever
// showed up under an artificial rapid-fire test scenario, not real usage.
export function db() {
  const connectionString = process.env.NETLIFY_DB_URL || process.env.DATABASE_URL;
  return connectionString ? getDatabase({ connectionString }) : getDatabase();
}

// The type of one db() client — passed explicitly through call chains (see
// actions.ts, live-push-tick.ts) so a single request/tick reuses ONE
// connection across its several queries instead of opening a fresh one per
// query. Never cached/reused ACROSS requests — see the comment above.
export type DbClient = ReturnType<typeof db>;
