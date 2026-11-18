import type { Metadata } from 'next';
import { ProjectLedgerPage } from './ProjectLedgerPage';

export default async function ({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectLedgerPage projectId={projectId} />;
}

export const metadata: Metadata = {
  title: 'Ledger',
};
