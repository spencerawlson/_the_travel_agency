# API reference (v1)

Base path: `/api/v1`. JSON only. The interactive OpenAPI UI is at `/api/docs` and the
schema at `/api/openapi.json`. Both are available in development only.

## Conventions

- **Errors** use one envelope:
  `{"error": {"code": "unknown_airport", "message": "...", "details": ..., "request_id": "..."}}`.
- **Request IDs.** Every response carries `X-Request-ID`; send your own (8–64 safe chars)
  to correlate logs.
- **Rate limits** are per client, by daily-rotating IP hash, in fixed windows, with defaults
  configurable via env. On a 429 response, `Retry-After` gives the wait in seconds.

| Bucket         | Default    | Endpoints                            |
| -------------- | ---------- | ------------------------------------ |
| `search`       | 20 / 60 s  | `POST /flights/search`, `GET /deals` |
| `autocomplete` | 120 / 60 s | `GET /airports/search`               |
| `referral`     | 30 / 60 s  | `POST /referrals/click`              |
| `login`        | 10 / 900 s | `POST /admin/auth/login`             |

- **Request size:** bodies over 64 KB are rejected with 413.
- **Money** is serialised as a decimal **string** (`"812"`, `"13.00"`), with the ISO 4217 code alongside.

### Error codes

| Code                                            | HTTP | Meaning                                                    |
| ----------------------------------------------- | ---- | ---------------------------------------------------------- |
| `validation_error`                              | 422  | Schema or field validation failed (`details` lists fields) |
| `unknown_airport`                               | 422  | Well-formed IATA code not in the airport table             |
| `invalid_date`                                  | 422  | Departure in the past or dates beyond 361 days             |
| `unsupported_currency`                          | 422  | Currency not active in `currencies`                        |
| `provider_unavailable`                          | 502  | Every provider failed or timed out                         |
| `offer_expired`                                 | 410  | Offer not in cache (30-min TTL); search again              |
| `referrals_disabled`                            | 403  | Live referral blocked by kill switch, agreement or status  |
| `redirect_rejected`                             | 403  | Provider URL failed the allowlist validation               |
| `rate_limited`                                  | 429  | Too many requests                                          |
| `not_authenticated` / `invalid_credentials`     | 401  | Missing/expired session, or bad login                      |
| `forbidden` / `csrf_failed` / `origin_rejected` | 403  | RBAC, CSRF or Origin check failed                          |
| `internal_error`                                | 500  | Unexpected; recorded in `system_error_events`              |

## Public endpoints

### `GET /health`

Returns `200` when both the database and Redis respond, otherwise `503`.

```json
{
  "status": "ok",
  "version": "0.1.0",
  "environment": "development",
  "checks": { "database": "ok", "redis": "ok", "providers": "mock" },
  "demo_mode": true,
  "referrals_live_enabled": false
}
```

`GET /health/live` is a dependency-free liveness probe.

### `GET /airports/search?q=<2..64 chars>&limit=<1..20, default 8>`

The search is accent- and case-insensitive. Results rank exact IATA matches first, then
city prefix, IATA prefix and name prefix, with larger airports ahead of smaller ones.

```json
[
  {
    "iata": "YUL",
    "name": "Montreal / Pierre Elliott Trudeau International Airport",
    "city": "Montréal",
    "country_code": "CA",
    "country_name": "Canada",
    "timezone": "America/Toronto"
  }
]
```

### `GET /currencies`

Returns `[{"code":"CAD","name":"Canadian dollar","symbol":"$","minor_units":2}, ...]`.

### `GET /destinations?locale=en|fr` and `GET /destinations/{slug}?locale=en|fr`

Returns localised destination content: `name, summary, description, highlights[], city,
country_code, airport_iata, tags[], theme`.

### `GET /deals?origin=YUL&currency=CAD&locale=en`

Returns the cheapest offer per published destination: a round trip departing in 45 days,
for 1 adult. With the mock provider, `is_demo` is `true` and `disclaimers` includes `demo_data`.

### `POST /flights/search`

```json
{
  "origin": "YUL",
  "destination": "CDG",
  "trip_type": "round_trip",
  "depart_date": "2026-11-20",
  "return_date": "2026-11-27",
  "adults": 1,
  "children": 0,
  "infants": 0,
  "cabin": "economy",
  "currency": "CAD",
  "locale": "en"
}
```

Validation rules:

- `origin` and `destination` are 3-letter codes, must differ, and must exist.
- `trip_type` is `one_way` or `round_trip`. `return_date` is required for round trips and forbidden for one-way.
- `return_date` must be on or after `depart_date`.
- The departure date must be no earlier than yesterday (UTC) and no later than today + 361 days.
- `adults` is 1–9, `children` 0–8, `infants` 0–4, with at most 9 passengers in total and `infants` ≤ `adults`.
- `cabin` is one of `economy`, `premium_economy`, `business`, `first`.
- Unknown fields are rejected.

Response (abridged):

```json
{"search_id":"<uuid>","is_demo":true,"currency":"CAD",
 "origin":{...airport},"destination":{...airport},
 "offers":[{"id":"<32 hex>","provider_code":"mock","provider_name":"Demo Provider (sample data)",
   "is_demo":true,"price":{"amount":"812","currency":"CAD"},"cabin":"economy",
   "outbound":{"segments":[{"carrier_code":"DMA","carrier_name":"Demo Aurora Air","flight_number":"DMA1234",
     "origin":"YUL","destination":"CDG","depart_at":"2026-11-20T18:30:00-05:00",
     "arrive_at":"2026-11-21T07:41:00+01:00","duration_minutes":431}],
     "duration_minutes":431,"stops":0},
   "inbound":{...},"seller_name":"Demo Aurora Air (demo)","seller_type":"demo",
   "expires_at":"...","notes":["demo_fare"]}],
 "providers":[{"code":"mock","name":"...","is_demo":true,"status":"ok","error":null,"result_count":8}],
 "disclaimers":["demo_data","prices_may_change","seller_responsible"]}
```

Times are ISO 8601 in each airport's local time zone. Offers never include redirect URLs.
If some providers fail, the response is 200 with their `status:"error"`. If all fail,
the response is 502 `provider_unavailable`.

### `POST /referrals/click`

```json
{ "offer_id": "<from search>", "locale": "en" }
```

→ `{"click_id":"<uuid>","redirect_url":"/demo/partner?offer=...","is_demo":true,
"provider_name":"...","seller_name":"...","notice":"demo_redirect"}`.
Every attempt is recorded, including blocked ones. See [SECURITY.md](SECURITY.md#open-redirect-prevention).

## Admin endpoints (authenticated)

These need the session cookie from login. Unsafe methods also need `X-CSRF-Token`.
Responses are `Cache-Control: no-store`.

| Method & path                     | Min role | Description                                                                                                                                                  |
| --------------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `POST /admin/auth/login`          | none     | `{email,password}` → `SessionOut` and sets the cookies. Origin must be in `CORS_ORIGINS`. Generic error message; lockout after `LOGIN_MAX_ATTEMPTS` failures |
| `POST /admin/auth/logout`         | any      | Revokes the session (CSRF required) → 204                                                                                                                    |
| `GET /admin/auth/me`              | any      | Current user and session expiry                                                                                                                              |
| `GET /admin/overview?days=1..365` | viewer   | Totals, CTR, click-to-commission rate, top destinations, popular routes, daily trend, providers, commissions by status/currency, errors, system status       |
| `GET /admin/searches`             | analyst  | Paginated search events. Filters: `date_from`, `date_to`, `origin`, `destination`, `status`; `page`, `page_size ≤ 200`                                       |
| `GET /admin/referrals`            | analyst  | Paginated click events. Filters: dates, `provider`, `status`                                                                                                 |
| `GET /admin/commissions`          | analyst  | Paginated commission reports and `totals[]` by status/currency. Filters: `status`, `provider`, dates                                                         |
| `GET /admin/audit-logs`           | admin    | Paginated audit log, filter `action`                                                                                                                         |

## Operational endpoints

- `GET /metrics` serves Prometheus text format. It returns 404 unless `METRICS_TOKEN` is
  set and sent as `Authorization: Bearer <token>`, and Nginx blocks it publicly.
