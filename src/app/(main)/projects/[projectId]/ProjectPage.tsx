'use client';

import { ProjectOverview } from './ProjectOverview';

export function ProjectPage({ projectId }: { projectId: string }) {
  return <ProjectOverview projectId={projectId} />;
}
