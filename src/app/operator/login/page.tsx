'use client';
import { LoginForm } from '@/app/login/LoginForm';
import { LoginPageWrapper } from '@/app/login/LoginPage';

export default function OperatorLoginPage() {
  return (
    <LoginPageWrapper>
      <LoginForm operator />
    </LoginPageWrapper>
  );
}
