'use client';
import { Column, Form, FormButtons, FormField, FormSubmitButton, Heading, Text, TextField } from '@umami/react-zen';
import { useState } from 'react';
import { LoginPageWrapper } from '../LoginPage';
import { AuthBar, authLinkStyle } from '../AuthBar';
import Link from '@/components/common/Link';
import { useMessages, useUpdateQuery } from '@/components/hooks';

function ForgotForm() {
  const { getErrorMessage } = useMessages();
  const { mutateAsync, error } = useUpdateQuery('/auth/forgot');
  const [resetUrl, setResetUrl] = useState('');
  const [message, setMessage] = useState('');

  const handleSubmit = async (data: { username: string }) => {
    const response = await mutateAsync(data);
    setMessage(response.message);
    if (response.resetUrl) setResetUrl(response.resetUrl);
  };

  return (
    <>
      <AuthBar
        action={
          <Link href="/login?mode=register" style={authLinkStyle}>
            Sign up
          </Link>
        }
      />
      <Column justifyContent="center" alignItems="center" gap="6" width="360px">
      <Heading>Reset password</Heading>
      <Form onSubmit={handleSubmit} error={getErrorMessage(error)} style={{ width: '100%' }}>
        <FormField label="Email" name="username" rules={{ required: 'Enter your email.' }}>
          <TextField type="email" autoComplete="email" autoFocus placeholder="you@example.com" />
        </FormField>
        <FormButtons>
          <FormSubmitButton variant="primary" style={{ flex: 1 }}>
            Send reset link
          </FormSubmitButton>
        </FormButtons>
      </Form>
      {message && <Text>{message}</Text>}
      {resetUrl && (
        <a href={resetUrl}>Open the reset link</a>
      )}
      <Link href="/login" style={authLinkStyle}>
        Back to sign in
      </Link>
    </Column>
    </>
  );
}

export default function ForgotPage() {
  return (
    <LoginPageWrapper>
      <ForgotForm />
    </LoginPageWrapper>
  );
}
