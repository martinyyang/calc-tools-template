#!/usr/bin/env python3
"""Template invariants: trailing slashes, gated analytics, default-off payments."""

from __future__ import annotations

import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
BUILDER = ROOT / "builder" / "build_site.py"

FORBIDDEN = (
    "hua" + "xve",
    "ria" + "fen",
    "@gmai" + "l.com",
    "@163." + "com",
    "tel:+",
)


def run_build(env: dict[str, str] | None = None) -> Path:
    work = Path(tempfile.mkdtemp(prefix="calc-tools-build-"))
    cmd_env = os.environ.copy()
    cmd_env.update(env or {})
    cmd_env["CALC_TOOLS_DIST"] = str(work)
    for key in (
        "GA4_MEASUREMENT_ID",
        "CLARITY_PROJECT_ID",
        "PLAUSIBLE_DOMAIN",
        "UMAMI_WEBSITE_ID",
        "ENABLE_STRIPE",
        "ENABLE_CHECKOUT_EVENTS",
        "ENABLE_AUTH_CREDITS",
    ):
        cmd_env.setdefault(key, "")
    subprocess.run(
        [sys.executable, str(BUILDER)],
        check=True,
        cwd=ROOT,
        env=cmd_env,
        capture_output=True,
        text=True,
    )
    return work


class TemplateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.dist = run_build()

    @classmethod
    def tearDownClass(cls) -> None:
        shutil.rmtree(cls.dist, ignore_errors=True)

    def read(self, rel: str) -> str:
        return (self.dist / rel).read_text(encoding="utf-8")

    def test_required_outputs_exist(self) -> None:
        for rel in (
            "index.html",
            "tool/index.html",
            "about/index.html",
            "privacy/index.html",
            "terms/index.html",
            "404.html",
            "checkout/success/index.html",
            "checkout/cancel/index.html",
            "sitemap.xml",
            "robots.txt",
            "_redirects",
            "_headers",
            "css/site.css",
            "js/tool.js",
            "js/analytics.js",
            "js/auth-credits.js",
            "favicon.svg",
        ):
            self.assertTrue((self.dist / rel).is_file(), rel)

    def test_trailing_slash_canonicals(self) -> None:
        pairs = {
            "index.html": "https://example.com/",
            "tool/index.html": "https://example.com/tool/",
            "about/index.html": "https://example.com/about/",
            "privacy/index.html": "https://example.com/privacy/",
            "terms/index.html": "https://example.com/terms/",
        }
        for rel, url in pairs.items():
            html = self.read(rel)
            self.assertIn(f'<link rel="canonical" href="{url}">', html, rel)
            self.assertIn(f'<meta property="og:url" content="{url}">', html, rel)

    def test_sitemap_trailing_slashes(self) -> None:
        sitemap = self.read("sitemap.xml")
        for loc in (
            "https://example.com/",
            "https://example.com/tool/",
            "https://example.com/about/",
            "https://example.com/privacy/",
            "https://example.com/terms/",
        ):
            self.assertIn(f"<loc>{loc}</loc>", sitemap)
        self.assertNotIn("<loc>https://example.com/about</loc>", sitemap)
        self.assertNotIn("/checkout/", sitemap)

    def test_internal_links_use_trailing_slashes(self) -> None:
        home = self.read("index.html")
        self.assertIn('href="/tool/"', home)
        self.assertIn('href="/about/"', home)
        self.assertIn('href="/privacy/"', home)
        self.assertIn('href="/terms/"', home)
        self.assertNotIn('href="/about"', home.replace('href="/about/"', ""))

    def test_analytics_omitted_when_unset(self) -> None:
        html = self.read("index.html")
        self.assertNotIn("googletagmanager.com/gtag/js", html)
        self.assertNotIn("clarity.ms/tag", html)
        self.assertNotIn("plausible.io", html)
        self.assertNotIn("umami", html.lower())
        self.assertIn('"enableStripe":false', html)
        self.assertIn('"enableCheckoutEvents":false', html)
        self.assertIn('"enableAuthCredits":false', html)

    def test_analytics_injected_when_set(self) -> None:
        built = run_build(
            {
                "GA4_MEASUREMENT_ID": "G-TESTONLY12",
                "CLARITY_PROJECT_ID": "claritytest1",
            }
        )
        try:
            html = (built / "index.html").read_text(encoding="utf-8")
            self.assertIn("gtag/js?id=G-TESTONLY12", html)
            self.assertIn("clarity.ms/tag", html)
            self.assertIn("claritytest1", html)
        finally:
            shutil.rmtree(built, ignore_errors=True)

    def test_plausible_not_both_umami(self) -> None:
        built = run_build(
            {
                "PLAUSIBLE_DOMAIN": "example.com",
                "UMAMI_WEBSITE_ID": "umami-should-lose",
            }
        )
        try:
            html = (built / "index.html").read_text(encoding="utf-8")
            self.assertIn("plausible.io/js/script.js", html)
            self.assertNotIn("umami-should-lose", html)
        finally:
            shutil.rmtree(built, ignore_errors=True)

    def test_404_is_noindex(self) -> None:
        self.assertIn('content="noindex, follow"', self.read("404.html"))

    def test_robots_points_at_sitemap(self) -> None:
        self.assertIn("Sitemap: https://example.com/sitemap.xml", self.read("robots.txt"))

    def test_redirects_have_404_and_host_hint(self) -> None:
        text = self.read("_redirects")
        self.assertIn("/* /404.html 404", text)
        self.assertIn("www.example.com", text)

    def test_no_forbidden_pii(self) -> None:
        skip_dirs = {".git", "dist", "__pycache__", ".wrangler", "node_modules"}
        skip_files = {"test_template.py"}
        for path in ROOT.rglob("*"):
            if any(part in skip_dirs for part in path.parts):
                continue
            if path.name in skip_files:
                continue
            if not path.is_file():
                continue
            if path.suffix.lower() in {".png", ".jpg", ".jpeg", ".webp", ".gif", ".woff", ".woff2"}:
                continue
            text = path.read_text(encoding="utf-8", errors="ignore").lower()
            for token in FORBIDDEN:
                self.assertNotIn(token, text, f"{token} in {path}")

    def test_license_line(self) -> None:
        license_text = (ROOT / "LICENSE").read_text(encoding="utf-8")
        self.assertIn("Copyright (c) 2026 martinyyang", license_text)
        self.assertIn("MIT", license_text)

    def test_readme_has_pages_bind_and_stripe_on(self) -> None:
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("python3 builder/build_site.py", readme)
        self.assertIn("dist", readme)
        self.assertIn("Turn payment ON", readme)
        self.assertIn("Martin buys the domain on his own machine", readme)
        self.assertNotIn("buy a domain", readme.lower().replace("buys the domain on his own machine", ""))

    def test_stripe_functions_are_gated(self) -> None:
        checkout = (ROOT / "functions" / "api" / "checkout.js").read_text(encoding="utf-8")
        webhook = (ROOT / "functions" / "api" / "webhook.js").read_text(encoding="utf-8")
        self.assertIn('ENABLE_STRIPE', checkout)
        self.assertIn("payments_disabled", checkout)
        self.assertIn("stripe-signature", webhook)
        self.assertIn("alreadySeen", webhook)
        self.assertIn('mode: "payment"', checkout)
        self.assertNotIn("mode: \"subscription\"", checkout)

    def test_auth_stub_comment(self) -> None:
        stub = (ROOT / "static" / "js" / "auth-credits.js").read_text(encoding="utf-8")
        self.assertIn("enable when next paid tool ships", stub.lower())

    def test_env_example_defaults_off(self) -> None:
        example = (ROOT / ".env.example").read_text(encoding="utf-8")
        self.assertIn("ENABLE_STRIPE=false", example)
        self.assertIn("ENABLE_CHECKOUT_EVENTS=false", example)
        self.assertIn("ENABLE_AUTH_CREDITS=false", example)
        self.assertIn("GA4_MEASUREMENT_ID=", example)


if __name__ == "__main__":
    unittest.main()
