import type { ProjectReport } from '@/stellog/project-reports';
import { useApi } from '../useApi';
import { useProjectDateRange } from '../useProjectDateRange';

/** One report section across every project the signed-in account can see. */
export function useProjectReportQuery(section: string) {
  const { get, useQuery } = useApi();
  const { range, value, setValue } = useProjectDateRange();
  const startAt = range?.startDate.getTime();
  const endAt = range?.endDate.getTime();

  const query = useQuery({
    queryKey: ['project-report', section, startAt, endAt],
    queryFn: () => get('/me/reports', { section, startAt, endAt }) as Promise<ProjectReport>,
    enabled: startAt != null && endAt != null,
  });

  return { ...query, value, setValue, range };
}
