import "dotenv/config";
import { execSync } from "node:child_process";

const dbUrl =
  process.env.DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL ||
  process.env.NETLIFY_DATABASE_URL_UNPOOLED;

function run(cmd, extraEnv = {}) {
  console.log(`\n$ ${cmd}`);
  execSync(cmd, { stdio: "inherit", env: { ...process.env, ...extraEnv } });
}

run("npx prisma generate");

if (dbUrl) {
  console.log("\nDatabase URL found — applying migrations (prisma migrate deploy).");
  run("npx prisma migrate deploy", { DATABASE_URL: dbUrl });
} else {
  console.warn(
    "\n⚠️  No DATABASE_URL / NETLIFY_DATABASE_URL found at build time — skipping migrations.\n" +
      "   Set a DATABASE_URL environment variable on the Netlify site (or attach Netlify DB),\n" +
      "   then trigger a new deploy so migrations can run.\n"
  );
}

run("npx next build");
