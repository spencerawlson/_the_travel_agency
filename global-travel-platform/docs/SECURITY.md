# Security architecture

## Threat model (summary)

| Asset                    | Threats                                                    | Primary controls                                                                                           |
| ------------------------ | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| Admin dashboard and data | Credential stuffing, session theft, CSRF, privilege misuse | Argon2id, lockout, login rate limit, HttpOnly/SameSite=Strict opaque sessions, CSRF token, RBAC, audit log |
| Visitors                 | Open redirect to phishing, XSS, clickjacking               | Server-side offer lookup and host allowlist, React escaping and CSP, `frame-ancestors 'none'`              |
| Availability             | Scraping or abuse of search (provider quota cost)          | Per-client Redis rate limits, Nginx `limit_req`, Cloudflare WAF                                            |
| Analytics and privacy    | Re-identification, over-collection                         | No PII schema, daily-rotating keyed IP hash, retention purge                                               |
| Secrets                  | Leakage via repo or logs                                   | Env-only secrets, `.gitignore`, production startup guards, no bodies in logs                               |

## Authentication and sessions

- **Passwords** are hashed with Argon2id (`time_cost=3`, `memory_cost=64 MiB`,
  `parallelism=2`) and transparently rehashed when parameters change. The policy requires
  at least 12 characters, rejects a common-password list, and rejects passwords
  containing the email's local part.
- **Login** returns the same generic error for unknown users, bad passwords and locked
  accounts, and always runs a hash verification to equalise timing.
  `LOGIN_MAX_ATTEMPTS` (5) failures lock the account for `LOGIN_LOCKOUT_MINUTES` (15).
  Logins are rate-limited per client (10 per 15 min), and the request `Origin` must be
  an allowed origin.
- **Sessions** use opaque 256-bit random tokens; the database stores only their SHA-256.
  The cookie is `HttpOnly; SameSite=Strict; Path=/api`, plus `Secure` in production.
  Sessions expire after 8 h absolute or 60 min idle. Logout revokes server-side. Sessions
  issued before a password change are rejected.
- **CSRF** uses a double-submit token bound to the session (only its hash is stored). The
  readable `gtp_csrf` cookie must be echoed in `X-CSRF-Token` on POST/PUT/PATCH/DELETE.
  SameSite=Strict adds a second layer.
- **RBAC** has three levels, `viewer` < `analyst` < `admin`, enforced per endpoint with
  `require_role(...)`. Denials are audited.
- Admins are created only via CLI (`python -m app.cli create-admin`). There is no public
  sign-up. The development bootstrap admin is refused unless `ENVIRONMENT=development`.

## Open-redirect prevention

1. Search responses never contain redirect URLs.
2. The click endpoint accepts only an `offer_id` (`^[A-Za-z0-9_-]{8,64}$`; extra fields
   are rejected) and loads the provider-generated offer from the server-side cache.
3. The URL is validated in `app/services/referrals.py::validate_redirect`:
   - **Demo:** no scheme or host, and the path must equal `/demo/partner`.
   - **Live:** `https` only, no userinfo, port 443 only, and an exact (case-insensitive)
     host match against `affiliate_providers.allowed_redirect_hosts`. Backslashes, CR/LF,
     tabs and spaces are rejected.
4. **Live referrals** also require `REFERRALS_LIVE_ENABLED=true`, provider `status=live`
   and `agreement_verified=true`. The database itself enforces that a `live` provider is
   demo or verified.
5. Blocked attempts are recorded (`blocked_host`, `blocked_live_disabled`).

The tests in `tests/test_referrals.py` cover suffix tricks, `//host`, `javascript:`,
backslash confusion, credentials, ports, CRLF injection, cache tampering and the kill switch.

## Input validation

- Pydantic models with `extra="forbid"` and bounded lengths, patterns and ranges cover
  every input. Cross-field rules (dates, passengers, origin ≠ destination) are enforced
  server-side, then airports and currencies are checked against the database. The web
  form validates the same rules client-side, purely for UX.
- SQL is always parameterised via SQLAlchemy. Autocomplete escapes `LIKE` wildcards.
- Request bodies are capped at 64 KB (API) and 64 KB / 16 KB (Nginx).

## HTTP security

- **API headers:** `Content-Security-Policy: default-src 'none'; frame-ancestors 'none'`,
  `X-Content-Type-Options`, `X-Frame-Options: DENY`, `Referrer-Policy`,
  `Permissions-Policy`, COOP/CORP, and HSTS when `COOKIE_SECURE=true`.
- **Web headers:** a CSP with `default-src 'self'`, `frame-ancestors 'none'`,
  `object-src 'none'` and `form-action 'self'`.
  - **Known gap:** `script-src` includes `'unsafe-inline'` for the Next.js bootstrap
    scripts. A nonce-based CSP is on the roadmap.
- **CORS:** an explicit origin allowlist (`CORS_ORIGINS`), with wildcards refused in
  production. Only GET and POST are allowed, with three allowed headers.
- **TLS:** Cloudflare "Full (strict)" plus an origin certificate on Nginx (see
  `infrastructure/nginx/production-tls.conf.example`).
- **Client IPs:** uvicorn trusts `X-Forwarded-For` only from `FORWARDED_ALLOW_IPS`. In
  Compose the API port is not published, so only Nginx and web can reach it. Nginx
  restores the visitor IP from Cloudflare ranges (`real_ip`).

## Rate limiting

- **Application:** fixed windows in Redis, per bucket (see [API.md](API.md)). It fails
  open if Redis is briefly unavailable, logging a warning, so availability wins over
  strictness.
- **Edge:** Nginx allows 20 r/s per IP (burst 40) on `/api/`, and Cloudflare WAF and bot
  rules are recommended.

## Secrets management

- All secrets come from environment variables (`.env` locally, the platform secret store
  in production). `.env*` is git-ignored except `.env.example`, which holds placeholders.
- In production, startup **fails** if `SECRET_KEY` is the default or shorter than 32
  characters, if `COOKIE_SECURE` is false, or if CORS contains `*`.
- Rotating `SECRET_KEY` invalidates IP hashes (harmless) but not sessions, since tokens are
  random. To force re-login, delete rows in `admin_sessions`.

## Logging, monitoring and audit

- Logs are structured JSON on stdout, carrying a request ID, method, route template,
  status and duration. Request bodies, cookies and query strings are never logged.
- `/api/v1/health` (readiness, checks DB and Redis) and `/health/live` (liveness) back the
  Docker health checks.
- Prometheus metrics (`/api/v1/metrics`, token-protected) cover request counts and
  latency, searches by status, provider errors, and clicks by status.
- **Sentry is optional** (`SENTRY_DSN`), configured with `send_default_pii=False`.
- **Audit log** entries cover logins (success/failure/denied), lockouts, logout, access
  denials, admin creation/updates via CLI, and retention purges.

## Dependency and supply-chain security

- Exact version pins are used in `pyproject.toml` and `package-lock.json`, with Dependabot
  updating pip, npm, Docker and GitHub Actions weekly.
- CI runs `pip-audit` and `npm audit --omit=dev --audit-level=high`.
- **Accepted exception (dev-only).** `braces` ≤ 3.0.3 (stack-exhaustion DoS) is reached
  through `eslint-config-next` → `fast-glob` → `micromatch`. No patched release exists,
  and npm's suggested "fix" downgrades `eslint-config-next` to v14. It runs only in the
  lint tool over our own source and is not shipped in the production image. Re-evaluate
  when a fix is published.
- Containers run as non-root (UID 10001), from slim/alpine bases, with multi-stage builds.

## Data retention and deletion

`python -m app.cli purge-expired` (or `scripts/purge_expired.sh`, run daily by cron)
deletes expired events, sessions and logs according to the configurable periods in
[DATABASE.md](DATABASE.md#privacy-by-design). Every run is audited.

## Reporting a vulnerability

Email the security contact (set `CONTACT_EMAIL`). Do not open public issues for
vulnerabilities.
