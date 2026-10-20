#!/usr/bin/env python3
"""Calc Tools — light static site builder.

Renders trailing-slash HTML into dist/ for Cloudflare Pages.

  python3 builder/build_site.py

Cloudflare Pages:
  Build command:           python3 builder/build_site.py
  Build output directory:  dist

Analytics: omit GA4_MEASUREMENT_ID / CLARITY_PROJECT_ID (and optional
Plausible XOR Umami) to skip injecting those scripts.
"""

from __future__ import annotations

import html
import json
import os
import shutil
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = Path(os.environ["CALC_TOOLS_DIST"]).resolve() if os.environ.get("CALC_TOOLS_DIST") else ROOT / "dist"
STATIC = ROOT / "static"

sys.path.insert(0, str(ROOT / "builder"))
from config import (  # noqa: E402
    CANONICAL_HOST,
    CLARITY_PROJECT_ID,
    ENABLE_AUTH_CREDITS,
    ENABLE_CHECKOUT_EVENTS,
    ENABLE_STRIPE,
    GA4_MEASUREMENT_ID,
    PAYMENT_PROVIDER,
    PAYMENTS_ENABLED,
    PLAUSIBLE_DOMAIN,
    SITE_BRAND,
    SITE_CONTACT_EMAIL,
    SITE_HOST,
    SITE_NAME,
    SITE_SCHEME,
    SITE_TAGLINE,
    SITE_URL,
    STRIPE_CHECKOUT_MODE,
    UMAMI_SRC,
    UMAMI_WEBSITE_ID,
)


NAV = [
    ("Home", "/"),
    ("Tool", "/tool/"),
    ("About", "/about/"),
]

FOOTER = [
    ("Home", "/"),
    ("Tool", "/tool/"),
    ("About", "/about/"),
    ("Privacy", "/privacy/"),
    ("Terms", "/terms/"),
]


def esc(value: str) -> str:
    return html.escape(value, quote=True)


def slash(path: str) -> str:
    """Homepage stays `/`; every other route ends with `/` (epoxy GSC lesson)."""
    if path in {"/", ""}:
        return "/"
    if not path.startswith("/"):
        path = "/" + path
    return path if path.endswith("/") else path + "/"


def abs_url(path: str) -> str:
    if path == "/":
        return f"{SITE_URL}/"
    return f"{SITE_URL}{slash(path)}"


def analytics_tags() -> str:
    tags: list[str] = []
    if GA4_MEASUREMENT_ID:
        gid = esc(GA4_MEASUREMENT_ID)
        tags.append(
            f'<script async src="https://www.googletagmanager.com/gtag/js?id={gid}"></script>\n'
            f"<script>window.dataLayer=window.dataLayer||[];function gtag(){{dataLayer.push(arguments);}}"
            f"gtag('js',new Date());gtag('config','{gid}');</script>"
        )
    if CLARITY_PROJECT_ID:
        cid = esc(CLARITY_PROJECT_ID)
        tags.append(
            f"<script>(function(c,l,a,r,i,t,y){{c[a]=c[a]||function(){{(c[a].q=c[a].q||[]).push(arguments)}};"
            f't=l.createElement(r);t.async=1;t.src="https://www.clarity.ms/tag/"+i;'
            f"y=l.getElementsByTagName(r)[0];y.parentNode.insertBefore(t,y);}})"
            f'(window,document,"clarity","script","{cid}");</script>'
        )
    if PLAUSIBLE_DOMAIN and UMAMI_WEBSITE_ID:
        print("warn: both PLAUSIBLE_DOMAIN and UMAMI_WEBSITE_ID are set; using Plausible only (one-of)")
    if PLAUSIBLE_DOMAIN:
        tags.append(
            f'<script defer data-domain="{esc(PLAUSIBLE_DOMAIN)}" '
            f'src="https://plausible.io/js/script.js"></script>'
        )
    elif UMAMI_WEBSITE_ID:
        tags.append(
            f'<script defer src="{esc(UMAMI_SRC)}" data-website-id="{esc(UMAMI_WEBSITE_ID)}"></script>'
        )
    return "\n".join(tags)


def site_config_script() -> str:
    payload = {
        "siteName": SITE_NAME,
        "paymentProvider": PAYMENT_PROVIDER,
        "paymentsEnabled": PAYMENTS_ENABLED,
        "enableStripe": ENABLE_STRIPE,
        "enableCheckoutEvents": ENABLE_CHECKOUT_EVENTS,
        "enableAuthCredits": ENABLE_AUTH_CREDITS,
        "stripeCheckoutMode": STRIPE_CHECKOUT_MODE,
    }
    return f"<script>window.SITE_CONFIG={json.dumps(payload, separators=(',', ':'))};</script>"


def nav_html(current: str) -> str:
    items = []
    for label, href in NAV:
        current_attr = ' aria-current="page"' if slash(href) == slash(current) or (
            href == "/" and current == "/"
        ) else ""
        items.append(f'<li><a href="{href}"{current_attr}>{esc(label)}</a></li>')
    return "".join(items)


def footer_html() -> str:
    items = "".join(f'<li><a href="{href}">{esc(label)}</a></li>' for label, href in FOOTER)
    return f"""<footer class="site-footer">
  <div class="wrap">
    <p>{esc(SITE_NAME)} — a {esc(SITE_BRAND)} template. Calculations run in your browser.</p>
    <nav aria-label="Footer">
      <ul>{items}<li><a href="/sitemap.xml">Sitemap</a></li></ul>
    </nav>
  </div>
</footer>"""


def base_page(
    *,
    title: str,
    description: str,
    path: str,
    h1: str,
    body: str,
    extra_head: str = "",
    extra_js: str = "",
    robots: str = "index, follow",
    jsonld: dict | None = None,
) -> str:
    canonical_path = "/" if path == "/" else slash(path)
    canonical = abs_url(canonical_path)
    ld = jsonld or {
        "@context": "https://schema.org",
        "@type": "WebPage",
        "name": title,
        "url": canonical,
        "description": description,
        "isPartOf": {"@type": "WebSite", "name": SITE_NAME, "url": f"{SITE_URL}/"},
    }
    mark = esc(SITE_NAME[:1] or "C")
    return f"""<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{esc(title)}</title>
<meta name="description" content="{esc(description)}">
<link rel="canonical" href="{esc(canonical)}">
<meta name="robots" content="{esc(robots)}">
<meta property="og:type" content="website">
<meta property="og:site_name" content="{esc(SITE_NAME)}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(description)}">
<meta property="og:url" content="{esc(canonical)}">
<link rel="icon" href="/favicon.svg" type="image/svg+xml">
<link rel="stylesheet" href="/css/site.css">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
{site_config_script()}
{analytics_tags()}
{extra_head.strip()}
</head>
<body>
<header class="site-header">
  <div class="wrap">
    <a class="brand" href="/" title="{esc(SITE_NAME)} home">
      <span class="brand-mark" aria-hidden="true">{mark}</span>
      <span>{esc(SITE_NAME)} <span class="brand-sub">{esc(SITE_TAGLINE)}</span></span>
    </a>
    <nav aria-label="Main"><ul>{nav_html(canonical_path)}</ul></nav>
  </div>
</header>
<main class="wrap">
<h1>{h1}</h1>
{body}
</main>
{footer_html()}
<script src="/js/analytics.js"></script>
<script src="/js/auth-credits.js"></script>
{extra_js}
</body>
</html>
"""


def page_home() -> str:
    return base_page(
        title=f"{SITE_NAME} — {SITE_TAGLINE}",
        description=f"{SITE_NAME} is a reusable {SITE_BRAND} calculator-site template. Swap this hub copy and the tool page for the next product.",
        path="/",
        h1=SITE_NAME,
        jsonld={
            "@context": "https://schema.org",
            "@type": "WebSite",
            "name": SITE_NAME,
            "url": f"{SITE_URL}/",
            "description": f"{SITE_NAME} is a reusable {SITE_BRAND} calculator-site template.",
        },
        body=f"""
<p class="lede">{esc(SITE_TAGLINE)}. Blank shell for the next {esc(SITE_BRAND)} site — keep the chrome, replace the calculator.</p>
<div class="tool-grid">
  <article class="card">
    <h2>Placeholder tool</h2>
    <p>A sample client-side calculator so the next site only swaps business logic and copy.</p>
    <a class="btn" href="/tool/">Open the tool</a>
  </article>
  <article class="card">
    <h2>About {esc(SITE_BRAND)}</h2>
    <p>Independent, browser-side calculators. No account required on this free shell.</p>
    <a href="/about/">About the brand</a>
  </article>
</div>
""",
    )


def page_tool() -> str:
    return base_page(
        title=f"Sample calculator | {SITE_NAME}",
        description=f"Placeholder calculator on {SITE_NAME}. Replace the formula and copy for the next tool site.",
        path="/tool/",
        h1="Sample calculator",
        extra_js='<script src="/js/tool.js"></script>',
        jsonld={
            "@context": "https://schema.org",
            "@type": "WebApplication",
            "name": f"{SITE_NAME} sample calculator",
            "url": abs_url("/tool/"),
            "applicationCategory": "UtilityApplication",
            "offers": {"@type": "Offer", "price": "0", "priceCurrency": "USD"},
        },
        body="""
<p class="lede">Replace this form and <code>static/js/tool.js</code> with the real calculator. Inputs stay in the browser.</p>
<form id="tool-form" class="calc" novalidate>
  <label for="tool-value">Value</label>
  <input id="tool-value" name="value" type="number" step="any" value="10" required>
  <label for="tool-factor">Factor</label>
  <input id="tool-factor" name="factor" type="number" step="any" value="1.5" required>
  <button class="btn" type="submit">Calculate</button>
  <p class="calc-out" id="tool-result" aria-live="polite">—</p>
  <p class="calc-line" id="tool-result-line">Submit to see a sample result.</p>
  <button class="btn" type="button" id="checkout-start" hidden>Start checkout (off by default)</button>
</form>
<p class="note">Payments stay off until <code>PAYMENT_PROVIDER</code> is <code>lemonsqueezy</code> or <code>stripe</code> and Pages Functions are configured. Auth/credits remain stubs.</p>
""",
    )


def page_about() -> str:
    return base_page(
        title=f"About {SITE_BRAND} | {SITE_NAME}",
        description=f"About {SITE_BRAND}: a family of free, browser-side calculator sites.",
        path="/about/",
        h1=f"About {esc(SITE_BRAND)}",
        body=f"""
<p>{esc(SITE_BRAND)} publishes small, focused calculator sites. Each site is independent, uses its own analytics IDs, and keeps math in the visitor's browser.</p>
<h2>This template</h2>
<p>Clone the repo, change <code>builder/config.py</code> (or env vars), replace the tool page and <code>static/js/tool.js</code>, and bind the new domain on Cloudflare Pages after the domain is already in Cloudflare.</p>
<h2>What we do not ship by default</h2>
<ul>
  <li>Payments are off (<code>PAYMENT_PROVIDER=none</code>). Lemon Squeezy is the recommended one-time provider; Stripe is still available. The checkout and webhook files are skeletons only.</li>
  <li>Accounts and credits are interface stubs: enable when the next paid tool ships.</li>
  <li>Analytics scripts load only when site-specific IDs are set.</li>
</ul>
<p>Questions: <a href="mailto:{esc(SITE_CONTACT_EMAIL)}">{esc(SITE_CONTACT_EMAIL)}</a> (set <code>SITE_CONTACT_EMAIL</code> per site; keep personal inboxes out of git).</p>
""",
    )


def page_privacy() -> str:
    return base_page(
        title=f"Privacy Policy | {SITE_NAME}",
        description=f"Privacy policy for {SITE_NAME}: client-side calculations and optional analytics.",
        path="/privacy/",
        h1="Privacy Policy",
        body=f"""
<p>Last updated: October 19, 2026.</p>
<p>{esc(SITE_NAME)} is part of the {esc(SITE_BRAND)} farm. We respect visitor privacy and keep this policy short.</p>
<h2>1. Client-side calculations</h2>
<p>Calculator inputs are processed in your browser. This static shell does not send those numbers to our servers.</p>
<h2>2. Analytics (only if configured)</h2>
<p>If this site has Google Analytics 4 and Microsoft Clarity IDs, those scripts load so we can see aggregate usage. If the IDs are unset, the scripts are not injected. An optional Plausible <em>or</em> Umami tag may be added the same way. We do not reuse analytics IDs across tool sites.</p>
<h2>3. Payments</h2>
<p>Payments are off by default. If a later paid tool turns them on (Lemon Squeezy or Stripe), the provider processes the payment on their hosted pages. We do not store card numbers.</p>
<h2>4. Accounts and credits</h2>
<p>This shell has no login. Auth and credits stay disabled until a paid tool ships.</p>
<h2>5. Contact</h2>
<p><a href="mailto:{esc(SITE_CONTACT_EMAIL)}">{esc(SITE_CONTACT_EMAIL)}</a></p>
""",
    )


def page_terms() -> str:
    return base_page(
        title=f"Terms of Service | {SITE_NAME}",
        description=f"Terms of service and estimation disclaimers for {SITE_NAME}.",
        path="/terms/",
        h1="Terms of Service",
        body=f"""
<p>Last updated: October 19, 2026.</p>
<p>By using {esc(SITE_NAME)} you agree to these terms.</p>
<h2>1. Estimates only</h2>
<p>Outputs are planning estimates, not professional advice and not a guarantee of real-world results.</p>
<h2>2. License</h2>
<p>The template is released under the MIT License. Copyright (c) 2026 martinyyang. Brand name: {esc(SITE_BRAND)}.</p>
<h2>3. Limitation of liability</h2>
<p>The site is provided “as is”, without warranty. Maintainers are not liable for damages arising from use of the calculators.</p>
<h2>4. Payments</h2>
<p>Paid checkout is off unless a later tool sets <code>PAYMENT_PROVIDER</code> to <code>lemonsqueezy</code> or <code>stripe</code>. No subscriptions are sold by this template.</p>
<h2>5. Contact</h2>
<p><a href="mailto:{esc(SITE_CONTACT_EMAIL)}">{esc(SITE_CONTACT_EMAIL)}</a></p>
""",
    )


def page_404() -> str:
    return base_page(
        title=f"Page not found | {SITE_NAME}",
        description=f"That URL is not on {SITE_NAME}.",
        path="/404.html",
        h1="Page not found",
        robots="noindex, follow",
        body="""
<div class="hero-404">
  <p class="code">404</p>
  <p class="lede">This path is not part of the site. Try the home page or the placeholder tool.</p>
  <p><a class="btn" href="/">Back home</a> <a href="/tool/">Open the tool</a></p>
</div>
""",
    )


def page_checkout_success() -> str:
    return base_page(
        title=f"Checkout success | {SITE_NAME}",
        description="Checkout success landing page (payments off by default).",
        path="/checkout/success/",
        h1="Payment complete",
        robots="noindex, follow",
        extra_js="""<script>
if (window.CalcToolsAnalytics) {
  window.CalcToolsAnalytics.track("purchase", { tool: "placeholder" });
}
</script>""",
        body="""
<p>This page is the checkout success URL. Payments are off until <code>PAYMENT_PROVIDER</code> is <code>lemonsqueezy</code> or <code>stripe</code>.</p>
<p><a href="/tool/">Return to the tool</a></p>
""",
    )


def page_checkout_cancel() -> str:
    return base_page(
        title=f"Checkout canceled | {SITE_NAME}",
        description="Checkout cancel landing page (payments off by default).",
        path="/checkout/cancel/",
        h1="Checkout canceled",
        robots="noindex, follow",
        body="""
<p>No charge was made. This page is the checkout cancel URL.</p>
<p><a href="/tool/">Return to the tool</a></p>
""",
    )


def build_sitemap(paths: list[str]) -> str:
    urls = "\n".join(f"  <url><loc>{abs_url(path)}</loc></url>" for path in paths)
    return f"""<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
{urls}
</urlset>
"""


def build_robots() -> str:
    return f"""User-agent: *
Allow: /

Sitemap: {SITE_URL}/sitemap.xml
"""


def build_headers() -> str:
    return """/*
  X-Content-Type-Options: nosniff
  X-Frame-Options: DENY
  Referrer-Policy: strict-origin-when-cross-origin
  Permissions-Policy: camera=(), microphone=(), geolocation=()
"""


def build_redirects() -> str:
    apex = SITE_HOST[4:] if SITE_HOST.startswith("www.") else SITE_HOST
    www = apex if SITE_HOST.startswith("www.") else f"www.{apex}"
    if CANONICAL_HOST == "www":
        canonical = f"{SITE_SCHEME}://{www}"
        other = f"{SITE_SCHEME}://{apex}"
        other_http = f"http://{apex}"
        canon_http = f"http://{www}"
    else:
        canonical = f"{SITE_SCHEME}://{apex}"
        other = f"{SITE_SCHEME}://{www}"
        other_http = f"http://{www}"
        canon_http = f"http://{apex}"
    return f"""# Fallback only. Prefer a Cloudflare Single Redirect (www↔apex)
# plus Always Use HTTPS at the zone. Pages _redirects often does
# not fire on custom-domain host aliases (epoxy lesson).
{other}/* {canonical}/:splat 301
{other_http}/* {canonical}/:splat 301
{canon_http}/* {canonical}/:splat 301

# Directory URLs already 308 to trailing slashes when index.html exists.
# Keep canonical + sitemap on the 200 URL (trailing slash).

/* /404.html 404
"""


def favicon_svg() -> str:
    return """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 32 32">
  <rect width="32" height="32" rx="8" fill="#0f766e"/>
  <text x="16" y="22" text-anchor="middle" font-size="16" font-family="system-ui,sans-serif" fill="#fff">C</text>
</svg>
"""


def write(rel: str, content: str) -> None:
    dest = DIST / rel
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_text(content, encoding="utf-8")
    print(f"  {rel}")


def main() -> None:
    if DIST.exists():
        shutil.rmtree(DIST)
    DIST.mkdir(parents=True)

    pages = {
        "index.html": page_home(),
        "tool/index.html": page_tool(),
        "about/index.html": page_about(),
        "privacy/index.html": page_privacy(),
        "terms/index.html": page_terms(),
        "checkout/success/index.html": page_checkout_success(),
        "checkout/cancel/index.html": page_checkout_cancel(),
        "404.html": page_404(),
    }
    for rel, content in pages.items():
        write(rel, content)

    if STATIC.exists():
        shutil.copytree(STATIC, DIST, dirs_exist_ok=True)

    write("favicon.svg", favicon_svg())
    sitemap_paths = ["/", "/tool/", "/about/", "/privacy/", "/terms/"]
    write("sitemap.xml", build_sitemap(sitemap_paths))
    write("robots.txt", build_robots())
    write("_headers", build_headers())
    write("_redirects", build_redirects())

    print(f"built {DIST} ({SITE_URL}/) payments={PAYMENT_PROVIDER} ga4={bool(GA4_MEASUREMENT_ID)} clarity={bool(CLARITY_PROJECT_ID)}")


if __name__ == "__main__":
    main()
