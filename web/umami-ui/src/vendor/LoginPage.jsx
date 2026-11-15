// Adapted from umami src/app/login/LoginPage.tsx (MIT).
import { Column, Loading } from '@umami/react-zen';

export function LoginPage({ user, loading, children }) {
  if (loading) return <Loading placement="absolute" />;
  if (user) return <Loading placement="absolute" />;
  return (
    <Column alignItems="center" justifyContent="flex-start" height="100vh" backgroundColor="surface-raised" style={{ paddingTop: '15vh' }}>
      {children}
    </Column>
  );
}
