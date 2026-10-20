import "server-only";
import { cache } from "react";
import { db, type DbClient } from "@/lib/db";

// Central, server-only authority on who gets to use WageFlow. Every page
// and every mutating/reading server action funnels through this — never
// through anything the client sends (a role on a JWT payload the client
// could forge, a boolean prop, etc). Two independent ways to be the owner
// (DB flag set by migration, or an env var) so losing one doesn't lock the
// owner out; everyone else needs an `active` subscription row.

export type SubscriptionStatus = "none" | "pending" | "active" | "past_due" | "canceled";

export type AccessState = {
  isOwner: boolean;
  status: SubscriptionStatus;
  currentPeriodEnd: string | null;
  cancelAtPeriodEnd: boolean;
  hasAccess: boolean;
};

type UserRow = { id: number; is_owner: boolean; stripe_customer_id: string | null };
type SubscriptionRow = {
  status: SubscriptionStatus;
  current_period_end: Date | null;
  cancel_at_period_end: boolean;
};

export function isOwnerUserId(userId: number): boolean {
  const ownerEnv = process.env.WAGEFLOW_OWNER_USER_ID;
  return Boolean(ownerEnv) && String(userId) === ownerEnv;
}

// Wrapped in React's cache(): every protected page calls this at least
// twice in the SAME render pass — once in layout.tsx (for the nav bar's
// admin tab), once more via requirePageAccess or the page itself — and
// cache() dedupes repeat calls with the same userId within that one render
// into a single DB round trip. It's a no-op outside a render (e.g. called
// from a "use server" action below, with an explicit shared client), so
// this can never reintroduce the stale-connection bug a PROCESS-scoped
// cache caused earlier: nothing here is cached across requests, only
// (optionally) within one.
export const getAccessState = cache(async function getAccessState(
  userId: number,
  client: DbClient = db()
): Promise<AccessState> {
  const [[user], [sub]] = await Promise.all([
    client.sql<UserRow>`SELECT id, is_owner, stripe_customer_id FROM users WHERE id = ${userId}`,
    client.sql<SubscriptionRow>`SELECT status, current_period_end, cancel_at_period_end FROM subscriptions WHERE user_id = ${userId}`,
  ]);

  const isOwner = Boolean(user?.is_owner) || isOwnerUserId(userId);
  const status: SubscriptionStatus = sub?.status ?? "none";

  return {
    isOwner,
    status,
    currentPeriodEnd: sub?.current_period_end ? new Date(sub.current_period_end).toISOString() : null,
    cancelAtPeriodEnd: Boolean(sub?.cancel_at_period_end),
    // Stripe keeps a subscription's status "active" right up until the paid
    // period actually ends, even after the user has clicked cancel — so
    // this already honors "access until the real end date" with no extra
    // grace-period logic needed here.
    hasAccess: isOwner || status === "active",
  };
});

export async function requireActiveAccess(userId: number, client?: DbClient): Promise<void> {
  const access = await getAccessState(userId, client);
  if (!access.hasAccess) {
    throw new Error("Dit WageFlow-abonnement er ikke aktivt. Gå til Abonnement for at fortsætte.");
  }
}

export async function getOrCreateStripeCustomerId(userId: number): Promise<string | null> {
  const rows = await db().sql<{ stripe_customer_id: string | null }>`SELECT stripe_customer_id FROM users WHERE id = ${userId}`;
  return rows[0]?.stripe_customer_id ?? null;
}
