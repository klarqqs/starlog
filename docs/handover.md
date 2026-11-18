# Handover

Work through this list when the install moves to another operator. The running database name is `umami`. The Compose service that serves HTTP is also named `umami`. The image to run is the one built from this repository, not `ghcr.io/umami-software/umami`.

## Checklist

- [ ] The receiving operator has a GitHub account with admin on the repository they will own.
- [ ] Transfer `github.com/klarqqs/stellog` (or push a mirror) and confirm Actions ran on the new default branch. CI is `.github/workflows/ci.yml`.
- [ ] Remove the previous owner's deploy keys, Action secrets, and package permissions after the new CI is green.
- [ ] Generate a new `APP_SECRET` and `TWO_FACTOR_ENCRYPTION_KEY` with `openssl rand -hex 32`. Setting a new `APP_SECRET` signs every session out. Setting a new two-factor key makes existing two-factor secrets unreadable.
- [ ] Put those values in the new host's environment. Do not commit `.env`.
- [ ] Take a dump with `./scripts/backup-db.sh` and copy it on a second disk.
- [ ] Restore into the new Postgres 15 volume with `RESTORE_CONFIRM=yes ./scripts/restore-db.sh <file>`, then `pnpm db:migrate` if the new checkout is ahead of the dump.
- [ ] Confirm `GET /api/heartbeat` and a `psql` `select 1` on the new host.
- [ ] Schedule backup and `scripts/ops-check.ts` from `docs/runbooks.md`. Render Alertmanager only after `ALERT_WEBHOOK_URL` points at a real receiver.
- [ ] Decide enrollment (`open` or `approval-required`) and record who may approve projects.
- [ ] Keep the old hostname proxying to the new app until tenants replace their script tags. Do not 301 the tracker host.
- [ ] Set `APP_URL` to the public origin and open one website settings page to confirm the snippet host, the `integrity` hash, and `crossorigin="anonymous"`.
- [ ] Run one restore onto a scratch database and throw that database away.
- [ ] Tell tenants that password reset is read from the server log until email exists.

## Repository transfer

The public repository is `https://github.com/klarqqs/stellog.git`. This checkout may still have `origin` pointed at `https://github.com/klarqqs/starlog.git`. Before transfer, push the commit you intend to hand over to `stellog`. This checkout also has uncommitted work until someone commits it.

GitHub's transfer keeps issues and stars and changes the owner. After it finishes, update the local remote, and rotate `APP_SECRET` so a token minted on the old operator's watch cannot be replayed as a session. Ingest keys and operator keys are hashes in the database; they move with the dump and do not depend on `APP_SECRET`. Revoke any operator key you do not want the new operator to inherit.

CI on the new repository runs five jobs: unit and Postgres integration tests, the OpenAPI and production build, the Playwright API suite, the Playwright browser suite, and `terraform validate`. The ClickHouse profile is not part of that suite. Stellog's store for this handover is Postgres.

`.github/workflows/cd.yml` and `cd-cloud.yml` still target Umami's own image publish and will not deploy this fork. Leave them. `gitleaks.yml` and `stale-issues.yml` still request a Blacksmith runner and will not start here. Do not turn on stale-issue closing as part of the transfer.

## Data migration

1. Stop writes if you can: `docker compose stop umami`.
2. `./scripts/backup-db.sh`
3. Copy the dump to the new host.
4. Start only Postgres there (`docker compose up -d db` or apply the Terraform stack and wait until `pg_isready` succeeds).
5. `RESTORE_CONFIRM=yes ./scripts/restore-db.sh stellog-....dump`
6. Start the app. On boot it does not wipe the database. If the new code adds migrations, run `pnpm db:migrate` against `DATABASE_URL` before serving traffic.
7. Sign in, open `/admin/projects`, and compare project names with the source. Then send one heartbeat check.

The dump includes users, websites, teams, sessions, API metric rollups, ingest-key hashes, and operator-key hashes. It does not include the plaintext of those keys. Tenants who lost a token need a new key.

Postgres row-level security is not enabled. Isolation is in the application queries. A database superuser can read every tenant. Give the new operator a role that is not shared with the application only if you create one outside this repository; this repo does not create `stellog_operator`.

There is no separate erasure workflow for `distinct_id`. Removing a project uses Umami's existing team and website delete. Say that in the handover instead of promising a GDPR delete API.

## Domain

The pinned snippet embeds the install origin:

```html
<script defer src="https://stats.example/s/1.js" integrity="sha384-..." crossorigin="anonymous" data-website-id="..."></script>
```

A 301 from the old host to the new host is a poor cutover for that tag. Browsers treat a cross-origin script redirect together with `integrity` poorly, and a tenant who does not update the tag stops sending. During the overlap, reverse-proxy the old hostname to the same app process so `/s/1.js` and `/s/e` answer with the same bytes. Leave the old host in place until the tenants you care about have pasted the snippet from the new origin.

Then set `APP_URL` to the new origin and restart the app. Links in the product, including password-reset links in the log, use that origin.

`TRACKER_SCRIPT_NAME` may alias the file. It does not change the hash. Changing `COLLECT_API_ENDPOINT` builds a new file and a new hash; that is a tracker release, not a DNS change. See `docs/tracker.md`.

## Infrastructure

`docker compose up` builds this repo and starts the app and Postgres. Telemetry and the admin update check default off. The database password defaults to `umami` so an existing local volume keeps working. Set `POSTGRES_PASSWORD` before the first boot of a host anyone else can reach, and use a URL-safe value.

`docker compose --profile ops up` adds Prometheus, Alertmanager, and a textfile exporter. It does not replace the cron entries in `docs/runbooks.md`.

`infra/terraform` is the same kind of single host, recorded in Terraform state: a Docker network, a Postgres 15 volume, and the app image built from this `Dockerfile`. Container names are `stellog-terraform-db` and `stellog-terraform-app`, and the published port defaults to 3001, so an apply does not reuse the Compose project. Do not apply it on a machine that should keep using Compose for the same install. Compose waits for Postgres health. Terraform restarts the app until the database accepts connections. Prefer Compose unless you need state.

```sh
cd infra/terraform
terraform init
terraform plan -var-file=terraform.tfvars
```

Copy `terraform.tfvars.example` and replace every value. Commit `infra/terraform/.terraform.lock.hcl` with the checkout. Do not commit `terraform.tfvars` or the state file. State contains the database password and `APP_SECRET`.

## Known limits to say out loud

- Protobuf ingestion is not accepted.
- The ingest key is per website, not per team.
- Hourly API metrics are not on a 90-day partition schedule. Aggregates are retained at least 24 months by the prune script, which you have to schedule.
- Password reset does not send email.
- `window.umami` and `data-umami-event` are still the tracker names.
- `/api/send` does not require the pinned-path nonce.
- There is no third-party reproducible-build audit. The tracker hash check is in `docs/tracker.md`.
