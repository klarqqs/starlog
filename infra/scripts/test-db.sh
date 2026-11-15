#!/usr/bin/env bash
# Spins up a throwaway local Postgres, applies migrations, runs isolation tests, cleans up.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"
[ -n "$BIN" ] || { echo "Postgres 14+ binaries not found. Install postgresql, or use Docker (make up)."; exit 1; }
AS=(); [ "$(id -u)" = 0 ] && AS=(runuser -u postgres --)
TMP="$(mktemp -d)"; chmod 755 "$TMP"; [ "$(id -u)" = 0 ] && chown postgres "$TMP"
PORT=54329; PSQL=("${AS[@]}" "$BIN/psql" -h "$TMP" -p $PORT -X -q)
cleanup(){ "${AS[@]}" "$BIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
"${AS[@]}" "$BIN/initdb" -D "$TMP/data" -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$TMP/data" -o "-p $PORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
"${PSQL[@]}" -d postgres -c "CREATE DATABASE starlog_test"
for f in "$ROOT"/infra/db/migrations/*.sql; do
  echo "apply $(basename "$f")"
  "${PSQL[@]}" -d starlog_test -v tenant_pw=t -v operator_pw=o -v ingest_pw=i -v auth_pw=a -f "$f"
done
"${PSQL[@]}" -d starlog_test -f "$ROOT/infra/db/tests/001_isolation.sql" 2>&1 | grep -E "^(NOTICE|psql|ERROR)|ALL ISOLATION|ok  |FAIL" | sed 's/^psql:[^ ]* //;s/^NOTICE:  //'
