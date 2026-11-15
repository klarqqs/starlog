# Onboarding SCF projects and proving adoption

The RFP asks for at least three SCF-awarded projects on web analytics and one on API analytics, plus a
tenant walkthrough and the operator view. This is the checklist. The tooling is tested; the real projects and
numbers have to come from the projects themselves.

## Before you start
- Service running with real email: set `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASSWORD`, `MAIL_FROM` in `.env`,
  and `NODE_ENV=production` plus `PUBLIC_URL=https://your-host`. In production the API refuses to start without SMTP.
- Serve it over HTTPS (a reverse proxy such as Caddy or nginx), set `TRUST_PROXY=1` behind it, and `ALLOWED_ORIGIN` to your public URL.
- Wallet sign-in: run `make wallet-key` and put `STELLAR_AUTH_SECRET` in `.env`. Without it, wallet sign-in is off in production.
- Create the first operator: `make operator EMAIL=you@example.org PASSWORD='12+ characters'`. Add the rest of the SCF team from the operator page (they get an email invite).

## For each web project (need 3)
1. The project registers at `/login?mode=register` and verifies the email (use "Resend verification email" if needed).
2. They add their production domain in the dashboard and paste the snippet from `/docs#web` into their site `<head>`.
3. They press "Send a test visit", then load their real site once from a normal browser.
4. Check the dashboard shows the visit. Real traffic only: do not generate fake visits for the proof.

## For each API project (need 1, Obba AI can be it)
1. Add the API domain (kind: API) and create an ingest token. Store it as a server secret.
2. Send request metrics from the API server as shown in `/docs#metrics`. Batches of up to 50 points.
3. Check the routes table: paths should show as `/accounts/:id/...`, with request counts, error rate, p50 and p95.

## Capture the proof
- Run `node api/scripts/adoption-report.js https://your-host op@email 'password' 30 --csv` for a dated list of projects
  with measured page views, visitors and API requests. Save the output with the date.
- Record the walkthrough (2 to 3 minutes): register, add domain, snippet, a live visit appearing, API routes with p50/p95,
  then sign out and open `/operator/login` to show the all-projects table with filter and sort.
- Use only numbers you can reproduce from the report. Say how long each project has been live.

## Tests
- `make test-db` isolation tests, `make test-api` API tests, `make e2e` full run over real HTTP. Needs local Postgres binaries.
