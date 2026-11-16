const UNITS = new Set(['minute', 'hour', 'day', 'month', 'year']);

/** A timezone safe to interpolate into `at time zone`. Anything else is UTC. */
export function sqlTimezone(timezone?: string) {
  if (timezone && /^[A-Za-z0-9_+/-]{1,64}$/.test(timezone) && !timezone.includes('--')) {
    return timezone;
  }
  return 'UTC';
}

/** Buckets the chart can ask Postgres to format. A week is drawn as days. */
export function chartUnit(unit?: string) {
  if (unit && UNITS.has(unit)) return unit;
  return 'day';
}

export function emptyWeekly() {
  return Array.from({ length: 7 }, () => Array.from({ length: 24 }, () => 0));
}
