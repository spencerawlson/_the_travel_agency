# Deployment

The stack is a set of containers orchestrated by Docker Compose: Nginx, Next.js web,
FastAPI api, the one-shot migrate job, PostgreSQL and Redis. It runs unchanged on a
laptop, a LAN Docker host, or a DigitalOcean Droplet.

## 1. Local or LAN host

```bash
cp .env.example .env      # set POSTGRES_PASSWORD, SECRET_KEY, DEV_ADMIN_PASSWORD
# If you browse from another machine, add its URL to CORS_ORIGINS, e.g.
# CORS_ORIGINS=http://192.168.1.88:8080,http://localhost:8080
docker compose up --build -d --wait
docker compose ps         # all services "healthy"; migrate "exited (0)"
```

Startup order is enforced by health checks:
postgres → migrate (alembic + seed) → api (plus redis) → web → nginx.

## 2. Production on DigitalOcean + Cloudflare

### Infrastructure

| Item      | Recommendation                                                                                                                                                         |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Droplet   | Ubuntu 24.04 LTS, ≥ 2 vCPU / 4 GB (Basic Premium); region TOR1 (Toronto) for Canadian data residency                                                                   |
| Database  | Start with the bundled PostgreSQL container and nightly backups, or use **DigitalOcean Managed PostgreSQL** (TOR1, PITR, `sslmode=require`, trusted sources = Droplet) |
| Firewall  | DO Cloud Firewall: inbound 22 (your IP only), 80/443 from Cloudflare IP ranges only                                                                                    |
| DNS / CDN | Cloudflare proxied A record → Droplet; SSL/TLS mode **Full (strict)**; "Always Use HTTPS"; WAF managed rules; Bot Fight Mode                                           |
| TLS       | Cloudflare **Origin Certificate** installed in `infrastructure/nginx/certs/`                                                                                           |
| Backups   | `scripts/backup_db.sh` nightly via cron, then ship to DO Spaces (encrypted); keep the DO Droplet backups too                                                           |

### Steps

```bash
# On the Droplet (as a non-root sudo user)
sudo apt-get update && sudo apt-get install -y docker.io docker-compose-v2 git
sudo usermod -aG docker $USER && newgrp docker
git clone <repo> /opt/gtp && cd /opt/gtp
cp .env.example .env && chmod 600 .env
```

Edit `.env` for production:

```dotenv
ENVIRONMENT=production
COOKIE_SECURE=true
CORS_ORIGINS=https://example.com
ENABLE_DOCS=false
POSTGRES_PASSWORD=<48+ random chars>
SECRET_KEY=<64 random chars>
DEV_ADMIN_EMAIL=
DEV_ADMIN_PASSWORD=
SITE_NAME=<cleared brand>
LEGAL_ENTITY_NAME=<registered name>
LEGAL_ADDRESS=<address>
CONTACT_EMAIL=<email>
PRIVACY_EMAIL=<privacy officer email>
SENTRY_DSN=<optional>
```

Then install the certificates and start the stack:

```bash
mkdir -p infrastructure/nginx/certs && chmod 700 infrastructure/nginx/certs
# paste the Cloudflare origin certificate and key into origin.pem / origin.key (chmod 600)
sed -i 's/example.com/yourdomain.com/g' infrastructure/nginx/production-tls.conf.example

docker compose -f docker-compose.yml -f infrastructure/deployment/docker-compose.prod.yml up -d --build --wait
docker compose exec api python -m app.cli create-admin --email you@yourdomain.com --role admin
```

Finally, set up the cron jobs (`crontab -e`):

```cron
15 3 * * * cd /opt/gtp && ./scripts/purge_expired.sh >> /var/log/gtp-retention.log 2>&1
30 3 * * * cd /opt/gtp && ./scripts/backup_db.sh /opt/gtp/backups >> /var/log/gtp-backup.log 2>&1
```

### Using managed PostgreSQL instead of the container

Override `DATABASE_URL` for `migrate` and `api` with the managed connection string, for
example `postgresql+psycopg://user:pass@host:25060/gtp?sslmode=require`. Then remove
`postgres` from the `depends_on` chain, or run with `--scale postgres=0`.

### Updating

```bash
git pull
docker compose -f docker-compose.yml -f infrastructure/deployment/docker-compose.prod.yml up -d --build --wait
```

The `migrate` job applies any new Alembic revisions before the API restarts. Take a
backup first. Migrations are written to be backwards-compatible for one release
(expand → migrate → contract).

### Rollback

1. Check out the previous tag and run `up -d --build`.
2. If a migration must be reverted: `docker compose run --rm migrate alembic downgrade -1`.
   Only do this if it is safe; otherwise restore a backup with `scripts/restore_db.sh`.

## 3. CI/CD

GitHub Actions (`.github/workflows/ci.yml`) runs on every push and PR:

1. **api:** ruff, format check, mypy, pytest on PostgreSQL and on SQLite, migration round-trip, pip-audit.
2. **web:** prettier check, ESLint, `tsc`, Vitest, production build, `npm audit --omit=dev`.
3. **e2e:** `docker compose up --build --wait`, then Playwright (desktop and mobile).

Continuous deployment is intentionally not enabled in Phase 1. To add it, create a
`deploy` job on tags that SSHes to the Droplet with a deploy key stored in GitHub
Environments (with required reviewers) and runs the update commands above.

## 4. Health and monitoring

| Check                      | Endpoint / command                                                                        |
| -------------------------- | ----------------------------------------------------------------------------------------- |
| Edge                       | `GET /nginx-health`                                                                       |
| API readiness (DB + Redis) | `GET /api/v1/health` (503 when degraded)                                                  |
| API liveness               | `GET /api/v1/health/live`                                                                 |
| Web                        | container health check fetches `/en`                                                      |
| Metrics                    | `GET /api/v1/metrics` with `Authorization: Bearer $METRICS_TOKEN` from inside the network |
| Logs                       | `docker compose logs -f` (JSON lines; ship to a log service as needed)                    |
| Errors                     | Admin dashboard → "Recent errors"; optional Sentry                                        |
| Uptime                     | External monitor on `https://<domain>/api/v1/health`                                      |
