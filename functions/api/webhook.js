/**
 * Optional Cloudflare Pages Function — payment webhook skeleton.
 *
 * Verifies the provider signature and records the event id so retries
 * are idempotent. Bind a KV namespace named ORDERS when you turn
 * payments on. One-time orders only. No subscriptions. No usage quotas.
 *
 * Lemon Squeezy: X-Signature = HMAC-SHA256 hex of the raw body
 *                with LEMONSQUEEZY_WEBHOOK_SECRET.
 * Stripe:        Stripe-Signature (t=,v1=) with STRIPE_WEBHOOK_SECRET.
 *
 * PAYMENT_PROVIDER=none (default) → 404. Static site does not need this file.
 * Deprecated: ENABLE_STRIPE=true with no PAYMENT_PROVIDER maps to stripe.
 */

import { handleWebhook, json, paymentsDisabledResponse, resolvePaymentProvider } from "../_lib/payments.js";

export async function onRequestGet({ env }) {
  if (resolvePaymentProvider(env) === "none") {
    return paymentsDisabledResponse();
  }
  return json(405, { error: "method_not_allowed" });
}

export async function onRequestPost(context) {
  return handleWebhook(context);
}
