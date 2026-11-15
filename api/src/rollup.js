// Writes one pageview, or one API observation, inside a transaction whose tenant is already set.

export async function recordPageview(c, siteId, ev) {
  const seen = await c.query(
    `INSERT INTO starlog.web_seen (tenant_id, site_id, day, visitor_hash)
     VALUES (starlog.current_tenant(), $1, current_date, $2)
     ON CONFLICT DO NOTHING RETURNING site_id`,
    [siteId, ev.visitorHash]);
  await c.query(
    `INSERT INTO starlog.web_daily (tenant_id, site_id, day, page_views, visitors, sessions)
     VALUES (starlog.current_tenant(), $1, current_date, 1, $2, $3)
     ON CONFLICT (site_id, day) DO UPDATE SET
       page_views = starlog.web_daily.page_views + 1,
       visitors = starlog.web_daily.visitors + EXCLUDED.visitors,
       sessions = starlog.web_daily.sessions + EXCLUDED.sessions`,
    [siteId, seen.rowCount ? 1 : 0, ev.newSession ? 1 : 0]);
  for (const [dim, key] of ev.dims) {
    if (!key) continue;
    await c.query(
      `INSERT INTO starlog.web_dim_daily (tenant_id, site_id, day, dim, key, views)
       VALUES (starlog.current_tenant(), $1, current_date, $2, $3, 1)
       ON CONFLICT (site_id, day, dim, key) DO UPDATE SET views = starlog.web_dim_daily.views + 1`,
      [siteId, dim, String(key).slice(0, 120)]);
  }
}

export async function recordApi(c, siteId, point) {
  const buckets = [0, 0, 0, 0, 0, 0, 0, 0, 0];
  buckets[point.bucket] = 1;
  await c.query(
    `INSERT INTO starlog.api_hourly (tenant_id, site_id, hour, route, status_code, requests, latency_sum_ms, latency_buckets)
     VALUES (starlog.current_tenant(), $1, date_trunc('hour', now()), $2, $3, 1, $4, $5::bigint[])
     ON CONFLICT (site_id, hour, route, status_code) DO UPDATE SET
       requests = starlog.api_hourly.requests + 1,
       latency_sum_ms = starlog.api_hourly.latency_sum_ms + EXCLUDED.latency_sum_ms,
       latency_buckets = ARRAY(
         SELECT starlog.api_hourly.latency_buckets[i] + EXCLUDED.latency_buckets[i]
         FROM generate_series(1, 9) AS i
         ORDER BY i
       )`,
    [siteId, point.route, point.status, point.latency, buckets]);
}
