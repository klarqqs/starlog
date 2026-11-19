# Stellog

The canonical repository is https://github.com/klarqqs/stellog.

Analytics for Stellar projects. This repository is [Umami](https://github.com/umami-software/umami) 3.5.0 (commit `b18d514`) with a Stellog landing page and three additions: password reset, Freighter and xBull sign-in, and a separate SCF operator door.

The app, its API routes, and the landing pages are one project.

## Run

```bash
cp .env.example .env
pnpm install
pnpm dev
```

Open http://127.0.0.1:3000. Sign in at `/login`. SCF operators use `/operator/login`.

The seeded admin is `admin` / `umami`. The first sign-in asks for a new password.

Set `DATABASE_URL` and `APP_SECRET` in `.env`. Apply the database with `pnpm exec prisma migrate deploy`. For wallet sign-in, set `STELLAR_AUTH_SECRET` to a Stellar secret key. Without it, development uses a temporary key and password-reset links are printed by the server.

## Layout

- `src/app` — Umami’s screens, plus Stellog sign-in, reset, and wallets
- `src/app/api` — the API
- `marketing` — landing, docs, pricing, privacy
- `prisma` — Umami’s schema, plus reset links and linked wallets

MIT licensed. Umami © Umami Software, Inc.
