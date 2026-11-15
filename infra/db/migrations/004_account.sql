-- Starlog 004: password reset, operator creation, and Stellar wallet sign-in.
\set ON_ERROR_STOP on

ALTER TABLE starlog.users ADD COLUMN IF NOT EXISTS wallet_public_key text;
CREATE UNIQUE INDEX IF NOT EXISTS users_wallet_uq ON starlog.users (wallet_public_key) WHERE wallet_public_key IS NOT NULL;

ALTER TABLE starlog.email_tokens ADD COLUMN IF NOT EXISTS purpose text NOT NULL DEFAULT 'verify';
ALTER TABLE starlog.email_tokens DROP CONSTRAINT IF EXISTS email_tokens_purpose_chk;
ALTER TABLE starlog.email_tokens ADD CONSTRAINT email_tokens_purpose_chk CHECK (purpose IN ('verify', 'reset'));

-- Named columns, so adding purpose does not break the positional insert.
CREATE OR REPLACE FUNCTION starlog.create_email_token(p_user uuid, p_hash bytea, p_ttl_hours int) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ INSERT INTO email_tokens (token_hash, user_id, expires_at, used_at, purpose)
   VALUES (p_hash, p_user, now() + make_interval(hours => p_ttl_hours), NULL, 'verify') $$;

CREATE OR REPLACE FUNCTION starlog.verify_email(p_hash bytea) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE u uuid;
BEGIN
  UPDATE email_tokens SET used_at = now()
   WHERE token_hash = p_hash AND purpose = 'verify' AND used_at IS NULL AND expires_at > now()
   RETURNING user_id INTO u;
  IF u IS NULL THEN RETURN false; END IF;
  UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = u;
  RETURN true;
END $$;

CREATE OR REPLACE FUNCTION starlog.create_reset_token(p_user uuid, p_hash bytea, p_ttl_hours int) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ INSERT INTO email_tokens (token_hash, user_id, expires_at, used_at, purpose)
   VALUES (p_hash, p_user, now() + make_interval(hours => p_ttl_hours), NULL, 'reset') $$;

CREATE OR REPLACE FUNCTION starlog.reset_password(p_hash bytea, p_password text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE u uuid;
BEGIN
  UPDATE email_tokens SET used_at = now()
   WHERE token_hash = p_hash AND purpose = 'reset' AND used_at IS NULL AND expires_at > now()
   RETURNING user_id INTO u;
  IF u IS NULL THEN RETURN false; END IF;
  UPDATE users SET password_hash = p_password, email_verified_at = coalesce(email_verified_at, now()) WHERE id = u;
  DELETE FROM sessions WHERE user_id = u;
  RETURN true;
END $$;

-- An existing operator calls this. It is not granted to the public auth role.
CREATE OR REPLACE FUNCTION starlog.create_operator(p_email text, p_hash text) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE u uuid;
BEGIN
  INSERT INTO users (tenant_id, email, password_hash, role, email_verified_at)
  VALUES (NULL, lower(p_email), p_hash, 'operator', now())
  RETURNING id INTO u;
  RETURN u;
END $$;

DROP FUNCTION IF EXISTS starlog.resolve_session(bytea);
CREATE FUNCTION starlog.resolve_session(p_hash bytea)
RETURNS TABLE (user_id uuid, tenant_id uuid, role text, email text, wallet_public_key text)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT u.id, u.tenant_id, u.role, u.email, u.wallet_public_key
     FROM sessions s JOIN users u ON u.id = s.user_id LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE s.token_hash = p_hash AND s.expires_at > now()
      AND (u.role = 'operator' OR t.status = 'active') $$;

CREATE TABLE IF NOT EXISTS starlog.wallet_challenges (
  message_hash bytea PRIMARY KEY,
  public_key   text NOT NULL,
  message      text NOT NULL,
  expires_at   timestamptz NOT NULL,
  used_at      timestamptz
);
REVOKE ALL ON starlog.wallet_challenges FROM PUBLIC;
ALTER TABLE starlog.wallet_challenges ENABLE ROW LEVEL SECURITY;
ALTER TABLE starlog.wallet_challenges FORCE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION starlog.issue_wallet_challenge(p_key text, p_message text, p_hash bytea) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ DELETE FROM wallet_challenges WHERE public_key = p_key OR expires_at < now();
   INSERT INTO wallet_challenges (message_hash, public_key, message, expires_at)
   VALUES (p_hash, p_key, p_message, now() + interval '5 minutes') $$;

-- Returns the message when it is still valid. Does not consume it, so a first-time
-- wallet can submit a project name with the same signature. Login marks it used.
CREATE OR REPLACE FUNCTION starlog.read_wallet_challenge(p_key text, p_hash bytea) RETURNS text
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT message FROM wallet_challenges
    WHERE message_hash = p_hash AND public_key = p_key AND used_at IS NULL AND expires_at > now() $$;

CREATE OR REPLACE FUNCTION starlog.consume_wallet_challenge(p_hash bytea) RETURNS void
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ UPDATE wallet_challenges SET used_at = now() WHERE message_hash = p_hash AND used_at IS NULL $$;

CREATE OR REPLACE FUNCTION starlog.login_lookup_wallet(p_key text)
RETURNS TABLE (user_id uuid, tenant_id uuid, role text, email text)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT u.id, u.tenant_id, u.role, u.email
     FROM users u LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE u.wallet_public_key = p_key
      AND (u.role = 'operator' OR t.status = 'active')
    LIMIT 1 $$;

CREATE OR REPLACE FUNCTION starlog.register_wallet(p_slug text, p_name text, p_key text, p_hash text)
RETURNS TABLE (tenant_id uuid, user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE t uuid; u uuid;
BEGIN
  INSERT INTO tenants (slug, name) VALUES (p_slug, p_name) RETURNING id INTO t;
  INSERT INTO users (tenant_id, email, password_hash, role, email_verified_at, wallet_public_key)
  VALUES (t, lower(p_key) || '@wallet.starlog.invalid', p_hash, 'tenant', now(), p_key)
  RETURNING id INTO u;
  RETURN QUERY SELECT t, u;
END $$;

GRANT EXECUTE ON FUNCTION
  starlog.create_reset_token(uuid,bytea,int), starlog.reset_password(bytea,text),
  starlog.resolve_session(bytea),
  starlog.issue_wallet_challenge(text,text,bytea), starlog.read_wallet_challenge(text,bytea),
  starlog.consume_wallet_challenge(bytea), starlog.login_lookup_wallet(text),
  starlog.register_wallet(text,text,text,text)
TO starlog_auth;

GRANT EXECUTE ON FUNCTION starlog.create_operator(text,text) TO starlog_operator;
