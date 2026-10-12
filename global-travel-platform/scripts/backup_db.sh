#!/usr/bin/env sh
# Create a compressed, timestamped PostgreSQL backup from the compose stack.
#   ./scripts/backup_db.sh [output_dir]        (default: ./backups)
# Keep backups off-host (e.g. DigitalOcean Spaces) and encrypted at rest.
set -eu

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
chmod 700 "$OUT_DIR"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
FILE="$OUT_DIR/gtp-$STAMP.dump"

# Custom format (-Fc): compressed, restorable selectively with pg_restore.
docker compose exec -T postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB" -Fc --no-owner' > "$FILE"
chmod 600 "$FILE"

# Sanity check: the archive must list its tables.
docker compose exec -T postgres pg_restore --list < "$FILE" | grep -q "TABLE DATA" \
  || { echo "backup verification failed: $FILE" >&2; exit 1; }

echo "backup written: $FILE ($(wc -c < "$FILE") bytes)"

# Retention: keep the newest 14 local backups.
ls -1t "$OUT_DIR"/gtp-*.dump 2>/dev/null | tail -n +15 | xargs -r rm -f
