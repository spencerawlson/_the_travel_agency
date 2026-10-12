# Compliance review checklist

> **This is an engineering checklist, not legal advice.** Every item marked ⚖️ needs
> review by a qualified Québec lawyer (privacy, consumer protection, and travel
> regulation). The public legal pages in `apps/web/src/content/legal/` are **drafts** and
> show a "DRAFT, not legal advice" banner until approved.

## 0. Go-live gate: production referrals stay OFF until all of these are signed off

- [ ] ⚖️ **Business model confirmed:** pure affiliate referral (no sale, no payment, no ticketing, no reservation creation).
- [ ] ⚖️ **Travel-agent licensing.** Confirm with counsel and the Office de la protection
      du consommateur (OPC) whether the activity triggers a travel-agent licence under
      Québec's _Act respecting travel agents_ (CQLR c A-10) and its regulation (including
      the FICAV). The platform is designed not to sell, issue tickets or collect payment.
      Obtain written confirmation, or a licence if required.
- [ ] ⚖️ Licensing and consumer rules in other target markets (e.g. Ontario TICO, EU
      Package Travel Directive implications, US DOT price-advertising rules).
- [ ] **Partner agreements signed.** Each provider's terms reviewed (permitted display,
      caching, price-freshness rules, required attributions, deep-link format) and
      `agreement_reference` recorded on `affiliate_providers`.
- [ ] Partner redirect hosts entered in `allowed_redirect_hosts`, `agreement_verified=true`, `status=live`.
- [ ] Legal pages approved and the draft banner removed.
- [ ] Only then set `REFERRALS_LIVE_ENABLED=true` (an audited configuration change).

## 1. Québec Law 25 (_Act respecting the protection of personal information in the private sector_)

| #    | Requirement                                                                                                                                                               | Implementation / status                                                                                                                                                                |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1.1  | Designate a **person in charge of the protection of personal information** (defaults to the highest authority) and publish their title and contact details on the website | `PRIVACY_OFFICER_TITLE`, `PRIVACY_EMAIL` shown in the privacy policy. ⚖️ Appoint a named person                                                                                        |
| 1.2  | **Governance policies** (roles, retention/destruction, complaint handling) published in clear terms                                                                       | Retention implemented (see DATABASE.md). ⚖️ Write and publish the governance policy                                                                                                    |
| 1.3  | **Privacy impact assessment (PIA)** for projects involving personal info, and before **communicating PI outside Québec**                                                  | ⚖️ Required: hosting (DigitalOcean region), Cloudflare and Sentry are outside Québec. Prepare the PIA and contractual safeguards                                                       |
| 1.4  | **Confidentiality incident** register; notify the CAI and affected people for "risk of serious injury"                                                                    | ⚖️ Create the register and response runbook. Audit logs and error events support investigation                                                                                         |
| 1.5  | **Privacy by default:** the most privacy-protective settings by default                                                                                                   | No accounts, no tracking cookies, no analytics SDKs, no PII in events, IP hashed daily                                                                                                 |
| 1.6  | **Transparency:** purposes, means, rights, and the use of tracking/profiling technologies                                                                                 | Privacy and cookie pages (drafts). No profiling or identification technology is used                                                                                                   |
| 1.7  | **Consent** that is manifest, free, enlightened and specific, given separately for sensitive info                                                                         | No sensitive info collected; only essential cookies. ⚖️ Confirm no consent banner is needed for essential-only cookies                                                                 |
| 1.8  | **Rights:** access, rectification, withdrawal, de-indexation, portability (from Sept 2024), and information about automated decisions                                     | Email channel in the privacy policy. Events are anonymous, so linking to a person is generally impossible (stated). ⚖️ Document the request-handling procedure (30-day response)       |
| 1.9  | **Retention and destruction** once the purpose is fulfilled                                                                                                               | `purge-expired` job with configurable periods (cron)                                                                                                                                   |
| 1.10 | Policy available in **French** (Charter of the French language, Bill 96)                                                                                                  | All UI and legal pages exist in French; the French version is complete and parity-tested. ⚖️ Confirm French primacy obligations (e.g. default language for Québec visitors, contracts) |

## 2. PIPEDA (federal) and other markets

- [ ] PIPEDA applies to inter-provincial and international data flows in commercial activity. Its fair information principles align with the controls above. ⚖️ Confirm.
- [ ] **CASL:** no commercial electronic messages are sent in Phase 1. Required before any newsletter.
- [ ] ⚖️ **EU/UK GDPR:** if marketing targets the EU or UK, assess Art. 3(2), a representative (Art. 27), a lawful basis (legitimate interest for anonymous analytics), and cookie rules (ePrivacy: essential-only).
- [ ] ⚖️ **US state privacy laws** (e.g. CCPA/CPRA): thresholds unlikely in Phase 1; reassess.

## 3. Consumer protection and advertising

| #   | Item                                                                                                                            | Status                                                                                                                                                                             |
| --- | ------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 3.1 | **Affiliate relationship disclosed** clearly and near offers                                                                    | Footer disclosure on every page and an Affiliate disclosure page. ⚖️ Consider an inline note on the results page                                                                   |
| 3.2 | **Identification of the actual seller** on every offer                                                                          | `seller_name` shown on each offer card ("Sold by …")                                                                                                                               |
| 3.3 | **Price and availability disclaimer**                                                                                           | `prices_may_change` disclaimer on results and deals. Prices shown are totals for all passengers                                                                                    |
| 3.4 | ⚖️ **All-inclusive price advertising** (Québec CPA s. 224(c); CTA _Air Transportation Regulations_ for air-price ads in Canada) | Mock fares are labelled demo. **Before going live,** confirm partner prices include all mandatory taxes and fees, or display them as required                                      |
| 3.5 | **Customer support responsibilities**                                                                                           | Contact page and terms state that the seller handles bookings, payments, refunds and changes                                                                                       |
| 3.6 | **Demo data never presented as real**                                                                                           | Site-wide demo banner (fails closed if the API is unreachable), "Demo data" badges, `demo_fare` notes, fictional "Demo …" carriers with non-IATA codes, internal demo partner page |
| 3.7 | Ranking transparency                                                                                                            | Results sorted by price by default; commission does not affect order (stated in the disclosure)                                                                                    |
| 3.8 | ⚖️ Terms of use enforceability (Québec CPA rules on consumer contracts, prohibited clauses)                                     | Draft terms preserve non-waivable consumer rights                                                                                                                                  |

## 4. Cookies and tracking

- Essential only: `NEXT_LOCALE`, `theme` (localStorage), and the admin-only `gtp_admin_session`/`gtp_csrf`.
- No advertising pixels, no third-party analytics.
- Partner sites set their own attribution cookies after the user leaves our site (disclosed).

## 5. Data inventory (for the PIA)

| Data                                           | Where                     | Personal?                   | Retention     |
| ---------------------------------------------- | ------------------------- | --------------------------- | ------------- |
| Search parameters                              | `flight_search_events`    | No (not linked to a person) | 395 d         |
| Click events (offer, price, partner)           | `referral_click_events`   | No                          | 760 d         |
| Daily IP hash                                  | events, sessions, audit   | Pseudonymous, rotates daily | as parent     |
| Admin email, password hash                     | `admin_users`             | Yes (staff)                 | until removed |
| Admin session metadata (hashed IP, user-agent) | `admin_sessions`          | Yes (staff)                 | until expiry  |
| Audit records                                  | `audit_logs`              | Staff actions               | 730 d         |
| Error events (no bodies)                       | `system_error_events`     | No                          | 90 d          |
| Email correspondence                           | mailbox (outside the app) | Yes                         | ⚖️ define     |

## 6. Accessibility (recommended)

WCAG 2.1 AA targets are built in: semantic landmarks, a skip link, labelled controls, an
ARIA combobox for airports, visible focus states, reduced-motion support, and both colour
themes. ⚖️ Check obligations in target markets (e.g. the Accessible Canada Act for some
sectors, EU Accessibility Act from 2025) and run a formal audit before launch.
