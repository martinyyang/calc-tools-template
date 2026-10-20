"""Resolve PAYMENT_PROVIDER with deprecated ENABLE_STRIPE fallback.

Values: none | creem | paddle | stripe
Legacy (deprecated): lemonsqueezy
Default none — payments fully off (routes 404, button hidden, no keys).
When enabling payments, the recommended provider is creem (one-time only).
"""

from __future__ import annotations

import os
from collections.abc import Mapping

PROVIDERS = ("none", "creem", "paddle", "stripe", "lemonsqueezy")
RECOMMENDED_PROVIDER = "creem"


def _truthy(value: object) -> bool:
    return str(value or "").strip().lower() in {"1", "true", "yes", "on"}


def resolve_payment_provider(env: Mapping[str, str] | None = None) -> str:
    """Return none | creem | paddle | stripe | lemonsqueezy.

    If PAYMENT_PROVIDER is unset or empty, ENABLE_STRIPE=true maps to stripe
    (deprecated compatibility). Unknown PAYMENT_PROVIDER values fall back to none.
    ``lemonsqueezy`` remains a working legacy value.
    """
    src = env if env is not None else os.environ
    raw = str(src.get("PAYMENT_PROVIDER") or "").strip().lower()
    if raw:
        return raw if raw in PROVIDERS else "none"
    if _truthy(src.get("ENABLE_STRIPE")):
        return "stripe"
    return "none"


def payments_enabled(env: Mapping[str, str] | None = None) -> bool:
    return resolve_payment_provider(env) != "none"
