'use client';
import { Column } from '@umami/react-zen';
import { useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { useLoginQuery } from '@/components/hooks';
import { LoginForm } from './LoginForm';
import { PropsWithChildren } from 'react';

export function LoginPageWrapper({ children }: PropsWithChildren) {
  const { user, isLoading } = useLoginQuery();
  const router = useRouter();

  useEffect(() => {
    if (user) {
      router.replace('/');
    }
  }, [user, router]);

  if (isLoading || user) {
    return (
      <Column
        className="stellog-auth"
        height="100vh"
        backgroundColor="surface-raised"
        style={{ backgroundColor: 'var(--stellog-chrome)' }}
      />
    );
  }

  return (
    <Column
      className="stellog-auth"
      alignItems="center"
      justifyContent="flex-start"
      height="100vh"
      backgroundColor="surface-raised"
      style={{ paddingTop: '15vh' }}
    >
      {children}
    </Column>
  );
}

export function LoginPage() {
  return (
    <LoginPageWrapper>
      <LoginForm />
    </LoginPageWrapper>
  );
}
