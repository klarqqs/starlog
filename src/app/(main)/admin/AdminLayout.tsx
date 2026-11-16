'use client';
import type { ReactNode } from 'react';
import { PageBody } from '@/components/common/PageBody';
import { useLoginQuery, useNavigation } from '@/components/hooks';

export function AdminLayout({ children }: { children: ReactNode }) {
  const { user } = useLoginQuery();
  const { pathname } = useNavigation();
  const isOperator = !!user?.isOperator && !user?.isAdmin;
  const allowed = !!user?.isAdmin || (isOperator && pathname.startsWith('/admin/projects'));

  if (!allowed || process.env.cloudMode) {
    return null;
  }

  return <PageBody>{children}</PageBody>;
}
