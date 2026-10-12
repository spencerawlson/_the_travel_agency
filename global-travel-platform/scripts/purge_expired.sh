#!/usr/bin/env sh
# Data-retention job. Schedule daily, e.g. crontab:
#   15 3 * * * cd /opt/gtp && ./scripts/purge_expired.sh >> /var/log/gtp-retention.log 2>&1
set -eu
docker compose exec -T api python -m app.cli purge-expired
