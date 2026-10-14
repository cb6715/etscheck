-- Adds real multi-tenant auth (password + session) and subscription billing
-- on top of what was a single-tenant app. Every existing row is preserved —
-- this only adds columns/tables, it never deletes or rewrites user data.

ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_owner BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE users ADD COLUMN IF NOT EXISTS stripe_customer_id TEXT;

-- The owner (Cornelius) always gets free, full access — identified here by
-- the email the original deploy-time seed migration created, so this marks
-- his *existing* account rather than guessing which user is him. The
-- WAGEFLOW_OWNER_USER_ID env var (checked in src/lib/access.ts) is a second,
-- independent way to grant owner status, in case this email ever changes.
UPDATE users SET is_owner = true WHERE email = 'cornelius@neurix.dk';

-- The pre-existing account had no password (this app had no login before
-- today). Give it a one-time random temporary password so sign-in works
-- immediately after this migration runs; disclosed once, out-of-band, to
-- the owner, who should change it from Indstillinger right away.
UPDATE users
SET password_hash = 'c78b1e1b427231fd7240e1c586f2c97b:d19618de7e21376fcf2026f8dd21d3551846e732c3a65ecd1998a1aaecfafdef249df6e1a4694383a7816781dc83407cd795c4cc37177c28b429801a75d5f0dc'
WHERE email = 'cornelius@neurix.dk' AND password_hash IS NULL;

CREATE TABLE IF NOT EXISTS subscriptions (
  id SERIAL PRIMARY KEY,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id),
  stripe_subscription_id TEXT UNIQUE,
  -- 'none' | 'pending' | 'active' | 'past_due' | 'canceled'
  status TEXT NOT NULL DEFAULT 'none',
  current_period_end TIMESTAMP,
  cancel_at_period_end BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP NOT NULL DEFAULT now(),
  updated_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Idempotency ledger for Stripe webhook deliveries — Stripe can and does
-- redeliver the same event, so every handler checks/inserts here first and
-- skips a duplicate id rather than re-applying the event.
CREATE TABLE IF NOT EXISTS webhook_events (
  id TEXT PRIMARY KEY,
  type TEXT NOT NULL,
  processed_at TIMESTAMP NOT NULL DEFAULT now()
);

-- Prevents two open (not-yet-checked-out) shifts for the same user, so a
-- double-tap of "tjek ind" can race the server and still never create a
-- duplicate open session — the second INSERT simply fails this constraint
-- and is caught as a no-op in checkIn().
CREATE UNIQUE INDEX IF NOT EXISTS work_sessions_one_open_per_user
  ON work_sessions (user_id) WHERE check_out_at IS NULL;
