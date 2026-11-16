'use client';
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
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { useMessages, useUpdateQuery } from '@/components/hooks';
import { Logo } from '@/components/svg';
import { signWallet, type WalletId } from '@/components/wallet-client';
import { removeClientAuthToken, setClientAuthToken } from '@/lib/client';
import { consumeReturnUrl } from '@/lib/return-url';
import { setUser } from '@/store/app';

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
            router.push('/');
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
        router.push(
          role === 'operator'
            ? '/admin/projects'
            : operator
              ? '/admin/websites'
              : (consumeReturnUrl() ?? '/'),
        );
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
      router.push(role === 'operator' ? '/admin/projects' : operator ? '/admin/websites' : '/');
    } catch (e) {
      setNote(e instanceof Error ? e.message : 'Wallet sign-in failed.');
    }
  };

  return (
    <Column justifyContent="center" alignItems="center" gap="6">
      <Icon size="lg">
        <Logo />
      </Icon>
      <Heading>{operator ? 'SCF operator' : register ? 'Create account' : 'Stellog'}</Heading>
      <Form
        onSubmit={handleSubmit}
        error={getErrorMessage(register ? registerQuery.error : error) || note}
        defaultValues={{ username: '', password: '' }}
        style={{ minWidth: 300 }}
      >
        <FormField
          label="Email"
          data-test="input-username"
          name="username"
          rules={{
            required: 'Enter your email.',
            validate: (value: string) =>
              operator ||
              /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value) ||
              'Enter a valid email address.',
          }}
        >
          <TextField
            type={operator ? 'text' : 'email'}
            autoComplete="email"
            autoFocus
            placeholder="you@example.com"
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
      {!register && (
        <Column gap="3" alignItems="center">
          <a href="/login/forgot">Forgot your password?</a>
          <Text>Or sign in with a wallet you already linked</Text>
          <Row gap="2">
            <Button variant="outline" onPress={() => handleWallet('freighter')}>
              Freighter
            </Button>
            <Button variant="outline" onPress={() => handleWallet('xbull')}>
              xBull
            </Button>
          </Row>
        </Column>
      )}
      <Text>
        {operator ? (
          <a href="/login">Project sign in</a>
        ) : register ? (
          <a href="/login">Already have an account? Sign in</a>
        ) : (
          <>
            <a href="/login?mode=register">Create an account</a>
            {' · '}
            <a href="/operator/login">SCF operator sign in</a>
          </>
        )}
      </Text>
    </Column>
  );
}
