/**
 * Optional Cloudflare Pages Function — one-time checkout skeleton.
 *
 * PAYMENT_PROVIDER=none (default) → 404. No keys required.
 * Recommended provider when enabling: creem
 *   hosted URL     — return CREEM_CHECKOUT_URL
 *   API checkout   — POST /v1/checkouts with CREEM_API_KEY + CREEM_PRODUCT_ID
 * paddle           — Paddle Billing transaction (one-time PADDLE_PRICE_ID)
 * stripe           — Payment Link or Checkout Session (mode=payment)
 * lemonsqueezy     — deprecated legacy (hosted URL or API checkout)
 *
 * Deprecated: ENABLE_STRIPE=true with no PAYMENT_PROVIDER maps to stripe.
 * No subscriptions. No spend caps or usage quotas.
 */

import { handleCheckout, json, paymentsDisabledResponse, resolvePaymentProvider } from "../_lib/payments.js";

export async function onRequestGet({ env }) {
  if (resolvePaymentProvider(env) === "none") {
    return paymentsDisabledResponse();
  }
  return json(405, { error: "method_not_allowed" });
}

export async function onRequestPost(context) {
  return handleCheckout(context);
}
