# Roadmap

## Phase 1: Foundation (this release)

- [x] Monorepo with a Next.js web app, FastAPI API, and shared TS types and UI packages
- [x] Bilingual site (EN/FR) with light/dark themes: home, results, destinations (list and detail), deals, about, contact, legal ×4, demo partner page
- [x] Flight search form with validation, accessible airport autocomplete (3,194 airports), one-way/round-trip, passengers, cabin, currency
- [x] Provider abstraction plus a deterministic, clearly labelled mock provider
- [x] PostgreSQL schema (15 tables) with Alembic migration, seed data, retention purge
- [x] Referral tracking with open-redirect prevention and a live-referral kill switch
- [x] Admin auth (Argon2id, sessions, CSRF, RBAC, lockout, audit) and a dashboard on stored data
- [x] Rate limiting, security headers, structured logs, health checks, Prometheus metrics, optional Sentry
- [x] Docker Compose stack, Nginx, CI (lint, types, tests, audits, e2e), backup/restore scripts
- [x] Documentation and compliance checklist

## Phase 2: First real partner (prerequisite: compliance gate in COMPLIANCE.md)

- Legal review of licensing, terms, privacy and the PIA; finalise the brand
- Travelpayouts provider (sandbox → live), commission import job, reconciliation view
- Admin UI for provider settings and commission entry, with audited changes and a 2-person rule for enabling live referrals
- Exchange-rate ingestion from a named source (e.g. Bank of Canada Valet API) for optional approximate conversion
- Nonce-based CSP (remove `'unsafe-inline'` from `script-src`)
- Inline affiliate notice on results; baggage and fare-condition display where partners provide it
- Admin MFA (TOTP / WebAuthn)

## Phase 3: Growth

- Additional affiliate providers (hotels, cars) behind the same abstraction
- Price alerts (requires email consent under CASL and Law 25, so opt-in only)
- More languages (es, de) and currencies; SEO landing pages per route
- Privacy-preserving, cookieless, first-party analytics dashboards
- Read replicas and a Redis cluster; CDN caching of reference endpoints

## Known limitations

- Demo fares are synthetic; intermediate stops use placeholder codes (`X01`).
- Deals are computed on request from providers (fine for the mock; Phase 2 should precompute).
- System status labels on the admin dashboard are English-only (internal tool).
- The development stack serves HTTP; production TLS is configured via the Nginx TLS template.
