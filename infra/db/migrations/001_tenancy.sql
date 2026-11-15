-- Starlog 001: multi-tenant schema with row-level security (RLS).
-- Requires psql variables: tenant_pw, operator_pw, ingest_pw (see init script).
-- Principle: isolation is enforced by Postgres itself, so an application bug
-- cannot leak another tenant's rows. Every policy fails closed.

\set ON_ERROR_STOP on

-- ---------------------------------------------------------------- roles
-- Three login roles, one per kind of caller. None can bypass RLS.
SELECT format('CREATE ROLE starlog_tenant   LOGIN PASSWORD %L NOBYPASSRLS', :'tenant_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlog_tenant') \gexec
SELECT format('CREATE ROLE starlog_operator LOGIN PASSWORD %L NOBYPASSRLS', :'operator_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlog_operator') \gexec
SELECT format('CREATE ROLE starlog_ingest   LOGIN PASSWORD %L NOBYPASSRLS', :'ingest_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlog_ingest') \gexec

CREATE SCHEMA IF NOT EXISTS starlog;
REVOKE ALL ON SCHEMA starlog FROM PUBLIC;
GRANT USAGE ON SCHEMA starlog TO starlog_tenant, starlog_operator, starlog_ingest;
ALTER DEFAULT PRIVILEGES IN SCHEMA starlog REVOKE EXECUTE ON FUNCTIONS FROM PUBLIC;

-- ---------------------------------------------------------------- tenant context
-- The API sets this once per transaction:  SELECT set_config('app.tenant_id', '<uuid>', true);
-- If it is unset or empty, current_tenant() is NULL and every tenant policy matches nothing.
CREATE FUNCTION starlog.current_tenant() RETURNS uuid
LANGUAGE sql STABLE AS
$$ SELECT nullif(current_setting('app.tenant_id', true), '')::uuid $$;
GRANT EXECUTE ON FUNCTION starlog.current_tenant() TO starlog_tenant, starlog_operator, starlog_ingest;

-- ---------------------------------------------------------------- tables
CREATE TABLE starlog.tenants (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug          text NOT NULL UNIQUE CHECK (slug ~ '^[a-z0-9][a-z0-9-]{1,40}$'),
  name          text NOT NULL,
  status        text NOT NULL DEFAULT 'active' CHECK (status IN ('active','removed')),
  share_enabled boolean NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE starlog.users (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     uuid REFERENCES starlog.tenants(id) ON DELETE CASCADE,
  email         text NOT NULL,
  password_hash text NOT NULL,                       -- argon2id, hashed by the API
  role          text NOT NULL CHECK (role IN ('tenant','operator')),
  created_at    timestamptz NOT NULL DEFAULT now(),
  CHECK ((role = 'operator') = (tenant_id IS NULL))  -- operators belong to no tenant
);
CREATE UNIQUE INDEX users_email_uq ON starlog.users (lower(email));

CREATE TABLE starlog.sites (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES starlog.tenants(id) ON DELETE CASCADE,
  kind       text NOT NULL CHECK (kind IN ('web','api')),
  domain     text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, kind, domain)
);

-- Ingest tokens (OpenTelemetry + web collector). Only the hash is stored.
CREATE TABLE starlog.ingest_tokens (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id  uuid NOT NULL REFERENCES starlog.tenants(id) ON DELETE CASCADE,
  token_hash bytea NOT NULL UNIQUE,                  -- sha256 of the token
  label      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Operator keys for machine consumers of metrics.
CREATE TABLE starlog.operator_api_keys (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  key_hash   bytea NOT NULL UNIQUE,
  scope      text NOT NULL DEFAULT 'read:metrics',
  label      text,
  created_at timestamptz NOT NULL DEFAULT now(),
  revoked_at timestamptz
);

-- Web rollups (daily).
CREATE TABLE starlog.web_daily (
  tenant_id        uuid NOT NULL REFERENCES starlog.tenants(id) ON DELETE CASCADE,
  site_id          uuid NOT NULL REFERENCES starlog.sites(id) ON DELETE CASCADE,
  day              date NOT NULL,
  page_views       bigint NOT NULL DEFAULT 0,
  visitors         bigint NOT NULL DEFAULT 0,
  sessions         bigint NOT NULL DEFAULT 0,
  bounces          bigint NOT NULL DEFAULT 0,
  total_duration_s bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day)
);
CREATE INDEX web_daily_tenant_day ON starlog.web_daily (tenant_id, day);

CREATE TABLE starlog.web_dim_daily (
  tenant_id uuid NOT NULL REFERENCES starlog.tenants(id) ON DELETE CASCADE,
  site_id   uuid NOT NULL REFERENCES starlog.sites(id) ON DELETE CASCADE,
  day       date NOT NULL,
  dim       text NOT NULL CHECK (dim IN ('referrer','country','device','browser')),
  key       text NOT NULL,
  views     bigint NOT NULL DEFAULT 0,
  PRIMARY KEY (site_id, day, dim, key)
);
CREATE INDEX web_dim_tenant_day ON starlog.web_dim_daily (tenant_id, day);

-- API rollups (hourly). latency_buckets are cumulative-free counts per bucket;
-- bucket upper bounds (ms) are fixed: 10,25,50,100,250,500,1000,2500,+inf.
CREATE TABLE starlog.api_hourly (
  tenant_id       uuid NOT NULL REFERENCES starlog.tenants(id) ON DELETE CASCADE,
  site_id         uuid NOT NULL REFERENCES starlog.sites(id) ON DELETE CASCADE,
  hour            timestamptz NOT NULL,
  route           text NOT NULL,                     -- normalized http.route
  status_code     smallint NOT NULL,
  requests        bigint NOT NULL DEFAULT 0,
  latency_sum_ms  double precision NOT NULL DEFAULT 0,
  latency_buckets bigint[] NOT NULL DEFAULT ARRAY[0,0,0,0,0,0,0,0,0]::bigint[],
  PRIMARY KEY (site_id, hour, route, status_code),
  CHECK (hour = date_trunc('hour', hour)),
  CHECK (array_length(latency_buckets, 1) = 9)
);
CREATE INDEX api_hourly_tenant_hour ON starlog.api_hourly (tenant_id, hour);

-- ---------------------------------------------------------------- privileges
REVOKE ALL ON ALL TABLES IN SCHEMA starlog FROM PUBLIC;

-- Tenants: read own data, manage own sites, toggle own sharing.
GRANT SELECT ON starlog.tenants, starlog.users, starlog.sites,
                starlog.web_daily, starlog.web_dim_daily, starlog.api_hourly TO starlog_tenant;
GRANT INSERT, DELETE ON starlog.sites TO starlog_tenant;
GRANT UPDATE (name, share_enabled) ON starlog.tenants TO starlog_tenant;

-- Operators: read everything except secrets; can remove or restore tenants and manage keys.
GRANT SELECT ON starlog.tenants, starlog.sites, starlog.web_daily,
                starlog.web_dim_daily, starlog.api_hourly TO starlog_operator;
GRANT SELECT (id, tenant_id, email, role, created_at) ON starlog.users TO starlog_operator;
GRANT UPDATE (status) ON starlog.tenants TO starlog_operator;
GRANT SELECT, INSERT ON starlog.operator_api_keys TO starlog_operator;
GRANT UPDATE (revoked_at) ON starlog.operator_api_keys TO starlog_operator;

-- Ingest: write rollups for the tenant resolved from the token. Nothing else.
GRANT SELECT, INSERT, UPDATE ON starlog.web_daily, starlog.web_dim_daily, starlog.api_hourly TO starlog_ingest;
GRANT SELECT ON starlog.sites TO starlog_ingest;

-- ---------------------------------------------------------------- row-level security
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['tenants','users','sites','ingest_tokens','operator_api_keys',
                           'web_daily','web_dim_daily','api_hourly'] LOOP
    EXECUTE format('ALTER TABLE starlog.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('ALTER TABLE starlog.%I FORCE ROW LEVEL SECURITY', t);   -- applies to the table owner too
  END LOOP;
END $$;

-- Tenant policies: a row is visible only when it belongs to the current tenant.
CREATE POLICY tenant_self        ON starlog.tenants  FOR SELECT TO starlog_tenant USING (id = starlog.current_tenant());
CREATE POLICY tenant_self_update ON starlog.tenants  FOR UPDATE TO starlog_tenant
  USING (id = starlog.current_tenant() AND status = 'active') WITH CHECK (id = starlog.current_tenant());
CREATE POLICY tenant_users       ON starlog.users    FOR SELECT TO starlog_tenant USING (tenant_id = starlog.current_tenant());
CREATE POLICY tenant_sites_sel   ON starlog.sites    FOR SELECT TO starlog_tenant USING (tenant_id = starlog.current_tenant());
CREATE POLICY tenant_sites_ins   ON starlog.sites    FOR INSERT TO starlog_tenant WITH CHECK (tenant_id = starlog.current_tenant());
CREATE POLICY tenant_sites_del   ON starlog.sites    FOR DELETE TO starlog_tenant USING (tenant_id = starlog.current_tenant());
CREATE POLICY tenant_web         ON starlog.web_daily     FOR SELECT TO starlog_tenant USING (tenant_id = starlog.current_tenant());
CREATE POLICY tenant_web_dim     ON starlog.web_dim_daily FOR SELECT TO starlog_tenant USING (tenant_id = starlog.current_tenant());
CREATE POLICY tenant_api         ON starlog.api_hourly    FOR SELECT TO starlog_tenant USING (tenant_id = starlog.current_tenant());

-- Operator policies: global read, plus removing tenants and managing keys.
CREATE POLICY op_tenants_sel ON starlog.tenants       FOR SELECT TO starlog_operator USING (true);
CREATE POLICY op_tenants_upd ON starlog.tenants       FOR UPDATE TO starlog_operator USING (true) WITH CHECK (true);
CREATE POLICY op_users       ON starlog.users         FOR SELECT TO starlog_operator USING (true);
CREATE POLICY op_sites       ON starlog.sites         FOR SELECT TO starlog_operator USING (true);
CREATE POLICY op_web         ON starlog.web_daily     FOR SELECT TO starlog_operator USING (true);
CREATE POLICY op_web_dim     ON starlog.web_dim_daily FOR SELECT TO starlog_operator USING (true);
CREATE POLICY op_api         ON starlog.api_hourly    FOR SELECT TO starlog_operator USING (true);
CREATE POLICY op_keys_sel    ON starlog.operator_api_keys FOR SELECT TO starlog_operator USING (true);
CREATE POLICY op_keys_ins    ON starlog.operator_api_keys FOR INSERT TO starlog_operator WITH CHECK (true);
CREATE POLICY op_keys_upd    ON starlog.operator_api_keys FOR UPDATE TO starlog_operator USING (true) WITH CHECK (true);

-- Ingest policies: only the tenant resolved from the token, and only active tenants.
CREATE POLICY ing_sites ON starlog.sites FOR SELECT TO starlog_ingest USING (tenant_id = starlog.current_tenant());
CREATE POLICY ing_web_sel ON starlog.web_daily     FOR SELECT TO starlog_ingest USING (tenant_id = starlog.current_tenant());
CREATE POLICY ing_web_ins ON starlog.web_daily     FOR INSERT TO starlog_ingest WITH CHECK (tenant_id = starlog.current_tenant());
CREATE POLICY ing_web_upd ON starlog.web_daily     FOR UPDATE TO starlog_ingest USING (tenant_id = starlog.current_tenant()) WITH CHECK (tenant_id = starlog.current_tenant());
CREATE POLICY ing_dim_sel ON starlog.web_dim_daily FOR SELECT TO starlog_ingest USING (tenant_id = starlog.current_tenant());
CREATE POLICY ing_dim_ins ON starlog.web_dim_daily FOR INSERT TO starlog_ingest WITH CHECK (tenant_id = starlog.current_tenant());
CREATE POLICY ing_dim_upd ON starlog.web_dim_daily FOR UPDATE TO starlog_ingest USING (tenant_id = starlog.current_tenant()) WITH CHECK (tenant_id = starlog.current_tenant());
CREATE POLICY ing_api_sel ON starlog.api_hourly    FOR SELECT TO starlog_ingest USING (tenant_id = starlog.current_tenant());
CREATE POLICY ing_api_ins ON starlog.api_hourly    FOR INSERT TO starlog_ingest WITH CHECK (tenant_id = starlog.current_tenant());
CREATE POLICY ing_api_upd ON starlog.api_hourly    FOR UPDATE TO starlog_ingest USING (tenant_id = starlog.current_tenant()) WITH CHECK (tenant_id = starlog.current_tenant());
-- ingest_tokens and (for tenants/ingest) operator_api_keys have no policy: no direct access.

-- ---------------------------------------------------------------- narrow SECURITY DEFINER doors
-- Each function does one job, pins its search_path, and returns the minimum.

-- Login: look up a user by email before any tenant context exists.
CREATE FUNCTION starlog.login_lookup(p_email text)
RETURNS TABLE (user_id uuid, tenant_id uuid, role text, password_hash text)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT u.id, u.tenant_id, u.role, u.password_hash
     FROM users u JOIN tenants t ON t.id = u.tenant_id OR u.tenant_id IS NULL
    WHERE lower(u.email) = lower(p_email)
      AND (u.role = 'operator' OR t.status = 'active')
    LIMIT 1 $$;
GRANT EXECUTE ON FUNCTION starlog.login_lookup(text) TO starlog_tenant, starlog_operator;

-- Ingest: swap a token hash for its tenant id. Revoked tokens and removed tenants resolve to NULL.
CREATE FUNCTION starlog.resolve_ingest_token(p_hash bytea) RETURNS uuid
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT k.tenant_id FROM ingest_tokens k JOIN tenants t ON t.id = k.tenant_id
    WHERE k.token_hash = p_hash AND k.revoked_at IS NULL AND t.status = 'active' $$;
GRANT EXECUTE ON FUNCTION starlog.resolve_ingest_token(bytea) TO starlog_ingest;

-- Operator API key check for machine consumers.
CREATE FUNCTION starlog.check_operator_key(p_hash bytea) RETURNS boolean
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT EXISTS (SELECT 1 FROM operator_api_keys WHERE key_hash = p_hash AND revoked_at IS NULL) $$;
GRANT EXECUTE ON FUNCTION starlog.check_operator_key(bytea) TO starlog_operator;

-- Public share links: aggregate totals only, and only while sharing is on.
CREATE FUNCTION starlog.shared_web_totals(p_slug text, p_days int DEFAULT 30)
RETURNS TABLE (name text, page_views bigint, visitors bigint, bounce_rate numeric, avg_session_s numeric)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT t.name,
          coalesce(sum(w.page_views),0)::bigint,
          coalesce(sum(w.visitors),0)::bigint,
          round(100.0 * sum(w.bounces) / nullif(sum(w.sessions),0), 1),
          round(sum(w.total_duration_s)::numeric / nullif(sum(w.sessions),0), 0)
     FROM tenants t LEFT JOIN web_daily w
       ON w.tenant_id = t.id AND w.day >= current_date - least(greatest(p_days,1),365)
    WHERE t.slug = p_slug AND t.share_enabled AND t.status = 'active'
    GROUP BY t.id, t.name $$;
GRANT EXECUTE ON FUNCTION starlog.shared_web_totals(text, int) TO starlog_tenant, starlog_operator;
