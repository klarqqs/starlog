'use client';

import { useApi, useDateRange, useModified } from '@/components/hooks';
import type { ProjectView } from '@/stellog/project-view';

export function useProjectView(projectId: string) {
  const { get, useQuery } = useApi();
  const { dateRange } = useDateRange();
  const { modified } = useModified('websites');
  const startAt = dateRange.startDate.getTime();
  const endAt = dateRange.endDate.getTime();

  return useQuery({
    queryKey: ['project', projectId, startAt, endAt, modified],
    queryFn: () =>
      get(`/projects/${projectId}`, {
        startAt,
        endAt,
        unit: dateRange.unit,
      }) as Promise<ProjectView>,
  });
}
