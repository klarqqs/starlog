#!/bin/sh
# Daily Postgres backup for a VPS. Requires DATABASE_URL and pg_dump.
set -eu
: "${DATABASE_URL:?Set DATABASE_URL}"
dir="${BACKUP_DIR:-/var/backups/stellog}"
mkdir -p "$dir"
stamp=$(date -u +%Y%m%dT%H%M%SZ)
file="$dir/stellog-$stamp.dump"
pg_dump "$DATABASE_URL" --format=custom --file "$file"
find "$dir" -name 'stellog-*.dump' -mtime +14 -delete
echo "Wrote $file"
