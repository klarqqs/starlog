'use client';
import {
  Button,
  Column,
  Form,
  FormButtons,
  FormField,
  FormSubmitButton,
  Heading,
  PasswordField,
  Row,
  Text,
  TextField,
} from '@umami/react-zen';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import Link from '@/components/common/Link';
import { useMessages, useUpdateQuery } from '@/components/hooks';
import { signWallet, type WalletId } from '@/components/wallet-client';
import { AuthBar, authLinkStyle } from './AuthBar';

const walletButtonStyle = {
  flex: '1 1 0',
  fontWeight: 700,
  background: '#fff',
  color: '#161616',
  borderColor: '#fff',
};

import { removeClientAuthToken, setClientAuthToken } from '@/lib/client';
import { setUser } from '@/store/app';

function landingPath(role?: string) {
  const path = role === 'admin' || role === 'operator' ? '/admin/overview' : '/overview';
  try {
    localStorage.setItem('stellog.landing', path);
  } catch {}
  return path;
}

export function LoginForm({ operator = false }: { operator?: boolean }) {
  const { t, labels, getErrorMessage } = useMessages();
  const router = useRouter();
  const { mutateAsync, error } = useUpdateQuery(operator ? '/auth/login' : '/auth/login');
  const registerQuery = useUpdateQuery('/auth/register');
  const [register, setRegister] = useState(false);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!operator)
      setRegister(new URLSearchParams(window.location.search).get('mode') === 'register');
  }, [operator]);

  const handleSubmit = async (data: any) => {
    setNote('');
    if (register) {
      await registerQuery.mutateAsync(
        { username: data.username, password: data.password },
        {
          onSuccess: async () => {
            const response = await mutateAsync({
              username: data.username,
              password: data.password,
            });
            setClientAuthToken(response.token);
            setUser(response.user);
            router.push('/overview');
          },
        },
      );
      return;
    }

    await mutateAsync(data, {
      onSuccess: async (response: any) => {
        if (response.requiresTwoFactor) {
          sessionStorage.setItem('umami.partial-token', response.partialToken);
          router.push('/login/two-factor');
          return;
        }
        const role = response.user?.role;
        if (operator && role !== 'admin' && role !== 'operator') {
          removeClientAuthToken();
          setNote('This entrance is for SCF operators. Project accounts use the project sign-in.');
          return;
        }
        setClientAuthToken(response.token);
        setUser(response.user);
        router.push(landingPath(role));
      },
    });
  };

  const handleWallet = async (walletId: WalletId) => {
    setNote('');
    try {
      const { signedTxXdr } = await signWallet(walletId);
      const res = await fetch('/api/auth/wallet/login', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ transaction: signedTxXdr }),
      });
      const response = await res.json();
      if (!res.ok) throw new Error(response?.error?.message || 'Wallet sign-in failed.');
      const role = response.user?.role;
      if (operator && role !== 'admin' && role !== 'operator') {
        setNote('This entrance is for SCF operators. Project accounts use the project sign-in.');
        return;
      }
      setClientAuthToken(response.token);
      setUser(response.user);
      router.push(landingPath(role));
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Wallet sign-in failed.');
    }
  };

  const corner = operator ? (
    <Link href="/login" style={authLinkStyle}>
      Project sign in
    </Link>
  ) : register ? (
    <Link href="/login" style={authLinkStyle}>
      Sign in
    </Link>
  ) : (
    <Link href="/login?mode=register" style={authLinkStyle}>
      Sign up
    </Link>
  );

  return (
    <>
      <AuthBar action={corner} />
      <Column justifyContent="center" alignItems="center" gap="6" width="360px">
        <Heading>{operator ? 'SCF operator' : register ? 'Sign up' : 'Log in'}</Heading>
        <Form
          onSubmit={handleSubmit}
          error={
            operator && (error as { code?: string } | null)?.code === 'incorrect-username-password'
              ? 'Incorrect username or password.'
              : getErrorMessage(register ? registerQuery.error : error) || note
          }
          defaultValues={{ username: '', password: '' }}
          style={{ width: '100%' }}
        >
          <FormField
            label={operator ? 'Username' : 'Email address'}
            data-test="input-username"
            name="username"
            rules={{
              required: operator ? 'Enter your username.' : 'Enter your email.',
              validate: (value: string) =>
                operator ||
                /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
                'Enter a valid email address.',
            }}
          >
            <TextField
              type={operator ? 'text' : 'email'}
              autoComplete={operator ? 'username' : 'email'}
              autoFocus
              placeholder={operator ? undefined : 'you@example.com'}
            />
          </FormField>

          <FormField
            label={t(labels.password)}
            data-test="input-password"
            name="password"
            rules={{ required: t(labels.required) }}
          >
            <PasswordField autoComplete={register ? 'new-password' : 'current-password'} />
          </FormField>
          <FormButtons>
            <FormSubmitButton
              data-test="button-submit"
              variant="primary"
              style={{ flex: 1 }}
              isDisabled={false}
            >
              {register ? 'Create account' : operator ? 'Sign in as operator' : t(labels.login)}
            </FormSubmitButton>
          </FormButtons>
        </Form>
        <Column gap="3" alignItems="center" width="100%">
          {operator ? (
            <Link href="/login" style={authLinkStyle}>
              Project sign in
            </Link>
          ) : register ? (
            <Text>
              Already have an account?{' '}
              <Link href="/login" style={authLinkStyle}>
                Sign in
              </Link>
            </Text>
          ) : (
            <Text>
              Don&apos;t have an account?{' '}
              <Link href="/login?mode=register" style={authLinkStyle}>
                Sign up
              </Link>
            </Text>
          )}
          {!register && (
            <Link href="/login/forgot" style={authLinkStyle}>
              Forgot password?
            </Link>
          )}
          {!register && (
            <>
              <div
                aria-hidden
                style={{
                  width: '100%',
                  borderTop: '1px solid currentColor',
                  opacity: 0.28,
                  marginTop: 12,
                  marginBottom: 12,
                }}
              />
              <Text>Or sign in with a wallet you already linked</Text>
              <Row gap="2" width="100%">
                <Button
                  variant="outline"
                  style={walletButtonStyle}
                  onPress={() => handleWallet('freighter')}
                >
                  Freighter
                </Button>
                <Button
                  variant="outline"
                  style={walletButtonStyle}
                  onPress={() => handleWallet('xbull')}
                >
                  xBull
                </Button>
              </Row>
            </>
          )}
          {!operator && !register && (
            <Link href="/operator/login" style={authLinkStyle}>
              SCF operator sign in
            </Link>
          )}
        </Column>
      </Column>
    </>
  );
}
