/**
 * Compare the operator list, the same overview payload, and each project page.
 * Prints one line per project and exits 1 when requests, error rate, or p95 differ.
 *
 *   node --env-file=.env.demo ./node_modules/tsx/dist/cli.mjs scripts/reconcile-demo.ts
 */
const base = (process.env.DEMO_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const end = Date.now();
const start = end - 30 * 24 * 60 * 60 * 1000;

type Row = {
  id: string;
  name: string;
  pageviews: number;
  requests: number;
  errorRate: number;
  p95: number | null;
};

async function login() {
  const response = await fetch(`${base}/api/auth/login`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      username: 'scf-operator-045',
      password: process.env.DEMO_OPERATOR_PASSWORD,
    }),
  });
  if (!response.ok) throw new Error(`operator login failed (${response.status})`);
  const body = (await response.json()) as { token?: string };
  if (!body.token) throw new Error('operator login returned no token');
  return body.token;
}

function close(left: number | null, right: number | null, tolerance: number) {
  if (left === null || right === null) return left === right;
  return Math.abs(left - right) <= tolerance;
}

async function main() {
  const token = await login();
  const headers = { authorization: `Bearer ${token}` };
  const listUrl = `${base}/api/admin/projects?startAt=${start}&endAt=${end}&unit=day&status=all&sort=requests&order=desc`;
  const listed = (await (await fetch(listUrl, { headers })).json()) as { projects: Row[] };
  const overview = (await (await fetch(listUrl, { headers })).json()) as { projects: Row[] };
  const overviewById = new Map(overview.projects.map(project => [project.id, project]));
  let mismatches = 0;

  console.log('project\trequests\terror\tp95\tstatus');
  for (const row of listed.projects) {
    const overviewRow = overviewById.get(row.id);
    const projectId = row.id.replace(/^team:/, '');
    const detailResponse = await fetch(
      `${base}/api/projects/${projectId}?startAt=${start}&endAt=${end}&unit=day`,
      { headers },
    );
    const detail = (await detailResponse.json()) as { project?: Row };
    const page = detail.project;
    const problems: string[] = [];
    if (!overviewRow) problems.push('missing from overview');
    if (!page) problems.push(`detail ${detailResponse.status}`);
    if (overviewRow && overviewRow.requests !== row.requests) problems.push('overview requests');
    if (overviewRow && !close(overviewRow.errorRate, row.errorRate, 0.0001)) {
      problems.push('overview error rate');
    }
    if (overviewRow && !close(overviewRow.p95, row.p95, 1)) problems.push('overview p95');
    if (page && page.requests !== row.requests) problems.push('detail requests');
    if (page && !close(page.errorRate, row.errorRate, 0.0001)) problems.push('detail error rate');
    if (page && !close(page.p95, row.p95, 1)) problems.push('detail p95');
    if (page && page.pageviews !== row.pageviews) problems.push('detail pageviews');
    if (row.name !== 'Obba' && row.name !== 'Starlog' && row.pageviews === 0) {
      problems.push('synthetic project has no pageviews');
    }
    if (row.name !== 'Obba' && row.name !== 'Starlog' && (row.requests === 0 || !page)) {
      problems.push('synthetic project has no API traffic');
    }
    if (problems.length > 0) mismatches += 1;
    const error = `${Math.round(row.errorRate * 1000) / 10}%`;
    const p95 = row.p95 == null ? '-' : `${Math.round(row.p95)} ms`;
    console.log(
      `${row.name}\t${row.requests}\t${error}\t${p95}\t${problems.join(', ') || 'ok'}`,
    );
  }

  if (listed.projects.some(project => project.name === 'Starlog')) {
    console.log('Starlog is still on the operator list');
    mismatches += 1;
  }
  if (mismatches > 0) {
    console.log(`${mismatches} mismatches`);
    process.exit(1);
  }
  console.log(`${listed.projects.length} projects reconcile`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
