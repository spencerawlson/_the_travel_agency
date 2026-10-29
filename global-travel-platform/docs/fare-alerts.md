# Fare-alert push — backend spec

Status: **client + API + evaluator built; dispatch NOT built.** An alert
created today is stored, can be listed and cancelled, and will be evaluated
— but it will NOT deliver a push notification until the pieces in
"Still needed" exist. The app says exactly that to the user; do not claim
otherwise in the store listing.

## What exists

### Client (Next.js app shell, iOS only in practice)

- `src/lib/fare-alerts.ts`
  - `ensurePushToken()` — on a native platform only: checks the current
    push-permission state, requests it if not yet determined, then registers
    and returns the APNs token. Returns `null` on web, on denial, on
    simulator (no APNs token exists there), and on any registration error
    (15 s timeout). Never throws to the UI.
  - `createFareAlert(trip, targetPrice)` — POSTs
    `/api/v1/push/alerts` with the device token, platform, route, dates,
    passengers, cabin, currency and target price; keeps a local copy in
    Preferences under `farelune.alerts.v1` so the Saved trips page can show
    active alerts offline.
  - `cancelFareAlert(id)` — POSTs `/api/v1/push/alerts/{id}/cancel` with
    the device token, then drops the local copy.
- `src/components/app/SavedTripsView.tsx` — per-trip alert form (target
  price input, create, active state, cancel) with honest notices when push
  is unavailable or the app is not running natively.

### API (FastAPI, `apps/api`)

- `app/models/push.py` — `PushDevice` (push_token unique, platform,
  last_seen_at) and `FareAlert` (device FK with cascade delete, route,
  dates, passengers, cabin, currency, target_price, is_active,
  last_seen_price, last_checked_at, last_notified_price,
  last_notified_at). No accounts exist in this app, so the token is the
  only credential; no names, emails or IPs are stored.
- `app/schemas/push.py` — `AlertCreateIn` (same validation rules as flight
  search: IATA codes, trip/date consistency, infants ≤ adults, target > 0),
  `AlertCancelIn`, `AlertOut` (never echoes the token).
- `app/api/v1/push.py` — `POST /api/v1/push/alerts` (upserts the device,
  caps at 10 active alerts per device), `GET /api/v1/push/alerts?push_token=`
  (own alerts only), `POST /api/v1/push/alerts/{alert_id}/cancel` (body
  carries the token; only the owning device's row is deleted).
  Rate-limited by the new `rate_limit_push` setting (`30/60`).
- `app/services/fare_alerts.py` — `evaluate_alerts(session)` reuses
  `search_flights` per active alert and returns a list of
  `PendingNotification` (alert id, token, platform, route, depart date,
  price, currency). Rules:
  - Demo offers never count; only live offers can trigger.
  - `per_adult` prices are multiplied by the adult count; `total` prices
    are used as-is.
  - Notify only when the cheapest live offer is ≤ target AND below the
    price last notified (or never notified) — at most one push per drop.
  - Alerts past their depart date are deactivated, not evaluated.
  - A failed search for one alert is logged and skipped; it does not stop
    the rest.
- Migration `alembic/versions/0004_fare_alert_push.py` (down_revision
  `0003`) creates both tables.

## Dispatcher and scheduler — BUILT (Oct 28, 2026, local, not yet deployed)

1. **APNs credentials** — Spencer staged them on the host: the .p8 file in
   `./secrets/AuthKey_YAKP52TL23.p8` (Key ID YAKP52TL23, Sandbox &
   Production, Team Scoped, Team ID RAXA72UKAC) plus `APNS_KEY_ID`,
   `APNS_TEAM_ID`, `APNS_BUNDLE_ID` in the project `.env`. Compose wires
   them into the api container (`x-api-env` + a read-only
   `./secrets:/app/secrets:ro,z` mount) — the .p8 itself is never in the
   repo, never in chat.
2. **APNs dispatcher service** — `apps/api/app/services/apns_dispatch.py`:
   sends `evaluate_alerts()` rows via APNs HTTP/2 with an ES256 JWT signed
   by the .p8 (fresh 30-minute token per run). 410 Gone and 400
   BadDeviceToken delete the device row (alerts cascade); other 4xx never
   delete; 429/5xx retry twice honouring Retry-After (capped 60s). Tokens
   are never logged. A failed send is NOT re-queued: the evaluator already
   stamped `last_notified_price`, so that drop is missed and the alert
   fires again only on a further drop. Non-iOS tokens are skipped (no rail
   yet), not failed. Tests: `apps/api/tests/test_apns_dispatch.py` (mock
   transport, fresh EC key per test; no Apple endpoint contacted).
3. **Scheduler / cron** — `python -m app.cli run-fare-alerts` evaluates,
   then dispatches, then prints counts. It REFUSES to evaluate when APNs
   is not configured (evaluating would silently consume the once-per-drop
   notification without sending). Host cron line (server-local time, one
   line to change for frequency):
   `0 8,18 * * * cd /opt/farelune/global-travel-platform && docker compose run --rm api python -m app.cli run-fare-alerts >> /var/log/gtp-fare-alerts.log 2>&1`
   Default is twice daily (08:00 + 18:00) — Spencer's frequency call; every
   run re-runs a live search per alert, so hourly would multiply provider
   load by the alert count. Deploying this needs `docker compose build api`
   first (one new dependency: `h2`, required because APNs mandates
   HTTP/2), then `docker compose up -d api` to pick up the env + mount.
   The cron line itself is NOT installed yet — that is a host step.

## Still needed (Spencer's pieces)

1. **Alert frequency rules** — the once-per-drop rule is built in, but
   caps (e.g. max one push per alert per day) and quiet hours are still
   open decisions.
2. **Push Notifications capability in Xcode** — the `aps-environment`
   entitlement must be enabled for the App ID / provisioning profile.
   Simulator testing cannot prove push: a simulator has no APNs token and
   `ensurePushToken()` returns `null` there by design; a real iPhone is
   required for an end-to-end push test.
3. **Android (later)** — FCM token handling is schema-ready
   (`platform` accepts `android`) but no client registration or FCM
   dispatch exists.

## Privacy and retention

- Push tokens are per-device routing tokens, deleted when the alert is
  cancelled, when the device row is deleted, or when APNs reports the token
  invalid. They are never logged and never returned by the API.
- No alert content (route, dates, price target) is ever shown to anyone
  except the device that created it.
- The evaluator's searches run through the normal search path and are
  recorded as search events, like any other search.
