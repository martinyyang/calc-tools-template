/**
 * Shared payment helpers for optional Pages Functions.
 *
 * PAYMENT_PROVIDER: none | creem | paddle | stripe
 * Legacy (deprecated): lemonsqueezy
 * Default none — checkout/webhook 404, no keys required.
 * Recommended when enabling: creem (hosted URL or API checkout).
 * Alternative: paddle (Paddle Billing, one-time price).
 * stripe: only when there is an overseas company.
 * One-time payment only. No subscriptions. No usage quotas.
 *
 * Deprecated: ENABLE_STRIPE=true with no PAYMENT_PROVIDER maps to stripe.
 */

const PROVIDERS = new Set(["none", "creem", "paddle", "stripe", "lemonsqueezy"]);

function truthy(value) {
  return ["1", "true", "yes", "on"].includes(String(value || "").trim().toLowerCase());
}

export function resolvePaymentProvider(env) {
  const src = env || {};
  const raw = String(src.PAYMENT_PROVIDER || "").trim().toLowerCase();
  if (raw) {
    return PROVIDERS.has(raw) ? raw : "none";
  }
  if (truthy(src.ENABLE_STRIPE)) {
    return "stripe";
  }
  return "none";
}

export function paymentsEnabled(env) {
  return resolvePaymentProvider(env) !== "none";
}

export function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json; charset=utf-8" },
  });
}

export function paymentsDisabledResponse() {
  return json(404, { error: "payments_disabled", hint: "PAYMENT_PROVIDER is none" });
}

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

export async function hmacSha256Hex(secret, payload) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return hex(signed);
}

/** Creem: creem-signature is HMAC-SHA256 hex of the raw body. */
export async function creemSignatureOk(payload, header, secret) {
  if (!header || !secret) return false;
  const expected = await hmacSha256Hex(secret, payload);
  const supplied = String(header).trim().toLowerCase();
  return timingSafeEqual(expected, supplied);
}

/**
 * Paddle Billing: Paddle-Signature is `ts=<unix>;h1=<hex>` (more h1 values
 * may appear during secret rotation). Signed payload is `${ts}:${rawBody}`.
 */
export async function paddleSignatureOk(payload, header, secret) {
  if (!header || !secret) return false;
  let timestamp = "";
  const signatures = [];
  for (const piece of String(header).split(";")) {
    const idx = piece.indexOf("=");
    if (idx === -1) continue;
    const key = piece.slice(0, idx).trim();
    const value = piece.slice(idx + 1).trim();
    if (key === "ts") timestamp = value;
    if (key === "h1" && value) signatures.push(value.toLowerCase());
  }
  if (!timestamp || signatures.length === 0) return false;
  const digest = await hmacSha256Hex(secret, `${timestamp}:${payload}`);
  return signatures.some((sig) => timingSafeEqual(digest, sig));
}

/** Lemon Squeezy (deprecated): X-Signature is HMAC-SHA256 hex of the raw body. */
export async function lemonSqueezySignatureOk(payload, header, secret) {
  if (!header || !secret) return false;
  const expected = await hmacSha256Hex(secret, payload);
  const supplied = String(header).trim().toLowerCase();
  return timingSafeEqual(expected, supplied);
}

export async function stripeSignatureOk(payload, header, secret) {
  if (!header || !secret) return false;
  const parts = Object.fromEntries(
    header.split(",").map((piece) => {
      const idx = piece.indexOf("=");
      return [piece.slice(0, idx), piece.slice(idx + 1)];
    }),
  );
  const timestamp = parts.t;
  const expected = parts.v1;
  if (!timestamp || !expected) return false;
  const digest = await hmacSha256Hex(secret, `${timestamp}.${payload}`);
  return timingSafeEqual(digest, String(expected).trim().toLowerCase());
}

async function alreadySeen(env, key) {
  if (!env.ORDERS || !key) return false;
  return (await env.ORDERS.get(key)) !== null;
}

async function kvPut(env, key, value) {
  if (!env.ORDERS) return;
  await env.ORDERS.put(key, value);
}

async function creemCheckout({ request, env, fetchImpl }) {
  const hosted = env.CREEM_CHECKOUT_URL;
  if (hosted) {
    return json(200, { url: hosted });
  }

  const apiKey = env.CREEM_API_KEY;
  const productId = env.CREEM_PRODUCT_ID;
  if (!apiKey || !productId) {
    return json(500, { error: "missing_creem_checkout_config" });
  }

  const origin = new URL(request.url).origin;
  const success = env.CREEM_SUCCESS_URL || `${origin}/checkout/success/`;
  const res = await fetchImpl("https://api.creem.io/v1/checkouts", {
    method: "POST",
    headers: {
      "x-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      product_id: productId,
      success_url: success,
    }),
  });
  const data = await res.json();
  const url = data && data.checkout_url;
  if (!res.ok || !url) {
    return json(502, { error: "creem_checkout_failed" });
  }
  return json(200, { url, id: data.id || null });
}

function paddleApiBase(env) {
  const mode = String(env.PADDLE_ENV || "sandbox").trim().toLowerCase();
  return mode === "production" ? "https://api.paddle.com" : "https://sandbox-api.paddle.com";
}

async function paddleCheckout({ request: _request, env, fetchImpl }) {
  const apiKey = env.PADDLE_API_KEY;
  const priceId = env.PADDLE_PRICE_ID;
  const paddleEnv = String(env.PADDLE_ENV || "sandbox").trim().toLowerCase();
  if (paddleEnv && paddleEnv !== "sandbox" && paddleEnv !== "production") {
    return json(500, { error: "invalid_paddle_env" });
  }
  if (!apiKey || !priceId) {
    return json(500, { error: "missing_paddle_checkout_config" });
  }

  const res = await fetchImpl(`${paddleApiBase(env)}/transactions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      "Paddle-Version": "1",
    },
    body: JSON.stringify({
      items: [{ price_id: priceId, quantity: 1 }],
    }),
  });
  const data = await res.json();
  const txn = data && data.data ? data.data : {};
  const url = txn.checkout && txn.checkout.url;
  if (!res.ok || !url) {
    return json(502, { error: "paddle_checkout_failed" });
  }
  return json(200, { url, id: txn.id || null });
}

async function lemonCheckout({ request, env, fetchImpl }) {
  const hosted = env.LEMONSQUEEZY_CHECKOUT_URL;
  if (hosted) {
    return json(200, { url: hosted });
  }

  const apiKey = env.LEMONSQUEEZY_API_KEY;
  const storeId = env.LEMONSQUEEZY_STORE_ID;
  const variantId = env.LEMONSQUEEZY_VARIANT_ID;
  if (!apiKey || !storeId || !variantId) {
    return json(500, { error: "missing_lemonsqueezy_checkout_config" });
  }

  const origin = new URL(request.url).origin;
  const redirect = `${origin}/checkout/success/`;
  const res = await fetchImpl("https://api.lemonsqueezy.com/v1/checkouts", {
    method: "POST",
    headers: {
      Accept: "application/vnd.api+json",
      "Content-Type": "application/vnd.api+json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      data: {
        type: "checkouts",
        attributes: {
          product_options: {
            redirect_url: redirect,
          },
        },
        relationships: {
          store: { data: { type: "stores", id: String(storeId) } },
          variant: { data: { type: "variants", id: String(variantId) } },
        },
      },
    }),
  });
  const data = await res.json();
  const url = data && data.data && data.data.attributes && data.data.attributes.url;
  if (!res.ok || !url) {
    return json(502, { error: "lemonsqueezy_checkout_failed" });
  }
  return json(200, { url, id: data.data.id });
}

async function stripeCheckout({ request, env, fetchImpl }) {
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

    const res = await fetchImpl("https://api.stripe.com/v1/checkout/sessions", {
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

export async function handleCheckout({ request, env, fetchImpl }) {
  const provider = resolvePaymentProvider(env);
  if (provider === "none") {
    return paymentsDisabledResponse();
  }
  const doFetch = fetchImpl || globalThis.fetch;
  if (provider === "creem") {
    return creemCheckout({ request, env, fetchImpl: doFetch });
  }
  if (provider === "paddle") {
    return paddleCheckout({ request, env, fetchImpl: doFetch });
  }
  if (provider === "lemonsqueezy") {
    return lemonCheckout({ request, env, fetchImpl: doFetch });
  }
  if (provider === "stripe") {
    return stripeCheckout({ request, env, fetchImpl: doFetch });
  }
  return paymentsDisabledResponse();
}

async function creemWebhook({ request, env, payload }) {
  const ok = await creemSignatureOk(
    payload,
    request.headers.get("creem-signature"),
    env.CREEM_WEBHOOK_SECRET,
  );
  if (!ok) {
    return json(400, { error: "invalid_signature" });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const eventType = event.eventType || event.event_type || "";
  const object = event.object || {};
  const eventKey = `creem:event:${event.id || object.id || eventType}`;

  if (await alreadySeen(env, eventKey)) {
    return json(200, { received: true, duplicate: true });
  }

  if (eventType === "checkout.completed") {
    await kvPut(
      env,
      eventKey,
      JSON.stringify({
        id: event.id || object.id || null,
        type: eventType,
        orderId: object.order || object.order_id || null,
      }),
    );
  } else if (env.ORDERS && (event.id || object.id || eventType)) {
    await kvPut(env, eventKey, JSON.stringify({ id: event.id || null, type: eventType, ignored: true }));
  }

  return json(200, { received: true });
}

async function paddleWebhook({ request, env, payload }) {
  const ok = await paddleSignatureOk(
    payload,
    request.headers.get("paddle-signature"),
    env.PADDLE_WEBHOOK_SECRET,
  );
  if (!ok) {
    return json(400, { error: "invalid_signature" });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const eventId = event.event_id || "";
  const eventType = event.event_type || "";
  const eventKey = `paddle:event:${eventId || eventType}`;

  if (await alreadySeen(env, eventKey)) {
    return json(200, { received: true, duplicate: true });
  }

  if (eventType === "transaction.completed" || eventType === "transaction.paid") {
    const object = event.data || {};
    const totals = (object.details && object.details.totals) || {};
    await kvPut(
      env,
      eventKey,
      JSON.stringify({
        id: eventId || object.id || null,
        type: eventType,
        transactionId: object.id || null,
        total: totals.total || null,
        currency: totals.currency_code || object.currency_code || null,
      }),
    );
  } else if (env.ORDERS && (eventId || eventType)) {
    await kvPut(env, eventKey, JSON.stringify({ id: eventId || null, type: eventType, ignored: true }));
  }

  return json(200, { received: true });
}

async function lemonWebhook({ request, env, payload }) {
  const ok = await lemonSqueezySignatureOk(
    payload,
    request.headers.get("X-Signature"),
    env.LEMONSQUEEZY_WEBHOOK_SECRET,
  );
  if (!ok) {
    return json(400, { error: "invalid_signature" });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  const eventName =
    (event.meta && event.meta.event_name) || request.headers.get("X-Event-Name") || "";
  const object = event.data || {};
  const eventKey = `lemonsqueezy:event:${eventName}:${object.id || ""}`;

  if (await alreadySeen(env, eventKey)) {
    return json(200, { received: true, duplicate: true });
  }

  if (eventName === "order_created") {
    const attributes = object.attributes || {};
    await kvPut(
      env,
      eventKey,
      JSON.stringify({
        id: object.id || null,
        type: eventName,
        total: attributes.total || null,
        currency: attributes.currency || null,
      }),
    );
  } else if (env.ORDERS && (object.id || eventName)) {
    await kvPut(env, eventKey, JSON.stringify({ id: object.id || null, type: eventName, ignored: true }));
  }

  return json(200, { received: true });
}

async function stripeWebhook({ request, env, payload }) {
  const ok = await stripeSignatureOk(
    payload,
    request.headers.get("stripe-signature"),
    env.STRIPE_WEBHOOK_SECRET,
  );
  if (!ok) {
    return json(400, { error: "invalid_signature" });
  }

  let event;
  try {
    event = JSON.parse(payload);
  } catch {
    return json(400, { error: "invalid_json" });
  }

  if (await alreadySeen(env, `stripe:event:${event.id}`)) {
    return json(200, { received: true, duplicate: true });
  }

  if (event.type === "checkout.session.completed") {
    const object = event.data && event.data.object ? event.data.object : {};
    await kvPut(
      env,
      `stripe:event:${event.id}`,
      JSON.stringify({
        id: event.id,
        type: event.type,
        created: event.created,
        sessionId: object.id || null,
        amountTotal: object.amount_total || null,
        currency: object.currency || null,
      }),
    );
  } else if (env.ORDERS && event.id) {
    await kvPut(
      env,
      `stripe:event:${event.id}`,
      JSON.stringify({ id: event.id, type: event.type, ignored: true }),
    );
  }

  return json(200, { received: true });
}

export async function handleWebhook({ request, env }) {
  const provider = resolvePaymentProvider(env);
  if (provider === "none") {
    return json(404, { error: "payments_disabled" });
  }
  const payload = await request.text();
  if (provider === "creem") {
    return creemWebhook({ request, env, payload });
  }
  if (provider === "paddle") {
    return paddleWebhook({ request, env, payload });
  }
  if (provider === "lemonsqueezy") {
    return lemonWebhook({ request, env, payload });
  }
  if (provider === "stripe") {
    return stripeWebhook({ request, env, payload });
  }
  return json(404, { error: "payments_disabled" });
}
