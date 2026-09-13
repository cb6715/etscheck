/**
 * Resolves the Postgres connection string across environments:
 * - Local dev / anywhere DATABASE_URL is set explicitly (.env): use it as-is.
 * - Netlify, once Netlify DB (Neon, auto-provisioned via @netlify/database) is
 *   attached to the site: falls back to the env vars Netlify injects for it.
 */
export function resolveDatabaseUrl(): string | undefined {
  return (
    process.env.DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL ||
    process.env.NETLIFY_DATABASE_URL_UNPOOLED
  );
}
