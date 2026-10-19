"""Per-site identity. Clone this repo, then change these defaults (or env vars)."""

from __future__ import annotations

import os
from urllib.parse import urlparse


def _env(name: str, default: str = "") -> str:
    return (os.environ.get(name) or default).strip()


def _truthy(name: str, default: str = "false") -> bool:
    return _env(name, default).lower() in {"1", "true", "yes", "on"}


SITE_NAME = _env("SITE_NAME", "Calc Tools")
SITE_TAGLINE = _env("SITE_TAGLINE", "Free online calculators")
SITE_BRAND = _env("SITE_BRAND", "Calc Tools")
SITE_URL = _env("SITE_URL", "https://example.com").rstrip("/")
CANONICAL_HOST = _env("CANONICAL_HOST", "apex").lower()
SITE_CONTACT_EMAIL = _env("SITE_CONTACT_EMAIL", "support@example.com")

GA4_MEASUREMENT_ID = _env("GA4_MEASUREMENT_ID")
CLARITY_PROJECT_ID = _env("CLARITY_PROJECT_ID")
PLAUSIBLE_DOMAIN = _env("PLAUSIBLE_DOMAIN")
UMAMI_WEBSITE_ID = _env("UMAMI_WEBSITE_ID")
UMAMI_SRC = _env("UMAMI_SRC", "https://cloud.umami.is/script.js")

ENABLE_STRIPE = _truthy("ENABLE_STRIPE", "false")
ENABLE_CHECKOUT_EVENTS = _truthy("ENABLE_CHECKOUT_EVENTS", "false")
ENABLE_AUTH_CREDITS = _truthy("ENABLE_AUTH_CREDITS", "false")
STRIPE_CHECKOUT_MODE = _env("STRIPE_CHECKOUT_MODE", "payment_link")

PARSED = urlparse(SITE_URL)
SITE_HOST = PARSED.netloc or "example.com"
SITE_SCHEME = PARSED.scheme or "https"

if CANONICAL_HOST not in {"apex", "www"}:
    CANONICAL_HOST = "apex"
