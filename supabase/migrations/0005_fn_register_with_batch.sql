-- M2 0005: registration function + membership audit trigger.
--
-- Flow (app calls this AFTER Supabase Auth signup, with the user's JWT):
--   1. resolve active batch by join_code (invalid/inactive → INVALID_JOIN_CODE)
--   2. roll taken in this batch → ROLL_TAKEN (unique index is the backstop)
--   3. user already actively enrolled elsewhere → ALREADY_ENROLLED
--      (spec §4: exactly one active batch; multi-course enrolment is a
--      super_admin manual action, never self-service)
--   4. upsert profile (email taken from the verified JWT, never from arguments),
--      grant the student role, insert the active membership — atomically.
-- Email/identity proof comes from auth.jwt()/auth.uid(), so a caller cannot
-- register a profile for anyone else.

CREATE OR REPLACE FUNCTION public.fn_register_with_batch(
  p_join_code text,
  p_roll_number text,
  p_full_name text,
  p_skill_track public.skill_track
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_email text := auth.jwt() ->> 'email';
  v_join_code text := btrim(p_join_code);
  v_roll text := btrim(p_roll_number);
  v_name text := btrim(p_full_name);
  v_batch_id uuid;
  v_member_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF v_email IS NULL OR v_email = '' THEN
    RAISE EXCEPTION 'NO_VERIFIED_EMAIL';
  END IF;
  IF v_join_code = '' THEN
    RAISE EXCEPTION 'INVALID_JOIN_CODE';
  END IF;
  IF v_roll = '' THEN
    RAISE EXCEPTION 'INVALID_ROLL_NUMBER';
  END IF;
  IF v_name = '' THEN
    RAISE EXCEPTION 'INVALID_FULL_NAME';
  END IF;

  SELECT id INTO v_batch_id
  FROM public.batches
  WHERE join_code = v_join_code AND is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'INVALID_JOIN_CODE';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.batch_members
    WHERE batch_id = v_batch_id AND roll_number = v_roll
  ) THEN
    RAISE EXCEPTION 'ROLL_TAKEN';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.batch_members
    WHERE user_id = v_user_id AND is_active
  ) THEN
    RAISE EXCEPTION 'ALREADY_ENROLLED';
  END IF;

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (v_user_id, v_email, v_name)
  ON CONFLICT (id) DO UPDATE
    SET email = EXCLUDED.email, full_name = EXCLUDED.full_name;

  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, 'student')
  ON CONFLICT DO NOTHING;

  INSERT INTO public.batch_members (batch_id, user_id, roll_number, skill_track, is_active)
  VALUES (v_batch_id, v_user_id, v_roll, p_skill_track, true)
  RETURNING id INTO v_member_id;

  RETURN v_member_id;
END;
$$;

REVOKE ALL ON FUNCTION public.fn_register_with_batch(text, text, text, public.skill_track)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_register_with_batch(text, text, text, public.skill_track)
  TO authenticated;

-- ---------------------------------------------------------------------------
-- Membership audit trigger. Fires on enrolment (INSERT) and on any roll /
-- active-flag / batch correction (UPDATE). SECURITY DEFINER as owner so the
-- audit row is written even though API roles have no INSERT on audit_logs.
-- This is what enforces "admin roll changes require an audit record".
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.trg_batch_members_audit()
RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_batch_id uuid := COALESCE(NEW.batch_id, OLD.batch_id);
  v_org_id uuid := public.batch_organization_id(v_batch_id);
BEGIN
  INSERT INTO public.audit_logs (actor_user_id, action, entity, entity_id, metadata)
  VALUES (
    auth.uid(),
    TG_ARGV[0],
    'batch_members',
    COALESCE(NEW.id, OLD.id)::text,
    jsonb_build_object(
      'organization_id', v_org_id,
      'batch_id', v_batch_id,
      'user_id', COALESCE(NEW.user_id, OLD.user_id),
      'old_roll_number', CASE WHEN TG_OP = 'UPDATE' THEN OLD.roll_number END,
      'new_roll_number', CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN NEW.roll_number END,
      'old_is_active', CASE WHEN TG_OP = 'UPDATE' THEN OLD.is_active END,
      'new_is_active', CASE WHEN TG_OP IN ('UPDATE', 'INSERT') THEN NEW.is_active END
    )
  );
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_batch_members_audit_ins ON public.batch_members;
DROP TRIGGER IF EXISTS trg_batch_members_audit_upd ON public.batch_members;

CREATE TRIGGER trg_batch_members_audit_ins
  AFTER INSERT ON public.batch_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_batch_members_audit('batch_member.created');

CREATE TRIGGER trg_batch_members_audit_upd
  AFTER UPDATE OF roll_number, is_active, batch_id ON public.batch_members
  FOR EACH ROW EXECUTE FUNCTION public.trg_batch_members_audit('batch_member.updated');
