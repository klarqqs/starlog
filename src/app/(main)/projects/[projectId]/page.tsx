import type { Metadata } from 'next';
import { ProjectPage } from './ProjectPage';

export default async function ({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectPage projectId={projectId} />;
}

export const metadata: Metadata = {
  title: 'Project',
};
