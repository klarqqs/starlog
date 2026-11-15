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
- `.github/workflows/gitleaks.yml` and `stale-issues.yml` still request the Blacksmith runner.

## Target schema (accepted, not migrated)

Migration 29 is the interim collector. The accepted design replaces it in a later phase. Do not extend `ingest_key` or the unpartitioned metric tables as if they were final.

- `team` is the project. `website` is a property and gains `kind` (`web` or `api`). `domain` stays nullable and is required only for `web`.
- `api_ingest_key` is a hashed, rotatable secret owned by a team. A website id is public and is not an ingest credential.
- `api_metric_hour` is partitioned by month and kept about 90 days. `api_metric_day` is partitioned by month and kept at least 24 months.
- New tables get Postgres row-level security. `stellog_operator` is a read-only database role and is not the Umami `admin` application role.
- Route cardinality past a named per-team hourly cap is stored as `other`. Per-IP bot counters are ephemeral and are not a table.

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
