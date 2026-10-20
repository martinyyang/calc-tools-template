/**
 * Provider selection + webhook signature tests for functions/_lib/payments.js.
 * Run: node tests/test_payments.mjs
 */
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import {
  handleCheckout,
  handleWebhook,
  lemonSqueezySignatureOk,
  resolvePaymentProvider,
  stripeSignatureOk,
} from "../functions/_lib/payments.js";

function mockRequest({
  body = "",
  headers = {},
  url = "https://example.com/api/checkout",
} = {}) {
  return {
    url,
    headers: new Headers(headers),
    text: async () => body,
  };
}

function memoryKv() {
  const map = new Map();
  return {
    get: async (key) => (map.has(key) ? map.get(key) : null),
    put: async (key, value) => {
      map.set(key, value);
    },
  };
}

function lemonSig(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function stripeHeader(payload, secret, timestamp = "1710000000") {
  const v1 = createHmac("sha256", secret).update(`${timestamp}.${payload}`).digest("hex");
  return `t=${timestamp},v1=${v1}`;
}

async function readJson(res) {
  return JSON.parse(await res.text());
}

const providerCases = [
  [{}, "none"],
  [{ PAYMENT_PROVIDER: "none" }, "none"],
  [{ PAYMENT_PROVIDER: "lemonsqueezy" }, "lemonsqueezy"],
  [{ PAYMENT_PROVIDER: "stripe" }, "stripe"],
  [{ PAYMENT_PROVIDER: "LemonSqueezy" }, "lemonsqueezy"],
  [{ PAYMENT_PROVIDER: "STRIPE" }, "stripe"],
  [{ PAYMENT_PROVIDER: "paypal" }, "none"],
  [{ ENABLE_STRIPE: "true" }, "stripe"],
  [{ ENABLE_STRIPE: "true", PAYMENT_PROVIDER: "" }, "stripe"],
  [{ ENABLE_STRIPE: "true", PAYMENT_PROVIDER: "none" }, "none"],
  [{ ENABLE_STRIPE: "true", PAYMENT_PROVIDER: "lemonsqueezy" }, "lemonsqueezy"],
  [{ ENABLE_STRIPE: "false" }, "none"],
  [{ ENABLE_STRIPE: "yes" }, "stripe"],
];

for (const [env, expected] of providerCases) {
  assert.equal(
    resolvePaymentProvider(env),
    expected,
    `resolvePaymentProvider(${JSON.stringify(env)})`,
  );
}

const noneRes = await handleCheckout({
  request: mockRequest(),
  env: {},
  fetchImpl: async () => {
    throw new Error("fetch should not run when payments are off");
  },
});
assert.equal(noneRes.status, 404);
assert.equal((await readJson(noneRes)).error, "payments_disabled");

const lemonHosted = await handleCheckout({
  request: mockRequest(),
  env: {
    PAYMENT_PROVIDER: "lemonsqueezy",
    LEMONSQUEEZY_CHECKOUT_URL: "https://store.lemonsqueezy.com/checkout/buy/999",
  },
});
assert.equal(lemonHosted.status, 200);
assert.equal((await readJson(lemonHosted)).url, "https://store.lemonsqueezy.com/checkout/buy/999");

let lemonApiCalled = false;
const lemonApi = await handleCheckout({
  request: mockRequest(),
  env: {
    PAYMENT_PROVIDER: "lemonsqueezy",
    LEMONSQUEEZY_API_KEY: "test_api_key",
    LEMONSQUEEZY_STORE_ID: "42",
    LEMONSQUEEZY_VARIANT_ID: "99",
  },
  fetchImpl: async (url, opts) => {
    lemonApiCalled = true;
    assert.equal(url, "https://api.lemonsqueezy.com/v1/checkouts");
    assert.equal(opts.headers.Authorization, "Bearer test_api_key");
    const posted = JSON.parse(opts.body);
    assert.equal(posted.data.type, "checkouts");
    assert.equal(posted.data.relationships.store.data.id, "42");
    assert.equal(posted.data.relationships.variant.data.id, "99");
    assert.ok(!JSON.stringify(posted).includes("subscription"));
    return {
      ok: true,
      json: async () => ({ data: { id: "chk_1", attributes: { url: "https://ls.example/c" } } }),
    };
  },
});
assert.equal(lemonApi.status, 200);
assert.equal(lemonApiCalled, true);
assert.equal((await readJson(lemonApi)).url, "https://ls.example/c");

const stripeLink = await handleCheckout({
  request: mockRequest(),
  env: {
    PAYMENT_PROVIDER: "stripe",
    STRIPE_CHECKOUT_MODE: "payment_link",
    STRIPE_PAYMENT_LINK_URL: "https://buy.stripe.com/test_placeholder",
  },
});
assert.equal(stripeLink.status, 200);
assert.equal((await readJson(stripeLink)).url, "https://buy.stripe.com/test_placeholder");

const secret = "test-webhook-secret";
const lemonBody = JSON.stringify({
  meta: { event_name: "order_created" },
  data: { id: "ord_1", type: "orders", attributes: { total: 500, currency: "USD" } },
});
assert.equal(await lemonSqueezySignatureOk(lemonBody, lemonSig(lemonBody, secret), secret), true);
assert.equal(await lemonSqueezySignatureOk(lemonBody, lemonSig(lemonBody, "other"), secret), false);
assert.equal(await lemonSqueezySignatureOk(lemonBody, "", secret), false);
assert.equal(await lemonSqueezySignatureOk(lemonBody, lemonSig(lemonBody, secret), ""), false);
assert.equal(
  await lemonSqueezySignatureOk(`${lemonBody} `, lemonSig(lemonBody, secret), secret),
  false,
);

const lemonOk = await handleWebhook({
  request: mockRequest({
    body: lemonBody,
    headers: { "X-Signature": lemonSig(lemonBody, secret) },
  }),
  env: {
    PAYMENT_PROVIDER: "lemonsqueezy",
    LEMONSQUEEZY_WEBHOOK_SECRET: secret,
    ORDERS: memoryKv(),
  },
});
assert.equal(lemonOk.status, 200);
assert.equal((await readJson(lemonOk)).received, true);

const lemonBad = await handleWebhook({
  request: mockRequest({
    body: lemonBody,
    headers: { "X-Signature": lemonSig(lemonBody, "wrong-secret") },
  }),
  env: {
    PAYMENT_PROVIDER: "lemonsqueezy",
    LEMONSQUEEZY_WEBHOOK_SECRET: secret,
  },
});
assert.equal(lemonBad.status, 400);
assert.equal((await readJson(lemonBad)).error, "invalid_signature");

const lemonMissing = await handleWebhook({
  request: mockRequest({ body: lemonBody }),
  env: {
    PAYMENT_PROVIDER: "lemonsqueezy",
    LEMONSQUEEZY_WEBHOOK_SECRET: secret,
  },
});
assert.equal(lemonMissing.status, 400);

const stripeBody = JSON.stringify({
  id: "evt_1",
  type: "checkout.session.completed",
  data: { object: { id: "cs_1", amount_total: 500, currency: "usd" } },
});
const stripeSecret = "whsec_test";
assert.equal(
  await stripeSignatureOk(stripeBody, stripeHeader(stripeBody, stripeSecret), stripeSecret),
  true,
);
assert.equal(
  await stripeSignatureOk(stripeBody, stripeHeader(stripeBody, "nope"), stripeSecret),
  false,
);

const stripeOk = await handleWebhook({
  request: mockRequest({
    body: stripeBody,
    headers: { "stripe-signature": stripeHeader(stripeBody, stripeSecret) },
  }),
  env: {
    PAYMENT_PROVIDER: "stripe",
    STRIPE_WEBHOOK_SECRET: stripeSecret,
    ORDERS: memoryKv(),
  },
});
assert.equal(stripeOk.status, 200);

const stripeViaLegacy = await handleWebhook({
  request: mockRequest({
    body: stripeBody,
    headers: { "stripe-signature": stripeHeader(stripeBody, stripeSecret) },
  }),
  env: {
    ENABLE_STRIPE: "true",
    STRIPE_WEBHOOK_SECRET: stripeSecret,
  },
});
assert.equal(stripeViaLegacy.status, 200);

const webhookOff = await handleWebhook({
  request: mockRequest({ body: lemonBody, headers: { "X-Signature": lemonSig(lemonBody, secret) } }),
  env: {},
});
assert.equal(webhookOff.status, 404);

console.log("test_payments.mjs: ok");
