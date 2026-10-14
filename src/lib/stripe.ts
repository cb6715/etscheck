import "server-only";
import Stripe from "stripe";

// Lazily constructed so a missing STRIPE_SECRET_KEY doesn't crash the whole
// app at import/build time — the owner always has free access and never
// needs this, and pages that do (/abonnement) check `stripeConfigured()`
// first and show "betaling er endnu ikke konfigureret" instead of calling
// anything here.
let client: Stripe | null = null;

export function stripeConfigured(): boolean {
  return Boolean(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new Error("STRIPE_SECRET_KEY mangler.");
  }
  if (!client) {
    client = new Stripe(process.env.STRIPE_SECRET_KEY);
  }
  return client;
}

export function stripePriceId(): string {
  const id = process.env.STRIPE_PRICE_ID;
  if (!id) throw new Error("STRIPE_PRICE_ID mangler.");
  return id;
}
