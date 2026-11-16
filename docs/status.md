# Stellog status against the web and API analytics request

This file records the local smoke on 15 Nov 2026. A row is BUILT only when that smoke passed it. PARTIAL means this smoke did not prove the whole requirement. PLANNED means this smoke did not exercise it and it is not claimed.

Environment: the local production server, not a container. `docker info` did not answer within 10 seconds and was not retried. Postgres on port 5434 did not accept a connection, so the server used database `stellog_smoke` on local Postgres at `127.0.0.1:5432`. The repo `.env` was not modified. The app was built with `SKIP_BUILD_GEO=1` and started with `next start -H 127.0.0.1 -p 3000`. `SMOKE_HARNESS=1` was set so the harness page was available. `next dev` was not used.

The script `scripts/smoke-test.ts` exited 0. Credentials stayed in gitignored `.env.smoke`.

| Requirement | Status | Evidence from this smoke |
| --- | --- | --- |
| Stay on Umami and Postgres | BUILT | The production server answered on `127.0.0.1:3000` and wrote to Postgres. Package name `stellog`, version 3.5.0. |
| Compose builds and runs this repo | PARTIAL | `docker info` timed out. The image was not built and the container was not started. |
| JSON OTLP metrics, traces, and logs | BUILT | `POST /v1/traces` 200, `POST /v1/metrics` 200, `POST /v1/logs` 200. Trace and metric rows were stored. The log body was not stored, and the marker was absent from text columns. |
| Protobuf and gzip | PARTIAL | `POST /v1/traces` with `application/x-protobuf` returned 200 and stored 1 row. It did not return 415. Gzip was not sent. |
| Route normalization | BUILT | Stored routes: `/payments/{id}`, `/orders/{uuid}`, `/accounts/{account}`, `/tx/{hash}`, `/health`, `/ready`, `/proto/{id}`. The numeric id, UUID, Stellar G-address, 64-character hex, and trailing slash were normalized. |
| Route cap with `other` | PARTIAL | Not exercised. The seven routes were stored under their own names. |
| Ingest key hashed, team scoped | BUILT | Keys are `stk_` bearers. `ingest_key.key_hash` is 128 characters and does not start with `stk_`. The table has `team_id` and no website column. A missing, unknown, or revoked key returned 401 and added no rows. A payload naming the other tenant's website returned 403 and added no rows. |
| Hour rows about 90 days, day rows 24 months, raw 48 hours | PARTIAL | Not exercised. Inserts wrote both the hour and day rollups: the 24h query used hour grain and the 7d query used day grain, and both reported 7 requests. Retention cutoffs were not checked. |
| Monthly partitions | PLANNED | Not exercised. Tables used by this smoke are not partitioned. |
| Forced row-level security | PLANNED | Not exercised. Isolation was the application check: the other tenant's session got 401 from the website API and the metrics API. |
| `stellog_operator` database role | PARTIAL | Not exercised. The operator HTTP key is a separate check below. |
| Tenant API screen | BUILT | Signed in, `/websites/:id/api` showed Requests 7, p50 50 ms, p95 500 ms, the seven routes, and status 200 at 71% (5) and 500 at 29% (2). The 24h API used hour grain and the 7d API used day grain. Both reported 7 requests. |
| Operator ranking, enrollment, operator keys | BUILT | `PUT /api/admin/enrollment` returned 200 for approval-required and 200 for open. `GET /api/admin/projects?status=active` included both tenants and excluded the pending team. The signed-in `/admin/projects` page showed both tenants, Enrollment Open, and no pending name. `GET /api/operator/projects` with an operator key returned 200. `GET /api/websites` and `GET /api/admin/enrollment` returned 401. After revoke, the projects call returned 401. |
| Pinned tracker and `/s/e` | BUILT | The harness served the snippet with `integrity` and `crossorigin`. `openssl dgst -sha384` of `public/s/1.js` matched `sha384-LalcFoscv7OTG55iSQicfQHsCj0wGfcDDVMOlI/t8AO00kv1uNfOhe+/qGNxZ8hU`. A browser loaded `/s/1.js` and `POST /s/e` stored `/smoke-harness`. A curl page view stored `/pricing`. The wrong Origin returned 403. Googlebot returned 200 and stored nothing. |
| City and region dropped on the Stellog path | PARTIAL | The two stored visits have null city, region, and country. The GeoIP database was not built (`SKIP_BUILD_GEO=1`), so this does not by itself prove a privacy split that still stores a country. |
| Erasure of a distinct id and a tenant | PARTIAL | Not exercised. |
| Backup, alerts, and handover docs | PARTIAL | Not exercised. |
| Prune scheduler | PARTIAL | `scripts/prune-metrics.ts` and `infra/systemd/stellog-prune.timer` are in the tree. The timer is not installed and the script was not run. |
| GeoIP redistribution | PARTIAL | The build used `SKIP_BUILD_GEO=1`. The license note was not reviewed in this smoke. |
| Load at about one million requests a day | PARTIAL | `scripts/load-api-metrics.ts` ran for its default length, not 30 minutes. 174 requests, 0 failed, p50 15.29 ms, p95 20.15 ms. A 24-hour run was not done. |
| Password-reset email | PLANNED | Not exercised. |
| Wallet-only signup | PLANNED | Not exercised. Sign-in still has an email form. |

A counter with no latency was also written into the `h_inf` bucket. The tenant page ignored that row, so its p50 and p95 were 50 ms and 500 ms. The operator page summed it and showed p95 as `> 10s`. After the fix, `GET /api/admin/projects` and the signed-in page report p50 50 and p95 500 for those 7 requests.

The other tenant's HTML page `/websites/:id/api` returned 200. That response is the app shell. The website API and the metrics API returned 401, and the other tenant's ingest key could not write.
