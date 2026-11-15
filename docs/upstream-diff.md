# Upstream diff

Stellog tracks changes to Umami files here so a later Umami release can be merged.

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
