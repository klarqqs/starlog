# Tenant onboarding

A project is a team when the website belongs to one, and the website itself when it does not. A website is the property that receives traffic. This build does not yet have a separate `kind` of `web` or `api`. An API property is still a website, and creating one requires a domain because the Umami website form requires one.

## Operator, before the first tenant

1. Open `/admin/projects` as an admin.
2. Leave enrollment on `open`, or set it to `approval-required`.
3. In approval-required mode, a non-admin team or website is created as `pending`. An admin's own creates stay `active`. A website added to a pending team stays pending.
4. Approve with the button on that page, or `POST /api/admin/projects/<team|website>/<id>/approve`.

Pending properties still record collection. They are left out of the operator ranking until approved.

## Account

Tenants register with an email address and a password. The email is stored in Umami's username column. The login form is an email field. The login API body is still `{ "username", "password" }`.

Wallet sign-in does not create an account. After email sign-in, the tenant links Freighter or xBull from settings. `GET /api/auth/wallet/config` reports `enabled: false` until `STELLAR_AUTH_SECRET` is set on the server. An unlinked wallet cannot sign in.

Password reset does not send mail. The link is printed in the server log. See `docs/runbooks.md`.

## Website

The tenant creates a website and copies the tracking snippet from its settings page. The snippet loads `/s/1.js` from this install, with `integrity` and `crossorigin="anonymous"`. It posts to `/s/e`.

The snippet host is this install's origin. A tenant who was given a snippet for `https://old.example` keeps sending there until they paste the new snippet. See the domain section of `docs/handover.md`.

`/script.js` and `POST /api/send` still exist for an older snippet. New websites should use the pinned snippet. Details and the upgrade steps are in `docs/tracker.md`.

The tenant's website screens show that website only. They do not show another tenant's properties.

## API ingestion

Create a key from the website: `POST /api/websites/<websiteId>/ingest-keys` with `{ "name": "production" }`. The response includes an `stk_` token once. The database stores a hash.

Send it as `Authorization: Bearer stk_...` to:

- `POST /v1/metrics`
- `POST /v1/traces`
- `POST /v1/logs`

The body is OTLP JSON. Protobuf is rejected with 415. A body over 1 MB, or more than 5000 points, is rejected. If the payload names a `tenant.id` other than the website that owns the key, nothing is stored. The website id is public and is not the credential.

This key is per website. A team-scoped `api_ingest_key` is the accepted later design and is not what these routes issue.

The tenant API screen is `/websites/<websiteId>/api`. It shows request volume, routes, status codes, and p50/p95 for that website. p50 and p95 are histogram bucket ceilings. A value above 10 seconds is capped.

Revoke a key with `DELETE /api/websites/<websiteId>/ingest-keys/<keyId>`. Revoking does not delete metrics already stored.

## What the tenant cannot do

A tenant cannot list another team's websites, approve enrollment, create operator keys, or read `GET /api/operator/projects`. An operator key cannot do those mutations either.
