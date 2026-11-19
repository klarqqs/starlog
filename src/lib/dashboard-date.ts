import { DATE_RANGE_CONFIG } from '@/lib/constants';
import { getItem, setItem } from '@/lib/storage';

/** Shared dashboard window. A change on any screen is kept until the next change. */
export const DASHBOARD_DATE_RANGE = '30day';

export function resolveDateRange(queryDate?: string) {
  const saved = getItem(DATE_RANGE_CONFIG);
  const stored = typeof saved === 'string' ? saved : '';
  return queryDate || stored || DASHBOARD_DATE_RANGE;
}

export function rememberDateRange(value: string) {
  if (value) {
    setItem(DATE_RANGE_CONFIG, value);
  }
}
