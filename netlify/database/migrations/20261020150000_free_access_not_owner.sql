-- redeemCode flipped users.is_owner = true to grant free access, reusing
-- the SAME flag the nav bar, /admin page, and redeem-actions.ts's
-- requireOwner() all read as "this is the real app owner, show them the
-- admin dashboard and let them manage codes/invites". That meant anyone
-- who redeemed a free-access code (a friend, a customer, a colleague)
-- silently also got full admin access — the Admin tab, user-count stats,
-- the ability to create/delete codes and invite others.
--
-- Splits the two meanings: is_owner stays exclusively "real owner, full
-- admin", has_free_access is the new, separate "redeemed a code, use the
-- app for free" flag that only feeds into hasAccess.
ALTER TABLE users ADD COLUMN IF NOT EXISTS has_free_access BOOLEAN NOT NULL DEFAULT false;

-- Self-heals every account that got is_owner through a redeemed code
-- (identified by having a row in redeem_code_redemptions) instead of
-- being the original owner — downgrades them to the correct, narrower
-- has_free_access flag without touching the real owner, who never
-- redeemed a code.
UPDATE users SET is_owner = false, has_free_access = true
WHERE is_owner = true
  AND id IN (SELECT user_id FROM redeem_code_redemptions);
