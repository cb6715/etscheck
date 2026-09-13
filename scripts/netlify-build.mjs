import "dotenv/config";
import { execSync } from "node:child_process";

const PLACEHOLDER_DATABASE_URL = "postgresql://placeholder:placeholder@localhost:5432/placeholder";

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL_UNPOOLED ||
  process.env.NEON_DATABASE_URL ||
  process.env.POSTGRES_URL;

function run(cmd, extraEnv = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

// `prisma generate` only reads the schema — it never connects — but
// prisma.config.ts still requires *some* DATABASE_URL to be set to load at
// all, so a placeholder is fine here even when no real database exists yet.
run("npx prisma generate", { DATABASE_URL: dbUrl || PLACEHOLDER_DATABASE_URL });

if (dbUrl) {
  console.log("\nDatabase URL found — applying migrations (prisma migrate deploy).");
  run("npx prisma migrate deploy", { DATABASE_URL: dbUrl });
} else {
  console.warn(
    "\n⚠️  No DATABASE_URL / NETLIFY_DATABASE_URL found at build time — skipping migrations.\n" +
      "   If you just enabled Netlify DB, its connection string usually only becomes\n" +
      "   available starting with the NEXT deploy — trigger one more deploy once this\n" +
      "   one finishes. Otherwise, set DATABASE_URL yourself in Site configuration →\n" +
      "   Environment variables, then redeploy.\n"
  );
}

// `next build` also imports src/lib/prisma.ts while collecting page data, so
// it needs a resolvable DATABASE_URL too — the placeholder keeps that from
// crashing the build; real queries will fail at runtime until a real one is set.
run("npx next build", { DATABASE_URL: dbUrl || PLACEHOLDER_DATABASE_URL });
