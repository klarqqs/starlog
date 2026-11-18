import type { Metadata } from 'next';
import { ProjectSetupPage } from './ProjectSetupPage';

export default async function ({ params }: { params: Promise<{ projectId: string }> }) {
  const { projectId } = await params;
  return <ProjectSetupPage projectId={projectId} />;
}

export const metadata: Metadata = {
  title: 'Setup',
};
