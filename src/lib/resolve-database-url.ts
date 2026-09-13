import { getConnectionString } from "@netlify/database";

const PLACEHOLDER_DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";

/**
 * Resolves the Postgres connection string across environments:
 * - Local dev / anywhere DATABASE_URL is set explicitly (.env): use it as-is.
 * - Deployed on Netlify with Netlify DB (Neon) attached: it does not expose a
 *   plain environment variable — @netlify/database's getConnectionString()
 *   resolves the live binding instead (this only works inside the deployed
 *   function's runtime, not during the build).
 * - Otherwise: a harmless placeholder, so PrismaClient can always construct
 *   (e.g. during `next build`'s module evaluation) without a real database
 *   configured yet. Actual queries will fail at runtime until one is wired up.
 */
export function resolveDatabaseUrl(): string {
  if (process.env.DATABASE_URL) return process.env.DATABASE_URL;

  try {
    const url = getConnectionString();
    if (url) return url;
  } catch {
    // Not running inside a Netlify DB-enabled environment (plain local dev,
    // or the build step, where this binding isn't available) — fall through.
  }

  return PLACEHOLDER_DATABASE_URL;
}
