import type { Metadata } from 'next';
import { ProjectApisPage } from './ProjectApisPage';

export default async function ({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectApisPage projectId={projectId} />;
}

export const metadata: Metadata = {
  title: 'APIs',
};
