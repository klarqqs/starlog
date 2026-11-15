import type { Metadata } from 'next';
import { ApiMetricsPage } from './ApiMetricsPage';

export default async function ({ params }: { params: Promise<{ websiteId: string }> }) {
  const { websiteId } = await params;
  return <ApiMetricsPage websiteId={websiteId} />;
}

export const metadata: Metadata = {
  title: 'API traffic',
};
