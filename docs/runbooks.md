# Runbooks

The metric prune is not inside the Compose app container. The runtime image does not include the TypeScript sources. On the host, `infra/systemd/stellog-prune.timer` runs `scripts/prune-metrics.ts` every hour. `DRY_RUN=1 ./node_modules/.bin/tsx scripts/prune-metrics.ts` prints the three cutoffs and does not delete rows.

These procedures match this repository. The database is Postgres 15. The app container is the `umami` service in `docker-compose.yml`, and the image is built from this repo's `Dockerfile`.

`GET /api/heartbeat` returns `{ "ok": true }` when the Node process is up. It does not check Postgres. The database check is separate.

Thresholds below are Stellog choices: a backup older than 26 hours is stale, dumps are kept 14 days, and the check is stale after 10 minutes. The check itself is intended to run every 5 minutes.

## App not answering

1. `curl -fsS http://127.0.0.1:3000/api/heartbeat`
2. `docker compose ps` and `docker compose logs umami --tail 100`
3. If the process is crash-looping, confirm `APP_SECRET` is set and `DATABASE_URL` reaches the `db` service.
4. Restart only the app: `docker compose restart umami`. Do not recreate the database volume.

## Database not answering

1. `docker compose exec -T db pg_isready -U umami -d umami`
2. `docker compose logs db --tail 100`
3. A full disk on the Docker volume presents as connection errors or a Postgres panic. Free space before deleting the volume. The volume name is `umami-db-data`.
4. Restoring over a broken database is the next section. Do not run `docker compose down -v`.

## Backup

From the repository root, with the compose stack running:

```sh
./scripts/backup-db.sh
```

`DRY_RUN=1 ./scripts/backup-db.sh` prints the `pg_dump` command and does not open Docker. The dump is a custom-format file named `stellog-YYYYMMDDTHHMMSSZ.dump` under `BACKUP_DIR` (default `backups/`). The command runs `pg_dump` inside the `db` container, so the database password is not placed on the host command line. After a successful dump, files older than 14 days by the timestamp in the name are deleted. Other files in the directory are left alone.

Schedule it on the host, not inside the request path:

```cron
15 2 * * * cd /opt/stellog && ./scripts/backup-db.sh >> /var/log/stellog-backup.log 2>&1
```

Copy the dumps off the same disk as the database. This repository does not ship object-storage replication.

## Restore

Restoring replaces the `umami` database and stops the app while it runs.

```sh
DRY_RUN=1 ./scripts/restore-db.sh stellog-20260101T000000Z.dump
RESTORE_CONFIRM=yes ./scripts/restore-db.sh stellog-20260101T000000Z.dump
```

The file name has to be a basename matching `stellog-YYYYMMDDTHHMMSSZ.dump` inside `BACKUP_DIR`. A path such as `../other.dump` is refused. Without `RESTORE_CONFIRM=yes` the script exits 2 and does not call Docker.

The script stops the `umami` service, runs `pg_restore --clean --if-exists --no-owner`, then starts the app. `pg_restore` can exit non-zero on harmless "does not exist" messages during `--clean`. Read the log before treating the database as healthy. Then run `pnpm db:migrate` if the code you are starting is newer than the dump.

Practice this against a copy before the first production restore.

## Check and paging

```sh
APP_URL=http://127.0.0.1:3000 OPS_TEXTFILE=infra/monitoring/textfile/stellog.prom ./node_modules/.bin/tsx scripts/ops-check.ts
```

The process prints one JSON object and writes Prometheus text. Exit 0 means no alert. Exit 2 means at least one of: heartbeat down, database down, no dump, dump older than 26 hours. `DATABASE_URL` is checked with `psql` when it is on `PATH`, and otherwise with `docker compose exec db pg_isready`. The script does not print the URL.

Cron, every 5 minutes:

```cron
*/5 * * * * cd /opt/stellog && APP_URL=http://127.0.0.1:3000 OPS_TEXTFILE=infra/monitoring/textfile/stellog.prom ./node_modules/.bin/tsx scripts/ops-check.ts
```

Paging is the ops Compose profile. It is not part of `docker compose up`.

```sh
ALERT_WEBHOOK_URL=https://hooks.example/stellog ./node_modules/.bin/tsx scripts/render-alertmanager.ts
docker compose --profile ops up -d
```

Prometheus listens on `127.0.0.1:9090` and Alertmanager on `127.0.0.1:9093`. The rules in `infra/monitoring/alerts.yml` match the check script: `StellogHeartbeatDown`, `StellogDatabaseDown`, `StellogBackupMissing`, `StellogBackupStale`, `StellogCheckStale` (no report for 10 minutes), and `StellogCheckMissing`. There is no default receiver. Set `ALERT_WEBHOOK_URL` to the system you actually page. The URL must be `http` or `https` and must not contain spaces or quotes.

## Approve or remove a project

An admin session is required. An `opk_` operator key can read `GET /api/operator/projects` and cannot approve, remove, or change enrollment.

- Approve: `POST /api/admin/projects/team/<id>/approve` or `POST /api/admin/projects/website/<id>/approve`
- Remove a team: `DELETE /api/admin/projects/team/<id>` (this deletes that team's websites)
- Remove a website that has no team: `DELETE /api/admin/projects/website/<id>`
- Enrollment: `PUT /api/admin/enrollment` with `{ "mode": "open" }` or `{ "mode": "approval-required" }`

Pending websites still accept collection. The operator ranking omits their traffic until they are approved.

## Rotate secrets

- `APP_SECRET`: generate `openssl rand -hex 32`, set it, restart the app. Every session stops working. Operator keys and ingest keys keep working because they are stored as hashes of the token, not as JWTs.
- `TWO_FACTOR_ENCRYPTION_KEY`: rotating it makes existing two-factor secrets unreadable. Plan a reset of two-factor enrollment before changing it.
- `POSTGRES_PASSWORD`: the value in Compose is used on the first boot of a volume. Changing the variable later does not change the password inside an existing volume. Use `ALTER ROLE` inside Postgres, then update Compose to match.
- Ingest keys (`stk_`) and operator keys (`opk_`) are shown once. Revoke from the website settings API or `DELETE /api/admin/operator-keys/<id>`.

## Password reset

`POST /api/auth/forgot` does not send email. It writes the reset link to the app log in every environment. Outside production the same link is also in the JSON response. To complete a reset, read the log and open the link, or call `POST /api/auth/reset` with the token.

## API metric retention

Raw API rows default to 48 hours (`STELLOG_RAW_RETENTION_HOURS`). Hour and day aggregates are kept at least 24 months. Nothing in Compose runs the prune. Schedule:

```cron
30 3 * * * cd /opt/stellog && ./node_modules/.bin/tsx scripts/prune-api-metrics.ts
```

## Tracker

A new tracker version is a new file under `public/s/`. The previous file stays. Tenants replace the script tag themselves. See `docs/tracker.md`.

## What this build does not monitor

There is no multi-region replica, no uptime vendor, and no paging unless you set `ALERT_WEBHOOK_URL`. The admin update notice and the telemetry pixel are off in Compose unless `DISABLE_UPDATES` or `DISABLE_TELEMETRY` is set to empty. Row-level security is not enabled. `stellog_operator` exists (migration 31) but the application does not connect as it.
