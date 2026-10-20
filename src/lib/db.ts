import { getDatabase } from "@netlify/database";

// On Netlify, @netlify/database auto-resolves NETLIFY_DB_URL. Locally (or
// anywhere NETLIFY_DB_URL isn't injected) we fall back to a plain
// DATABASE_URL, same convention as every other app in this account.
//
// getDatabase() itself allocates a brand new `pg.Pool` every time it's
// called — it does NOT pool/reuse connections across calls. db() used to
// call it fresh on every single query, which is normally fine under light,
// sequential traffic but falls over under real concurrent load: each call
// opens its own pool (and its own live Postgres connection) that isn't
// explicitly closed, so a page that fires several queries in quick
// succession — e.g. generateMonthFromTemplate's per-day loop, or several
// users hitting the app at once — can rack up enough simultaneous
// connections to hit Postgres's max_connections and fail with "sorry, too
// many clients already". Caught locally while exercising the new
// Planlægning flow end-to-end. Memoizing a single client here, reused for
// the lifetime of this server process/function instance, is the same fix
// every other Node Postgres pooling guide recommends — one shared pool
// instead of one pool per call.
let cachedClient: ReturnType<typeof getDatabase> | undefined;

export function db() {
  if (cachedClient) return cachedClient;
  const connectionString = process.env.NETLIFY_DB_URL || process.env.DATABASE_URL;
  cachedClient = connectionString ? getDatabase({ connectionString }) : getDatabase();
  return cachedClient;
}
