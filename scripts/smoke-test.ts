/**
 * Re-runnable local smoke test.
 *
 * Reads SMOKE_BASE_URL, SMOKE_DATABASE_URL, SMOKE_ADMIN_USERNAME, and
 * SMOKE_ADMIN_PASSWORD from the environment. When SMOKE_CREDENTIALS_FILE is
 * set, those keys are loaded from that file first and the rotated admin
 * password is written back there. The file must stay gitignored. This script
 * does not contain a password.
 */
import { spawnSync } from 'node:child_process';
import { randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync } from 'node:fs';
import { TRACKER_INTEGRITY, trackerSrc, trackingSnippet } from '../src/stellog/tracker-pin';

type Verdict = 'PASS' | 'FAIL' | 'NOT RUN';
type Check = { name: string; result: Verdict; evidence: string };

const checks: Check[] = [];
const credentialsFile = process.env.SMOKE_CREDENTIALS_FILE;

loadCredentials(credentialsFile);

const base = (process.env.SMOKE_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const databaseUrl = process.env.SMOKE_DATABASE_URL || '';
const adminUser = process.env.SMOKE_ADMIN_USERNAME || 'admin';
const origin = new URL(base).origin;
const pageHost = new URL(base).host;

const account = `G${'A'.repeat(55)}`;
const uuid = '11111111-1111-4111-8111-111111111111';
const hash = 'ab'.repeat(32);
const bodyMarker = `SMOKE_BODY_${randomBytes(8).toString('hex')}`;

function loadCredentials(file: string | undefined) {
  if (!file) return;
  let text = '';
  try {
    text = readFileSync(file, 'utf8');
  } catch {
    return;
  }
  for (const line of text.split('\n')) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line.trim());
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2];
  }
}

function saveCredential(key: string, value: string) {
  if (!credentialsFile) return;
  const current = readFileSync(credentialsFile, 'utf8');
  const line = `${key}=${value}`;
  const next = new RegExp(`^${key}=.*$`, 'm').test(current)
    ? current.replace(new RegExp(`^${key}=.*$`, 'm'), line)
    : `${current.trimEnd()}\n${line}\n`;
  writeFileSync(credentialsFile, next.endsWith('\n') ? next : `${next}\n`, { mode: 0o600 });
  process.env[key] = value;
}

function record(name: string, result: Verdict, evidence: string) {
  checks.push({ name, result, evidence });
  console.log(`${result}\t${name}\t${evidence}`);
}

function pass(name: string, evidence: string) {
  record(name, 'PASS', evidence);
}

function fail(name: string, evidence: string) {
  record(name, 'FAIL', evidence);
}

function skip(name: string, evidence: string) {
  record(name, 'NOT RUN', evidence);
}

async function call(
  method: string,
  path: string,
  options: { token?: string; body?: unknown; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...(options.headers || {}) };
  if (options.body !== undefined && !headers['content-type'])
    headers['content-type'] = 'application/json';
  if (options.token) headers.authorization = `Bearer ${options.token}`;
  const response = await fetch(`${base}${path}`, {
    method,
    headers,
    body:
      options.body === undefined
        ? undefined
        : typeof options.body === 'string' || options.body instanceof Uint8Array
          ? options.body
          : JSON.stringify(options.body),
  });
  const text = await response.text();
  let json: any = null;
  try {
    json = text ? JSON.parse(text) : null;
  } catch {
    json = null;
  }
  console.log(`${method} ${path} ${response.status}`);
  return { status: response.status, json, text };
}

function sql(query: string) {
  if (!databaseUrl) throw new Error('SMOKE_DATABASE_URL is not set');
  const result = spawnSync(
    'psql',
    [databaseUrl, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', query],
    {
      encoding: 'utf8',
    },
  );
  if (result.status !== 0) throw new Error(result.stderr || result.stdout);
  return result.stdout.trim();
}

function rawCount(websiteId: string) {
  return Number(sql(`SELECT count(*) FROM api_metric_raw WHERE website_id = '${websiteId}'`));
}

function createdId(body: any) {
  if (body?.id) return body.id as string;
  if (Array.isArray(body) && body[0]?.id) return body[0].id as string;
  return null;
}

function password() {
  return randomBytes(18).toString('base64url');
}

async function login(username: string, secret: string) {
  const response = await call('POST', '/api/auth/login', { body: { username, password: secret } });
  if (response.status !== 200 || !response.json?.token) return null;
  return response.json as {
    token: string;
    user: { id: string; passwordChangeRequired?: boolean };
  };
}

function span(route: string, status: number, latencyMs: number, nowMs: number) {
  const end = BigInt(nowMs) * 1_000_000n;
  const start = end - BigInt(latencyMs) * 1_000_000n;
  return {
    startTimeUnixNano: start.toString(),
    endTimeUnixNano: end.toString(),
    name: bodyMarker,
    attributes: [
      { key: 'http.route', value: { stringValue: route } },
      { key: 'http.response.status_code', value: { intValue: status } },
      { key: 'smoke.body', value: { stringValue: bodyMarker } },
    ],
  };
}

function tracePayload(websiteId: string, serviceName: string, spans: unknown[]) {
  return {
    resourceSpans: [
      {
        resource: {
          attributes: [
            { key: 'service.name', value: { stringValue: serviceName } },
            { key: 'tenant.id', value: { stringValue: websiteId } },
          ],
        },
        scopeSpans: [{ spans }],
      },
    ],
  };
}

async function main() {
  console.log(`base ${base}`);
  console.log(
    `database ${databaseUrl ? new URL(databaseUrl).host + new URL(databaseUrl).pathname : 'unset'}`,
  );
  if (!process.env.SMOKE_ADMIN_PASSWORD) {
    fail('admin sign-in', 'SMOKE_ADMIN_PASSWORD is not set');
    return;
  }

  const first = await login(adminUser, process.env.SMOKE_ADMIN_PASSWORD);
  if (!first) {
    fail('admin sign-in', 'login did not return a token');
    return;
  }
  pass('admin sign-in', 'POST /api/auth/login 200');
  let adminToken = first.token;

  if (first.user.passwordChangeRequired) {
    const nextPassword = password();
    const changed = await call('POST', '/api/me/password', {
      token: adminToken,
      body: { currentPassword: process.env.SMOKE_ADMIN_PASSWORD, newPassword: nextPassword },
    });
    if (changed.status !== 200 || !changed.json?.token) {
      fail('admin password change', `POST /api/me/password ${changed.status}`);
      return;
    }
    saveCredential('SMOKE_ADMIN_PASSWORD', nextPassword);
    adminToken = changed.json.token;
    const again = await login(adminUser, nextPassword);
    if (!again || again.user.passwordChangeRequired) {
      fail('admin password change', 'new password did not sign in');
      return;
    }
    adminToken = again.token;
    pass('admin password change', 'POST /api/me/password 200; new password stored outside git');
  } else {
    pass('admin password change', 'already rotated; current password signed in');
  }

  const stamp = Date.now();
  const userAPassword = password();
  const userBPassword = password();
  const pendingPassword = password();
  const emailA = `smoke-a-${stamp}@example.test`;
  const emailB = `smoke-b-${stamp}@example.test`;
  const emailPending = `smoke-pending-${stamp}@example.test`;
  saveCredential('SMOKE_USER_A_EMAIL', emailA);
  saveCredential('SMOKE_USER_A_PASSWORD', userAPassword);
  saveCredential('SMOKE_USER_B_EMAIL', emailB);
  saveCredential('SMOKE_USER_B_PASSWORD', userBPassword);

  const registeredA = await call('POST', '/api/auth/register', {
    body: { username: emailA, password: userAPassword },
  });
  const registeredB = await call('POST', '/api/auth/register', {
    body: { username: emailB, password: userBPassword },
  });
  if (registeredA.status !== 200 || registeredB.status !== 200) {
    fail('register tenants', `A ${registeredA.status} B ${registeredB.status}`);
    return;
  }
  const sessionA = await login(emailA, userAPassword);
  const sessionB = await login(emailB, userBPassword);
  if (!sessionA || !sessionB) {
    fail('register tenants', 'login after register failed');
    return;
  }
  pass('register tenants', 'POST /api/auth/register 200 for two users');

  const teamA = await call('POST', '/api/teams', {
    token: sessionA.token,
    body: { name: 'smoke-tenant-a' },
  });
  const teamB = await call('POST', '/api/teams', {
    token: sessionB.token,
    body: { name: 'smoke-tenant-b' },
  });
  const teamAId = createdId(teamA.json);
  const teamBId = createdId(teamB.json);
  if (teamA.status !== 200 || teamB.status !== 200 || !teamAId || !teamBId) {
    fail('create teams', `A ${teamA.status} B ${teamB.status}`);
    return;
  }
  pass('create teams', 'POST /api/teams 200 for both tenants');

  const webDomain = pageHost;
  const webA = await call('POST', '/api/websites', {
    token: sessionA.token,
    body: { name: 'smoke-web-a', domain: webDomain, teamId: teamAId },
  });
  const apiA = await call('POST', '/api/websites', {
    token: sessionA.token,
    body: { name: 'smoke-api-a', domain: 'smoke-api-a.example', teamId: teamAId },
  });
  const webB = await call('POST', '/api/websites', {
    token: sessionB.token,
    body: { name: 'smoke-web-b', domain: 'smoke-web-b.example', teamId: teamBId },
  });
  const apiB = await call('POST', '/api/websites', {
    token: sessionB.token,
    body: { name: 'smoke-api-b', domain: 'smoke-api-b.example', teamId: teamBId },
  });
  const websites = [webA, apiA, webB, apiB];
  if (websites.some(item => item.status !== 200 || !item.json?.id)) {
    fail(
      'create websites',
      websites
        .map(item => `${item.status} ${JSON.stringify(item.json)?.slice(0, 160)}`)
        .join(' | '),
    );
    return;
  }
  pass('create websites', `web domain ${webDomain}; POST /api/websites 200 x4`);
  const webAId = webA.json.id as string;
  const apiAId = apiA.json.id as string;
  const apiBId = apiB.json.id as string;

  const keyA = await call('POST', `/api/websites/${apiAId}/ingest-keys`, {
    token: sessionA.token,
    body: { name: 'smoke' },
  });
  const keyB = await call('POST', `/api/websites/${apiBId}/ingest-keys`, {
    token: sessionB.token,
    body: { name: 'smoke' },
  });
  if (keyA.status !== 200 || !String(keyA.json?.token || '').startsWith('stk_')) {
    fail('create ingest key', `POST ingest-keys ${keyA.status}`);
    return;
  }
  if (keyB.status !== 200 || !keyB.json?.token) {
    fail('create tenant B ingest key', `POST ingest-keys ${keyB.status}`);
    return;
  }
  pass(
    'create ingest key',
    `POST /api/websites/${apiAId}/ingest-keys 200 prefix ${keyA.json.prefix}`,
  );
  const tokenA = keyA.json.token as string;
  const tokenB = keyB.json.token as string;

  const now = Date.now();
  const routes = [
    { path: '/payments/42', status: 200, ms: 8, expect: '/payments/{id}' },
    { path: `/orders/${uuid}`, status: 200, ms: 40, expect: '/orders/{uuid}' },
    { path: `/accounts/${account}`, status: 500, ms: 80, expect: '/accounts/{account}' },
    { path: `/tx/${hash}`, status: 200, ms: 200, expect: '/tx/{hash}' },
    { path: '/health/', status: 500, ms: 400, expect: '/health' },
  ];
  const traces = await call('POST', '/v1/traces', {
    token: tokenA,
    body: tracePayload(
      apiAId,
      'smoke-api-a',
      routes.map(route => span(route.path, route.status, route.ms, now)),
    ),
  });
  const metrics = await call('POST', '/v1/metrics', {
    token: tokenA,
    body: {
      resourceMetrics: [
        {
          resource: {
            attributes: [
              { key: 'service.name', value: { stringValue: 'smoke-api-a' } },
              { key: 'tenant.id', value: { stringValue: apiAId } },
            ],
          },
          scopeMetrics: [
            {
              metrics: [
                {
                  name: 'http.server.requests',
                  sum: {
                    aggregationTemporality: 2,
                    dataPoints: [
                      {
                        attributes: [
                          { key: 'http.route', value: { stringValue: '/ready' } },
                          { key: 'http.response.status_code', value: { intValue: 200 } },
                        ],
                        timeUnixNano: String(BigInt(now) * 1_000_000n),
                        asInt: '1',
                      },
                    ],
                  },
                },
              ],
            },
          ],
        },
      ],
    },
  });
  const stored = sql(
    `SELECT route || ' ' || status_code || ' ' || coalesce(latency_ms::text, 'null')
     FROM api_metric_raw WHERE website_id = '${apiAId}' ORDER BY route, status_code`,
  );
  const expectedRoutes = [...routes.map(route => route.expect), '/ready'].sort();
  const gotRoutes = stored
    .split('\n')
    .filter(Boolean)
    .map(line => line.split(' ')[0])
    .sort();
  if (
    traces.status === 200 &&
    metrics.status === 200 &&
    expectedRoutes.join() === gotRoutes.join()
  ) {
    pass(
      'OTLP traces and metrics',
      `traces 200 metrics 200 rows: ${stored.replaceAll('\n', '; ')}`,
    );
  } else {
    fail(
      'OTLP traces and metrics',
      `traces ${traces.status} metrics ${metrics.status} rows: ${stored}`,
    );
  }

  const beforeNegative = rawCount(apiAId);
  const missing = await call('POST', '/v1/traces', {
    body: tracePayload(apiAId, 'smoke-api-a', [span('/missing', 200, 5, now)]),
  });
  const bogus = await call('POST', '/v1/traces', {
    token: 'stk_not-a-real-key',
    body: tracePayload(apiAId, 'smoke-api-a', [span('/missing', 200, 5, now)]),
  });
  const foreign = await call('POST', '/v1/traces', {
    token: tokenA,
    body: tracePayload(apiBId, 'smoke-api-b', [span('/foreign', 200, 5, now)]),
  });
  const revoked = await call('DELETE', `/api/websites/${apiAId}/ingest-keys/${keyA.json.id}`, {
    token: sessionA.token,
  });
  const afterRevoke = await call('POST', '/v1/traces', {
    token: tokenA,
    body: tracePayload(apiAId, 'smoke-api-a', [span('/revoked', 200, 5, now)]),
  });
  const afterNegative = rawCount(apiAId);
  const negativeOk =
    missing.status === 401 &&
    bogus.status === 401 &&
    foreign.status === 403 &&
    revoked.status === 200 &&
    afterRevoke.status === 401 &&
    afterNegative === beforeNegative;
  if (negativeOk) {
    pass(
      'rejected keys and foreign tenant',
      `missing ${missing.status} unknown ${bogus.status} foreign ${foreign.status} revoke ${revoked.status} revoked ${afterRevoke.status} rows stayed ${afterNegative}`,
    );
  } else {
    fail(
      'rejected keys and foreign tenant',
      `missing ${missing.status} unknown ${bogus.status} foreign ${foreign.status} revoke ${revoked.status} revoked ${afterRevoke.status} rows ${beforeNegative}->${afterNegative}`,
    );
  }

  const freshKey = await call('POST', `/api/websites/${apiAId}/ingest-keys`, {
    token: sessionA.token,
    body: { name: 'smoke-2' },
  });
  if (freshKey.status !== 200 || !freshKey.json?.token) {
    fail('protobuf', 'could not create a replacement key');
  } else {
    const beforeProto = rawCount(apiAId);
    let protoStatus = 0;
    try {
      const { ProtobufTraceSerializer } = await import('@opentelemetry/otlp-transformer');
      const time: [number, number] = [Math.floor(now / 1000), 0];
      const encoded = ProtobufTraceSerializer.serializeRequest([
        {
          name: bodyMarker,
          kind: 1,
          startTime: time,
          endTime: [time[0], 12_000_000],
          attributes: { 'http.route': '/proto/7', 'http.response.status_code': 200 },
          droppedAttributesCount: 0,
          events: [],
          droppedEventsCount: 0,
          links: [],
          droppedLinksCount: 0,
          status: { code: 0 },
          resource: { attributes: { 'service.name': 'smoke-api-a', 'tenant.id': apiAId } },
          instrumentationScope: { name: 'stellog-smoke', version: '1' },
          spanContext: () => ({ traceId: 'ab'.repeat(16), spanId: 'cd'.repeat(8), traceFlags: 1 }),
        },
      ] as never);
      const posted = await call('POST', '/v1/traces', {
        token: freshKey.json.token,
        body: encoded,
        headers: { 'content-type': 'application/x-protobuf' },
      });
      protoStatus = posted.status;
    } catch (error) {
      fail('protobuf', error instanceof Error ? error.message : 'serializer failed');
    }
    const protoRows = rawCount(apiAId) - beforeProto;
    if (protoStatus === 415) {
      pass('protobuf', 'POST /v1/traces application/x-protobuf 415; protobuf is not accepted');
    } else if (protoStatus === 200 && protoRows > 0) {
      pass('protobuf', `POST /v1/traces application/x-protobuf 200; stored ${protoRows}; not 415`);
    } else if (protoStatus) {
      fail(
        'protobuf',
        `POST /v1/traces application/x-protobuf ${protoStatus}; new rows ${protoRows}`,
      );
    }
  }

  const logKey = freshKey.status === 200 ? (freshKey.json.token as string) : '';
  if (!logKey) {
    skip('trace and log bodies not stored', 'no live key');
  } else {
    const beforeLogs = rawCount(apiAId);
    const logs = await call('POST', '/v1/logs', {
      token: logKey,
      body: {
        resourceLogs: [
          {
            resource: {
              attributes: [
                { key: 'service.name', value: { stringValue: 'smoke-api-a' } },
                { key: 'tenant.id', value: { stringValue: apiAId } },
              ],
            },
            scopeLogs: [
              {
                logRecords: [
                  {
                    body: { stringValue: bodyMarker },
                    timeUnixNano: String(BigInt(now) * 1_000_000n),
                  },
                ],
              },
            ],
          },
        ],
      },
    });
    const found = markerHits(bodyMarker);
    const logRows = rawCount(apiAId) - beforeLogs;
    if (logs.status === 200 && logRows === 0 && found === '') {
      pass(
        'trace and log bodies not stored',
        'POST /v1/logs 200; raw rows unchanged; marker absent from text columns',
      );
    } else {
      fail(
        'trace and log bodies not stored',
        `logs ${logs.status} new rows ${logRows} hits ${found || 'none'}`,
      );
    }
  }

  const range = (ms: number) => `startAt=${now - ms}&endAt=${now + 60_000}`;
  const hourView = await call(
    'GET',
    `/api/websites/${apiAId}/api-metrics?${range(24 * 60 * 60 * 1000)}`,
    {
      token: sessionA.token,
    },
  );
  const dayView = await call(
    'GET',
    `/api/websites/${apiAId}/api-metrics?${range(7 * 24 * 60 * 60 * 1000)}&unit=day`,
    { token: sessionA.token },
  );
  const hourRoutes = (hourView.json?.routes || [])
    .map((row: { route: string }) => row.route)
    .sort();
  const dayRoutes = (dayView.json?.routes || []).map((row: { route: string }) => row.route).sort();
  const statuses = (hourView.json?.statuses || [])
    .map((row: { statusCode: number; requests: number }) => `${row.statusCode}:${row.requests}`)
    .sort()
    .join(',');
  const metricsOk =
    hourView.status === 200 &&
    dayView.status === 200 &&
    hourView.json?.unit === 'hour' &&
    dayView.json?.unit === 'day' &&
    hourView.json?.requests >= 6 &&
    dayView.json?.requests === hourView.json?.requests &&
    hourView.json?.p50 === (hourRoutes.includes('/proto/{id}') ? 50 : 100) &&
    hourView.json?.p95 === 500 &&
    statuses.includes('200:') &&
    statuses.includes('500:') &&
    expectedRoutes.every(route => hourRoutes.includes(route) && dayRoutes.includes(route));
  if (metricsOk) {
    pass(
      'tenant API hour and day',
      `24h unit ${hourView.json.unit} requests ${hourView.json.requests} p50 ${hourView.json.p50} p95 ${hourView.json.p95} statuses ${statuses}; 7d unit ${dayView.json.unit} requests ${dayView.json.requests}`,
    );
  } else {
    fail(
      'tenant API hour and day',
      `hour ${hourView.status} ${JSON.stringify(hourView.json)?.slice(0, 400)} day ${dayView.status} ${JSON.stringify(dayView.json)?.slice(0, 240)}`,
    );
  }

  const pageApi = await call('GET', `/api/websites/${webAId}`, { token: sessionB.token });
  const apiMetrics = await call(
    'GET',
    `/api/websites/${apiAId}/api-metrics?${range(24 * 60 * 60 * 1000)}`,
    {
      token: sessionB.token,
    },
  );
  const pageHtml = await call('GET', `/websites/${webAId}/api`, { token: sessionB.token });
  const beforeCross = rawCount(apiAId);
  const crossWrite = await call('POST', '/v1/traces', {
    token: tokenB,
    body: tracePayload(apiAId, 'smoke-api-a', [span('/from-b', 200, 5, now)]),
  });
  const crossRows = rawCount(apiAId) - beforeCross;
  if (
    pageApi.status === 401 &&
    apiMetrics.status === 401 &&
    crossWrite.status === 403 &&
    crossRows === 0
  ) {
    pass(
      'tenant isolation',
      `GET website ${pageApi.status} GET api-metrics ${apiMetrics.status} GET page ${pageHtml.status} B key write ${crossWrite.status} rows +${crossRows}`,
    );
  } else {
    fail(
      'tenant isolation',
      `GET website ${pageApi.status} GET api-metrics ${apiMetrics.status} GET page ${pageHtml.status} B key write ${crossWrite.status} rows +${crossRows}`,
    );
  }

  const snippet = trackingSnippet(trackerSrc(origin, '', null), TRACKER_INTEGRITY, webAId);
  const digest = spawnSync('openssl', ['dgst', '-sha384', '-binary', 'public/s/1.js'], {
    encoding: 'buffer',
  });
  const b64 = spawnSync('openssl', ['base64', '-A'], { input: digest.stdout, encoding: 'utf8' });
  const sri = `sha384-${b64.stdout.trim()}`;
  const harness = await call('GET', `/smoke-harness?website=${webAId}`);
  const scriptFile = await call('GET', '/s/1.js');
  if (
    harness.status === 200 &&
    harness.text.includes(snippet) &&
    scriptFile.status === 200 &&
    sri === TRACKER_INTEGRITY &&
    snippet.includes('integrity="') &&
    snippet.includes('crossorigin="anonymous"')
  ) {
    pass('tracker snippet and SRI', `GET /smoke-harness 200 GET /s/1.js 200 openssl ${sri}`);
  } else {
    fail(
      'tracker snippet and SRI',
      `html ${harness.status} script ${scriptFile.status} openssl ${sri} pin ${TRACKER_INTEGRITY}`,
    );
  }

  const nonce = await call('GET', `/s/e?id=${webAId}`);
  const viewed = await call('POST', '/s/e', {
    headers: {
      'content-type': 'application/json',
      origin,
      'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0',
    },
    body: {
      type: 'event',
      payload: {
        website: webAId,
        nonce: nonce.json?.nonce,
        hostname: pageHost,
        url: '/pricing',
        title: 'Pricing',
      },
    },
  });
  const wrongOrigin = await call('POST', '/s/e', {
    headers: {
      'content-type': 'application/json',
      origin: 'https://evil.example',
      'user-agent': 'Mozilla/5.0 (Macintosh) Chrome/120.0.0.0',
    },
    body: {
      type: 'event',
      payload: {
        website: webAId,
        nonce: nonce.json?.nonce,
        hostname: 'evil.example',
        url: '/nope',
      },
    },
  });
  const secondNonce = await call('GET', `/s/e?id=${webAId}`);
  const beforeBot = Number(
    sql(`SELECT count(*) FROM website_event WHERE website_id = '${webAId}' AND url_path = '/bot'`),
  );
  const bot = await call('POST', '/s/e', {
    headers: {
      'content-type': 'application/json',
      origin,
      'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)',
    },
    body: {
      type: 'event',
      payload: { website: webAId, nonce: secondNonce.json?.nonce, hostname: pageHost, url: '/bot' },
    },
  });
  const botRows = Number(
    sql(`SELECT count(*) FROM website_event WHERE website_id = '${webAId}' AND url_path = '/bot'`),
  );
  const pageviews = Number(
    sql(
      `SELECT count(*) FROM website_event WHERE website_id = '${webAId}' AND url_path = '/pricing'`,
    ),
  );
  const stats = await call(
    'GET',
    `/api/websites/${webAId}/stats?startAt=${now - 60_000}&endAt=${now + 60_000}`,
    {
      token: sessionA.token,
    },
  );
  if (
    nonce.status === 200 &&
    viewed.status === 200 &&
    pageviews === 1 &&
    wrongOrigin.status === 403 &&
    bot.status === 200 &&
    bot.json?.beep === 'boop' &&
    botRows === beforeBot &&
    Number(stats.json?.pageviews) >= 1
  ) {
    pass(
      'page view, wrong origin, bot',
      `nonce ${nonce.status} view ${viewed.status} stats ${stats.status} pageviews ${stats.json?.pageviews} wrong origin ${wrongOrigin.status} bot ${bot.status} bot rows ${botRows}`,
    );
  } else {
    fail(
      'page view, wrong origin, bot',
      `nonce ${nonce.status} view ${viewed.status} ${viewed.text.slice(0, 180)} page rows ${pageviews} stats ${stats.status} ${JSON.stringify(stats.json)?.slice(0, 180)} wrong ${wrongOrigin.status} bot ${bot.status} ${bot.text.slice(0, 80)} bot rows ${botRows}`,
    );
  }

  const modeOn = await call('PUT', '/api/admin/enrollment', {
    token: adminToken,
    body: { mode: 'approval-required' },
  });
  const registeredPending = await call('POST', '/api/auth/register', {
    body: { username: emailPending, password: pendingPassword },
  });
  const pendingSession =
    registeredPending.status === 200 ? await login(emailPending, pendingPassword) : null;
  const pendingTeam = pendingSession
    ? await call('POST', '/api/teams', {
        token: pendingSession.token,
        body: { name: 'smoke-pending' },
      })
    : { status: 0, json: null, text: '' };
  const modeOff = await call('PUT', '/api/admin/enrollment', {
    token: adminToken,
    body: { mode: 'open' },
  });
  const projects = await call(
    'GET',
    `/api/admin/projects?startAt=${now - 86_400_000}&endAt=${now + 60_000}&status=active`,
    { token: adminToken },
  );
  const names = (projects.json?.projects || []).map((row: { name: string }) => row.name);
  const adminPage = await call('GET', '/admin/projects');
  const ranked =
    modeOn.status === 200 &&
    modeOn.json?.mode === 'approval-required' &&
    modeOff.status === 200 &&
    modeOff.json?.mode === 'open' &&
    pendingTeam.status === 200 &&
    names.includes('smoke-tenant-a') &&
    names.includes('smoke-tenant-b') &&
    !names.includes('smoke-pending');
  if (ranked) {
    pass(
      'operator ranking and enrollment',
      `PUT enrollment ${modeOn.status}/${modeOff.status} GET /admin/projects ${adminPage.status} GET /api/admin/projects ${projects.status} active names include both tenants and exclude smoke-pending`,
    );
  } else {
    fail(
      'operator ranking and enrollment',
      `mode ${modeOn.status} ${modeOn.json?.mode} off ${modeOff.status} ${modeOff.json?.mode} pending ${pendingTeam.status} projects ${projects.status} names ${names.join(',')}`,
    );
  }

  const operatorKey = await call('POST', '/api/admin/operator-keys', {
    token: adminToken,
    body: { name: 'smoke' },
  });
  if (operatorKey.status !== 200 || !String(operatorKey.json?.token || '').startsWith('opk_')) {
    fail('operator key', `POST /api/admin/operator-keys ${operatorKey.status}`);
  } else {
    const opToken = operatorKey.json.token as string;
    const allowed = await call(
      'GET',
      `/api/operator/projects?startAt=${now - 86_400_000}&endAt=${now + 60_000}`,
      { token: opToken },
    );
    const denied = await call('GET', '/api/websites', { token: opToken });
    const deniedAdmin = await call('GET', '/api/admin/enrollment', { token: opToken });
    const removed = await call('DELETE', `/api/admin/operator-keys/${operatorKey.json.id}`, {
      token: adminToken,
    });
    const after = await call(
      'GET',
      `/api/operator/projects?startAt=${now - 86_400_000}&endAt=${now + 60_000}`,
      { token: opToken },
    );
    if (
      allowed.status === 200 &&
      denied.status === 401 &&
      deniedAdmin.status === 401 &&
      removed.status === 200 &&
      after.status === 401
    ) {
      pass(
        'operator key scope and revoke',
        `projects ${allowed.status} websites ${denied.status} enrollment ${deniedAdmin.status} revoke ${removed.status} after ${after.status}`,
      );
    } else {
      fail(
        'operator key scope and revoke',
        `projects ${allowed.status} websites ${denied.status} enrollment ${deniedAdmin.status} revoke ${removed.status} after ${after.status}`,
      );
    }
  }

  if (!databaseUrl) {
    skip('load sanity', 'SMOKE_DATABASE_URL is not set');
  } else {
    const load = spawnSync('./node_modules/.bin/tsx', ['scripts/load-api-metrics.ts'], {
      encoding: 'utf8',
      env: { ...process.env, DATABASE_URL: databaseUrl },
    });
    const match = load.stdout.match(/\{[\s\S]*\}\s*$/);
    if (load.status !== 0 || !match) {
      fail('load sanity', `exit ${load.status} ${(load.stderr || load.stdout).slice(0, 300)}`);
    } else {
      const report = JSON.parse(match[0]);
      pass(
        'load sanity',
        `requests ${report.sustained?.requests} failed ${report.sustained?.failed} p50 ${report.sustained?.p50ms}ms p95 ${report.sustained?.p95ms}ms`,
      );
    }
  }
}

function markerHits(marker: string) {
  const safe = marker.replace(/[^A-Za-z0-9_]/g, '');
  const columns = sql(`
    SELECT c.relname || '|' || a.attname
    FROM pg_class c
    JOIN pg_namespace ns ON ns.oid = c.relnamespace
    JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum > 0 AND NOT a.attisdropped
    JOIN pg_type t ON t.oid = a.atttypid
    WHERE ns.nspname = 'public' AND c.relkind = 'r'
      AND t.typname IN ('text', 'varchar', 'json', 'jsonb')
  `);
  const hits: string[] = [];
  for (const line of columns.split('\n').filter(Boolean)) {
    const [table, column] = line.split('|');
    if (!/^[A-Za-z_][A-Za-z0-9_]*$/.test(table) || !/^[A-Za-z_][A-Za-z0-9_]*$/.test(column))
      continue;
    const count = Number(
      sql(`SELECT count(*) FROM public."${table}" WHERE "${column}"::text LIKE '%${safe}%'`),
    );
    if (count > 0) hits.push(`${table}.${column}`);
  }
  return hits.join(',');
}

main()
  .catch(error => {
    fail('smoke script', error instanceof Error ? error.message : String(error));
  })
  .finally(() => {
    const failed = checks.filter(check => check.result === 'FAIL').length;
    console.log('\ncheck\tresult\tevidence');
    for (const check of checks) console.log(`${check.name}\t${check.result}\t${check.evidence}`);
    process.exit(failed === 0 && checks.length > 0 ? 0 : 1);
  });
