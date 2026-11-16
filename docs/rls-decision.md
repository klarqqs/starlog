# Row-level security and partitions

## Row-level security: not forced

The application connects through one Prisma client and one pooled Postgres role (`DATABASE_URL`). A policy that hides other tenants needs a session variable such as `app.team_id` on every statement. Prisma does not set that variable, and a pooled connection keeps it after the request that set it unless every query runs inside a transaction that uses `SET LOCAL`. Forcing row-level security on `api_metric_hour`, `api_metric_day`, `api_metric_raw`, and `ingest_key` would make the current client return no rows, or leak a tenant setting across pooled checkouts.

The tables stay without row-level security. Isolation stays in the application: an ingest key resolves to one team, a payload can name only a website of that team, and the tenant API query is scoped by `websiteId`. The tests in `src/stellog/metrics-store.integration.test.ts` and `src/stellog/tenant-metrics.integration.test.ts` cover two tenants.

`stellog_operator` is a separate `NOLOGIN` role with `SELECT` on `api_metric_hour` and `api_metric_day` only. It is not the application login. `src/stellog/operator-role.integration.test.ts` checks that it cannot insert a rollup row and cannot read `user.password`, `session.distinct_id`, or `ingest_key.key_hash`.

## Partitioning: skipped

`api_metric_hour` and `api_metric_day` are ordinary tables. Hour rows are deleted after `STELLOG_HOUR_RETENTION_DAYS` (default 90). Day rows are deleted after at least 24 months. That prune is a `DELETE`, not a dropped partition.

Monthly partitions would match the accepted design, and Prisma would not manage them: the client would still write the parent table, and creating the next month’s partition would be a scheduled SQL job. The current volume does not need that. Add partitions when the hour or day table is large enough that the prune delete or the rollup index becomes the problem, and record that change in a new migration.
