#!/bin/sh
# Replace the synthetic demo. The app must already be running.
# Credentials are rewritten to .env.demo. Passwords are not printed.
set -eu
cd "$(dirname "$0")/.."
exec ./node_modules/.bin/tsx scripts/seed-demo.ts --reset
