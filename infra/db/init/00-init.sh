#!/bin/bash
# Runs once on first start of an empty data volume.
set -euo pipefail
psql -v ON_ERROR_STOP=1 -U "$POSTGRES_USER" -d postgres <<SQL
CREATE DATABASE ${UMAMI_DB_NAME:-umami};
CREATE DATABASE ${STARLOG_DB_NAME:-starlog};
SQL
for f in /migrations/*.sql; do
  echo "Applying $f"
  psql -v ON_ERROR_STOP=1 \
    -v tenant_pw="${STARLOG_TENANT_PASSWORD}" \
    -v operator_pw="${STARLOG_OPERATOR_PASSWORD}" \
    -v ingest_pw="${STARLOG_INGEST_PASSWORD}" \
    -v auth_pw="${STARLOG_AUTH_PASSWORD}" \
    -U "$POSTGRES_USER" -d "${STARLOG_DB_NAME:-starlog}" -f "$f"
done
