import { getDatabase } from "@netlify/database";

// On Netlify, @netlify/database auto-resolves NETLIFY_DB_URL. Locally (or
// anywhere NETLIFY_DB_URL isn't injected) we fall back to a plain
// DATABASE_URL, same convention as every other app in this account.
export function db() {
  const connectionString = process.env.NETLIFY_DB_URL || process.env.DATABASE_URL;
  return connectionString ? getDatabase({ connectionString }) : getDatabase();
}
