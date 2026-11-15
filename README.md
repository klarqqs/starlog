# Starlog

Open-source, privacy-first, multi-tenant web and API analytics for Stellar projects.
Built for the SCF #46 RFP. MIT licensed.

## Layout
- `infra/compose` Docker Compose: Postgres 16 + Umami baseline
- `infra/db/migrations` Schema and row-level security (RLS)
- `infra/db/tests` Tenant-isolation tests
- `web`, `collector`, `api` Added in later steps
- `docs` Privacy, security and handover docs

## Quick start (step 1)
```bash
cp .env.example .env      # set every CHANGE-ME value
make up                   # Postgres on 127.0.0.1:5432, Umami on 127.0.0.1:3000
```
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
make test-api             # 13 integration tests on a throwaway Postgres
```
Endpoints: `POST /auth/register|login|logout`, `GET /auth/verify`, `GET /me`,
`GET|POST /tenant/sites`, `PATCH /tenant/share`, `GET /tenant/web/summary`,
`GET /operator/tenants`, `POST /operator/tenants/:id/remove`, `GET /share/:slug`.
Passwords use argon2id. Sessions are opaque, hashed in the database, in HttpOnly SameSite=Strict cookies.
Create the first operator with `api/scripts/create-operator.js`.
Dev emails print to the console. Replace the mailer with SMTP before production.

## Known limits to address next
- The SECURITY DEFINER functions rely on the table owner bypassing RLS (a superuser owner does). Use a dedicated owner role with BYPASSRLS if you change this.
- Register returns 409 for a known email, which reveals that it is registered. Consider a neutral response later.
- Umami keeps its own database and users. Linking its sites to Starlog tenants is step 3.
- Connection pooling must use transaction mode so `set_config(..., true)` cannot leak across requests.
- Not yet run under Docker. Compose file is unverified, so run `make up` and report errors.
