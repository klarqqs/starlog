import type { CSSProperties, ReactNode } from 'react';
import { Logo } from '@/components/svg';

export const authLinkStyle: CSSProperties = {
  fontWeight: 700,
  color: 'inherit',
  textDecoration: 'none',
};

export function AuthBar({ action }: { action?: ReactNode }) {
  return (
    <header
      style={{
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '20px 28px',
        zIndex: 2,
      }}
    >
      <a href="/" style={{ ...authLinkStyle, display: 'inline-flex', alignItems: 'center', gap: 8 }}>
        <Logo width={22} height={22} />
        Stellog
      </a>
      {action}
    </header>
  );
}
