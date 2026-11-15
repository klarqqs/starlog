// Adapted from umami src/components/common/PageBody.tsx (MIT).
import { Column } from '@umami/react-zen';

export function PageBody({ maxWidth = '1320px', children, ...props }) {
  return (
    <Column {...props} width="100%" minHeight="100vh" paddingBottom="6" maxWidth={maxWidth} paddingX="6" style={{ margin: '0 auto' }}>
      {children}
    </Column>
  );
}
