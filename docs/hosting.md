# Hosting a Stellog demo

This is a self-hosted Umami 3.5.0 fork on Postgres. Nothing in this document has been deployed for you. Two paths avoid Docker Desktop: a Linux VPS, and Fly.io's remote builders. Railway is the same Node process with its own Postgres.

Copy `deploy/env.example` to the server's env file. Do not commit that copy. Generate `APP_SECRET` with `openssl rand -base64 32`.

The app listens on port 3000. `GET /api/health` returns 200 `{"ok":true}` when Postgres answers.

## Linux VPS

Ubuntu, with Node 22, Postgres, and Caddy. Run as root except where `sudo -u stellog` is shown.

```sh
apt update
apt install -y postgresql postgresql-contrib caddy
curl -fsSL https://deb.nodesource.com/setup_22.x | bash -
apt install -y nodejs
corepack enable
corepack prepare pnpm@12.3.4 --activate
```

If `pnpm` exits with `MODULE_NOT_FOUND` for `pnpm.cjs`, install the pinned version directly:

```sh
npm install -g pnpm@12.3.4
```

```sh
sudo -u postgres psql -c "CREATE USER stellog WITH PASSWORD 'choose-a-password'"
sudo -u postgres psql -c "CREATE DATABASE stellog OWNER stellog"
useradd --system --create-home --home-dir /opt/stellog stellog || true
```

Put this repository at `/opt/stellog` and give the `stellog` user ownership of it. Then:

```sh
cd /opt/stellog
sudo -u stellog pnpm install --frozen-lockfile
sudo -u stellog env SKIP_BUILD_GEO=1 pnpm build
sudo -u stellog env DATABASE_URL='postgresql://stellog:choose-a-password@127.0.0.1:5432/stellog' \
  ./node_modules/.bin/prisma migrate deploy
install -m 600 /dev/null /etc/stellog.env
```

Fill `/etc/stellog.env` from `deploy/env.example`. `DATABASE_URL` must be the database you just created. `APP_URL` and `SITE_ADDRESS` must be the public hostname.

```sh
cp deploy/stellog.service /etc/systemd/system/stellog.service
cp deploy/stellog-backup.service /etc/systemd/system/stellog-backup.service
cp deploy/stellog-backup.timer /etc/systemd/system/stellog-backup.timer
systemctl daemon-reload
systemctl enable --now stellog
systemctl enable --now stellog-backup.timer
```

Caddy terminates HTTPS. Replace `demo.example.com` in `deploy/Caddyfile` with the public hostname, then reload:

```sh
cp deploy/Caddyfile /etc/caddy/Caddyfile
systemctl reload caddy
curl -fsS https://demo.example.com/api/health
```

Seed the demo after the service is up. Credentials are written to `/opt/stellog/.env.demo` and are not printed.

```sh
cd /opt/stellog
sudo -u stellog env \
  DATABASE_URL='postgresql://stellog:choose-a-password@127.0.0.1:5432/stellog' \
  DEMO_BASE_URL='https://demo.example.com' \
  ./scripts/reset-demo.sh
```

Reset the synthetic data the same way. `scripts/reset-demo.sh` runs `scripts/seed-demo.ts --reset`. It deletes teams whose names start with `Demo ` and the `demo-tenant`, `demo-other`, `demo-holder`, and `demo-operator` users, then creates them again. It changes the seeded admin password only while that password is still the default.

The backup timer runs `scripts/backup-vps.sh` daily. Dumps go to `BACKUP_DIR` (default `/var/backups/stellog`) and files older than 14 days are deleted. Run it once by hand to confirm `pg_dump` works:

```sh
sudo -u stellog env \
  DATABASE_URL='postgresql://stellog:choose-a-password@127.0.0.1:5432/stellog' \
  BACKUP_DIR=/var/backups/stellog \
  ./scripts/backup-vps.sh
```

## Fly.io, without Docker Desktop

`deploy/fly.toml` builds the repo `Dockerfile` and checks `/api/health`. Fly's remote builder does the image build.

```sh
fly auth login
fly apps create stellog-demo
fly postgres create --name stellog-demo-db
fly postgres attach stellog-demo-db --app stellog-demo
fly secrets set APP_SECRET="$(openssl rand -base64 32)" APP_URL='https://stellog-demo.fly.dev' --app stellog-demo
fly deploy --remote-only --build-arg SKIP_BUILD_GEO=1
fly ssh console -C "node node_modules/prisma/build/index.js migrate deploy"
```

The migrate command runs inside the machine, which has `DATABASE_URL` from the attached database. Seed from your laptop only if the app is reachable and `DATABASE_URL` points at that database through `fly proxy`. A simpler reset, once a shell on the machine can reach Postgres, is:

```sh
fly ssh console -C "./scripts/reset-demo.sh"
```

That shell must have `DATABASE_URL` and `DEMO_BASE_URL`. Set `DEMO_BASE_URL` to the public `https://` origin. Read `.env.demo` on the machine after it finishes. Do not copy it into git.

## Railway

Create a project with the Node service and a Postgres plugin. Railway injects `DATABASE_URL`. Set the other variables from `deploy/env.example` in the service variables, not in the repo. Set the start command to:

```sh
node node_modules/next/dist/bin/next start -H 0.0.0.0 -p $PORT
```

Set the build command to:

```sh
SKIP_BUILD_GEO=1 pnpm install --frozen-lockfile && SKIP_BUILD_GEO=1 pnpm build && ./node_modules/.bin/prisma migrate deploy
```

Use the health check path `/api/health`. After the deploy is up, run `scripts/seed-demo.ts --reset` from `railway ssh` or a one-off shell with the same `DATABASE_URL` and `DEMO_BASE_URL` set to the public origin.

## What stays off the host

Do not ship a GeoLite2 database. `SKIP_BUILD_GEO=1` is the build used above. City and region are empty when that database is absent.
