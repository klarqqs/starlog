# Stellog demo walkthrough

About ten minutes. The app is the Umami 3.5.0 fork with Postgres. The public site is [https://stellog-eta.vercel.app](https://stellog-eta.vercel.app). Its home page shows a screenshot of the overview chart from the running app.

Credentials are in `.env.demo` on the machine that ran `scripts/seed-demo.ts`. That file is gitignored. This guide does not repeat the passwords.

Sign-in for a project account is `/login`. Sign-in for the operator is `/operator/login`, labeled “Sign in as operator.” The operator username is not an email.

## 1. Tenant web view

Sign in at `/login` as `demo-tenant@stellog.demo`. Open **Websites**, then a project site such as **Authline**. Set the date range to **Last 30 days**.

You should see pageviews, visitors, countries, browsers, and referrers such as `stellar.org` and `google.com`.

## 2. Tenant API view

Open an API property, such as **Authline API**. Open the API page. Last 30 days.

You should see request volume, a status split, p50 and p95, and routes. The stored routes include `/payments/{id}`, `/orders/{uuid}`, `/accounts/{account}`, `/contracts/{contract}`, `/tx/{hash}`, and `/health`. A numeric id, a UUID, a Stellar G-address, a Stellar C-address, a hex hash, and a trailing slash were sent and normalized.

## 3. Operator ranking

Sign out. Sign in as `demo-operator` at `/operator/login`. You land on `/admin/projects`.

Set **Last 30 days**. The table lists the SCF projects (Authline, JetPad, Obba, and the rest), each with its site icon, a rank, error rate, p95, and a trend against the previous 30 days. Sort by API requests, then by error rate. Filter the name to `Authline`.

Select up to four projects. A fifth checkbox does not add a column. The side-by-side panel shows the same error rate, p95, and trends.

This login cannot remove a project, change enrollment, or create an operator key. Those controls are absent. An administrator still has them.

## 4. Operator key

From `.env.demo`, use `DEMO_OPERATOR_KEY`:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $DEMO_OPERATOR_KEY" \
  "$DEMO_BASE_URL/api/operator/projects?startAt=$(($(date +%s)*1000-2592000000))&endAt=$(($(date +%s)*1000))"
```

That is 200. The same key on another route is 401:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $DEMO_OPERATOR_KEY" \
  "$DEMO_BASE_URL/api/websites"
```

## 5. Pinned tracker

Sign in again as `demo-tenant@stellog.demo`. Open **Demo Lobstr site**, then settings. The snippet loads `/s/1.js` and includes `integrity` and `crossorigin="anonymous"`. The hash matches:

```sh
openssl dgst -sha384 -binary public/s/1.js | openssl base64 -A
```

## 6. Isolation

Sign in as `demo-other@stellog.demo`. Copy the website id from the **Demo Lobstr site** URL while you were the tenant. As the other account:

```sh
curl -sS -o /dev/null -w '%{http_code}\n' \
  -H "Authorization: Bearer $OTHER_TOKEN" \
  "$DEMO_BASE_URL/api/websites/$WALLET_WEBSITE_ID"
```

`$OTHER_TOKEN` is the bearer token from that login. The status is 401. That account owns **Demo StellarExpert** and does not receive Lobstr's numbers.

## Status

The smoke record is [docs/status.md](status.md). This demo does not change those rows. Short form:

| Area | Status |
| --- | --- |
| Umami and Postgres, JSON OTLP, route normalization, hashed team ingest keys | BUILT |
| Tenant API page and operator ranking, including this demo's error rate, p95, and trend columns | BUILT on the running app when the seed and the checks in the report passed |
| Pinned tracker and `/s/e` | BUILT |
| Protobuf traces | PARTIAL in the smoke (JSON protobuf body returned 200 there). Gzip was not part of that smoke |
| Compose image, retention cutoffs, prune timer, route cap, operator database role, erasure, GeoIP license | PARTIAL or not exercised. See status.md |
| Monthly partitions, forced row-level security, password-reset email, wallet-only signup | PLANNED |

Hosting steps, the health check, the daily backup, and the reset command are in [docs/hosting.md](hosting.md). This repository was not deployed by the change that added those steps.
