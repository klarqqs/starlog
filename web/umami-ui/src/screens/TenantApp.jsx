// Page composition follows umami WebsitePage.tsx and WebsitesPage.tsx (MIT).
import { useEffect, useState } from 'react';
import { Button, Column, Grid, Heading, Row, Select, Text, TextField } from '@umami/react-zen';
import { api, snippet } from '../api.js';
import { MetricsBar } from '../vendor/MetricsBar.jsx';
import { PageBody } from '../vendor/PageBody.jsx';
import { PageHeader } from '../vendor/PageHeader.jsx';
import { Panel } from '../vendor/Panel.jsx';
import { SideNav } from '../vendor/SideNav.jsx';

function Metric({ label, value }) {
  return (
    <Column padding="4" gap="1">
      <Text color="muted" size="sm">{label}</Text>
      <Heading size="3xl">{value}</Heading>
    </Column>
  );
}

function Bars({ series }) {
  const list = series || [];
  const max = Math.max(1, ...list.map((d) => Number(d.page_views) || 0));
  if (!list.length) return <Text color="muted">No page views in this range.</Text>;
  return (
    <Row alignItems="flex-end" gap="1" height="180px">
      {list.map((d) => (
        <Column key={d.day} flexGrow="1" justifyContent="flex-end" height="100%" title={`${d.day}: ${d.page_views}`}>
          <Column backgroundColor="primary" borderRadius width="100%" style={{ height: `${Math.max(4, Math.round(100 * d.page_views / max))}%` }} />
        </Column>
      ))}
    </Row>
  );
}

function Table({ columns, rows }) {
  const list = rows || [];
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse' }}>
      <thead>
        <tr>{columns.map((c) => <th key={c[0]} style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 500 }}><Text color="muted" size="sm">{c[0]}</Text></th>)}</tr>
      </thead>
      <tbody>
        {list.slice(0, 8).map((row, i) => (
          <tr key={i}>{columns.map((c) => <td key={c[0]} style={{ padding: '8px 4px', borderTop: '1px solid var(--color-border, #333)' }}>{c[1](row)}</td>)}</tr>
        ))}
        {!list.length && <tr><td colSpan={columns.length}><Text color="muted">No data yet.</Text></td></tr>}
      </tbody>
    </table>
  );
}

export function TenantApp({ user }) {
  const [view, setView] = useState('dashboard');
  const [days, setDays] = useState('30');
  const [data, setData] = useState(null);
  const [domain, setDomain] = useState('');
  const [label, setLabel] = useState('');
  const [message, setMessage] = useState('');
  const [tokenOnce, setTokenOnce] = useState(null);

  const load = () => Promise.all([
    api('/tenant/sites'),
    api(`/tenant/web/summary?days=${days}`),
    api('/tenant/tokens'),
    api(`/tenant/api/summary?days=${days}`),
  ]).then(([sites, summary, tokens, apiSummary]) => setData({
    sites: sites.body || [],
    summary: summary.body || {},
    tokens: tokens.body || [],
    apiSummary: apiSummary.body || {},
  }));

  useEffect(() => { load(); }, [days]);

  const web = (data?.sites || []).filter((s) => s.kind === 'web');
  const apis = (data?.sites || []).filter((s) => s.kind === 'api');
  const addSite = async (kind) => {
    setMessage('');
    const r = await api('/tenant/sites', { method: 'POST', body: JSON.stringify({ kind, domain: domain.trim() }) });
    if (r.status !== 201) { setMessage(r.body.error || 'Could not add that domain.'); return; }
    setDomain('');
    load();
  };

  return (
    <Row height="100vh" backgroundColor="surface-sunken">
      <SideNav user={user} active={view} onSelect={setView} items={[
        { id: 'dashboard', label: 'Dashboard', icon: 'dashboard' },
        { id: 'boards', label: 'Boards', icon: 'boards' },
        { id: 'websites', label: 'Websites', icon: 'websites' },
        { id: 'links', label: 'Links', icon: 'links' },
        { id: 'pixels', label: 'Pixels', icon: 'pixels' },
        { id: 'api', label: 'API', icon: 'api' },
      ]} />
      <Column flexGrow="1" overflow="auto">
        <PageBody>
          {view === 'dashboard' && (
            <Column gap="6">
              <PageHeader title="Dashboard">
                <Select value={days} onChange={(value) => setDays(String(value))} items={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
              </PageHeader>
              <MetricsBar>
                <Metric label="Views" value={data?.summary.totals?.pageViews ?? 0} />
                <Metric label="Visitors" value={data?.summary.totals?.visitors ?? 0} />
                <Metric label="API requests" value={data?.apiSummary.totals?.requests ?? 0} />
                <Metric label="Websites" value={web.length} />
              </MetricsBar>
              <Panel>
                <Bars series={data?.summary.series} />
              </Panel>
              <Text color="muted">Umami counts website traffic. Stellog also takes an ingest token per project. It strips Stellar addresses, UUIDs, hashes and ids from paths, then keeps request counts, status codes and p50/p95 latency.</Text>
              <Grid columns="1fr 1fr" gap="3">
                <Panel title="Referrers"><Table columns={[['Source', (r) => r.key], ['Views', (r) => r.views]]} rows={data?.summary.breakdown?.referrer} /></Panel>
                <Panel title="Browsers"><Table columns={[['Browser', (r) => r.key], ['Views', (r) => r.views]]} rows={data?.summary.breakdown?.browser} /></Panel>
                <Panel title="Devices"><Table columns={[['Device', (r) => r.key], ['Views', (r) => r.views]]} rows={data?.summary.breakdown?.device} /></Panel>
                <Panel title="Routes"><Table columns={[['Route', (r) => r.route], ['Requests', (r) => r.requests], ['p95', (r) => r.p95 ?? '—']]} rows={data?.apiSummary.routes} /></Panel>
              </Grid>
            </Column>
          )}
          {view === 'websites' && (
            <Column gap="6">
              <PageHeader title="Websites" description="Paste the script on that site. A visit counts only when the browser origin matches the domain.">
                <Select value={days} onChange={(value) => setDays(String(value))} items={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
              </PageHeader>
              <Panel title="Add a website">
                <Row gap="2">
                  <TextField placeholder="app.example.com" value={domain} onChange={setDomain} />
                  <Button variant="primary" onPress={() => addSite('web')}>Add</Button>
                </Row>
                {message && <Text color="danger">{message}</Text>}
              </Panel>
              <Grid columns="1fr 1fr" gap="3">
                {web.map((s) => (
                  <Panel key={s.id} title={s.domain}>
                    <textarea readOnly rows={3} value={snippet(s.id)} style={{ width: '100%' }} />
                    <Button onPress={async () => { await api(`/tenant/sites/${s.id}/test`, { method: 'POST', body: '{}' }); setView('dashboard'); }}>Send a test visit</Button>
                  </Panel>
                ))}
              </Grid>
              {!web.length && <Text color="muted">No website yet.</Text>}
            </Column>
          )}
          {view === 'boards' && (
            <Column gap="6">
              <PageHeader title="Boards" description="Umami boards are custom layouts of charts. Stellog keeps one dashboard per project." />
              <Panel><Text color="muted">Page views, visitors, and API routes are on the Dashboard.</Text></Panel>
            </Column>
          )}
          {view === 'links' && (
            <Column gap="6">
              <PageHeader title="Links" description="Umami links are short links with click counts." />
              <Panel><Text color="muted">Stellog does not host short links. Website traffic is under Websites.</Text></Panel>
            </Column>
          )}
          {view === 'pixels' && (
            <Column gap="6">
              <PageHeader title="Pixels" description="Umami pixels are image beacons." />
              <Panel><Text color="muted">Stellog counts a visit with the script tag on the Websites screen.</Text></Panel>
            </Column>
          )}
          {view === 'settings' && (
            <Column gap="6">
              <PageHeader title="Settings" description="This account" />
              <Panel>
                <Text>{user.email}</Text>
                <Text color="muted">{user.wallet ? `Wallet ${user.wallet}` : 'Email account'}</Text>
              </Panel>
            </Column>
          )}
          {view === 'api' && (
            <Column gap="6">
              <PageHeader title="API">
                <Select value={days} onChange={(value) => setDays(String(value))} items={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
              </PageHeader>
              <Text color="muted">Create an ingest token per project and send request metrics. Stellog strips Stellar addresses, UUIDs, hashes and ids from paths, then keeps request counts, status codes and p50/p95 latency.</Text>
              <Panel title="API domain">
                <Row gap="2">
                  <TextField placeholder="api.example.com" value={domain} onChange={setDomain} />
                  <Button variant="primary" onPress={() => addSite('api')}>Add</Button>
                </Row>
                {apis.map((s) => <Text key={s.id}>{s.domain}</Text>)}
                {!apis.length && <Text color="muted">No API domain yet.</Text>}
                {message && <Text color="danger">{message}</Text>}
              </Panel>
              <Panel title="Ingest tokens">
                <Row gap="2">
                  <TextField placeholder="production" value={label} onChange={setLabel} />
                  <Button variant="primary" onPress={async () => {
                    const r = await api('/tenant/tokens', { method: 'POST', body: JSON.stringify({ label }) });
                    if (r.status !== 201) { setMessage(r.body.error || 'Could not create a token.'); return; }
                    setTokenOnce(r.body.token);
                    setLabel('');
                    load();
                  }}>Create token</Button>
                </Row>
                {tokenOnce && (
                  <Column gap="2">
                    <Text weight="bold">Copy this token now. It is not shown again.</Text>
                    <pre style={{ whiteSpace: 'pre-wrap' }}>{tokenOnce}</pre>
                  </Column>
                )}
                <Table columns={[['Label', (t) => t.label || '—'], ['Status', (t) => t.revoked_at ? 'Revoked' : new Date(t.created_at).toLocaleString()], ['', (t) => t.revoked_at ? '' : 'Revoke']]} rows={data?.tokens} />
                <Row gap="2">
                  {(data?.tokens || []).filter((t) => !t.revoked_at).map((t) => (
                    <Button key={t.id} onPress={async () => { await api(`/tenant/tokens/${t.id}/revoke`, { method: 'POST', body: '{}' }); load(); }}>Revoke {t.label || 'token'}</Button>
                  ))}
                </Row>
              </Panel>
              <Panel title="Routes">
                <Table columns={[['Route', (r) => r.route], ['Requests', (r) => r.requests], ['Error %', (r) => r.errorRate], ['p50', (r) => r.p50 ?? '—'], ['p95', (r) => r.p95 ?? '—']]} rows={data?.apiSummary.routes} />
              </Panel>
            </Column>
          )}
        </PageBody>
      </Column>
    </Row>
  );
}
