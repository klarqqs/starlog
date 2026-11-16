const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;
const MIN_AGGREGATE_MONTHS = 24;
/** Choice, not a figure from the RFP. Hour rows are the short aggregate. */
const DEFAULT_HOUR_RETENTION_DAYS = 90;

export function rawRetentionHours(env: Record<string, string | undefined> = process.env): number {
  const raw = env.STELLOG_RAW_RETENTION_HOURS ?? '48';
  const hours = Number(raw);
  if (!Number.isFinite(hours) || hours < 1) {
    throw new Error('STELLOG_RAW_RETENTION_HOURS must be a number of at least 1.');
  }
  return hours;
}

export function hourRetentionDays(env: Record<string, string | undefined> = process.env): number {
  const raw = env.STELLOG_HOUR_RETENTION_DAYS ?? String(DEFAULT_HOUR_RETENTION_DAYS);
  const days = Number(raw);
  if (!Number.isFinite(days) || days < 1) {
    throw new Error('STELLOG_HOUR_RETENTION_DAYS must be a number of at least 1.');
  }
  return Math.floor(days);
}

export function aggregateRetentionMonths(
  env: Record<string, string | undefined> = process.env,
): number {
  const raw = env.STELLOG_AGGREGATE_RETENTION_MONTHS ?? String(MIN_AGGREGATE_MONTHS);
  const months = Number(raw);
  if (!Number.isFinite(months)) return MIN_AGGREGATE_MONTHS;
  return Math.max(MIN_AGGREGATE_MONTHS, Math.floor(months));
}

export function rawCutoff(now: Date, env: Record<string, string | undefined> = process.env): Date {
  return new Date(now.getTime() - rawRetentionHours(env) * HOUR_MS);
}

export function hourCutoff(now: Date, env: Record<string, string | undefined> = process.env): Date {
  return new Date(now.getTime() - hourRetentionDays(env) * DAY_MS);
}

/** Calendar months, never fewer than 24. */
export function aggregateCutoff(
  now: Date,
  env: Record<string, string | undefined> = process.env,
): Date {
  const cutoff = new Date(now.getTime());
  cutoff.setUTCMonth(cutoff.getUTCMonth() - aggregateRetentionMonths(env));
  return cutoff;
}

export function startOfUtcHour(date: Date): Date {
  const next = new Date(date.getTime());
  next.setUTCMinutes(0, 0, 0);
  return next;
}

export function startOfUtcDay(date: Date): Date {
  const next = new Date(date.getTime());
  next.setUTCHours(0, 0, 0, 0);
  return next;
}

const FUTURE_SKEW_MS = 5 * 60 * 1000;

export function acceptedObservationTime(observedAt: Date, now: Date): boolean {
  const earliest = aggregateCutoff(now);
  return (
    observedAt.getTime() >= earliest.getTime() &&
    observedAt.getTime() <= now.getTime() + FUTURE_SKEW_MS
  );
}
