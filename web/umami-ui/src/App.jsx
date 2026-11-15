import { useEffect, useState } from 'react';
import { Loading } from '@umami/react-zen';
import { api } from './api.js';
import { LoginForm } from './vendor/LoginForm.jsx';
import { LoginPage } from './vendor/LoginPage.jsx';
import { OperatorApp } from './screens/OperatorApp.jsx';
import { TenantApp } from './screens/TenantApp.jsx';

export function App() {
  const path = location.pathname;
  const [user, setUser] = useState(undefined);
  useEffect(() => { api('/me').then((r) => setUser(r.status === 200 ? r.body : null)); }, []);

  if (user === undefined) return <Loading placement="absolute" />;

  if (path === '/login') {
    if (user?.role === 'tenant') { location.replace('/app'); return null; }
    if (user?.role === 'operator') { location.replace('/operator'); return null; }
    return <LoginPage user={user} loading={false}><LoginForm /></LoginPage>;
  }
  if (path === '/operator/login') {
    if (user?.role === 'operator') { location.replace('/operator'); return null; }
    return <LoginPage user={null} loading={false}><LoginForm operator /></LoginPage>;
  }
  if (path === '/operator') {
    if (!user) { location.replace('/operator/login'); return null; }
    if (user.role !== 'operator') { location.replace('/app'); return null; }
    return <OperatorApp user={user} />;
  }
  if (!user) { location.replace('/login'); return null; }
  if (user.role === 'operator') { location.replace('/operator'); return null; }
  return <TenantApp user={user} />;
}
