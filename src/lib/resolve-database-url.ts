/**
 * Resolves the Postgres connection string across environments:
 * - Local dev / anywhere DATABASE_URL is set explicitly (.env): use it as-is.
 * - Netlify, once Netlify DB (Neon, auto-provisioned via @netlify/database) is
 *   attached to the site: falls back to the env vars Netlify injects for it.
 * - Otherwise: a harmless placeholder, so PrismaClient can always construct
 *   (e.g. during `next build`'s module evaluation) without a real database
 *   configured yet. Actual queries will fail at runtime until one is wired up.
 */
export function resolveDatabaseUrl(): string {
  return (
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL_UNPOOLED ||
    process.env.NEON_DATABASE_URL ||
    process.env.POSTGRES_URL ||
    "postgresql://placeholder:placeholder@localhost:5432/placeholder"
  );
}
