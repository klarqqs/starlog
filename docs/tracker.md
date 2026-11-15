# Tracker

The tenant snippet loads a versioned file built from this repository. Version 1 is `public/s/1.js`. Its sha384 hash is `src/stellog/tracker-pin.json`, and the snippet sets `integrity` and `crossorigin="anonymous"`.

`/script.js` remains the legacy Umami file. It still posts to `/api/send` and does not require a nonce. New websites get the pinned snippet. The dashboard's own pageview tag still uses the legacy file.

## Paths

The default script path is `s/1.js`. The default collect path is `/s/e`. Neither default contains `script.js`, `/api/send`, or `umami`.

`TRACKER_SCRIPT_NAME` can add another filename. The server rewrites that name to `/s/1.js`, so the bytes and the SRI hash stay the same. An `https://` value is ignored. The snippet keeps the hash of the file in this build.

`COLLECT_API_ENDPOINT` is baked into the file by `pnpm build:tracker:pin`. Changing it changes the bytes, so it needs a new tracker version and a new hash. A runtime rewrite sends that path to `/s/e`. A tracker built earlier still posts to the path it was built with. `/api/send` is not the rewrite target, so the nonce check is not skipped.

`scripts/update-tracker.js` rewrites only `public/script.js`. It refuses to rewrite `public/s`.

## What the pinned collect path checks

`GET /s/e?id=<website id>` returns a nonce. `POST /s/e` then checks, in order:

1. The payload has a website id, and that website exists. A link or pixel payload is rejected.
2. The IP is under the event budget. The address is hashed with the app secret and kept in process memory. It is not written to Postgres. The budget is 60 POST attempts per 60 seconds, including attempts that fail the later checks. Both numbers are Stellog choices. The map clears on process restart and is not shared across instances.
3. The user agent is not a bot, unless `DISABLE_BOT_CHECK` is set. A bot gets `{ "beep": "boop" }` and is not stored.
4. The nonce is a valid HMAC for that website and for the current or previous 5-minute window. Five minutes is a Stellog choice. There is no nonce table.
5. `Origin` or `Referer` matches the website domain. The port is ignored and a leading `www.` is ignored. If the website has no domain, this check is skipped. If it has a domain and both headers are missing, the request is rejected.

A passing request is handed to the existing `/api/send` handler. The extra `nonce` field is removed by that handler's schema. `x-stellog-cache` is copied to `x-umami-cache` before that hand-off.

The tracker requests a nonce only when it is built with the pinned flag. The legacy bundle does not.

## What stays on the old names

`window.umami` and `data-umami-event` are unchanged, because the tracker tests and the public `umami.track` API use them. The pinned file sends `x-stellog-cache` and `x-umami-website-id`. Those names can still be filtered.

`/api/send` does not require a nonce. An existing legacy snippet keeps working.

The admin update notice reads `https://api.umami.is/v1/updates`. The production telemetry pixel loads `https://i.umami.is/a.png` unless telemetry is disabled. Neither replaces the tracker file.

## Tenant upgrade

1. Bump `TRACKER_VERSION` in `src/stellog/tracker-pin.ts`, and the matching output in `rollup.tracker.pin.config.js` and `scripts/pin-tracker.js`.
2. If the collect path changes, set `COLLECT_API_ENDPOINT` for the build. The new file must post to a path that rewrites to `/s/e`.
3. Run `pnpm build:tracker:pin`. Commit `public/s/<version>.js` and `src/stellog/tracker-pin.json`.
4. Leave the previous file in `public/s`. An installed snippet keeps loading it until the tenant replaces the tag.
5. The tenant copies the new snippet from the website settings page. The old hash does not match the new file, which is why the tag has to change.

## Supply chain

The pinned file is an IIFE produced by Rollup from `src/tracker`. The tracker bundle does not install packages at runtime and does not fetch a newer copy of itself. `CLOUD_MODE` no longer rewrites `/script.js` to `https://cloud.umami.is/script.js`, and an absolute `TRACKER_SCRIPT_URL` is not used.

The hash in the manifest is the sha384 of the committed file. `pnpm-lock.yaml` pins the Rollup and TypeScript versions that produce it. This is not a third-party reproducible-build audit. A tenant can recompute the hash with `openssl dgst -sha384 -binary public/s/1.js | openssl base64 -A` and compare it with the snippet.
