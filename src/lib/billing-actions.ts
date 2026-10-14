"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db";
import { getSessionUserId } from "@/lib/session";
import { getAccessState, type AccessState } from "@/lib/access";
import { stripe, stripeConfigured, stripePriceId } from "@/lib/stripe";

async function requireUserId(): Promise<number> {
  const userId = await getSessionUserId();
  if (userId === null) throw new Error("Ikke logget ind.");
  return userId;
}

export async function getBillingState(): Promise<AccessState & { stripeConfigured: boolean }> {
  const userId = await requireUserId();
  const access = await getAccessState(userId);
  return { ...access, stripeConfigured: stripeConfigured() };
}

async function ensureStripeCustomerId(userId: number): Promise<string> {
  const rows = await db().sql<{ email: string; name: string; stripe_customer_id: string | null }>`
    SELECT email, name, stripe_customer_id FROM users WHERE id = ${userId}
  `;
  const user = rows[0];
  if (!user) throw new Error("Bruger ikke fundet.");
  if (user.stripe_customer_id) return user.stripe_customer_id;

  const customer = await stripe().customers.create({
    email: user.email,
    name: user.name,
    metadata: { wageflow_user_id: String(userId) },
  });
  await db().sql`UPDATE users SET stripe_customer_id = ${customer.id} WHERE id = ${userId}`;
  return customer.id;
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") || "";
}

// Redirects straight to Stripe's hosted Checkout — WageFlow never collects
// or stores a card number/CVC itself. The subscription only ever becomes
// `active` once the checkout.session.completed webhook confirms it; this
// action itself never marks anyone as subscribed.
export async function startCheckout(): Promise<void> {
  const userId = await requireUserId();
  if (!stripeConfigured()) throw new Error("Betaling er endnu ikke konfigureret.");

  const access = await getAccessState(userId);
  if (access.hasAccess) {
    redirect("/abonnement");
  }

  const customerId = await ensureStripeCustomerId(userId);
  const base = appUrl();
  const session = await stripe().checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    client_reference_id: String(userId),
    line_items: [{ price: stripePriceId(), quantity: 1 }],
    success_url: `${base}/abonnement?checkout=success`,
    cancel_url: `${base}/abonnement?checkout=cancelled`,
    allow_promotion_codes: false,
  });

  if (!session.url) throw new Error("Kunne ikke starte betaling.");
  redirect(session.url);
}

// Stripe's hosted Billing Portal — lets the user see invoices, update
// payment method, and cancel, without WageFlow building any of that UI
// itself. Requires a Portal configuration to exist for the Stripe account
// (see the setup instructions) or Stripe returns an error naming that.
export async function openBillingPortal(): Promise<void> {
  const userId = await requireUserId();
  if (!stripeConfigured()) throw new Error("Betaling er endnu ikke konfigureret.");

  const customerId = await ensureStripeCustomerId(userId);
  const portal = await stripe().billingPortal.sessions.create({
    customer: customerId,
    return_url: `${appUrl()}/abonnement`,
  });
  redirect(portal.url);
}
