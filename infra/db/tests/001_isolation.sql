-- Isolation tests for 001_tenancy.sql. Run as a superuser; each check switches roles.
\set ON_ERROR_STOP on
\set QUIET on

CREATE SCHEMA starlogtest;
GRANT USAGE ON SCHEMA starlogtest TO PUBLIC;
CREATE FUNCTION starlogtest.eq(label text, got bigint, want bigint) RETURNS void
LANGUAGE plpgsql AS $$ BEGIN
  IF got IS DISTINCT FROM want THEN RAISE EXCEPTION 'FAIL %: got %, want %', label, got, want; END IF;
  RAISE NOTICE 'ok   %', label; END $$;
GRANT EXECUTE ON FUNCTION starlogtest.eq(text,bigint,bigint) TO PUBLIC;

-- Seed as superuser (bypasses RLS).
INSERT INTO starlog.tenants (id, slug, name, share_enabled) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','alpha','Alpha',true),
 ('bbbbbbbb-0000-0000-0000-000000000002','beta','Beta',false);
INSERT INTO starlog.users (tenant_id,email,password_hash,role) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','a@alpha.test','h','tenant'),
 ('bbbbbbbb-0000-0000-0000-000000000002','b@beta.test','h','tenant'),
 (NULL,'op@scf.test','h','operator');
INSERT INTO starlog.sites (id,tenant_id,kind,domain) VALUES
 ('a1000000-0000-0000-0000-000000000001','aaaaaaaa-0000-0000-0000-000000000001','web','alpha.test'),
 ('b1000000-0000-0000-0000-000000000002','bbbbbbbb-0000-0000-0000-000000000002','web','beta.test');
INSERT INTO starlog.web_daily (tenant_id,site_id,day,page_views,visitors,sessions,bounces,total_duration_s) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',current_date,100,60,50,20,5000),
 ('bbbbbbbb-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002',current_date,900,500,400,100,40000);
INSERT INTO starlog.ingest_tokens (tenant_id,token_hash,label) VALUES
 ('aaaaaaaa-0000-0000-0000-000000000001', sha256('token-alpha'),'ok'),
 ('aaaaaaaa-0000-0000-0000-000000000001', sha256('token-revoked'),'revoked');
UPDATE starlog.ingest_tokens SET revoked_at = now() WHERE label = 'revoked';
INSERT INTO starlog.operator_api_keys (key_hash,label) VALUES (sha256('op-key'),'k');

-- 1. Tenant A sees only its own rows.
BEGIN;
SET LOCAL ROLE starlog_tenant;
SELECT set_config('app.tenant_id','aaaaaaaa-0000-0000-0000-000000000001',true);
SELECT starlogtest.eq('tenant A sees 1 web row',  (SELECT count(*) FROM starlog.web_daily), 1);
SELECT starlogtest.eq('tenant A sees only itself', (SELECT count(*) FROM starlog.tenants), 1);
SELECT starlogtest.eq('tenant A cannot see B web', (SELECT count(*) FROM starlog.web_daily WHERE tenant_id='bbbbbbbb-0000-0000-0000-000000000002'), 0);
SELECT starlogtest.eq('tenant A sees own users only', (SELECT count(*) FROM starlog.users), 1);
DO $$ BEGIN
  UPDATE starlog.web_daily SET page_views = 0 WHERE site_id = 'b1000000-0000-0000-0000-000000000002';
  RAISE EXCEPTION 'FAIL tenant updated metrics';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok   tenant cannot update metrics'; END $$;
-- Tenant may update its own tenant row (share toggle) but never another tenant's.
UPDATE starlog.tenants SET share_enabled = false WHERE id = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT starlogtest.eq('tenant A update of B tenant row affects 0', (SELECT count(*) FROM starlog.tenants WHERE share_enabled), 1);
DO $$ BEGIN
  INSERT INTO starlog.sites (tenant_id,kind,domain) VALUES ('bbbbbbbb-0000-0000-0000-000000000002','web','evil.test');
  RAISE EXCEPTION 'FAIL tenant A inserted a site into B';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok   tenant A cannot insert site into B'; END $$;
DO $$ BEGIN
  UPDATE starlog.tenants SET status = 'removed' WHERE id = 'aaaaaaaa-0000-0000-0000-000000000001';
  RAISE EXCEPTION 'FAIL tenant changed own status';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok   tenant cannot change status'; END $$;
DO $$ BEGIN
  PERFORM count(*) FROM starlog.ingest_tokens;
  RAISE EXCEPTION 'FAIL tenant read ingest_tokens';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok   tenant cannot read ingest_tokens'; END $$;
DO $$ BEGIN
  PERFORM count(*) FROM starlog.operator_api_keys;
  RAISE EXCEPTION 'FAIL tenant read operator keys';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok   tenant cannot read operator keys'; END $$;
DO $$ BEGIN
  INSERT INTO starlog.web_daily (tenant_id,site_id,day) VALUES ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',current_date-1);
  RAISE EXCEPTION 'FAIL tenant wrote metrics';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok   tenant cannot write metrics'; END $$;
COMMIT;

-- 2. No tenant context fails closed.
BEGIN;
SET LOCAL ROLE starlog_tenant;
SELECT starlogtest.eq('no context: 0 web rows', (SELECT count(*) FROM starlog.web_daily), 0);
SELECT starlogtest.eq('no context: 0 tenants',  (SELECT count(*) FROM starlog.tenants), 0);
COMMIT;

-- 3. A malformed tenant id errors instead of leaking.
BEGIN;
SET LOCAL ROLE starlog_tenant;
SELECT set_config('app.tenant_id',$$' OR 1=1 --$$,true);
DO $$ BEGIN
  PERFORM count(*) FROM starlog.web_daily;
  RAISE EXCEPTION 'FAIL malformed tenant id did not error';
EXCEPTION WHEN invalid_text_representation THEN RAISE NOTICE 'ok   malformed tenant id errors'; END $$;
ROLLBACK;

-- 4. Operator: global read, can remove tenants, cannot read password hashes or write metrics.
BEGIN;
SET LOCAL ROLE starlog_operator;
SELECT starlogtest.eq('operator sees both web rows', (SELECT count(*) FROM starlog.web_daily), 2);
SELECT starlogtest.eq('operator sees both tenants',  (SELECT count(*) FROM starlog.tenants), 2);
UPDATE starlog.tenants SET status = 'removed' WHERE slug = 'beta';
SELECT starlogtest.eq('operator removed beta', (SELECT count(*) FROM starlog.tenants WHERE status='removed'), 1);
DO $$ BEGIN
  PERFORM password_hash FROM starlog.users;
  RAISE EXCEPTION 'FAIL operator read password_hash';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok   operator cannot read password hashes'; END $$;
DO $$ BEGIN
  UPDATE starlog.web_daily SET page_views = 1;
  RAISE EXCEPTION 'FAIL operator wrote metrics';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok   operator cannot write metrics'; END $$;
SELECT starlogtest.eq('operator key valid',   (SELECT starlog.check_operator_key(sha256('op-key')))::int, 1);
SELECT starlogtest.eq('operator key invalid', (SELECT starlog.check_operator_key(sha256('nope')))::int, 0);
ROLLBACK;

-- 5. Ingest: token resolves to one tenant, writes only for that tenant.
BEGIN;
SET LOCAL ROLE starlog_ingest;
SELECT starlogtest.eq('good token resolves', (starlog.resolve_ingest_token(sha256('token-alpha')) IS NOT NULL)::int, 1);
SELECT starlogtest.eq('revoked token is null', (starlog.resolve_ingest_token(sha256('token-revoked')) IS NULL)::int, 1);
SELECT starlogtest.eq('unknown token is null', (starlog.resolve_ingest_token(sha256('x')) IS NULL)::int, 1);
SELECT set_config('app.tenant_id', starlog.resolve_ingest_token(sha256('token-alpha'))::text, true);
INSERT INTO starlog.web_daily (tenant_id,site_id,day,page_views)
  VALUES ('aaaaaaaa-0000-0000-0000-000000000001','a1000000-0000-0000-0000-000000000001',current_date-1,7);
SELECT starlogtest.eq('ingest wrote for own tenant', (SELECT count(*) FROM starlog.web_daily), 2);
DO $$ BEGIN
  INSERT INTO starlog.web_daily (tenant_id,site_id,day,page_views)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000002','b1000000-0000-0000-0000-000000000002',current_date-1,7);
  RAISE EXCEPTION 'FAIL ingest wrote for another tenant';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok   ingest cannot write for another tenant'; END $$;
DO $$ BEGIN
  PERFORM count(*) FROM starlog.ingest_tokens;
  RAISE EXCEPTION 'FAIL ingest read token table';
EXCEPTION WHEN insufficient_privilege THEN RAISE NOTICE 'ok   ingest cannot read token table'; END $$;
ROLLBACK;

-- 6. Share links: only while sharing is on, and only for active tenants.
BEGIN;
SET LOCAL ROLE starlog_tenant;
SELECT starlogtest.eq('shared alpha returns totals', (SELECT page_views FROM starlog.shared_web_totals('alpha',30)), 100);
SELECT starlogtest.eq('unshared beta returns nothing', (SELECT count(*) FROM starlog.shared_web_totals('beta',30)), 0);
COMMIT;
UPDATE starlog.tenants SET status='removed' WHERE slug='alpha';
BEGIN;
SET LOCAL ROLE starlog_tenant;
SELECT starlogtest.eq('removed tenant share is gone', (SELECT count(*) FROM starlog.shared_web_totals('alpha',30)), 0);
SELECT starlogtest.eq('removed tenant cannot log in', (SELECT count(*) FROM starlog.login_lookup('a@alpha.test')), 0);
SELECT starlogtest.eq('operator can log in', (SELECT count(*) FROM starlog.login_lookup('op@scf.test')), 1);
COMMIT;

DROP SCHEMA starlogtest CASCADE;
\echo ALL ISOLATION TESTS PASSED
