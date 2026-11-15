-- Starlog 004: password reset, operator invites, wallet sign-in. All access goes through
-- SECURITY DEFINER functions that only starlog_auth (the API's pre-login door) may call.
\set ON_ERROR_STOP on

-- Tokens now have a purpose, so a reset link can never verify an email and the reverse.
ALTER TABLE starlog.email_tokens ADD COLUMN purpose text NOT NULL DEFAULT 'verify' CHECK (purpose IN ('verify','reset','invite'));

CREATE OR REPLACE FUNCTION starlog.verify_email(p_hash bytea) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE u uuid;
BEGIN
  UPDATE email_tokens SET used_at = now()
   WHERE token_hash = p_hash AND purpose = 'verify' AND used_at IS NULL AND expires_at > now() RETURNING user_id INTO u;
  IF u IS NULL THEN RETURN false; END IF;
  UPDATE users SET email_verified_at = coalesce(email_verified_at, now()) WHERE id = u;
  RETURN true;
END $$;

-- Password reset: one live reset token per account. Returns the user only if the account may sign in.
CREATE FUNCTION starlog.request_reset(p_email text, p_hash bytea, p_ttl_hours int)
RETURNS TABLE (user_id uuid)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE u uuid;
BEGIN
  SELECT x.id INTO u FROM users x LEFT JOIN tenants t ON t.id = x.tenant_id
   WHERE lower(x.email) = lower(p_email) AND (x.role = 'operator' OR t.status = 'active') LIMIT 1;
  IF u IS NULL THEN RETURN; END IF;
  DELETE FROM email_tokens WHERE email_tokens.user_id = u AND purpose = 'reset' AND used_at IS NULL;
  INSERT INTO email_tokens (token_hash, user_id, expires_at, purpose)
    VALUES (p_hash, u, now() + make_interval(hours => p_ttl_hours), 'reset');
  RETURN QUERY SELECT u;
END $$;

-- Uses a reset or invite token once, sets the new password hash, and signs the account out everywhere.
CREATE FUNCTION starlog.reset_password(p_hash bytea, p_password_hash text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE u uuid;
BEGIN
  UPDATE email_tokens SET used_at = now()
   WHERE token_hash = p_hash AND purpose IN ('reset','invite') AND used_at IS NULL AND expires_at > now()
   RETURNING user_id INTO u;
  IF u IS NULL THEN RETURN false; END IF;
  UPDATE users SET password_hash = p_password_hash, email_verified_at = coalesce(email_verified_at, now()) WHERE id = u;
  DELETE FROM sessions WHERE sessions.user_id = u;
  RETURN true;
END $$;

-- Operators. The placeholder hash can never verify, so an invited operator must set a password from the emailed link.
CREATE FUNCTION starlog.create_operator_invite(p_email text, p_hash bytea, p_ttl_hours int) RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
DECLARE u uuid;
BEGIN
  INSERT INTO users (tenant_id, email, password_hash, role) VALUES (NULL, lower(p_email), '!', 'operator') RETURNING id INTO u;
  INSERT INTO email_tokens (token_hash, user_id, expires_at, purpose)
    VALUES (p_hash, u, now() + make_interval(hours => p_ttl_hours), 'invite');
  RETURN u;
END $$;

-- Returns ok, self, last or missing. Never removes yourself or the last verified operator.
CREATE FUNCTION starlog.remove_operator(p_target uuid, p_actor uuid) RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
BEGIN
  IF p_target = p_actor THEN RETURN 'self'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE id = p_target AND role = 'operator') THEN RETURN 'missing'; END IF;
  IF NOT EXISTS (SELECT 1 FROM users WHERE role = 'operator' AND email_verified_at IS NOT NULL AND id <> p_target) THEN RETURN 'last'; END IF;
  DELETE FROM users WHERE id = p_target AND role = 'operator';
  RETURN 'ok';
END $$;

-- Wallet sign-in. A wallet belongs to one account; the key is public, the proof is a signed challenge.
CREATE TABLE starlog.wallets (
  public_key text PRIMARY KEY CHECK (public_key ~ '^G[A-Z2-7]{55}$'),
  user_id    uuid NOT NULL REFERENCES starlog.users(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE TABLE starlog.wallet_challenges (
  tx_hash    bytea PRIMARY KEY,
  expires_at timestamptz NOT NULL
);
REVOKE ALL ON starlog.wallets, starlog.wallet_challenges FROM PUBLIC;
ALTER TABLE starlog.wallets           ENABLE ROW LEVEL SECURITY; ALTER TABLE starlog.wallets           FORCE ROW LEVEL SECURITY;
ALTER TABLE starlog.wallet_challenges ENABLE ROW LEVEL SECURITY; ALTER TABLE starlog.wallet_challenges FORCE ROW LEVEL SECURITY;

CREATE FUNCTION starlog.list_operators()
RETURNS TABLE (id uuid, email text, created_at timestamptz, email_verified boolean, wallets int)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT u.id, u.email, u.created_at, u.email_verified_at IS NOT NULL,
          (SELECT count(*)::int FROM wallets w WHERE w.user_id = u.id)
     FROM users u WHERE u.role = 'operator' ORDER BY u.created_at $$;

CREATE FUNCTION starlog.link_wallet(p_user uuid, p_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
BEGIN
  IF (SELECT count(*) FROM wallets WHERE user_id = p_user) >= 5 THEN RETURN false; END IF;
  INSERT INTO wallets (public_key, user_id) VALUES (p_key, p_user) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;

CREATE FUNCTION starlog.list_wallets(p_user uuid) RETURNS TABLE (public_key text, created_at timestamptz)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT public_key, created_at FROM wallets WHERE user_id = p_user ORDER BY created_at $$;

CREATE FUNCTION starlog.unlink_wallet(p_user uuid, p_key text) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
BEGIN DELETE FROM wallets WHERE user_id = p_user AND public_key = p_key; RETURN FOUND; END $$;

CREATE FUNCTION starlog.wallet_lookup(p_key text)
RETURNS TABLE (user_id uuid, tenant_id uuid, role text, email_verified boolean)
LANGUAGE sql SECURITY DEFINER SET search_path = starlog, pg_temp AS
$$ SELECT u.id, u.tenant_id, u.role, u.email_verified_at IS NOT NULL
     FROM wallets w JOIN users u ON u.id = w.user_id LEFT JOIN tenants t ON t.id = u.tenant_id
    WHERE w.public_key = p_key AND (u.role = 'operator' OR t.status = 'active') $$;

-- A signed challenge can be used once. Returns false if it was already used.
CREATE FUNCTION starlog.consume_challenge(p_hash bytea, p_expires timestamptz) RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER SET search_path = starlog, pg_temp AS $$
BEGIN
  DELETE FROM wallet_challenges WHERE expires_at < now();
  INSERT INTO wallet_challenges (tx_hash, expires_at) VALUES (p_hash, p_expires) ON CONFLICT DO NOTHING;
  RETURN FOUND;
END $$;

-- Lock every auth function to starlog_auth. (Functions are executable by PUBLIC unless revoked.)
REVOKE ALL ON FUNCTION
  starlog.login_lookup(text), starlog.register_tenant(text,text,text,text),
  starlog.create_email_token(uuid,bytea,int), starlog.verify_email(bytea),
  starlog.create_session(uuid,bytea,int), starlog.resolve_session(bytea), starlog.delete_session(bytea),
  starlog.request_reset(text,bytea,int), starlog.reset_password(bytea,text),
  starlog.create_operator_invite(text,bytea,int), starlog.list_operators(), starlog.remove_operator(uuid,uuid),
  starlog.link_wallet(uuid,text), starlog.list_wallets(uuid), starlog.unlink_wallet(uuid,text),
  starlog.wallet_lookup(text), starlog.consume_challenge(bytea,timestamptz)
FROM PUBLIC;
GRANT EXECUTE ON FUNCTION
  starlog.login_lookup(text), starlog.register_tenant(text,text,text,text),
  starlog.create_email_token(uuid,bytea,int), starlog.verify_email(bytea),
  starlog.create_session(uuid,bytea,int), starlog.resolve_session(bytea), starlog.delete_session(bytea),
  starlog.request_reset(text,bytea,int), starlog.reset_password(bytea,text),
  starlog.create_operator_invite(text,bytea,int), starlog.list_operators(), starlog.remove_operator(uuid,uuid),
  starlog.link_wallet(uuid,text), starlog.list_wallets(uuid), starlog.unlink_wallet(uuid,text),
  starlog.wallet_lookup(text), starlog.consume_challenge(bytea,timestamptz)
TO starlog_auth;
