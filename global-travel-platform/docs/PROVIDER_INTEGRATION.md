# Provider integration strategy

Phase 1 ships one provider, `mock`. Phase 2 adds real affiliate partners, with
Travelpayouts (Aviasales flight data and partner programmes) as the first candidate.
The provider layer was built so that a new integration touches only
`app/providers/` plus a database row.

## The contract (`app/providers/base.py`)

| Type                  | Role                                                                                                                                                                                         |
| --------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `FlightSearchRequest` | Validated request: resolved `AirportRef`s (IATA, coordinates, IANA tz), dates, passengers, cabin, ISO currency, locale                                                                       |
| `FlightOffer`         | Normalised offer: `Money` price, outbound/inbound `FlightSlice`s with tz-aware `FlightSegment`s, `seller_name`/`seller_type`, `is_demo`, `expires_at`, and a server-side-only `redirect_url` |
| `AffiliateRedirect`   | What the click endpoint follows: `url`, `provider_code`, `is_demo`, `seller_name`                                                                                                            |
| `ProviderError`       | Expected failure with `kind` (`timeout`, `unavailable`, `rate_limited`, `bad_response`, `configuration`, `unsupported_route`) and `retryable`                                                |
| `FlightProvider`      | ABC: `code`, `display_name`, `is_demo`, `async search()`, `build_redirect()`, `close()`                                                                                                      |

Orchestration (`app/services/search.py`) calls all enabled providers concurrently under
`PROVIDER_TIMEOUT_SECONDS`, converts any unexpected exception into
`ProviderError(bad_response)`, records failures in `system_error_events`, and returns
partial results when at least one provider succeeds.

## Adding a provider: checklist

1. **Agreement first.** Sign the partner agreement. Record the permitted uses (display,
   caching, price freshness, mandatory attribution, deep-link rules) in
   `affiliate_providers.notes` and `agreement_reference`.
2. **Implement** `app/providers/<name>.py`:
   - Use one shared `httpx.AsyncClient` with timeouts, connection limits, and retries
     with backoff only on idempotent, retryable errors. Close it in `close()`.
   - Map partner errors to `ProviderError` kinds. Never leak raw partner messages to users.
   - Normalise times to timezone-aware datetimes (use the airports' IANA zones), prices to
     `Decimal` plus ISO currency, and the seller to the actual ticket seller.
   - **Redirect URLs must come from the partner's API response** (or their documented
     deep-link builder with our marker). Never construct booking URLs by guesswork.
   - Respect the partner's own rate limits. Cache responses only as the agreement allows.
3. **Register** it in `PROVIDER_FACTORIES` (`app/providers/registry.py`) and read its
   secrets from env, e.g. `TRAVELPAYOUTS_TOKEN` and `TRAVELPAYOUTS_MARKER`. Fail at
   startup if they are missing.
4. **Database row** via a migration or admin action: `code`, `name`, `status='sandbox'`,
   `is_demo=false`, and `allowed_redirect_hosts` set to the exact hostnames the partner's
   links use.
5. **Tests:** recorded-response fixtures (no live calls in CI), error mapping, timezone and
   price normalisation, and redirect-host validation for real partner URLs.
6. **Sandbox run:** add the code to `ENABLED_PROVIDERS` in staging. Results show a
   provider name but referrals stay blocked (`referrals_disabled`) because the kill switch
   is off and the provider isn't `live`.
7. **Go-live** after the [COMPLIANCE.md](COMPLIANCE.md) gate: set `status='live'`,
   `agreement_verified=true`, `REFERRALS_LIVE_ENABLED=true`, and remove `mock` from
   `ENABLED_PROVIDERS` (the demo banner then disappears automatically).

## Travelpayouts notes (to verify against current partner docs)

- Flight data APIs are typically **cached price data** (recent cheapest fares), not live
  bookable availability. Present them as "found recently" prices with timestamps. If a
  live-search API is granted, it may have separate approval and usage rules.
- Attribution uses a partner **marker** appended to links. Redirect hosts must be listed
  exactly in `allowed_redirect_hosts`.
- Commissions are reported on the partner's dashboard and API. Phase 2 adds a
  `provider_api` importer that upserts `commission_reports` by
  `(provider_id, external_reference)` with status mapping
  (`estimated`/`pending`/`approved`/`rejected`/`paid`). Rows are never synthesised from clicks.

## Currency

Providers should return prices in the requested currency when they support it. If they
cannot, show the provider's currency rather than converting. Converting is allowed only
with an `exchange_rate_records` row from a named source (`services/catalog.py::convert`
refuses otherwise), and converted prices must be labelled as approximate.
