#!/usr/bin/env sh
# Restore a backup created by backup_db.sh into the compose PostgreSQL.
#   ./scripts/restore_db.sh backups/gtp-20261012T000000Z.dump [--yes]
# DESTRUCTIVE: replaces existing objects in the database.
set -eu

FILE="${1:?usage: restore_db.sh <backup.dump> [--yes]}"
[ -f "$FILE" ] || { echo "no such file: $FILE" >&2; exit 1; }

if [ "${2:-}" != "--yes" ]; then
  printf "This will overwrite the current database with %s. Type 'restore' to continue: " "$FILE"
  read -r answer
  [ "$answer" = "restore" ] || { echo "aborted"; exit 1; }
fi

# Stop writers so the restore is consistent.
docker compose stop api web

docker compose exec -T postgres sh -c \
  'pg_restore -U "$POSTGRES_USER" -d "$POSTGRES_DB" --clean --if-exists --no-owner --single-transaction' < "$FILE"

# Bring the schema up to date in case the backup predates newer migrations.
docker compose run --rm migrate
docker compose start api web
echo "restore complete from $FILE"
