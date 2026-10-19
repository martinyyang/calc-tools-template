/**
 * Optional Cloudflare Pages Function — Stripe checkout skeleton.
 *
 * Default: ENABLE_STRIPE is not "true" → 404. The static site works
 * without Stripe keys. No subscriptions. No spend caps.
 *
 * Modes (STRIPE_CHECKOUT_MODE):
 *   payment_link      — return STRIPE_PAYMENT_LINK_URL
 *   checkout_session  — create a one-time Checkout Session
 *
 * Enable when a paid tool ships. See README → Turn payment ON.
 */

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

function paymentsOn(env) {
  return String(env.ENABLE_STRIPE || "").toLowerCase() === "true";
}

export async function onRequestGet() {
  return json(405, { error: "method_not_allowed" });
}

export async function onRequestPost({ request, env }) {
  if (!paymentsOn(env)) {
    return json(404, { error: "payments_disabled", hint: "ENABLE_STRIPE is false" });
  }

  const mode = env.STRIPE_CHECKOUT_MODE || "payment_link";

  if (mode === "payment_link") {
    const url = env.STRIPE_PAYMENT_LINK_URL;
    if (!url) {
      return json(500, { error: "missing_payment_link" });
    }
    return json(200, { url });
  }

  if (mode === "checkout_session") {
    const secret = env.STRIPE_SECRET_KEY;
    const price = env.STRIPE_PRICE_ID;
    if (!secret || !price) {
      return json(500, { error: "missing_stripe_checkout_config" });
    }

    const origin = new URL(request.url).origin;
    const success = env.STRIPE_SUCCESS_URL || `${origin}/checkout/success/`;
    const cancel = env.STRIPE_CANCEL_URL || `${origin}/checkout/cancel/`;

    const body = new URLSearchParams({
      mode: "payment",
      "line_items[0][price]": price,
      "line_items[0][quantity]": "1",
      success_url: success,
      cancel_url: cancel,
    });

    const res = await fetch("https://api.stripe.com/v1/checkout/sessions", {
      method: "POST",
      headers: {
        authorization: `Bearer ${secret}`,
        "content-type": "application/x-www-form-urlencoded",
      },
      body,
    });
    const data = await res.json();
    if (!res.ok || !data.url) {
      return json(502, { error: "stripe_checkout_failed" });
    }
    return json(200, { url: data.url, id: data.id });
  }

  return json(500, { error: "unknown_checkout_mode" });
}
