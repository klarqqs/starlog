'use client';
import { Column } from '@umami/react-zen';
import type { ReactNode } from 'react';
import { PageBody } from '@/components/common/PageBody';

export function SettingsLayout({ children }: { children: ReactNode }) {
  return (
    <PageBody>
      <Column gap="6" margin="2" width="100%">
        {children}
      </Column>
    </PageBody>
  );
}
