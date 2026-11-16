import { useMemo } from 'react';
import { DATE_RANGE_CONFIG } from '@/lib/constants';
import { parseDateRange } from '@/lib/date';
import { getItem } from '@/lib/storage';
import { useLocale } from './useLocale';
import { useNavigation } from './useNavigation';

export const PROJECT_DEFAULT_RANGE = '30day';

/** Date range for Overview, APIs, and Setup. Defaults to the last 30 days. */
export function useProjectDateRange() {
  const {
    query: { date = '', unit = '' },
    router,
    updateParams,
  } = useNavigation();
  const { locale } = useLocale();
  const value = date || getItem(DATE_RANGE_CONFIG) || PROJECT_DEFAULT_RANGE;

  const range = useMemo(
    () =>
      parseDateRange(value, unit, locale) ?? parseDateRange(PROJECT_DEFAULT_RANGE, unit, locale),
    [value, unit, locale],
  );

  return {
    value,
    range,
    setValue: (next: string) => router.push(updateParams({ date: next })),
  };
}
