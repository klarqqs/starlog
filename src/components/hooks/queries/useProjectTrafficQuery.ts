import type { ProjectTraffic } from '@/stellog/project-traffic';
import { useApi } from '../useApi';
import { useProjectDateRange } from '../useProjectDateRange';
import { useTimezone } from '../useTimezone';

/** Combined website overview for every project the signed-in account can see. */
export function useProjectTrafficQuery() {
  const { get, useQuery } = useApi();
  const { range, value, setValue } = useProjectDateRange();
  const { timezone } = useTimezone();
  const startAt = range?.startDate.getTime();
  const endAt = range?.endDate.getTime();

  const query = useQuery({
    queryKey: ['project-traffic', startAt, endAt, range?.unit, timezone],
    queryFn: () =>
      get('/me/traffic', {
        startAt,
        endAt,
        unit: range?.unit,
        timezone,
      }) as Promise<ProjectTraffic>,
    enabled: startAt != null && endAt != null,
  });

  return { ...query, value, setValue, range };
}
