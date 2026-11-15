// Adapted from umami src/app/login/LoginForm.tsx (MIT).
// Stellog adds project registration, forgot password, resend, Freighter, and xBull on this form.
import { useState } from 'react';
import {
  Button,
  Column,
  Form,
  FormButtons,
  FormField,
  FormSubmitButton,
  Heading,
  Icon,
  PasswordField,
  Row,
  Text,
  TextField,
} from '@umami/react-zen';
import { api } from '../api.js';
import { Logo } from './Logo.jsx';

function signatureText(signed) {
  if (typeof signed === 'string') return signed;
  const bytes = signed instanceof Uint8Array ? signed : signed?.data;
  if (bytes) return btoa(String.fromCharCode(...bytes));
  throw new Error('The wallet returned a signature Stellog cannot read.');
}

async function walletLogin(which, project) {
  let publicKey;
  let sign;
  const wallets = await import(/* @vite-ignore */ '/vendor/wallets.js');
  if (which === 'freighter') {
    const freighter = typeof wallets.freighter?.isConnected === 'function' ? wallets.freighter : wallets.freighter?.default;
    if (!freighter || typeof freighter.requestAccess !== 'function') throw new Error('Freighter could not be loaded.');
    let installed = true;
    if (typeof freighter.isConnected === 'function') {
      const connected = await freighter.isConnected();
      const flag = connected?.isConnected;
      installed = flag === true || (flag && typeof flag === 'object');
    }
    if (!installed) throw new Error('Freighter is not installed in this browser.');
    const access = await freighter.requestAccess();
    if (access.error || !access.address) throw new Error(access.error?.message || 'Freighter did not connect.');
    publicKey = access.address;
    sign = async (message) => {
      const signed = await freighter.signMessage(message, { address: publicKey });
      if (signed.error || !signed.signedMessage) throw new Error(signed.error?.message || 'Freighter did not sign.');
      return signatureText(signed.signedMessage);
    };
  } else {
    const Ctor = wallets.xBullWalletConnect;
    if (typeof Ctor !== 'function') throw new Error('xBull could not be loaded.');
    const bridge = new Ctor();
    publicKey = await bridge.connect();
    sign = async (message) => signatureText((await bridge.signMessage(message, { address: publicKey })).signedMessage);
  }
  const challenge = await api('/auth/wallet/challenge', { method: 'POST', body: JSON.stringify({ publicKey }) });
  if (challenge.status !== 200) throw new Error(challenge.body.error || 'Could not start wallet sign-in.');
  const signature = await sign(challenge.body.message);
  return api('/auth/wallet', {
    method: 'POST',
    body: JSON.stringify({ publicKey, signature, message: challenge.body.message, project: project || undefined }),
  });
}

export function LoginForm({ operator }) {
  const resetToken = new URLSearchParams(location.search).get('reset');
  const start = resetToken ? 'reset' : new URLSearchParams(location.search).get('mode') === 'register' && !operator ? 'up' : 'in';
  const [mode, setMode] = useState(start);
  const [error, setError] = useState('');
  const [note, setNote] = useState(new URLSearchParams(location.search).get('verified') === '1' ? 'Email verified. Sign in.' : '');
  const [project, setProject] = useState('');
  const [needsProject, setNeedsProject] = useState(false);

  const submit = async (data) => {
    setError('');
    setNote('');
    const email = String(data.email || '').trim();
    const password = data.password || '';
    if (mode === 'forgot') {
      const r = await api('/auth/forgot', { method: 'POST', body: JSON.stringify({ email }) });
      if (r.status === 429) { setError('Too many requests. Try again in a minute.'); return; }
      setNote(r.body.resetUrl ? <>{r.body.message} <a href={r.body.resetUrl}>Open the reset link</a>.</> : (r.body.message || 'Done.'));
      return;
    }
    if (mode === 'reset') {
      const r = await api('/auth/reset', { method: 'POST', body: JSON.stringify({ token: resetToken, password }) });
      if (r.status !== 200) { setError(r.body.error || 'Could not update the password.'); return; }
      setNote(r.body.message);
      history.replaceState({}, '', operator ? '/operator/login' : '/login');
      setMode('in');
      return;
    }
    if (!operator && mode === 'up') {
      const r = await api('/auth/register', { method: 'POST', body: JSON.stringify({ project: data.project, email, password }) });
      if (r.status !== 201) { setError(r.body.error || 'Could not register.'); return; }
      setNote(r.body.verifyUrl ? <>Account created. <a href={r.body.verifyUrl}>Verify this email</a>, then sign in.</> : r.body.message);
      setMode('in');
      return;
    }
    const r = await api('/auth/login', { method: 'POST', body: JSON.stringify({ email, password }) });
    if (r.status !== 200) {
      setError(r.body.error || 'Could not sign in.');
      if (r.status === 403 && !operator) {
        const again = await api('/auth/resend', { method: 'POST', body: JSON.stringify({ email }) });
        if (again.body.verifyUrl) setNote(<>This machine is not sending email. <a href={again.body.verifyUrl}>Verify this email</a>, then sign in.</>);
      }
      return;
    }
    if (operator && r.body.role !== 'operator') {
      await api('/auth/logout', { method: 'POST', body: '{}' });
      setError('This entrance is for SCF operators. Project accounts sign in on the project page.');
      return;
    }
    if (!operator && r.body.role === 'operator') {
      await api('/auth/logout', { method: 'POST', body: '{}' });
      setError('Operator accounts use the SCF operator entrance.');
      return;
    }
    location.href = operator ? '/operator' : '/app';
  };

  const onWallet = async (which) => {
    setError('');
    try {
      const r = await walletLogin(which, project.trim());
      if (r.status === 409 && r.body.needsProject) {
        setNeedsProject(true);
        setError('First time with this wallet. Enter a project name, then press the wallet button again.');
        return;
      }
      if (r.status !== 200) { setError(r.body.error || 'Could not sign in with that wallet.'); return; }
      location.href = '/app';
    } catch (e) {
      setError(e?.message || 'The wallet did not connect.');
    }
  };

  return (
    <Column justifyContent="center" alignItems="center" gap="6">
      <Icon size="lg"><Logo /></Icon>
      <Heading>Stellog</Heading>
      <Form key={mode} onSubmit={submit} error={error} style={{ minWidth: 300 }} autoComplete="on">
        {(mode === 'up' || needsProject) && (
          <FormField label="Project name" name="project" rules={{ required: mode === 'up' ? 'Required' : false }}>
            <TextField autoComplete="organization" value={needsProject ? project : undefined} onChange={needsProject ? setProject : undefined} />
          </FormField>
        )}
        {mode !== 'reset' && (
          <FormField label="Email" name="email" rules={{ required: 'Required' }}>
            <TextField type="email" autoComplete="username" autoFocus />
          </FormField>
        )}
        {mode !== 'forgot' && (
          <FormField label={mode === 'reset' ? 'New password' : 'Password'} name="password" rules={{ required: 'Required' }}>
            <PasswordField autoComplete={mode === 'in' ? 'current-password' : 'new-password'} />
          </FormField>
        )}
        <FormButtons>
          <FormSubmitButton variant="primary" style={{ flex: 1 }} isDisabled={false}>
            {mode === 'up' ? 'Create account' : mode === 'forgot' ? 'Email reset link' : mode === 'reset' ? 'Update password' : 'Login'}
          </FormSubmitButton>
        </FormButtons>
      </Form>
      {note && <Text color="muted" style={{ maxWidth: 360, textAlign: 'center' }}>{note}</Text>}
      <Row justifyContent="space-between" width="300px">
        {!operator && mode !== 'reset' && (
          <Button variant="quiet" onPress={() => { setError(''); setMode(mode === 'up' ? 'in' : 'up'); }}>
            {mode === 'up' ? 'Login' : 'Create an account'}
          </Button>
        )}
        {mode !== 'reset' && (
          <Button variant="quiet" onPress={() => { setError(''); setMode(mode === 'forgot' ? 'in' : 'forgot'); }}>Forgot password?</Button>
        )}
      </Row>
      <Text color="muted">
        {operator ? 'An operator already signed in can add another operator from the dashboard.' : <>SCF staff use the <a href="/operator/login">operator login</a>.</>}
      </Text>
      {!operator && (
        <Column gap="3" width="300px">
          <Row gap="2">
            <Button onPress={() => onWallet('freighter')} style={{ flex: 1 }}>Freighter</Button>
            <Button onPress={() => onWallet('xbull')} style={{ flex: 1 }}>xBull</Button>
          </Row>
          <Text color="muted" size="sm">The first time a wallet signs in, enter a project name and press the wallet button again.</Text>
        </Column>
      )}
    </Column>
  );
}
