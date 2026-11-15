#!/usr/bin/env bash
# Starts a throwaway Postgres, applies migrations, runs the API test suite.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$BIN" ] || { echo "Postgres binaries not found."; exit 1; }
AS=(); [ "$(id -u)" = 0 ] && AS=(runuser -u postgres --)
TMP="$(mktemp -d)"; chmod 755 "$TMP"; [ "$(id -u)" = 0 ] && chown postgres "$TMP"
PORT=54330; PSQL=("${AS[@]}" "$BIN/psql" -h "$TMP" -p $PORT -X -q)
cleanup(){ "${AS[@]}" "$BIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
"${AS[@]}" "$BIN/initdb" -D "$TMP/data" -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE starlog_test"
for f in "$ROOT"/infra/db/migrations/*.sql; do
  "${PSQL[@]}" -d starlog_test -v tenant_pw=t -v operator_pw=o -v ingest_pw=i -v auth_pw=a -f "$f"
done
url(){ echo "postgresql://$1@/starlog_test?host=$TMP&port=$PORT"; }
export ADMIN_DATABASE_URL="$(url postgres)" AUTH_DATABASE_URL="$(url starlog_auth)" \
       TENANT_DATABASE_URL="$(url starlog_tenant)" OPERATOR_DATABASE_URL="$(url starlog_operator)" \
       INGEST_DATABASE_URL="$(url starlog_ingest)"
cd "$ROOT/api" && node --test "test/*.test.js"
