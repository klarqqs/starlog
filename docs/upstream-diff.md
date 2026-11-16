# Upstream diff

Stellog tracks changes to Umami files here so a later Umami release can be merged.

## Phase 0

`docker-compose.yml`

- The `umami` service builds `Dockerfile` in this repository and tags the image `stellog:local`.
- It no longer pulls `ghcr.io/umami-software/umami:latest`.

`.github/workflows/ci.yml`

- Removed `if: github.repository == 'umami-software/umami'`, so the test job runs in this repository.
- The job runs on `ubuntu-latest` instead of Umami's `blacksmith-4vcpu-ubuntu-2404` runner.

Left unchanged on purpose:

- `.github/workflows/cd.yml` and `cd-cloud.yml` still publish the upstream Umami images and stay limited to `umami-software/umami`.

`.github/workflows/gitleaks.yml`

- The secret scan runs on `ubuntu-latest`.

`.github/workflows/stale-issues.yml`

- The job is disabled with `if: false` and would run on `ubuntu-latest`. This fork does not auto-close issues.

## Target schema (accepted, not migrated)

Migration 29 is the interim collector. The accepted design replaces it in a later phase. Do not extend `ingest_key` or the unpartitioned metric tables as if they were final.

- `team` is the project. `website` is a property and gains `kind` (`web` or `api`). `domain` stays nullable and is required only for `web`.
- `api_ingest_key` is a hashed, rotatable secret owned by a team. A website id is public and is not an ingest credential.
- `api_metric_hour` is partitioned by month and kept about 90 days. `api_metric_day` is partitioned by month and kept at least 24 months.
- New tables get Postgres row-level security. `stellog_operator` is a read-only database role and is not the Umami `admin` application role.
- Route cardinality past a named per-team hourly cap is stored as `other`. Per-IP bot counters are ephemeral and are not a table.

`src/app/page.tsx` already sends a signed-out visitor to `/home`. `src/app/page.test.tsx` now expects that path.

## Handover

`docker-compose.yml`

- The app's `DATABASE_URL` and `POSTGRES_PASSWORD` follow `POSTGRES_PASSWORD`, defaulting to `umami` so an existing volume still starts.
- `APP_URL` defaults to `http://127.0.0.1:3000`.
- `DISABLE_TELEMETRY` and `DISABLE_UPDATES` default to `1`.
- Profile `ops` adds Prometheus, Alertmanager, and a textfile exporter. `docker compose up` does not start them.

`.github/workflows/ci.yml`

- The test job runs the Vitest suite, including Postgres integration tests, against Postgres 15, then the package tests.
- Separate jobs run the OpenAPI and production build, the Playwright API suite, the Playwright browser suite, and `terraform validate`.

`.gitignore`

- Ignores `backups/`, generated Alertmanager config, Prometheus textfiles, and Terraform state.

`src/openapi/discover.ts`

- Also walks `src/app/v1`, so `POST /v1/metrics`, `/v1/traces`, and `/v1/logs` are part of the explicit contract check.

New routes gained hand-written OpenAPI contracts. `/s/e` stays outside that walk.

## Pinned tracker

`src/tracker/index.ts`

- The pinned build requests a nonce and sends `x-stellog-cache`. The legacy build leaves those compile-time tokens unset, so it still posts once to its collect endpoint with `x-umami-cache`.
- When no collect host is configured, the tracker uses the script's origin. The script directory would make `/s/1.js` post to `/s/s/e`.

`rollup.tracker.config.js`

- The legacy bundle sets the nonce flag off and keeps `x-umami-cache`.

`next.config.ts`

- Removed the production `CLOUD_MODE` rewrite of `/script.js` to `https://cloud.umami.is/script.js`.
- An absolute `TRACKER_SCRIPT_URL` is ignored.
- `COLLECT_API_ENDPOINT` rewrites to `/s/e`.
- `TRACKER_SCRIPT_NAME` rewrites to `/s/1.js`.

`docker/proxy.ts`

- The same three runtime rules. A custom collect path rewrites to `/s/e`, and a custom script name rewrites to the pinned file.

`src/app/(main)/websites/[websiteId]/settings/WebsiteTrackingCode.tsx`

- The snippet is the pinned file, with `integrity` and `crossorigin="anonymous"`.

`scripts/update-tracker.js`

- Still rewrites only `public/script.js`. It throws if that path is under `public/s`.

`biome.json`

- The pinned tracker `public/s` is excluded. It is a minified build, and linting it reports the compressor's syntax.

`package.json`

- `build:tracker` also builds and hashes `public/s/1.js`.

`tests/e2e/website.spec.ts`

- The settings snippet is expected to contain `/s/1.js` and `integrity=`.

The nonce, origin, and per-IP checks live in new files and run on `/s/e` only. `/api/send` is unchanged.

## Operator dashboard

`src/app/(main)/admin/AdminNav.tsx`

- Added a Projects item that links to `/admin/projects`.

`src/app/api/websites/route.ts`

- A new website takes `enrollmentStatus` from the operator enrollment mode. Admins stay active. Approval-required makes a non-admin website pending. A website added to a pending team stays pending.

`src/app/api/teams/route.ts`

- A new team takes the same enrollment status. Admins stay active.

The ranking query, operator keys, removal, and approval live in new files. An operator key can call `GET /api/operator/projects` only.

## Tenant API view

`src/components/hooks/useWebsiteNavItems.tsx`

- Added an API item under Monitoring that links to `/websites/:websiteId/api`.
- The page and its query live in new files. The query predicate is `websiteId` plus the selected time range.

## API metrics (migration 29)

`prisma/schema.prisma`

- `Website` gained relations to the Stellog metric tables: `ingestKeys`, `apiMetricRaw`, `apiMetricHours`, `apiMetricDays`, `apiMetricCursors`.
- New models: `IngestKey`, `ApiMetricRaw`, `ApiMetricHour`, `ApiMetricDay`, `ApiMetricCursor`.

No Umami route, tracker, query, or auth file was edited for the collector. New code lives in `src/stellog/` and in new routes:

- `POST /v1/metrics`
- `POST /v1/traces`
- `POST /v1/logs`
- `GET` and `POST /api/websites/:websiteId/ingest-keys`
- `DELETE /api/websites/:websiteId/ingest-keys/:keyId`

The website key routes call Umami's existing `canUpdateWebsite`. They do not change that function.

## Local website domain

`src/lib/constants.ts`

- `DOMAIN_REGEX` accepts an IPv4 address with an optional port, so a local site can be registered as `127.0.0.1:3000` and match that page's origin. Hostnames and `localhost` are unchanged.


## Read-only demo operator

`src/lib/constants.ts`

- Added the `operator` role. It has no Umami permissions. It is not an admin.

`src/lib/auth.ts`

- A session whose role is `operator` is marked `isOperator`. `isAdmin` stays limited to `admin`.

`src/app/login/LoginForm.tsx`

- The operator entrance accepts `admin` and `operator`. An `operator` is sent to `/admin/projects`. A project account is still rejected there.

`src/app/(main)/admin/AdminLayout.tsx`

- An `operator` can open `/admin/projects` only. Other admin pages stay closed. An admin is unchanged.
