# Launch checklist (Calc Tools farm)

Aligned to the Tool-site launch SOP on the farm sheet  
[工具站进度总表](https://docs.google.com/spreadsheets/d/1hF8bl2eBcFrz_gWMAYRp8UP_fPYErLkUw_eyTSfClvM/edit) (`spreadsheetId=1hF8bl2eBcFrz_gWMAYRp8UP_fPYErLkUw_eyTSfClvM`).

The sheet is the source of truth. This file is a repo checklist, not a substitute.

**Domain buying and payment are not documented here.** Martin buys the domain on his own machine. The ops bot takes over only after the domain is already in Cloudflare, then binds Pages.

Do not put secrets, Creem / Paddle / Stripe / Lemon Squeezy keys, or personal inboxes in git, chat, or sheet cells.

## Stage 0 — Intake (sheet row first)

- [ ] Site name, intended domain, repo path
- [ ] Build command `python3 builder/build_site.py` and output dir `dist`
- [ ] Analytics timezone / currency notes
- [ ] New row on sheet tab **站点总览**
- [ ] Copy one-time steps from **环节模板** into **一次性进度**

## Stage 1 — Domain (Martin)

- [ ] Martin buys the domain on his own machine (bot does not buy or pay)
- [ ] Domain is in the target Cloudflare account
- [ ] COS / Martin confirms “domain is already in Cloudflare”
- [ ] Bot does not continue to Pages bind until that confirmation exists on the sheet

## Stage 2 — Cloudflare Pages bind

- [ ] Pages → Create project → Connect Git → this repo
- [ ] Build command: `python3 builder/build_site.py`
- [ ] Output directory: `dist`
- [ ] Preview deploy of the empty shell succeeds (HTTPS 200 on `/`)
- [ ] Custom domain: bind apex (or the chosen canonical host)
- [ ] Zone: **Always Use HTTPS** + **www → apex Single Redirect** (or the reverse if `CANONICAL_HOST=www`)
- [ ] No GitHub Actions secrets unless a later job truly needs them. Pages env vars are enough for analytics inject.

## Stage 3 — GA4 + Clarity

- [ ] New GA4 property + web stream → site-specific `G-` ID (never reuse)
- [ ] New Clarity project → site-specific Project ID (never reuse)
- [ ] Write both IDs on **站点总览**

## Stage 4 — Inject + ship

- [ ] Pages build env: `GA4_MEASUREMENT_ID`, `CLARITY_PROJECT_ID`
- [ ] Optional one-of: `PLAUSIBLE_DOMAIN` **or** `UMAMI_WEBSITE_ID` (not both)
- [ ] Rebuild / redeploy
- [ ] Live HTML contains the GA4 and Clarity snippets; `https://` `/` is 200
- [ ] `https://…/sitemap.xml` lists trailing-slash URLs

## Stage 5 — Search consoles

- [ ] Google Search Console: verify property, submit `https://<canonical>/sitemap.xml`
- [ ] Bing Webmaster: verify (GSC import is fine), submit the same sitemap
- [ ] Confirm GSC is not chasing slashless sitemap URLs into 308s

## Stage 6 — Backlinks (≤5 free directories / week / site)

- [ ] After stage 5 is done, open a **循环任务** row for this site the same day (do not wait for a verbal “start backlinks”)
- [ ] Free directory submissions **≤5 per site per week**; sites do not share quota
- [ ] Evidence URL or screenshot on the sheet
- [ ] Login walls: mark **待登录** and stop
- [ ] No paid links, no reciprocal badge swaps, no mixing with other farms’ lists
- [ ] Product Hunt / Hacker News / Reddit: draft only; human gate before publish
- [ ] ProductPerch: do not put real names or avatars on creator profiles if the goal is MIT → dofollow

## Later (not this template)

- AdSense: only after the site has a real tool and traffic. Current farm sites are 暂缓. Never bind Fetch China.
- Payments stay OFF (`PAYMENT_PROVIDER=none`) until a paid tool ships. Recommended provider when enabling: **Creem** (one-time only; suits mainland-China individuals, payout to Alipay). Alternative: **Paddle** (payout via Payoneer). **Stripe** only when there is an overseas company. `lemonsqueezy` is a deprecated legacy value that still works. `ENABLE_STRIPE` is deprecated; `ENABLE_STRIPE=true` with no `PAYMENT_PROVIDER` still maps to Stripe. Auth-credits stay OFF (`ENABLE_AUTH_CREDITS=false`). See README.

## Recurring (after launch)

- Weekly HTTPS / key-page smoke
- GSC coverage / index spot-check
- Confirm GA4 and Clarity are receiving hits
- Weekly unused directory quota (priority: new stage-6 sites, then site number ascending)
