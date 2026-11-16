import type { MyOverview } from '@/stellog/my-overview';
import { useApi } from '../useApi';
import { useProjectDateRange } from '../useProjectDateRange';

/** The signed-in project's sites and APIs for the selected date range. */
export function useMyOverviewQuery() {
  const { get, useQuery } = useApi();
  const { range, value, setValue } = useProjectDateRange();
  const startAt = range.startDate.getTime();
  const endAt = range.endDate.getTime();

  const query = useQuery({
    queryKey: ['my-overview', startAt, endAt, range.unit],
    queryFn: () => get('/me/overview', { startAt, endAt, unit: range.unit }) as Promise<MyOverview>,
  });

  return { ...query, value, setValue, range };
}
