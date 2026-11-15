# Stellog

Open-source, privacy-first, multi-tenant web and API analytics for Stellar projects.
Built for the SCF #46 RFP. MIT licensed.

## Layout
- `infra/compose` Docker Compose: Postgres 16 + Umami baseline
- `infra/db/migrations` Schema and row-level security (RLS)
- `infra/db/tests` Tenant-isolation tests
- `web`, `collector`, `api` Landing page and dashboards, tracker, and the API that serves them
- `docs` Privacy, security and handover docs

## Quick start (step 1)
```bash
cp .env.example .env      # set every CHANGE-ME value
make up                   # Postgres :5432, Umami :3000, Stellog app :4000 (all on 127.0.0.1)
make operator EMAIL=you@example.org PASSWORD='at-least-12-chars'
```
Open http://127.0.0.1:4000 for the Stellog landing page. Project sign-in is `/login`, SCF operator sign-in is `/operator/login`.
Umami on :3000 is only the baseline engine; it is not the product front door. In development, verification links print in `make logs`.
Umami's default first login is `admin` / `umami`. Change it immediately.
Pin `UMAMI_IMAGE` to an exact version or digest before any real deployment.

## Tenant isolation (step 2)
```bash
make test-db              # needs local Postgres binaries, not Docker
```
Three login roles, none able to bypass RLS:
| Role | Can do |
|---|---|
| `starlog_tenant` | Read its own rows only; manage own sites; toggle sharing |
| `starlog_operator` | Read all rows (no password hashes); remove tenants; manage operator keys |
| `starlog_ingest` | Write rollups for the one tenant resolved from its token |

The API must run each request in a transaction and set the tenant first:
```sql
BEGIN;
SELECT set_config('app.tenant_id', '<tenant uuid>', true);
-- queries as starlog_tenant
COMMIT;
```
If it is unset, every tenant query returns zero rows (fails closed).

## Auth API (step 2b)
```bash
cd api && npm ci
make test-api             # 24 tests on a throwaway Postgres
make e2e                  # full run over real HTTP: register, verify, tracker, metrics, operator view
```
Endpoints: `POST /auth/register|login|logout|forgot|reset|wallet`, `GET /auth/verify`, `GET /me`,
`GET|POST /tenant/sites`, `PATCH /tenant/share`, `GET /tenant/web/summary`,
`GET /operator/tenants`, `POST /operator/tenants/:id/remove`, `GET /share/:slug`.
Onboarding real projects and proving adoption: see `docs/onboarding.md`. Passwords use argon2id. Sessions are opaque, hashed in the database, in HttpOnly SameSite=Strict cookies.
Create the first operator with `api/scripts/create-operator.js`.
Verification email goes out over SMTP when `SMTP_HOST` is set. With it unset, links print in the log (development only), and `NODE_ENV=production` refuses to start without SMTP. `POST /auth/resend` sends a new link.

## Known limits to address next
- The SECURITY DEFINER functions rely on the table owner bypassing RLS (a superuser owner does). Use a dedicated owner role with BYPASSRLS if you change this.
- Register returns 409 for a known email, which reveals that it is registered. Consider a neutral response later.
- Umami keeps its own database and users. Linking its sites to Stellog tenants is step 3.
- Connection pooling must use transaction mode so `set_config(..., true)` cannot leak across requests.
- Not yet run under Docker. The Compose file is unverified, so run `make up` and report errors. Everything else is tested on real Postgres.
