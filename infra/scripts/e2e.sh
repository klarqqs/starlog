#!/usr/bin/env bash
# End-to-end check over real HTTP: throwaway Postgres + the real server + curl.
# Covers pages, register, verify, add domain, tracker, collect (right and wrong origin), API metrics, operator view.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
BIN="$(ls -d /usr/lib/postgresql/*/bin 2>/dev/null | sort -V | tail -1 || true)"; [ -n "$BIN" ] || { echo "Postgres binaries not found."; exit 1; }
AS=(); [ "$(id -u)" = 0 ] && AS=(runuser -u postgres --)
TMP="$(mktemp -d)"; chmod 755 "$TMP"; [ "$(id -u)" = 0 ] && chown postgres "$TMP"
PGPORT=54331; APIPORT=4011; BASE="http://127.0.0.1:$APIPORT"; SRV_PID=""
cleanup(){ [ -n "$SRV_PID" ] && kill "$SRV_PID" 2>/dev/null || true; "${AS[@]}" "$BIN/pg_ctl" -D "$TMP/data" stop -m immediate >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT
"${AS[@]}" "$BIN/initdb" -D "$TMP/data" -A trust >/dev/null
"${AS[@]}" "$BIN/pg_ctl" -D "$TMP/data" -o "-p $PGPORT -k $TMP -c listen_addresses=''" -l "$TMP/log" -w start >/dev/null
P=("${AS[@]}" "$BIN/psql" -h "$TMP" -p $PGPORT -X -q)
"${P[@]}" -d postgres -c "CREATE DATABASE starlog_e2e"
for f in "$ROOT"/infra/db/migrations/*.sql; do "${P[@]}" -d starlog_e2e -v tenant_pw=t -v operator_pw=o -v ingest_pw=i -v auth_pw=a -f "$f"; done
url(){ echo "postgresql://$1@/starlog_e2e?host=$TMP&port=$PGPORT"; }
export ADMIN_DATABASE_URL="$(url postgres)" AUTH_DATABASE_URL="$(url starlog_auth)" TENANT_DATABASE_URL="$(url starlog_tenant)" \
       OPERATOR_DATABASE_URL="$(url starlog_operator)" INGEST_DATABASE_URL="$(url starlog_ingest)" PORT=$APIPORT PUBLIC_URL="$BASE"
cd "$ROOT/api"
node scripts/create-operator.js op@scf.test 'operator-password-1' >/dev/null
node src/server.js >"$TMP/server.log" 2>&1 & SRV_PID=$!
for i in $(seq 1 40); do curl -fs "$BASE/docs" >/dev/null 2>&1 && break; sleep 0.25; done
ok(){ echo "ok   $1"; }; fail(){ echo "FAIL $1"; echo "--- server log"; cat "$TMP/server.log"; exit 1; }
code(){ curl -s -o /dev/null -w '%{http_code}' "$@"; }
J=(-H 'content-type: application/json')
for p in / /docs /pricing /privacy /login /operator/login /s.js /site.css; do [ "$(code "$BASE$p")" = 200 ] || fail "page $p"; done; ok "all public pages and the tracker serve"
R="$(curl -s "${J[@]}" -d '{"project":"Demo Wallet","email":"owner@demo.test","password":"correct-horse-battery"}' "$BASE/auth/register")"
VERIFY="$(echo "$R" | node -pe 'JSON.parse(require("fs").readFileSync(0)).verifyUrl')"; [ -n "$VERIFY" ] || fail "register did not return a verify link"; ok "register returns a verify link (dev)"
[ "$(code "$BASE/auth/verify?token=bad")" = 400 ] || fail "bad token accepted"
[ "$(code "${J[@]}" -d '{"email":"owner@demo.test","password":"correct-horse-battery"}' "$BASE/auth/login")" = 403 ] || fail "unverified login allowed"; ok "unverified login blocked"
[ "$(code "$VERIFY")" = 200 ] || fail "verify"; ok "email verified"
CJ="$TMP/jar"; curl -s -c "$CJ" "${J[@]}" -d '{"email":"owner@demo.test","password":"correct-horse-battery"}' "$BASE/auth/login" >/dev/null
SITE="$(curl -s -b "$CJ" "${J[@]}" -d '{"kind":"web","domain":"demo.example.com"}' "$BASE/tenant/sites" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')"; [ ${#SITE} = 36 ] || fail "domain was not added"; ok "domain added, site id issued"
APISITE="$(curl -s -b "$CJ" "${J[@]}" -d '{"kind":"api","domain":"api.demo.example.com"}' "$BASE/tenant/sites" | node -pe 'JSON.parse(require("fs").readFileSync(0)).id')"
[ ${#APISITE} = 36 ] || fail "api domain was not added"
[ "$(code -X POST -H 'content-type: text/plain' -H 'Origin: https://demo.example.com' -d "{\"site\":\"$SITE\",\"referrer\":\"https://stellar.org/x\",\"newSession\":true}" "$BASE/collect")" = 204 ] || fail "collect from registered origin"; ok "visit from the registered domain is counted"
[ "$(code -X POST -H 'content-type: text/plain' -H 'Origin: https://evil.example.net' -d "{\"site\":\"$SITE\"}" "$BASE/collect")" = 403 ] || fail "foreign origin accepted"; ok "visit from another origin is refused"
[ "$(code -X POST -H 'content-type: text/plain' -d "{\"site\":\"$SITE\"}" "$BASE/collect")" = 403 ] || fail "server-side post accepted"; ok "post without a browser origin is refused"
SUM="$(curl -s -b "$CJ" "$BASE/tenant/web/summary?days=7")"; echo "$SUM" | grep -q '"pageViews":1' || fail "summary $SUM"; ok "dashboard shows exactly the 1 counted view"
TOK="$(curl -s -b "$CJ" "${J[@]}" -d '{"label":"prod"}' "$BASE/tenant/tokens" | node -pe 'JSON.parse(require("fs").readFileSync(0)).token')"
BODY='{"domain":"api.demo.example.com","points":[{"path":"/accounts/GABCDEFGHIJKLMNOPQRSTUVWXYZ234567ABCDEFGHIJKLMNOPQRSTUVW/payments?limit=5","status":200,"latencyMs":42},{"path":"/tx/'"$(printf 'a%.0s' $(seq 1 64))"'","status":500,"latencyMs":900}]}'
[ "$(code -X POST -H "Authorization: Bearer $TOK" "${J[@]}" -d "$BODY" "$BASE/v1/metrics")" = 200 ] || fail "metrics"
[ "$(code -X POST -H "Authorization: Bearer nope" "${J[@]}" -d "$BODY" "$BASE/v1/metrics")" = 401 ] || fail "bad token accepted"; ok "API metrics accepted with a token, refused without"
API="$(curl -s -b "$CJ" "$BASE/tenant/api/summary")"; echo "$API" | grep -q '"/accounts/:id/payments"' && echo "$API" | grep -q '"/tx/:id"' || fail "normalization $API"; ok "paths are normalized: $(echo "$API" | node -pe 'JSON.parse(require("fs").readFileSync(0)).routes.map(r=>r.route+" p95="+r.p95).join(", ")')"
REPORT="$(node scripts/adoption-report.js "$BASE" op@scf.test operator-password-1 30)"; echo "$REPORT" | grep -q "Demo Wallet.*views=1.*api=2" || fail "operator report: $REPORT"; ok "operator report shows the project: $(echo "$REPORT" | tail -1)"
[ "$(code -b "$CJ" "$BASE/operator/tenants")" = 403 ] || fail "tenant reached operator data"; ok "a project cannot open the operator list"
# ---- accounts: forgot/reset, operator invites, verify redirect, wallet config
field(){ node -pe "JSON.parse(require('fs').readFileSync(0))$1"; }
RESETURL="$(curl -s "${J[@]}" -d '{"email":"owner@demo.test"}' "$BASE/auth/forgot" | field .resetUrl)"; RTOK="${RESETURL##*token=}"; [ -n "$RTOK" ] || fail "forgot gave no reset link (dev)"
[ "$(code "${J[@]}" -d "{\"token\":\"$RTOK\",\"password\":\"a-brand-new-password\"}" "$BASE/auth/reset")" = 200 ] || fail "reset"
[ "$(code "${J[@]}" -d "{\"token\":\"$RTOK\",\"password\":\"a-brand-new-password\"}" "$BASE/auth/reset")" = 400 ] || fail "reset link reused"
[ "$(code -b "$CJ" "$BASE/me")" = 401 ] || fail "old session survived the reset"
[ "$(code "${J[@]}" -d '{"email":"owner@demo.test","password":"correct-horse-battery"}' "$BASE/auth/login")" = 401 ] || fail "old password still works"
[ "$(code "${J[@]}" -d '{"email":"owner@demo.test","password":"a-brand-new-password"}' "$BASE/auth/login")" = 200 ] || fail "new password"; ok "password reset: one-time link, old password and sessions gone"
OPJ="$TMP/opjar"; curl -s -c "$OPJ" "${J[@]}" -d '{"email":"op@scf.test","password":"operator-password-1"}' "$BASE/auth/login" >/dev/null
INV="$(curl -s -b "$OPJ" "${J[@]}" -d '{"email":"colleague@scf.test"}' "$BASE/operator/operators" | field .inviteUrl)"; ITOK="${INV##*token=}"; [ -n "$ITOK" ] || fail "no invite link"
[ "$(code "${J[@]}" -d '{"email":"colleague@scf.test","password":"guess-guess-guess"}' "$BASE/auth/login")" = 401 ] || fail "invited operator signed in before accepting"
[ "$(code "${J[@]}" -d "{\"token\":\"$ITOK\",\"password\":\"colleague-password-1\"}" "$BASE/auth/reset")" = 200 ] || fail "accept invite"
[ "$(curl -s "${J[@]}" -d '{"email":"colleague@scf.test","password":"colleague-password-1"}' "$BASE/auth/login" | field .role)" = operator ] || fail "invited operator login"
TJ="$TMP/tjar"; curl -s -c "$TJ" "${J[@]}" -d '{"email":"owner@demo.test","password":"a-brand-new-password"}' "$BASE/auth/login" >/dev/null
[ "$(code -b "$TJ" "${J[@]}" -d '{"email":"x@scf.test"}' "$BASE/operator/operators")" = 403 ] || fail "a project invited an operator"; ok "operators: invite, accept, and projects cannot invite"
curl -s "${J[@]}" -d '{"project":"Redirect Co","email":"rd@demo.test","password":"correct-horse-battery"}' "$BASE/auth/register" > "$TMP/rd.json"; RV="$(field .verifyUrl < "$TMP/rd.json")"
[ "$(code -H 'Accept: text/html' "$RV")" = 302 ] || fail "browser verify link did not redirect"; ok "emailed verify link sends browsers to the sign-in page"
[ "$(curl -s "$BASE/auth/wallet/config" | field .enabled)" = true ] || fail "wallet config"
[ "$(code "${J[@]}" -d '{"address":"nope"}' "$BASE/auth/wallet/challenge")" = 400 ] || fail "bad wallet address accepted"
CH="$(curl -s "${J[@]}" -d "{\"address\":\"$(cd "$ROOT/api" && node -e "import('@stellar/stellar-sdk').then(s=>console.log(s.Keypair.random().publicKey()))")\"}" "$BASE/auth/wallet/challenge" | field .transaction)"; [ ${#CH} -gt 100 ] || fail "no wallet challenge"; ok "wallet challenge issued for a valid address (signing is covered by the API tests)"
echo "ALL END-TO-END CHECKS PASSED"
