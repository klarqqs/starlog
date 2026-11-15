#!/bin/sh
set -eu
cd "$(dirname "$0")/.."
exec ./node_modules/.bin/tsx scripts/restore-db.ts "$@"
