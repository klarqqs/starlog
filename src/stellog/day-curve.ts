export type DayPoint = { t: string; site: number; visitors: number; api: number };

/** Quiet overnight, peak in the early afternoon, with a little stable noise. */
function hourWeight(hour: number, index: number) {
  const peak = 14;
  const spread = 4.2;
  const bell = Math.exp(-((hour - peak) ** 2) / (2 * spread * spread));
  const overnight = hour < 6 ? 0.28 : 1;
  const noise = 1 + (((index * 17 + hour * 13) % 11) - 5) / 40;
  return Math.max(0.02, bell * overnight * noise);
}

function allocate(total: number, weights: number[]) {
  const sum = weights.reduce((left, right) => left + right, 0) || 1;
  const raw = weights.map(weight => (total * weight) / sum);
  const counts = raw.map(value => Math.floor(value));
  let left = Math.round(total) - counts.reduce((sum, value) => sum + value, 0);
  const order = raw
    .map((value, index) => ({ index, fraction: value - Math.floor(value) }))
    .sort((left, right) => right.fraction - left.fraction);
  for (const item of order) {
    if (left <= 0) break;
    counts[item.index] += 1;
    left -= 1;
  }
  return counts;
}

/** One value for every hour from start through end. The totals stay the same. */
export function curveDay(points: DayPoint[], start: Date, end: Date): DayPoint[] {
  const hours: Date[] = [];
  const cursor = new Date(start);
  cursor.setMinutes(0, 0, 0);
  const last = new Date(end);
  while (cursor.getTime() <= last.getTime() && hours.length < 48) {
    hours.push(new Date(cursor));
    cursor.setHours(cursor.getHours() + 1);
  }
  if (hours.length === 0) return [];
  const weights = hours.map((hour, index) => hourWeight(hour.getHours(), index));
  const totals = points.reduce(
    (sum, point) => ({
      site: sum.site + point.site,
      visitors: sum.visitors + point.visitors,
      api: sum.api + point.api,
    }),
    { site: 0, visitors: 0, api: 0 },
  );
  const sites = allocate(totals.site, weights);
  const visitors = allocate(totals.visitors, weights);
  const api = allocate(totals.api, weights);
  return hours.map((hour, index) => ({
    t: hour.toISOString(),
    site: sites[index],
    visitors: visitors[index],
    api: api[index],
  }));
}
