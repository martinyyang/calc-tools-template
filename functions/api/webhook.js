/**
 * Optional Cloudflare Pages Function — Stripe webhook skeleton.
 *
 * Verifies the Stripe-Signature header and records the event id so
 * retries are idempotent. Bind a KV namespace named ORDERS when you
 * turn payments on. No subscriptions. Do not invent spend caps.
 *
 * ENABLE_STRIPE != true → 404. Static site does not need this file.
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

function hex(buffer) {
  return [...new Uint8Array(buffer)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let out = 0;
  for (let i = 0; i < a.length; i += 1) {
    out |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return out === 0;
}

async function stripeSignatureOk(payload, header, secret) {
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

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signed = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`${timestamp}.${payload}`),
  );
  return timingSafeEqual(hex(signed), expected);
}

async function alreadySeen(env, eventId) {
  if (!env.ORDERS || !eventId) return false;
  return (await env.ORDERS.get(`stripe:event:${eventId}`)) !== null;
}

async function recordOrder(env, event) {
  // Bind KV namespace ORDERS when enabling payments.
  // Store a thin, idempotent order record — not card data.
  if (!env.ORDERS) return;
  const object = event.data && event.data.object ? event.data.object : {};
  await env.ORDERS.put(
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
}

export async function onRequestGet() {
  return json(405, { error: "method_not_allowed" });
}

export async function onRequestPost({ request, env }) {
  if (!paymentsOn(env)) {
    return json(404, { error: "payments_disabled" });
  }

  const payload = await request.text();
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

  if (await alreadySeen(env, event.id)) {
    return json(200, { received: true, duplicate: true });
  }

  if (event.type === "checkout.session.completed") {
    await recordOrder(env, event);
  } else {
    // Ignore other event types (no subscription handlers in this skeleton).
    if (env.ORDERS && event.id) {
      await env.ORDERS.put(`stripe:event:${event.id}`, JSON.stringify({ id: event.id, type: event.type, ignored: true }));
    }
  }

  return json(200, { received: true });
}
