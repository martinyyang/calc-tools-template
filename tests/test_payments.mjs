/**
 * Provider selection + webhook signature tests for functions/_lib/payments.js.
 * Run: node tests/test_payments.mjs
 */
import { createHmac } from "node:crypto";
import assert from "node:assert/strict";
import {
  creemSignatureOk,
  handleCheckout,
  handleWebhook,
  lemonSqueezySignatureOk,
  paddleSignatureOk,
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

function bodyHmac(payload, secret) {
  return createHmac("sha256", secret).update(payload).digest("hex");
}

function paddleHeader(payload, secret, timestamp = "1710000000") {
  const h1 = createHmac("sha256", secret).update(`${timestamp}:${payload}`).digest("hex");
  return `ts=${timestamp};h1=${h1}`;
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
  [{ PAYMENT_PROVIDER: "creem" }, "creem"],
  [{ PAYMENT_PROVIDER: "paddle" }, "paddle"],
  [{ PAYMENT_PROVIDER: "stripe" }, "stripe"],
  [{ PAYMENT_PROVIDER: "lemonsqueezy" }, "lemonsqueezy"],
  [{ PAYMENT_PROVIDER: "Creem" }, "creem"],
  [{ PAYMENT_PROVIDER: "PADDLE" }, "paddle"],
  [{ PAYMENT_PROVIDER: "STRIPE" }, "stripe"],
  [{ PAYMENT_PROVIDER: "LemonSqueezy" }, "lemonsqueezy"],
  [{ PAYMENT_PROVIDER: "paypal" }, "none"],
  [{ ENABLE_STRIPE: "true" }, "stripe"],
  [{ ENABLE_STRIPE: "true", PAYMENT_PROVIDER: "" }, "stripe"],
  [{ ENABLE_STRIPE: "true", PAYMENT_PROVIDER: "none" }, "none"],
  [{ ENABLE_STRIPE: "true", PAYMENT_PROVIDER: "creem" }, "creem"],
  [{ ENABLE_STRIPE: "true", PAYMENT_PROVIDER: "paddle" }, "paddle"],
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

const creemHosted = await handleCheckout({
  request: mockRequest(),
  env: {
    PAYMENT_PROVIDER: "creem",
    CREEM_CHECKOUT_URL: "https://www.creem.io/payment/prod_test",
  },
});
assert.equal(creemHosted.status, 200);
assert.equal((await readJson(creemHosted)).url, "https://www.creem.io/payment/prod_test");

let creemApiCalled = false;
const creemApi = await handleCheckout({
  request: mockRequest(),
  env: {
    PAYMENT_PROVIDER: "creem",
    CREEM_API_KEY: "creem_test_key",
    CREEM_PRODUCT_ID: "prod_123",
  },
  fetchImpl: async (url, opts) => {
    creemApiCalled = true;
    assert.equal(url, "https://api.creem.io/v1/checkouts");
    assert.equal(opts.headers["x-api-key"], "creem_test_key");
    const posted = JSON.parse(opts.body);
    assert.equal(posted.product_id, "prod_123");
    assert.ok(!JSON.stringify(posted).includes("subscription"));
    return {
      ok: true,
      json: async () => ({ id: "ch_1", checkout_url: "https://checkout.creem.io/ch_1" }),
    };
  },
});
assert.equal(creemApi.status, 200);
assert.equal(creemApiCalled, true);
assert.equal((await readJson(creemApi)).url, "https://checkout.creem.io/ch_1");

const creemMissing = await handleCheckout({
  request: mockRequest(),
  env: { PAYMENT_PROVIDER: "creem" },
});
assert.equal(creemMissing.status, 500);
assert.equal((await readJson(creemMissing)).error, "missing_creem_checkout_config");

let paddleApiCalled = false;
const paddleTxn = await handleCheckout({
  request: mockRequest(),
  env: {
    PAYMENT_PROVIDER: "paddle",
    PADDLE_ENV: "sandbox",
    PADDLE_CLIENT_TOKEN: "test_client_token",
    PADDLE_API_KEY: "pdl_sdbx_apikey_test",
    PADDLE_PRICE_ID: "pri_one_time",
  },
  fetchImpl: async (url, opts) => {
    paddleApiCalled = true;
    assert.equal(url, "https://sandbox-api.paddle.com/transactions");
    assert.equal(opts.headers.Authorization, "Bearer pdl_sdbx_apikey_test");
    const posted = JSON.parse(opts.body);
    assert.equal(posted.items[0].price_id, "pri_one_time");
    assert.equal(posted.items[0].quantity, 1);
    assert.ok(!JSON.stringify(posted).includes("subscription"));
    return {
      ok: true,
      json: async () => ({
        data: { id: "txn_1", checkout: { url: "https://sandbox-checkout.paddle.com/?_ptxn=txn_1" } },
      }),
    };
  },
});
assert.equal(paddleTxn.status, 200);
assert.equal(paddleApiCalled, true);
assert.equal((await readJson(paddleTxn)).url, "https://sandbox-checkout.paddle.com/?_ptxn=txn_1");

let paddleLiveCalled = false;
const paddleLive = await handleCheckout({
  request: mockRequest(),
  env: {
    PAYMENT_PROVIDER: "paddle",
    PADDLE_ENV: "production",
    PADDLE_API_KEY: "pdl_live_apikey_test",
    PADDLE_PRICE_ID: "pri_live",
  },
  fetchImpl: async (url) => {
    paddleLiveCalled = true;
    assert.equal(url, "https://api.paddle.com/transactions");
    return {
      ok: true,
      json: async () => ({
        data: { id: "txn_live", checkout: { url: "https://buy.paddle.com/?_ptxn=txn_live" } },
      }),
    };
  },
});
assert.equal(paddleLive.status, 200);
assert.equal(paddleLiveCalled, true);

const paddleBadEnv = await handleCheckout({
  request: mockRequest(),
  env: {
    PAYMENT_PROVIDER: "paddle",
    PADDLE_ENV: "staging",
    PADDLE_API_KEY: "k",
    PADDLE_PRICE_ID: "pri_x",
  },
});
assert.equal(paddleBadEnv.status, 500);
assert.equal((await readJson(paddleBadEnv)).error, "invalid_paddle_env");

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
const creemBody = JSON.stringify({
  id: "evt_creem_1",
  eventType: "checkout.completed",
  object: { id: "ch_1", order_id: "ord_1" },
});
assert.equal(await creemSignatureOk(creemBody, bodyHmac(creemBody, secret), secret), true);
assert.equal(await creemSignatureOk(creemBody, bodyHmac(creemBody, "other"), secret), false);
assert.equal(await creemSignatureOk(creemBody, "", secret), false);
assert.equal(await creemSignatureOk(creemBody, bodyHmac(creemBody, secret), ""), false);
assert.equal(await creemSignatureOk(`${creemBody} `, bodyHmac(creemBody, secret), secret), false);

const creemOk = await handleWebhook({
  request: mockRequest({
    body: creemBody,
    headers: { "creem-signature": bodyHmac(creemBody, secret) },
  }),
  env: {
    PAYMENT_PROVIDER: "creem",
    CREEM_WEBHOOK_SECRET: secret,
    ORDERS: memoryKv(),
  },
});
assert.equal(creemOk.status, 200);
assert.equal((await readJson(creemOk)).received, true);

const creemBad = await handleWebhook({
  request: mockRequest({
    body: creemBody,
    headers: { "creem-signature": bodyHmac(creemBody, "wrong-secret") },
  }),
  env: {
    PAYMENT_PROVIDER: "creem",
    CREEM_WEBHOOK_SECRET: secret,
  },
});
assert.equal(creemBad.status, 400);
assert.equal((await readJson(creemBad)).error, "invalid_signature");

const creemMissingSig = await handleWebhook({
  request: mockRequest({ body: creemBody }),
  env: {
    PAYMENT_PROVIDER: "creem",
    CREEM_WEBHOOK_SECRET: secret,
  },
});
assert.equal(creemMissingSig.status, 400);

const paddleSecret = "pdl_ntfset_test_secret";
const paddleBody = JSON.stringify({
  event_id: "evt_paddle_1",
  event_type: "transaction.completed",
  data: {
    id: "txn_1",
    details: { totals: { total: "500", currency_code: "USD" } },
  },
});
assert.equal(await paddleSignatureOk(paddleBody, paddleHeader(paddleBody, paddleSecret), paddleSecret), true);
assert.equal(await paddleSignatureOk(paddleBody, paddleHeader(paddleBody, "nope"), paddleSecret), false);
assert.equal(await paddleSignatureOk(paddleBody, "", paddleSecret), false);
assert.equal(await paddleSignatureOk(paddleBody, paddleHeader(paddleBody, paddleSecret), ""), false);
assert.equal(
  await paddleSignatureOk(`${paddleBody} `, paddleHeader(paddleBody, paddleSecret), paddleSecret),
  false,
);

const rotated = `${paddleHeader(paddleBody, "old")};h1=${createHmac("sha256", paddleSecret).update(`1710000000:${paddleBody}`).digest("hex")}`;
assert.equal(await paddleSignatureOk(paddleBody, rotated, paddleSecret), true);

const paddleOk = await handleWebhook({
  request: mockRequest({
    body: paddleBody,
    headers: { "Paddle-Signature": paddleHeader(paddleBody, paddleSecret) },
  }),
  env: {
    PAYMENT_PROVIDER: "paddle",
    PADDLE_WEBHOOK_SECRET: paddleSecret,
    ORDERS: memoryKv(),
  },
});
assert.equal(paddleOk.status, 200);
assert.equal((await readJson(paddleOk)).received, true);

const paddleBad = await handleWebhook({
  request: mockRequest({
    body: paddleBody,
    headers: { "Paddle-Signature": paddleHeader(paddleBody, "wrong") },
  }),
  env: {
    PAYMENT_PROVIDER: "paddle",
    PADDLE_WEBHOOK_SECRET: paddleSecret,
  },
});
assert.equal(paddleBad.status, 400);
assert.equal((await readJson(paddleBad)).error, "invalid_signature");

const lemonBody = JSON.stringify({
  meta: { event_name: "order_created" },
  data: { id: "ord_1", type: "orders", attributes: { total: 500, currency: "USD" } },
});
assert.equal(await lemonSqueezySignatureOk(lemonBody, bodyHmac(lemonBody, secret), secret), true);
assert.equal(await lemonSqueezySignatureOk(lemonBody, bodyHmac(lemonBody, "other"), secret), false);

const lemonOk = await handleWebhook({
  request: mockRequest({
    body: lemonBody,
    headers: { "X-Signature": bodyHmac(lemonBody, secret) },
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
    headers: { "X-Signature": bodyHmac(lemonBody, "wrong-secret") },
  }),
  env: {
    PAYMENT_PROVIDER: "lemonsqueezy",
    LEMONSQUEEZY_WEBHOOK_SECRET: secret,
  },
});
assert.equal(lemonBad.status, 400);
assert.equal((await readJson(lemonBad)).error, "invalid_signature");

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
  request: mockRequest({ body: creemBody, headers: { "creem-signature": bodyHmac(creemBody, secret) } }),
  env: {},
});
assert.equal(webhookOff.status, 404);

console.log("test_payments.mjs: ok");
