-- Redeem-code system: entering a valid code grants permanent free access,
-- by flipping the SAME is_owner flag that already means "always has
-- access" (see src/lib/access.ts's getAccessState) — no new access-level
-- concept needed, this reuses the existing one.
CREATE TABLE IF NOT EXISTS redeem_codes (
  id SERIAL PRIMARY KEY,
  code TEXT NOT NULL UNIQUE,
  max_uses INTEGER NOT NULL DEFAULT 1,
  use_count INTEGER NOT NULL DEFAULT 0,
  note TEXT,
  created_at TIMESTAMP NOT NULL DEFAULT now()
);

-- One row per successful redemption, unique per user — a user can only
-- ever redeem one code (they're owner-forever after the first), and this
-- is also the audit trail of who redeemed what.
CREATE TABLE IF NOT EXISTS redeem_code_redemptions (
  id SERIAL PRIMARY KEY,
  code_id INTEGER NOT NULL REFERENCES redeem_codes(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  redeemed_at TIMESTAMP NOT NULL DEFAULT now()
);

-- One starter code so there's something to actually test with immediately.
-- Change or delete it any time from the owner-only "Kode-administration"
-- section in Indstillinger — it's an ordinary row, not hardcoded in code.
INSERT INTO redeem_codes (code, max_uses, note)
VALUES ('NEURIX2026', 50, 'Standard beta-kode')
ON CONFLICT (code) DO NOTHING;
