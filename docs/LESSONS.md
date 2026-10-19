# Lessons from epoxycalculators + creatorpaycalc

- Unify canonical, `og:url`, JSON-LD `url`, nav/footer links, and sitemap `<loc>` on the **trailing-slash** URL that Cloudflare Pages returns as HTTP 200. Slashless directory paths 308 to `/path/`. A sitemap that lists `/about` while the page canonical points at `/about` (or the reverse) created GSC redirect noise on epoxy (PR #4).
- Prefer a zone-level **www → apex Single Redirect** plus **Always Use HTTPS**. Pages `_redirects` often does not fire on custom-domain host aliases; epoxy www stayed 200 with a canonical to apex instead of redirecting.
- creatorpaycalc: apex and www both 200 without a www→apex rule creates host duplication. Decide `CANONICAL_HOST` (`apex` or `www`) before the first index.
- Do not put real names or avatars on ProductPerch creator profiles if the goal is MIT → dofollow.
- GA4 and Clarity IDs must be **site-specific**. Never reuse a `G-` or Clarity project across tool sites.
- Per-site weekly free-directory cap is **≤5**. Mark login walls as **待登录** and stop. Do not burn quota on walls.
- No secrets in GitHub Actions unless a job truly needs them. Cloudflare Pages environment variables are enough to inject analytics at build time (creatorpaycalc pattern: omit → skip).
- Keep personal names, personal inboxes, and phone numbers out of the public repo. Directory contact mail lives in ops notes, not in this template.
