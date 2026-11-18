import type { Metadata } from 'next';
import { ProjectWebsitesPage } from './ProjectWebsitesPage';

export default async function ({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectWebsitesPage projectId={projectId} />;
}

export const metadata: Metadata = {
  title: 'Websites',
};
