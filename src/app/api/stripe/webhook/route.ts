import { NextResponse } from "next/server";
import type Stripe from "stripe";
import { db } from "@/lib/db";
import { stripe } from "@/lib/stripe";
import type { SubscriptionStatus } from "@/lib/access";

export const dynamic = "force-dynamic";

// Maps Stripe's own subscription.status onto the small set this app tracks
// (see the 20261016 migration). trialing counts as active since this app
// has no trial-specific UI; anything else terminal (incomplete_expired,
// unpaid) is treated as canceled rather than invented a 7th state.
function mapStatus(stripeStatus: Stripe.Subscription.Status): SubscriptionStatus {
  switch (stripeStatus) {
    case "active":
    case "trialing":
      return "active";
    case "past_due":
      return "past_due";
    case "incomplete":
      return "pending";
    case "canceled":
    case "incomplete_expired":
    case "unpaid":
    case "paused":
      return "canceled";
    default:
      return "canceled";
  }
}

async function userIdForCustomer(customerId: string): Promise<number | null> {
  const rows = await db().sql<{ id: number }>`SELECT id FROM users WHERE stripe_customer_id = ${customerId}`;
  return rows[0]?.id ?? null;
}

async function upsertSubscription(userId: number, sub: Stripe.Subscription): Promise<void> {
  const status = mapStatus(sub.status);
  const periodEndUnix = sub.items.data[0]?.current_period_end ?? null;
  const currentPeriodEnd = periodEndUnix ? new Date(periodEndUnix * 1000) : null;

  await db().sql`
    INSERT INTO subscriptions (user_id, stripe_subscription_id, status, current_period_end, cancel_at_period_end, updated_at)
    VALUES (${userId}, ${sub.id}, ${status}, ${currentPeriodEnd}, ${sub.cancel_at_period_end}, now())
    ON CONFLICT (user_id) DO UPDATE SET
      stripe_subscription_id = EXCLUDED.stripe_subscription_id,
      status = EXCLUDED.status,
      current_period_end = EXCLUDED.current_period_end,
      cancel_at_period_end = EXCLUDED.cancel_at_period_end,
      updated_at = now()
  `;
}

async function handleEvent(event: Stripe.Event): Promise<void> {
  switch (event.type) {
    case "checkout.session.completed": {
      const session = event.data.object as Stripe.Checkout.Session;
      const userId = session.client_reference_id ? Number(session.client_reference_id) : null;
      const customerId = typeof session.customer === "string" ? session.customer : session.customer?.id;
      if (!userId || !customerId) break;

      await db().sql`UPDATE users SET stripe_customer_id = ${customerId} WHERE id = ${userId} AND stripe_customer_id IS NULL`;

      if (session.subscription) {
        const subId = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
        const sub = await stripe().subscriptions.retrieve(subId);
        await upsertSubscription(userId, sub);
      }
      break;
    }

    case "customer.subscription.created":
    case "customer.subscription.updated":
    case "customer.subscription.deleted": {
      const sub = event.data.object as Stripe.Subscription;
      const customerId = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
      const userId = await userIdForCustomer(customerId);
      if (!userId) break;
      await upsertSubscription(userId, sub);
      break;
    }

    case "invoice.payment_failed": {
      const invoice = event.data.object as Stripe.Invoice;
      const customerId = typeof invoice.customer === "string" ? invoice.customer : invoice.customer?.id;
      if (!customerId) break;
      const userId = await userIdForCustomer(customerId);
      if (!userId) break;
      await db().sql`UPDATE subscriptions SET status = 'past_due', updated_at = now() WHERE user_id = ${userId} AND status = 'active'`;
      break;
    }

    default:
      break;
  }
}

export async function POST(request: Request): Promise<NextResponse> {
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "STRIPE_WEBHOOK_SECRET mangler." }, { status: 500 });
  }

  const signature = request.headers.get("stripe-signature");
  if (!signature) {
    return NextResponse.json({ error: "Mangler stripe-signature header." }, { status: 400 });
  }

  const rawBody = await request.text();

  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(rawBody, signature, secret);
  } catch (err) {
    console.error("Stripe webhook signatur ugyldig:", err);
    return NextResponse.json({ error: "Ugyldig signatur." }, { status: 400 });
  }

  // Idempotency: Stripe redelivers events, so a duplicate id is a no-op —
  // the INSERT below fails with a unique violation and we just return 200.
  try {
    await db().sql`INSERT INTO webhook_events (id, type) VALUES (${event.id}, ${event.type})`;
  } catch (e) {
    const code = typeof e === "object" && e !== null && "code" in e ? (e as { code?: unknown }).code : undefined;
    if (code === "23505") {
      return NextResponse.json({ received: true, duplicate: true });
    }
    throw e;
  }

  try {
    await handleEvent(event);
  } catch (err) {
    console.error(`Stripe webhook handling failed for ${event.type} (${event.id}):`, err);
    return NextResponse.json({ error: "Intern fejl under behandling." }, { status: 500 });
  }

  return NextResponse.json({ received: true });
}
