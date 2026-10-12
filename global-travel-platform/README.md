# Global Travel Platform: Phase 1 Foundation

A bilingual (English/French) flight search and **affiliate referral** platform, operated
from Québec, Canada. Travellers search and compare offers, then are sent to the seller
(an airline or agency) to book. **The platform never sells tickets, takes payments, or
creates reservations.**

> **Phase 1 runs in DEMO MODE.** The only flight provider is a deterministic _mock_ that
> generates clearly labelled sample fares. Live partner referrals are disabled by a kill
> switch until partner agreements and licensing are verified (see
> [docs/COMPLIANCE.md](docs/COMPLIANCE.md)).

| Area | Stack                                                                    |
| ---- | ------------------------------------------------------------------------ |
| Web  | Next.js 16 (App Router, TypeScript, React 19), Tailwind CSS 4, next-intl |
| API  | Python 3.12, FastAPI, Pydantic 2, SQLAlchemy 2.1 (async), Alembic        |
| Data | PostgreSQL 17, Redis 7 (offer cache, rate limits)                        |
| Ops  | Docker Compose, Nginx, GitHub Actions; DigitalOcean + Cloudflare ready   |

## Quick start (Docker)

Requirements: Docker Engine 24+ with Compose v2, about 4 GB RAM.

```bash
cp .env.example .env
# Edit .env: set POSTGRES_PASSWORD, SECRET_KEY (>= 32 chars) and DEV_ADMIN_PASSWORD (>= 12 chars).
docker compose up --build -d --wait
```

Then open:

| URL                                 | What                                                                    |
| ----------------------------------- | ----------------------------------------------------------------------- |
| http://localhost:8080               | Website (redirects to `/en` or `/fr`)                                   |
| http://localhost:8080/en/admin      | Admin dashboard (sign in with `DEV_ADMIN_EMAIL` / `DEV_ADMIN_PASSWORD`) |
| http://localhost:8080/api/docs      | OpenAPI docs (development only)                                         |
| http://localhost:8080/api/v1/health | Health check                                                            |

The `migrate` service runs `alembic upgrade head`, seeds reference data (3,194 airports,
4 currencies, 12 destinations, the demo provider) and, in development only, creates the
dev admin. It is idempotent and runs on every `up`.

Common operations:

```bash
docker compose logs -f api web                    # follow logs
docker compose exec api python -m app.cli create-admin --email you@example.com --role admin
docker compose exec api python -m app.cli purge-expired   # data-retention job
./scripts/backup_db.sh                             # backup to ./backups
./scripts/restore_db.sh backups/gtp-<stamp>.dump   # restore (destructive, asks to confirm)
docker compose down                                # stop (add -v to delete the database volume)
```

## Local development without Docker

```bash
# API (needs PostgreSQL and Redis; e.g. `docker compose up -d postgres redis` and publish ports)
cd apps/api
python3.12 -m venv .venv && . .venv/bin/activate     # Windows: .venv\Scripts\activate
pip install -e ".[dev]"
export DATABASE_URL=postgresql+psycopg://gtp:<password>@localhost:5432/gtp
alembic upgrade head && python -m app.cli seed
uvicorn app.main:app --reload --port 8000

# Web (separate terminal, from the repository root)
npm install
API_INTERNAL_URL=http://localhost:8000 npm run dev:web   # http://localhost:3000
```

In development the Next.js server proxies `/api/*` to FastAPI, so the browser always
talks to a single origin.

## Tests and quality checks

```bash
# API (SQLite by default; set TEST_DATABASE_URL for PostgreSQL)
cd apps/api && pytest && ruff check . && ruff format --check . && mypy app

# Web: unit/component tests, lint, types, production build
npm test && npm run lint && npm run typecheck && npm run build:web

# End-to-end, against a running stack
npx playwright install chromium
E2E_BASE_URL=http://localhost:8080 E2E_ADMIN_PASSWORD=<dev admin password> npm run test:e2e
```

CI (`.github/workflows/ci.yml`) runs all of the above, including API tests against
PostgreSQL, migration round-trips, `pip-audit`, `npm audit` and the Playwright suite
against a Docker Compose stack.

## Repository layout

```
apps/
  api/             FastAPI service (app/, alembic/, tests/)
  web/             Next.js app (src/app/[locale]/..., messages/en.json, fr.json)
packages/
  shared-types/    TypeScript API contract types
  ui/              Shared UI primitives (Button, Badge, Card)
infrastructure/
  docker/          api.Dockerfile, web.Dockerfile
  nginx/           reverse-proxy config (+ TLS example)
  deployment/      DigitalOcean / production notes and compose override
scripts/           airport dataset builder, backup/restore, retention
tests/e2e/         Playwright end-to-end tests
docs/              architecture, database, API, deployment, security, compliance, roadmap
```

## Documentation

- [Architecture](docs/ARCHITECTURE.md), including the Mermaid diagram
- [Database](docs/DATABASE.md)
- [API reference](docs/API.md)
- [Deployment](docs/DEPLOYMENT.md)
- [Security](docs/SECURITY.md)
- [Compliance checklist (Québec OPC / Law 25)](docs/COMPLIANCE.md)
- [Roadmap](docs/ROADMAP.md)
- [Provider integration strategy](docs/PROVIDER_INTEGRATION.md)

## Important notices

- **Brand.** Farelune, _Connecting You to Everywhere_ (farelune.com). Have a trademark agent run a
  formal clearance and file in Canada before launch (`SITE_NAME` sets the displayed name).
- **Legal pages are drafts** for review by a qualified lawyer. They are not legal advice.
- **Data sources.** Airports come from [OurAirports](https://ourairports.com/data/) (public domain);
  time zones are derived with `timezonefinder`. No exchange rates are seeded or invented.
