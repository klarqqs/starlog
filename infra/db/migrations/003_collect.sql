-- Starlog 003: doors for the web tracker and API ingest.
-- Visitor hashes are stored for one day so unique visitors can be counted.
-- Tenants and operators cannot read them.
\set ON_ERROR_STOP on

CREATE TABLE IF NOT EXISTS starlog.web_seen (
  tenant_id    uuid NOT NULL REFERENCES starlog.tenants(id) ON DELETE CASCADE,
  site_id      uuid NOT NULL REFERENCES starlog.sites(id) ON DELETE CASCADE,
  day          date NOT NULL,
  visitor_hash bytea NOT NULL,
  PRIMARY KEY (site_id, day, visitor_hash)
);

REVOKE ALL ON starlog.web_seen FROM PUBLIC;
GRANT SELECT, INSERT ON starlog.web_seen TO starlog_ingest;
ALTER TABLE starlog.web_seen ENABLE ROW LEVEL SECURITY;
ALTER TABLE starlog.web_seen FORCE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ing_seen_sel ON starlog.web_seen;
DROP POLICY IF EXISTS ing_seen_ins ON starlog.web_seen;
CREATE POLICY ing_seen_sel ON starlog.web_seen FOR SELECT TO starlog_ingest
  USING (tenant_id = starlog.current_tenant());
CREATE POLICY ing_seen_ins ON starlog.web_seen FOR INSERT TO starlog_ingest
  WITH CHECK (
    tenant_id = starlog.current_tenant()
    AND EXISTS (
      SELECT 1 FROM starlog.sites s
      WHERE s.id = site_id AND s.tenant_id = starlog.current_tenant()
    )
  );

-- Look up a web site before a tenant is set on the connection.
CREATE OR REPLACE FUNCTION starlog.resolve_web_site(p_site uuid)
RETURNS TABLE (tenant_id uuid, domain text)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT s.tenant_id, s.domain
     FROM sites s JOIN tenants t ON t.id = s.tenant_id
    WHERE s.id = p_site AND s.kind = 'web' AND t.status = 'active' $$;
REVOKE ALL ON FUNCTION starlog.resolve_web_site(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION starlog.resolve_web_site(uuid) TO starlog_ingest;

CREATE OR REPLACE FUNCTION starlog.create_ingest_token(p_hash bytea, p_label text)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE tid uuid := starlog.current_tenant(); new_id uuid;
BEGIN
  IF tid IS NULL OR NOT EXISTS (SELECT 1 FROM tenants WHERE id = tid AND status = 'active') THEN
    RAISE EXCEPTION 'tenant required';
  END IF;
  INSERT INTO ingest_tokens (tenant_id, token_hash, label)
  VALUES (tid, p_hash, left(nullif(btrim(p_label), ''), 40))
  RETURNING id INTO new_id;
  RETURN new_id;
END $$;
REVOKE ALL ON FUNCTION starlog.create_ingest_token(bytea, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION starlog.create_ingest_token(bytea, text) TO starlog_tenant;

CREATE OR REPLACE FUNCTION starlog.list_ingest_tokens()
RETURNS TABLE (id uuid, label text, created_at timestamptz, revoked_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT id, label, created_at, revoked_at FROM ingest_tokens
    WHERE tenant_id = starlog.current_tenant() ORDER BY created_at DESC $$;
REVOKE ALL ON FUNCTION starlog.list_ingest_tokens() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION starlog.list_ingest_tokens() TO starlog_tenant;

CREATE OR REPLACE FUNCTION starlog.revoke_ingest_token(p_id uuid)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE n int;
BEGIN
  UPDATE ingest_tokens SET revoked_at = coalesce(revoked_at, now())
   WHERE id = p_id AND tenant_id = starlog.current_tenant();
  GET DIAGNOSTICS n = ROW_COUNT;
  RETURN n > 0;
END $$;
REVOKE ALL ON FUNCTION starlog.revoke_ingest_token(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION starlog.revoke_ingest_token(uuid) TO starlog_tenant;
