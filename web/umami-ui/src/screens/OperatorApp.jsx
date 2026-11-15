import { useEffect, useState } from 'react';
import { Button, Column, Row, Select, Text, TextField } from '@umami/react-zen';
import { api } from '../api.js';
import { PageBody } from '../vendor/PageBody.jsx';
import { PageHeader } from '../vendor/PageHeader.jsx';
import { Panel } from '../vendor/Panel.jsx';
import { SideNav } from '../vendor/SideNav.jsx';

export function OperatorApp({ user }) {
  const [view, setView] = useState('projects');
  const [days, setDays] = useState('30');
  const [sort, setSort] = useState('page_views');
  const [q, setQ] = useState('');
  const [rows, setRows] = useState([]);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');

  useEffect(() => {
    if (view !== 'projects') return;
    api(`/operator/tenants?days=${days}`).then((r) => setRows(Array.isArray(r.body) ? r.body : []));
  }, [view, days]);

  const query = q.trim().toLowerCase();
  const shown = rows
    .filter((t) => !query || `${t.name} ${t.slug}`.toLowerCase().includes(query))
    .sort((a, b) => sort === 'name' ? a.name.localeCompare(b.name) : Number(b[sort]) - Number(a[sort]));

  return (
    <Row height="100vh" backgroundColor="surface-sunken">
      <SideNav user={user} active={view} onSelect={setView} items={[
        { id: 'projects', label: 'Projects', icon: 'dashboard' },
        { id: 'operators', label: 'Operators', icon: 'settings' },
      ]} />
      <Column flexGrow="1" overflow="auto">
        <PageBody>
          {view === 'projects' && (
            <Column gap="4">
              <PageHeader title="Projects" description="Every Stellog project, with measured page views, visitors and API requests. This is not the Umami website list.">
                <Select value={days} onChange={(value) => setDays(String(value))} items={[{ value: '7', label: 'Last 7 days' }, { value: '30', label: 'Last 30 days' }, { value: '90', label: 'Last 90 days' }]} />
              </PageHeader>
              <Row gap="2">
                <TextField placeholder="Filter by name" value={q} onChange={setQ} />
                <Select value={sort} onChange={(value) => setSort(String(value))} items={[
                  { value: 'page_views', label: 'Views' },
                  { value: 'visitors', label: 'Visitors' },
                  { value: 'api_requests', label: 'API requests' },
                  { value: 'name', label: 'Name' },
                ]} />
              </Row>
              <Panel title="All projects">
                <table style={{ width: '100%', borderCollapse: 'collapse' }}>
                  <thead><tr>{['Project', 'Status', 'Views', 'Visitors', 'API'].map((h) => <th key={h} style={{ textAlign: 'left', padding: 8 }}><Text color="muted" size="sm">{h}</Text></th>)}</tr></thead>
                  <tbody>
                    {shown.map((t) => (
                      <tr key={t.id}>
                        <td style={{ padding: 8 }}>{t.name}</td>
                        <td>{t.status}</td>
                        <td>{Number(t.page_views).toLocaleString()}</td>
                        <td>{Number(t.visitors).toLocaleString()}</td>
                        <td>{Number(t.api_requests).toLocaleString()}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </Panel>
              <Row gap="2">
                {shown.filter((t) => t.status === 'active').map((t) => (
                  <Button key={t.id} onPress={async () => {
                    if (!confirm('Remove this project? They will not be able to sign in.')) return;
                    await api(`/operator/tenants/${t.id}/remove`, { method: 'POST', body: '{}' });
                    const r = await api(`/operator/tenants?days=${days}`);
                    setRows(Array.isArray(r.body) ? r.body : []);
                  }}>Remove {t.name}</Button>
                ))}
              </Row>
            </Column>
          )}
          {view === 'settings' && (
            <Column gap="4">
              <PageHeader title="Settings" description="This operator account" />
              <Panel><Text>{user.email}</Text></Panel>
            </Column>
          )}
          {view === 'operators' && (
            <Column gap="4">
              <PageHeader title="Operators" description="This adds another SCF sign-in. It is not on the public login page." />
              <Panel title="Add an operator">
                <Row gap="2">
                  <TextField type="email" placeholder="Email" value={email} onChange={setEmail} />
                  <TextField type="password" placeholder="Password, 12+ characters" value={password} onChange={setPassword} />
                  <Button variant="primary" onPress={async () => {
                    const r = await api('/operator/operators', { method: 'POST', body: JSON.stringify({ email: email.trim(), password }) });
                    setMessage(r.status === 201 ? r.body.message : (r.body.error || 'Could not create that operator.'));
                    if (r.status === 201) { setEmail(''); setPassword(''); }
                  }}>Create</Button>
                </Row>
                {message && <Text>{message}</Text>}
              </Panel>
            </Column>
          )}
        </PageBody>
      </Column>
    </Row>
  );
}
