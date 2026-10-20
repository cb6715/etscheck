"use server";

import { revalidatePath } from "next/cache";
import { db, type DbClient } from "@/lib/db";
import { ok, fail, type ActionResult } from "@/lib/action-result";
import { getUserId } from "@/lib/actions";

// Redeem-code access: entering a valid code flips the SAME is_owner flag
// that already means "always has access" (src/lib/access.ts), reusing the
// existing access model instead of inventing a second one. No
// requireActiveAccess here — this is the mechanism for GETTING access in
// the first place, so it only needs you to be logged in.
export async function redeemCode(code: string): Promise<ActionResult> {
  const userId = await getUserId();
  const client = db();
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return fail("Indtast en kode.");

  const [existingRedemption] = await client.sql<{ id: number }>`SELECT id FROM redeem_code_redemptions WHERE user_id = ${userId}`;
  if (existingRedemption) return fail("Du har allerede indløst en kode på denne konto.");

  const [codeRow] = await client.sql<{ id: number; max_uses: number; use_count: number }>`
    SELECT id, max_uses, use_count FROM redeem_codes WHERE code = ${trimmed}
  `;
  if (!codeRow) return fail("Ugyldig kode.");
  if (codeRow.use_count >= codeRow.max_uses) return fail("Koden er desværre brugt op.");

  await client.sql`UPDATE redeem_codes SET use_count = use_count + 1 WHERE id = ${codeRow.id}`;
  await client.sql`INSERT INTO redeem_code_redemptions (code_id, user_id) VALUES (${codeRow.id}, ${userId})`;
  await client.sql`UPDATE users SET is_owner = true WHERE id = ${userId}`;

  revalidatePath("/");
  revalidatePath("/abonnement");
  return ok(undefined);
}

// ─────────────────────────────────────────────────────────────
// OWNER-ONLY: oprettelse af nye koder
// ─────────────────────────────────────────────────────────────

async function requireOwner(userId: number, client: DbClient): Promise<void> {
  const [user] = await client.sql<{ is_owner: boolean }>`SELECT is_owner FROM users WHERE id = ${userId}`;
  if (!user?.is_owner) throw new Error("Kun ejeren kan administrere koder.");
}

export type RedeemCodeRow = { id: number; code: string; max_uses: number; use_count: number; note: string | null };

export async function getRedeemCodes(): Promise<RedeemCodeRow[]> {
  const userId = await getUserId();
  const client = db();
  await requireOwner(userId, client);
  return client.sql<RedeemCodeRow>`SELECT id, code, max_uses, use_count, note FROM redeem_codes ORDER BY created_at DESC`;
}

export async function createRedeemCode(code: string, maxUses: number, note?: string): Promise<ActionResult<{ id: number }>> {
  const userId = await getUserId();
  const client = db();
  await requireOwner(userId, client);
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return fail("Koden må ikke være tom.");
  const existing = await client.sql<{ id: number }>`SELECT id FROM redeem_codes WHERE code = ${trimmed}`;
  if (existing.length > 0) return fail("Den kode findes allerede.");
  const [row] = await client.sql<{ id: number }>`
    INSERT INTO redeem_codes (code, max_uses, note) VALUES (${trimmed}, ${Math.max(1, maxUses)}, ${note ?? null}) RETURNING id
  `;
  revalidatePath("/indstillinger");
  return ok({ id: row.id });
}

export async function deleteRedeemCode(id: number): Promise<void> {
  const userId = await getUserId();
  const client = db();
  await requireOwner(userId, client);
  await client.sql`DELETE FROM redeem_codes WHERE id = ${id}`;
  revalidatePath("/admin");
}

// ─────────────────────────────────────────────────────────────
// ADMIN: brugerstatistik + invitationer
// ─────────────────────────────────────────────────────────────

export type AdminStats = {
  totalUsers: number;
  activeAccess: number; // owner eller aktivt abonnement
  paidSubscribers: number; // aktivt abonnement, ikke ejer
};

export async function getAdminStats(): Promise<AdminStats> {
  const userId = await getUserId();
  const client = db();
  await requireOwner(userId, client);
  const [[{ count: totalUsers }], [{ count: paidSubscribers }], [{ count: ownerCount }]] = await Promise.all([
    client.sql<{ count: string }>`SELECT count(*)::text as count FROM users`,
    client.sql<{ count: string }>`SELECT count(*)::text as count FROM subscriptions WHERE status = 'active'`,
    client.sql<{ count: string }>`SELECT count(*)::text as count FROM users WHERE is_owner = true`,
  ]);
  return {
    totalUsers: Number(totalUsers),
    paidSubscribers: Number(paidSubscribers),
    activeAccess: Number(paidSubscribers) + Number(ownerCount),
  };
}

function randomInviteCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I — easier to read/type
  let out = "";
  for (let i = 0; i < 8; i++) out += alphabet[Math.floor(Math.random() * alphabet.length)];
  return out;
}

/** Generates a fresh, single-use code tied to one invited email (stored as
 * the code's note — purely a label for the admin list below, the redeemer
 * can type any email they like, this doesn't gate WHO can redeem it). */
export async function createInvite(email: string): Promise<ActionResult<{ code: string }>> {
  const userId = await getUserId();
  const client = db();
  await requireOwner(userId, client);
  const trimmedEmail = email.trim();
  if (!trimmedEmail) return fail("Indtast en e-mail.");

  for (let attempt = 0; attempt < 5; attempt++) {
    const code = randomInviteCode();
    const existing = await client.sql<{ id: number }>`SELECT id FROM redeem_codes WHERE code = ${code}`;
    if (existing.length > 0) continue;
    await client.sql`INSERT INTO redeem_codes (code, max_uses, note) VALUES (${code}, 1, ${trimmedEmail})`;
    revalidatePath("/admin");
    return ok({ code });
  }
  return fail("Kunne ikke generere en unik kode — prøv igen.");
}
