# START HERE: Global Travel Platform

Everything you need in one place: what this is, where it runs, how to open it, how to start
and stop it, how to update it, and what's still left to decide.

> **Short version:** it's already running. Open **http://192.168.1.88:8080** in a browser.

---

## 1. What this is

A bilingual (English/French) **flight search and comparison website** that earns money through
**affiliate referrals**. Visitors search flights, compare offers, and click through to the airline
or travel agency to book. **The site never sells tickets, takes payments, or makes reservations.**

**Current state: Phase 1, DEMO MODE.**
- Flight prices come from a built-in *demo provider* that generates fake sample fares.
  They are clearly labelled as demo everywhere (banner, badges, notes).
- Clicking "View deal" goes to an internal *demo partner page*, not a real booking site.
- Real partner links are **switched off** (`REFERRALS_LIVE_ENABLED=false`) until the legal
  and partner checks in section 9 are done.

| Part | Technology |
|---|---|
| Website | Next.js 16 (React, TypeScript), Tailwind CSS, English/French, light/dark theme |
| Backend API | Python 3.12, FastAPI |
| Database | PostgreSQL 17 |
| Cache / rate limits | Redis 7 |
| Web server | Nginx |
| Packaging | Docker + Docker Compose |

---

## 2. Where it runs

Everything runs in **Docker on your Proxmox container `Docker` (CT 104) at 192.168.1.88**.

| Container | What it does |
|---|---|
| `nginx` | Front door; the only thing reachable from the network (port **8080**) |
| `web` | The website |
| `api` | The backend (search, referrals, admin) |
| `postgres` | The database (data lives in the Docker volume `gtp_pgdata`) |
| `redis` | Short-term cache and rate limiting |
| `migrate` | Runs at startup to create/upgrade tables and load reference data, then exits |

| Server detail | Value |
|---|---|
| Login | `ssh spencer@192.168.1.88` (password login) |
| Project folder on server | `~/gtp/_the_travel_agency/global-travel-platform` (a git clone of GitHub) |
| Secrets file on server | `~/gtp/_the_travel_agency/global-travel-platform/.env` (never commit or share it) |
| Resources | 2 CPU, 4 GB RAM, 20 GB disk |
| Also on this server | A `k3d-homelab` Kubernetes cluster; unrelated, leave it alone |

Your Windows PC holds the **source code** (this folder). Docker Desktop on the PC is currently
broken, so nothing runs here except development tools and tests.

---

## 3. Open it

| Address | What |
|---|---|
| **http://192.168.1.88:8080** | Website (goes to `/en` or `/fr`) |
| **http://192.168.1.88:8080/en/admin** | Admin dashboard |
| http://192.168.1.88:8080/api/docs | Interactive API documentation |
| http://192.168.1.88:8080/api/v1/health | Health check (should say `"status":"ok"`) |

### Admin login
- **Email:** `admin@example.com`
- **Password:** generated automatically and stored on the server. To see it, run this in a VS
  Code terminal (**Ctrl + `**):
  ```powershell
  ssh spencer@192.168.1.88 "grep DEV_ADMIN_PASSWORD ~/gtp/_the_travel_agency/global-travel-platform/.env"
  ```

The dashboard shows searches, referral clicks, click-through rate, top destinations, popular
routes, a traffic chart, providers, commissions, errors and system health. **Every number
comes from real recorded events.** Nothing is invented. Commissions stay empty until a partner
reports one.

---

## 4. Start, stop, check (on the server)

Log in first: `ssh spencer@192.168.1.88`, then `cd ~/gtp/_the_travel_agency/global-travel-platform`.

| Task | Command |
|---|---|
| Start (or restart after changes) | `docker compose up -d --wait` |
| See status (all should be "healthy") | `docker compose ps` |
| Watch logs (Ctrl+C to stop watching) | `docker compose logs -f api web` |
| Stop (keeps the data) | `docker compose down` |
| Stop **and delete the database** | `docker compose down -v` |
| Create another admin | `docker compose exec api python -m app.cli create-admin --email you@example.com --role admin` |
| Back up the database | `./scripts/backup_db.sh` (saves to `./backups/`) |
| Restore a backup (overwrites data) | `./scripts/restore_db.sh backups/<file>.dump` |
| Delete expired data (privacy retention) | `./scripts/purge_expired.sh` |

The containers restart automatically if the server reboots.

Admin roles: `viewer` (overview only), `analyst` (+ searches, referrals, commissions),
and `admin` (+ audit log).

---

## 5. Update the server after changing code

The server runs a **git clone** of `github.com/spencerawlson/_the_travel_agency`.

**On your PC:** commit and push as usual.
```powershell
git add .
git commit -m "describe the change"
git push
```

**On the server** (`ssh spencer@192.168.1.88`):
```bash
cd ~/gtp/_the_travel_agency && git pull && cd global-travel-platform && docker compose up -d --build --wait
```

- The rebuild takes about 3–8 minutes. Database changes are applied automatically by `migrate`.
- The server's `.env` (secrets) is **not** in git and is never touched by `git pull`.
- Data is kept across updates (it lives in the Docker volume `gtp_pgdata`).
- Check afterwards: `docker compose ps` (all healthy) and http://192.168.1.88:8080/api/v1/health.
- **Undo a bad update:** `git log --oneline` to find the previous commit, then
  `git checkout <commit> && docker compose up -d --build --wait`. Return to normal later with
  `git checkout main`.

> **The GitHub repository is public.** Anyone can read the code, which is fine because no secrets
> are in it. Never commit `.env` files, keys or passwords (`.gitignore` blocks the usual ones).
> If you make the repo private, the server will need a GitHub deploy key or access token to `git pull`.

> **Tip:** to stop typing the password on every `ssh`, install your SSH key on the server once
> (see `DOCKER_HOST_SETUP.md`, which stays on this PC and is not committed).

---

## 6. Run it somewhere new (any machine with Docker)

```bash
cd global-travel-platform
cp .env.example .env
#   Edit .env and set:
#     POSTGRES_PASSWORD   long random value
#     SECRET_KEY          random, at least 32 characters
#     DEV_ADMIN_PASSWORD  at least 12 characters
#     CORS_ORIGINS        the address you'll browse from, e.g. http://localhost:8080
docker compose up --build -d --wait
```
Open http://localhost:8080. The first build takes about 5–10 minutes. You need around 4 GB RAM.

For a real public launch (domain, HTTPS, Cloudflare, DigitalOcean), follow
`global-travel-platform/docs/DEPLOYMENT.md`.

---

## 7. Develop and test on your PC

> Your folder path contains `&` (`SaaS & Portfolio`), which breaks `npm run` / `npx` on Windows.
> The commands below call the tools directly and work around it.

**Backend** (in `global-travel-platform/apps/api`):
```powershell
.venv\Scripts\python -m pytest            # tests
.venv\Scripts\ruff check .                # lint
.venv\Scripts\mypy app                    # type check
```

**Website** (in `global-travel-platform/apps/web`):
```powershell
node ..\..\node_modules\vitest\vitest.mjs run              # tests
node ..\..\node_modules\eslint\bin\eslint.js .             # lint
node ..\..\node_modules\typescript\bin\tsc --noEmit        # type check
node ..\..\node_modules\next\dist\bin\next build           # production build
```

**End-to-end browser tests** against the server (in `global-travel-platform`):
```powershell
$env:E2E_BASE_URL="http://192.168.1.88:8080"; $env:E2E_ADMIN_PASSWORD="<admin password>"
node node_modules\@playwright\test\cli.js test -c tests\e2e\playwright.config.ts
```

**Last verified results (2026-10-12):**
- Backend: 79 tests passed on PostgreSQL, 78 on SQLite.
- Website: 26 tests passed.
- End-to-end: 13 tests passed (desktop and mobile).
- Lint, type checks and build are clean, and backup/restore was verified.

---

## 8. Git and GitHub

- The repository root is **this folder** (`_The_Agency`), remote
  `github.com/spencerawlson/_the_travel_agency`. Nothing has been committed yet.
- `git status` shows only `global-travel-platform/` because the whole folder is new. Use
  `git status -uall` to list all ~167 files.
- `.gitignore` already excludes secrets (`.env`, keys, certificates), `node_modules`, `.venv`,
  build output, test output, backups, and `DOCKER_HOST_SETUP.md`.

To save your work to GitHub:
```powershell
git add .
git commit -m "Phase 1 foundation"
git push
```

> **CI won't run in the current layout.** GitHub only runs workflows from `.github/` at the
> repository root, and ours is at `global-travel-platform/.github/`. Fix it by either:
> **(a)** making `global-travel-platform` its own repository (recommended), or
> **(b)** moving `.github/` to the root and adjusting paths.

---

## 9. To-do list: decisions only you can make

**Security (do now)**
- [ ] Change the **root** and **spencer** passwords on 192.168.1.88; both were shared in chat.

**Before going public**
- [ ] Choose the real brand. "Northstar Fares" is a placeholder (`SITE_NAME`) and needs a trademark check.
- [ ] Fill in the real legal identity in the server `.env`: `LEGAL_ENTITY_NAME`, `LEGAL_ADDRESS`,
      `CONTACT_EMAIL`, `PRIVACY_EMAIL`.
- [ ] Have a Québec lawyer review the legal pages (privacy, terms, affiliate disclosure,
      cookies). They currently show a **DRAFT** banner.
- [ ] Confirm whether a **Québec travel-agent licence** is required (OPC). See
      `docs/COMPLIANCE.md` §0.
- [ ] Appoint a privacy officer and complete a privacy impact assessment (Québec Law 25).

**Before turning on real partner links (Phase 2)**
- [ ] Sign up with Travelpayouts (or another partner) and sign the agreement.
- [ ] Have the partner integration built (plan in `docs/PROVIDER_INTEGRATION.md`).
- [ ] Only after all the above: set `REFERRALS_LIVE_ENABLED=true`.

---

## 10. Where to find the details

All in `global-travel-platform/`:

| File | Read it for |
|---|---|
| `README.md` | Developer quick start |
| `docs/ARCHITECTURE.md` | How the pieces fit (with diagram) |
| `docs/DATABASE.md` | Tables, what data is stored, retention, backups |
| `docs/API.md` | Every API endpoint and error code |
| `docs/DEPLOYMENT.md` | Production launch (DigitalOcean, Cloudflare, HTTPS) |
| `docs/SECURITY.md` | Logins, sessions, rate limits, protections, known gaps |
| `docs/COMPLIANCE.md` | Legal and privacy checklist (Law 25, OPC, PIPEDA) |
| `docs/PROVIDER_INTEGRATION.md` | How to add real flight partners |
| `docs/ROADMAP.md` | What's done, what's next, known limitations |

Project folders:
```
global-travel-platform/
  apps/api/          backend (Python)
  apps/web/          website (Next.js); translations in messages/en.json and fr.json
  packages/          shared code
  infrastructure/    Docker, Nginx, production settings
  scripts/           backup, restore, retention, airport data builder
  tests/e2e/         browser tests
  docs/              documentation
```

---

## 11. Troubleshooting

| Problem | Fix |
|---|---|
| Site doesn't load | `ssh` in, then `docker compose ps`. If something isn't healthy: `docker compose logs <service>`, then `docker compose up -d --wait` |
| Health check says `degraded` | Database or Redis is down: `docker compose restart postgres redis` |
| Admin login says "Invalid email or password" | Check the password (section 3). After 5 wrong tries the account locks for 15 minutes |
| Admin login refused when browsing from a new address | Add that address to `CORS_ORIGINS` in the server `.env`, then `docker compose up -d` |
| "Too many requests" | Rate limit; wait a minute |
| Search says partners unavailable | `docker compose logs api` and check "Recent errors" on the dashboard |
| `npm run ...` fails on the PC | The `&` in the folder path; use the direct commands in section 7 |
| Out of disk on the server | `docker system prune` (removes unused images/build cache) |
