-- Starlog 002: authentication. Adds the starlog_auth role (pre-login door), sessions,
-- and email verification. Needs psql variable: auth_pw.
\set ON_ERROR_STOP on

SELECT format('CREATE ROLE starlog_auth LOGIN PASSWORD %L NOBYPASSRLS', :'auth_pw')
 WHERE NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'starlog_auth') \gexec
GRANT USAGE ON SCHEMA starlog TO starlog_auth;

ALTER TABLE starlog.users ADD COLUMN email_verified_at timestamptz;

CREATE TABLE starlog.sessions (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_hash bytea NOT NULL UNIQUE,                 -- sha256 of the cookie value
  user_id    uuid NOT NULL REFERENCES starlog.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE starlog.email_tokens (
  token_hash bytea PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES starlog.users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  used_at    timestamptz
);
-- RLS on with no policies: no role can touch these tables directly. Only the functions below can.
REVOKE ALL ON starlog.sessions, starlog.email_tokens FROM PUBLIC;
ALTER TABLE starlog.sessions     ENABLE ROW LEVEL SECURITY;  ALTER TABLE starlog.sessions     FORCE ROW LEVEL SECURITY;
ALTER TABLE starlog.email_tokens ENABLE ROW LEVEL SECURITY;  ALTER TABLE starlog.email_tokens FORCE ROW LEVEL SECURITY;

-- Replace login_lookup so it also reports verification state.
DROP FUNCTION starlog.login_lookup(text);
CREATE FUNCTION starlog.login_lookup(p_email text)
RETURNS TABLE (user_id uuid, tenant_id uuid, role text, password_hash text, email_verified boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT u.id, u.tenant_id, u.role, u.password_hash, u.email_verified_at IS NOT NULL
     FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE lower(u.email) = lower(p_email)
      AND (u.role = 'operator' OR t.status = 'active')
    LIMIT 1 $$;

-- Create a tenant and its first user in one step.
CREATE FUNCTION starlog.register_tenant(p_slug text, p_name text, p_email text, p_hash text)
RETURNS TABLE (tenant_id uuid, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE t uuid; u uuid;
BEGIN
  INSERT INTO tenants (slug, name) VALUES (p_slug, p_name) RETURNING id INTO t;
  INSERT INTO users (tenant_id, email, password_hash, role) VALUES (t, p_email, p_hash, 'tenant') RETURNING id INTO u;
  RETURN QUERY SELECT t, u;
END $$;

CREATE FUNCTION starlog.create_email_token(p_user uuid, p_hash bytea, p_ttl_hours int) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ INSERT INTO email_tokens VALUES (p_hash, p_user, now() + make_interval(hours => p_ttl_hours), NULL) $$;

CREATE FUNCTION starlog.verify_email(p_hash bytea) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE u uuid;
BEGIN
  UPDATE email_tokens SET used_at = now()
   WHERE token_hash = p_hash AND used_at IS NULL AND expires_at > now() RETURNING user_id INTO u;
  IF u IS NULL THEN RETURN false; END IF;
  UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = u;
  RETURN true;
END $$;

CREATE FUNCTION starlog.create_session(p_user uuid, p_hash bytea, p_ttl_hours int) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (p_hash, p_user, now() + make_interval(hours => p_ttl_hours)) $$;

-- Resolve a session; fails for expired sessions and removed tenants.
CREATE FUNCTION starlog.resolve_session(p_hash bytea)
RETURNS TABLE (user_id uuid, tenant_id uuid, role text, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT u.id, u.tenant_id, u.role, u.email
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE s.token_hash = p_hash AND s.expires_at > now()
      AND (u.role = 'operator' OR t.status = 'active') $$;

CREATE FUNCTION starlog.delete_session(p_hash bytea) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ DELETE FROM sessions WHERE token_hash = p_hash $$;

GRANT EXECUTE ON FUNCTION
  starlog.login_lookup(text), starlog.register_tenant(text,text,text,text),
  starlog.create_email_token(uuid,bytea,int), starlog.verify_email(bytea),
  starlog.create_session(uuid,bytea,int), starlog.resolve_session(bytea),
  starlog.delete_session(bytea), starlog.shared_web_totals(text,int)
TO starlog_auth;
