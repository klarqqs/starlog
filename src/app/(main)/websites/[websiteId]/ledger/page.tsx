import type { Metadata } from 'next';
import { LedgerPage } from './LedgerPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <LedgerPage websiteId={websiteId} />;
}

export const metadata: Metadata = {
  title: 'Ledger',
};
