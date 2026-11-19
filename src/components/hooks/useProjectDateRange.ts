import { useMemo } from 'react';
import { DASHBOARD_DATE_RANGE, rememberDateRange, resolveDateRange } from '@/lib/dashboard-date';
import { parseDateRange } from '@/lib/date';
import { useLocale } from './useLocale';
import { useNavigation } from './useNavigation';

export const PROJECT_DEFAULT_RANGE = DASHBOARD_DATE_RANGE;

/** Date range for Overview, APIs, and Setup. The same window as the rest of the dashboard. */
export function useProjectDateRange() {
  const {
    query: { date = '', unit = '' },
    router,
    updateParams,
  } = useNavigation();
  const { locale } = useLocale();
  const value = resolveDateRange(date);

  const range = useMemo(
    () =>
      parseDateRange(value, unit, locale) ?? parseDateRange(PROJECT_DEFAULT_RANGE, unit, locale),
    [value, unit, locale],
  );

  return {
    value,
    range,
    setValue: (next: string) => {
      rememberDateRange(next);
      router.push(updateParams({ date: next }));
    },
  };
}
