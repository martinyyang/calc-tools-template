# Calc Tools — reusable tool-site template

MIT blank shell for the next **Calc Tools** calculator site.

Clone this repo, swap the placeholder calculator and copy, then bind the new domain on Cloudflare Pages. The empty shell is static. Payments, auth, and analytics stay off until you turn them on.

Copyright (c) 2026 martinyyang. Brand name: Calc Tools.

## What you swap for a new site

1. `builder/config.py` defaults, or the env vars in `.env.example`
2. Tool page copy in `builder/build_site.py` (`page_tool`, `page_home`) and `static/js/tool.js`
3. About / privacy / terms copy
4. Site-specific GA4 (`G-…`) and Clarity IDs — never reuse IDs from another tool site

Keep trailing-slash URLs (`/tool/`, `/about/`). Cloudflare Pages 308s slashless directory paths to the slash URL that returns 200.

## Cloudflare Pages bind

Martin buys the domain on his own machine. The ops bot takes over only after the domain is already in Cloudflare, then binds Pages.

Dashboard settings (exact):

| Field | Value |
| --- | --- |
| Framework preset | None |
| **Build command** | `python3 builder/build_site.py` |
| **Build output directory** | `dist` |
| Root directory | `/` (repo root) |
| Python | 3.12 (Pages default is fine) |

Local build:

```bash
python3 builder/build_site.py
python3 -m http.server 8787 --directory dist
```

Preview: `http://127.0.0.1:8787/` — home, `/tool/`, `/about/`, `/privacy/`, `/terms/`.

Optional Functions preview (only needed when testing checkout):

```bash
npx wrangler pages dev dist
```

`functions/` at the repo root is optional Pages Functions. With `PAYMENT_PROVIDER=none` those routes 404 and do not need payment keys. Delete `functions/` on a free-only site if you want a pure static project.

## Analytics

Match creatorpaycalc: **omit an ID → skip that script**.

Set as Cloudflare Pages **build** environment variables (no GitHub Actions secrets required):

| Variable | Role | If unset |
| --- | --- | --- |
| `GA4_MEASUREMENT_ID` | GA4 (`G-…`) | Script not injected |
| `CLARITY_PROJECT_ID` | Microsoft Clarity | Script not injected |
| `PLAUSIBLE_DOMAIN` | Optional Plausible | Script not injected |
| `UMAMI_WEBSITE_ID` + `UMAMI_SRC` | Optional Umami | Script not injected |

Plausible **or** Umami — one of, not both. If both are set, the builder keeps Plausible and warns.

Events:

| Event | Default |
| --- | --- |
| `page_view` | On when GA4 is injected (`gtag('config')`) |
| `tool_submit` | On when analytics scripts exist |
| `tool_result` | On when analytics scripts exist |
| `checkout_start` | **Off** (`ENABLE_CHECKOUT_EVENTS=false`) |
| `purchase` | **Off** (`ENABLE_CHECKOUT_EVENTS=false`) |

## Payments (default OFF)

`PAYMENT_PROVIDER=none` (default): payments are fully off — checkout/webhook routes 404, the tool button stays hidden, and no provider keys are required. The site is pure static.

One-time pay-per-use only. This template does not sell subscriptions and does not add usage limits or quotas.

When you turn payments **on**, the recommended provider is **Creem** (suits mainland-China individuals; payout to Alipay). **Paddle** is the alternative (payout via Payoneer). Use **Stripe** only when there is an overseas company.

| Variable | Values / role | Default |
| --- | --- | --- |
| `PAYMENT_PROVIDER` | `none` \| `creem` \| `paddle` \| `stripe` | `none` |
| `PAYMENT_PROVIDER=lemonsqueezy` | **Deprecated** legacy value; still works | — |
| `ENABLE_STRIPE` | **Deprecated.** `true` with no `PAYMENT_PROVIDER` maps to `stripe` | `false` |
| `CREEM_CHECKOUT_URL` | Hosted checkout URL (used as-is when set) | empty |
| `CREEM_API_KEY` | API checkout creation (`x-api-key`) | empty |
| `CREEM_PRODUCT_ID` | One-time product id for API checkout | empty |
| `CREEM_WEBHOOK_SECRET` | HMAC-SHA256 key for `creem-signature` | empty |
| `PADDLE_ENV` | `sandbox` \| `production` | `sandbox` |
| `PADDLE_CLIENT_TOKEN` | Paddle.js client token (public) | empty |
| `PADDLE_PRICE_ID` | One-time price id | empty |
| `PADDLE_API_KEY` | Server API key for transaction create | empty |
| `PADDLE_WEBHOOK_SECRET` | HMAC-SHA256 key for `Paddle-Signature` (`ts;h1`) | empty |
| `STRIPE_CHECKOUT_MODE` | `payment_link` \| `checkout_session` | `payment_link` |
| `STRIPE_PAYMENT_LINK_URL` | Stripe Payment Link URL | empty |
| `STRIPE_SECRET_KEY` | Checkout Session secret | empty |
| `STRIPE_WEBHOOK_SECRET` | Stripe-Signature secret | empty |
| `STRIPE_PRICE_ID` | One-time price id | empty |
| `STRIPE_SUCCESS_URL` / `STRIPE_CANCEL_URL` | Stripe session return URLs | `/checkout/success/` and `/checkout/cancel/` |
| `LEMONSQUEEZY_CHECKOUT_URL` | **Deprecated.** Hosted checkout URL | empty |
| `LEMONSQUEEZY_API_KEY` | **Deprecated.** API checkout (`Bearer`) | empty |
| `LEMONSQUEEZY_STORE_ID` | **Deprecated.** Store id | empty |
| `LEMONSQUEEZY_VARIANT_ID` | **Deprecated.** One-time variant id | empty |
| `LEMONSQUEEZY_WEBHOOK_SECRET` | **Deprecated.** HMAC-SHA256 key for `X-Signature` | empty |
| `ENABLE_CHECKOUT_EVENTS` | `checkout_start` / `purchase` analytics | `false` |
| `ENABLE_AUTH_CREDITS` | Auth/credits stubs | `false` |

Do not commit real secrets. Set the same names in Cloudflare Pages → Settings → Environment variables (Production + Preview as needed). `PAYMENT_PROVIDER` must be set for the **build** (button visibility is baked into `window.SITE_CONFIG`) and for Functions (route gate).

### Turn payment ON (Creem — recommended)

Suits mainland-China individuals; payout to Alipay. One-time products only.

1. Create a **one-time** Creem product (not a subscription).
2. In Pages env vars:

   ```
   PAYMENT_PROVIDER=creem
   CREEM_CHECKOUT_URL=https://www.creem.io/payment/...
   CREEM_WEBHOOK_SECRET=
   ```

   Or API checkout creation (used when `CREEM_CHECKOUT_URL` is empty):

   ```
   PAYMENT_PROVIDER=creem
   CREEM_API_KEY=
   CREEM_PRODUCT_ID=
   CREEM_WEBHOOK_SECRET=
   ```

3. Point the Creem webhook at `https://your-domain/api/webhook` and subscribe to `checkout.completed` (one-time). The Function verifies the `creem-signature` header as HMAC-SHA256 of the raw body with `CREEM_WEBHOOK_SECRET` ([Creem webhook docs](https://docs.creem.io/code/webhooks)).
4. Optional: bind a KV namespace named `ORDERS` for idempotent event ids.
5. Leave `ENABLE_CHECKOUT_EVENTS=false` unless you want `checkout_start` / `purchase` analytics.
6. Redeploy. The placeholder tool shows **Start checkout** only when the **build** env has `PAYMENT_PROVIDER` set to a provider other than `none`.

### Paddle (alternative)

Payout via Payoneer. Create a **one-time** Paddle Billing price (not a subscription).

```
PAYMENT_PROVIDER=paddle
PADDLE_ENV=sandbox
PADDLE_CLIENT_TOKEN=
PADDLE_PRICE_ID=pri_...
PADDLE_API_KEY=
PADDLE_WEBHOOK_SECRET=
```

The Function creates a Paddle Billing transaction (`POST /transactions`, `quantity: 1`) against `sandbox-api.paddle.com` or `api.paddle.com` and returns `checkout.url`. Point the Paddle notification destination at `https://your-domain/api/webhook`. The Function verifies `Paddle-Signature` (`ts=...;h1=...`) as HMAC-SHA256 of `` `${ts}:${rawBody}` `` with `PADDLE_WEBHOOK_SECRET` ([Paddle signature docs](https://developer.paddle.com/webhooks/signature-verification)).

### Stripe (overseas company only)

```
PAYMENT_PROVIDER=stripe
STRIPE_CHECKOUT_MODE=payment_link
STRIPE_PAYMENT_LINK_URL=https://buy.stripe.com/...
STRIPE_WEBHOOK_SECRET=whsec_...
```

Or Checkout Session mode (`mode=payment` only):

```
PAYMENT_PROVIDER=stripe
STRIPE_CHECKOUT_MODE=checkout_session
STRIPE_SECRET_KEY=sk_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_ID=price_...
STRIPE_SUCCESS_URL=https://your-domain/checkout/success/
STRIPE_CANCEL_URL=https://your-domain/checkout/cancel/
```

Point the Stripe webhook at `https://your-domain/api/webhook`.

**Deprecated:** `ENABLE_STRIPE=true` with no `PAYMENT_PROVIDER` still enables Stripe. Prefer `PAYMENT_PROVIDER=stripe` on new sites.

### Lemon Squeezy (deprecated legacy)

`PAYMENT_PROVIDER=lemonsqueezy` still works (hosted `LEMONSQUEEZY_CHECKOUT_URL` or API checkout with store + variant; `X-Signature` HMAC-SHA256). Prefer Creem or Paddle on new sites.

Do not invent spend caps or auto-fail limits.

## Auth / credits

Stubs only in `static/js/auth-credits.js` (`window.CalcToolsAuthCredits`).  
`ENABLE_AUTH_CREDITS` stays `false`. Enable when the next paid tool ships.

## URL and host rules

- Canonical, `og:url`, sitemap `<loc>`, and internal links use trailing slashes.
- Prefer a zone-level **www → apex Single Redirect** plus **Always Use HTTPS**. Do not rely on `dist/_redirects` for host aliases.
- Pick `CANONICAL_HOST=apex` or `www` before the first index. Serving both hosts as 200 creates duplication.

## Docs

- [docs/LAUNCH.md](docs/LAUNCH.md) — Domain (Martin) → Pages bind → GA4/Clarity → inject/ship → GSC/Bing → backlinks
- [docs/LESSONS.md](docs/LESSONS.md) — epoxy / creatorpaycalc ops notes

Farm tracker (source of truth): spreadsheet `1hF8bl2eBcFrz_gWMAYRp8UP_fPYErLkUw_eyTSfClvM`.

## Tests

```bash
python3 tests/test_template.py -v
python3 builder/build_site.py
```

## License

[MIT](LICENSE). Copyright (c) 2026 martinyyang.
