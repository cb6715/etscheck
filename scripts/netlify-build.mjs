import "dotenv/config";
import { execSync } from "node:child_process";

const PLACEHOLDER_DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";

// Only a plain DATABASE_URL (your own Postgres) is usable here at build time.
// Netlify DB (Neon) does not expose a build-time environment variable at all —
// its schema is instead applied by Netlify's own migration runner, reading
// SQL files from netlify/database/migrations/ (mirrored from prisma/migrations/
// — see that folder for the source of truth).
const dbUrl = process.env.DATABASE_URL;

function run(cmd, extraEnv = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

// `prisma generate` only reads the schema — it never connects — but
// prisma.config.ts still requires *some* DATABASE_URL to be set to load at
// all, so a placeholder is fine here even when no real database exists yet.
run("npx prisma generate", { DATABASE_URL: dbUrl || PLACEHOLDER_DATABASE_URL });

if (dbUrl) {
  console.log("\nDATABASE_URL found — applying migrations (prisma migrate deploy).");
  run("npx prisma migrate deploy", { DATABASE_URL: dbUrl });
} else {
  console.log(
    "\nℹ️  No DATABASE_URL set at build time — skipping `prisma migrate deploy`.\n" +
      "   This is expected when using Netlify DB: Netlify applies netlify/database/migrations/\n" +
      "   itself as part of the deploy. If you're using your own Postgres instead, set\n" +
      "   DATABASE_URL under Site configuration → Environment variables.\n"
  );
}

// `next build` also imports src/lib/prisma.ts while collecting page data, so
// it needs a resolvable DATABASE_URL too — the placeholder keeps that from
// crashing the build; real queries will fail at runtime until a real one is set.
run("npx next build", { DATABASE_URL: dbUrl || PLACEHOLDER_DATABASE_URL });
