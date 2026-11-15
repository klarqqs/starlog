// Path normalization and latency histograms for API metrics.
// Bucket upper bounds (ms) match starlog.api_hourly: 10, 25, 50, 100, 250, 500, 1000, 2500, +inf.

export const BOUNDS = [10, 25, 50, 100, 250, 500, 1000, 2500, 10000];

const STRKEY = /\/M[A-Z2-7]{68}(?=\/|$)/g;
const STRKEY_SHORT = /\/[A-Z][A-Z2-7]{55}(?=\/|$)/g;
const UUID = /\/[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}(?=\/|$)/g;
const HEX = /\/[a-fA-F0-9]{32,}(?=\/|$)/g;
const NUM = /\/\d{2,}(?=\/|$)/g;

export function normalizePath(input) {
  let p = String(input || '/').split('?')[0].split('#')[0];
  if (!p.startsWith('/')) p = `/${p}`;
  p = p.replace(STRKEY, '/:id').replace(STRKEY_SHORT, '/:id').replace(UUID, '/:id').replace(HEX, '/:id').replace(NUM, '/:id');
  p = p.toLowerCase().replace(/\/{2,}/g, '/');
  if (p.length > 1 && p.endsWith('/')) p = p.slice(0, -1);
  return (p || '/').slice(0, 200);
}

export function bucketIndex(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return -1;
  for (let i = 0; i < BOUNDS.length; i++) if (n <= BOUNDS[i]) return i;
  return BOUNDS.length - 1;
}

export function percentile(buckets, p) {
  const counts = (buckets || []).map(Number);
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return null;
  const target = Math.ceil(p * total);
  let acc = 0;
  for (let i = 0; i < counts.length; i++) {
    acc += counts[i];
    if (acc >= target) return BOUNDS[i] ?? BOUNDS.at(-1);
  }
  return BOUNDS.at(-1);
}

export function addBuckets(into, add) {
  for (let i = 0; i < BOUNDS.length; i++) into[i] = (into[i] || 0) + Number(add?.[i] || 0);
  return into;
}
