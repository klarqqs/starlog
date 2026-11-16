/** Choice, not a figure from the RFP. Distinct routes past this cap share the "other" bucket. */
export const ROUTE_CAP_PER_TEAM_HOUR = 100;

export function routeCapLimit(env: Record<string, string | undefined> = process.env): number {
  const raw = env.STELLOG_ROUTE_CAP ?? String(ROUTE_CAP_PER_TEAM_HOUR);
  const cap = Number(raw);
  if (!Number.isFinite(cap) || cap < 1) return ROUTE_CAP_PER_TEAM_HOUR;
  return Math.floor(cap);
}

/** Adds a new route to `known` until the cap, then maps further routes to "other". */
export function assignRouteCap(known: Set<string>, route: string, cap: number): string {
  if (route === 'other' || known.has(route)) return route;
  if (known.size >= cap) return 'other';
  known.add(route);
  return route;
}
