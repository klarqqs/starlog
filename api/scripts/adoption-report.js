// Usage: node scripts/adoption-report.js <base-url> <operator-email> <operator-password> [days=30] [--csv]
// Prints every project with measured page views, visitors and API requests, so you can show which
// SCF projects are really onboarded. Reads the same endpoint as the operator page.
const [base, email, password, daysArg] = process.argv.slice(2).filter((a) => a !== '--csv');
const csv = process.argv.includes('--csv');
if (!base || !email || !password) { console.error('Usage: node scripts/adoption-report.js <base-url> <operator-email> <operator-password> [days] [--csv]'); process.exit(1); }
const days = Math.min(Math.max(parseInt(daysArg, 10) || 30, 1), 365);
const login = await fetch(`${base}/auth/login`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email, password }) });
if (!login.ok) { console.error(`Sign-in failed (${login.status}).`); process.exit(1); }
if ((await login.json()).role !== 'operator') { console.error('That account is not an operator.'); process.exit(1); }
const cookie = login.headers.get('set-cookie').split(';')[0];
const res = await fetch(`${base}/operator/tenants?days=${days}`, { headers: { cookie } });
if (!res.ok) { console.error(`Could not load tenants (${res.status}).`); process.exit(1); }
const rows = await res.json();
const q = (v) => `"${String(v).replace(/"/g, '""')}"`;
if (csv) {
  console.log('project,slug,status,page_views,visitors,api_requests');
  for (const r of rows) console.log([q(r.name), r.slug, r.status, r.page_views, r.visitors, r.api_requests].join(','));
} else {
  console.log(`Projects in the last ${days} days: ${rows.length}`);
  for (const r of rows) console.log(`${r.name.padEnd(28)} ${r.status.padEnd(8)} views=${r.page_views} visitors=${r.visitors} api=${r.api_requests}`);
  console.log(`With web traffic: ${rows.filter((r) => r.page_views > 0).length} | With API traffic: ${rows.filter((r) => r.api_requests > 0).length}`);
}
