-- TEST-ONLY bootstrap for the docker pgTAP container.
-- NEVER ship to production: it emulates the Supabase Auth Postgres surface
-- (auth.users + auth.uid() + auth.jwt()) so RLS can be tested without the
-- full Supabase stack. Apply BEFORE the versioned migrations.

CREATE SCHEMA IF NOT EXISTS auth;
CREATE SCHEMA IF NOT EXISTS tests;

-- Minimal auth.users stand-in (id + email are all M2 needs).
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);

-- Emulates Supabase's auth.uid(): session JWT sub claim.
CREATE OR REPLACE FUNCTION auth.uid()
RETURNS uuid LANGUAGE sql STABLE AS $$
  SELECT nullif(current_setting('request.jwt.claim.sub', true), '')::uuid;
$$;

-- Emulates Supabase's auth.jwt(): session JWT claims as JSON.
CREATE OR REPLACE FUNCTION auth.jwt()
RETURNS json LANGUAGE sql STABLE AS $$
  SELECT coalesce(nullif(current_setting('request.jwt.claims', true), '')::json, '{}'::json);
$$;

-- Test helper: impersonate a user for subsequent statements in this session.
CREATE OR REPLACE FUNCTION tests.set_claims(p_sub uuid, p_email text DEFAULT NULL)
RETURNS void LANGUAGE plpgsql AS $$
BEGIN
  PERFORM set_config('request.jwt.claim.sub', p_sub::text, true);
  PERFORM set_config(
    'request.jwt.claims',
    json_build_object('sub', p_sub, 'email', p_email)::text,
    true
  );
END;
$$;

CREATE OR REPLACE FUNCTION tests.clear_claims()
RETURNS void LANGUAGE sql AS $$
  SELECT set_config('request.jwt.claim.sub', '', true);
  SELECT set_config('request.jwt.claims', '{}', true);
$$;

-- API roles as PostgREST would see them (stock Postgres has none).
DO $$ BEGIN
  CREATE ROLE anon NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
DO $$ BEGIN
  CREATE ROLE authenticated NOLOGIN;
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;
