'use client';
import { Column, Form, FormButtons, FormField, FormSubmitButton, Heading, PasswordField, Text } from '@umami/react-zen';
import { useEffect, useState } from 'react';
import { LoginPageWrapper } from '../LoginPage';
import { AuthBar, authLinkStyle } from '../AuthBar';
import Link from '@/components/common/Link';
import { useMessages, useUpdateQuery } from '@/components/hooks';

function ResetForm() {
  const { t, labels, getErrorMessage } = useMessages();
  const { mutateAsync, error } = useUpdateQuery('/auth/reset');
  const [done, setDone] = useState('');
  const [token, setToken] = useState('');
  useEffect(() => {
    setToken(new URLSearchParams(window.location.search).get('token') || '');
  }, []);

  const handleSubmit = async (data: { password: string }) => {
    const response = await mutateAsync({ token, password: data.password });
    setDone(response.message);
  };

  return (
    <>
      <AuthBar
        action={
          <Link href="/login" style={authLinkStyle}>
            Sign in
          </Link>
        }
      />
      <Column justifyContent="center" alignItems="center" gap="6" width="360px">
      <Heading>Choose a new password</Heading>
      <Form onSubmit={handleSubmit} error={token ? getErrorMessage(error) : 'This link is invalid or expired.'} style={{ width: '100%' }}>
        <FormField label={t(labels.password)} name="password" rules={{ required: t(labels.required), minLength: { value: 8, message: 'At least 8 characters.' } }}>
          <PasswordField autoComplete="new-password" autoFocus />
        </FormField>
        <FormButtons>
          <FormSubmitButton variant="primary" style={{ flex: 1 }} isDisabled={!token}>
            Update password
          </FormSubmitButton>
        </FormButtons>
      </Form>
      {done && <Text>{done}</Text>}
      <Link href="/login" style={authLinkStyle}>
        Back to sign in
      </Link>
    </Column>
    </>
  );
}

export default function ResetPage() {
  return (
    <LoginPageWrapper>
      <ResetForm />
    </LoginPageWrapper>
  );
}
