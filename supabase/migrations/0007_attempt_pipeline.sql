-- M4 0007: attempt pipeline (game_attempts + attempt_results).
--
-- Lifecycle: created → started → in_progress → submitted → validating →
-- validated (or rejected); abandoned/expired interrupt non-terminal states.
-- The ONLY writers are the SECURITY DEFINER functions below (no INSERT /
-- UPDATE / DELETE policies for API roles), so state transitions are atomic
-- and duplicate finalization is impossible. Results are immutable: no UPDATE
-- policy exists; administrative corrections happen via service_role plus a
-- manual audit_logs row (tooling in a later milestone).
--
-- Trust split: the Route Handler (server, @tap/scoring + validation) computes
-- and verifies metrics; fn_submit_attempt atomically persists them. The DB
-- never trusts client-claimed numbers — it stores what the server passes.

DO $$ BEGIN
  CREATE TYPE public.attempt_status AS ENUM (
    'created', 'started', 'in_progress', 'submitted',
    'validating', 'validated', 'rejected', 'abandoned', 'expired'
  );
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

CREATE TABLE IF NOT EXISTS public.game_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE CASCADE,
  game_id uuid NOT NULL REFERENCES public.games (id) ON DELETE RESTRICT,
  game_version_id uuid NOT NULL REFERENCES public.game_versions (id) ON DELETE RESTRICT,
  prompt_seed text NOT NULL DEFAULT '',
  -- Server-bound prompt snapshot: recompute/validation source of truth.
  expected_text text NOT NULL DEFAULT '',
  difficulty text NOT NULL DEFAULT 'beginner',
  status public.attempt_status NOT NULL DEFAULT 'started',
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz,
  finalized_at timestamptz,
  expires_at timestamptz NOT NULL DEFAULT now() + interval '15 minutes'
);
CREATE INDEX IF NOT EXISTS attempts_user_idx
  ON public.game_attempts (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS attempts_game_status_idx
  ON public.game_attempts (game_id, status);
CREATE INDEX IF NOT EXISTS attempts_expiry_idx
  ON public.game_attempts (status, expires_at)
  WHERE status IN ('created', 'started', 'in_progress', 'submitted');

CREATE TABLE IF NOT EXISTS public.attempt_results (
  attempt_id uuid PRIMARY KEY REFERENCES public.game_attempts (id) ON DELETE CASCADE,
  raw jsonb NOT NULL,
  score numeric NOT NULL,
  accuracy numeric NOT NULL,
  effective_wpm numeric NOT NULL,
  is_valid boolean NOT NULL,
  rejected_reason text,
  validated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.game_attempts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attempt_results ENABLE ROW LEVEL SECURITY;

-- Owners read their own attempts + results. Nothing else for API roles.
CREATE POLICY attempts_select_own ON public.game_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY results_select_own ON public.attempt_results
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.game_attempts a
      WHERE a.id = attempt_results.attempt_id AND a.user_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- fn_start_attempt: bind user × game version × prompt snapshot, expiry set.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_start_attempt(
  p_game_slug text,
  p_difficulty text,
  p_seed text,
  p_expected text,
  p_expires_after_seconds int DEFAULT 900
)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_game_id uuid;
  v_version_id uuid;
  v_attempt_id uuid;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF p_expected IS NULL OR p_expected = '' THEN
    RAISE EXCEPTION 'EMPTY_PROMPT';
  END IF;

  SELECT g.id, gv.id INTO v_game_id, v_version_id
  FROM public.games g
  JOIN public.game_versions gv
    ON gv.game_id = g.id AND gv.version = g.current_version
  WHERE g.slug = p_game_slug AND g.is_active;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'GAME_NOT_FOUND';
  END IF;

  -- Anti-spam foundation: cap concurrent live attempts per user.
  IF (
    SELECT count(*) FROM public.game_attempts
    WHERE user_id = v_user_id
      AND status IN ('created', 'started', 'in_progress', 'submitted')
  ) >= 5 THEN
    RAISE EXCEPTION 'TOO_MANY_ACTIVE';
  END IF;

  INSERT INTO public.game_attempts
    (user_id, game_id, game_version_id, prompt_seed, expected_text,
     difficulty, status, expires_at)
  VALUES
    (v_user_id, v_game_id, v_version_id, p_seed, p_expected,
     p_difficulty, 'started',
     now() + make_interval(secs => GREATEST(p_expires_after_seconds, 60)))
  RETURNING id INTO v_attempt_id;

  RETURN v_attempt_id;
END;
$$;

REVOKE ALL ON FUNCTION
  public.fn_start_attempt(text, text, text, text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fn_start_attempt(text, text, text, text, int) TO authenticated;

-- ---------------------------------------------------------------------------
-- fn_submit_attempt: atomic finalize. Row lock + status gate make duplicate
-- finalization impossible (second call sees a terminal status). Metrics are
-- SERVER-computed by the caller (route); this function persists them.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_submit_attempt(
  p_attempt_id uuid,
  p_raw jsonb,
  p_score numeric,
  p_accuracy numeric,
  p_wpm numeric,
  p_valid boolean,
  p_reason text DEFAULT NULL
)
RETURNS public.attempt_status
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid := auth.uid();
  v_row public.game_attempts%ROWTYPE;
  v_final public.attempt_status;
BEGIN
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;

  SELECT * INTO v_row FROM public.game_attempts
  WHERE id = p_attempt_id FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'ATTEMPT_NOT_FOUND';
  END IF;
  IF v_row.user_id <> v_user_id THEN
    RAISE EXCEPTION 'NOT_OWNER';
  END IF;
  IF v_row.status IN ('validated', 'rejected', 'abandoned', 'expired') THEN
    RAISE EXCEPTION 'ALREADY_FINALIZED';
  END IF;
  IF v_row.status NOT IN ('started', 'in_progress', 'submitted') THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  IF now() > v_row.expires_at THEN
    -- Fail closed WITHOUT marking here: the UPDATE would roll back with the
    -- raise inside the caller's transaction. A sweeper (future milestone)
    -- flips stale live rows to expired for hygiene; finalization stays
    -- impossible past expiry because every submit re-checks this gate.
    RAISE EXCEPTION 'ATTEMPT_EXPIRED';
  END IF;

  v_final := CASE WHEN p_valid THEN 'validated'::public.attempt_status
                 ELSE 'rejected'::public.attempt_status END;

  UPDATE public.game_attempts
  SET status = v_final, submitted_at = now(), finalized_at = now()
  WHERE id = p_attempt_id;

  INSERT INTO public.attempt_results
    (attempt_id, raw, score, accuracy, effective_wpm, is_valid, rejected_reason)
  VALUES
    (p_attempt_id, p_raw, p_score, p_accuracy, p_wpm, p_valid, p_reason)
  ON CONFLICT (attempt_id) DO NOTHING;

  RETURN v_final;
END;
$$;

REVOKE ALL ON FUNCTION
  public.fn_submit_attempt(uuid, jsonb, numeric, numeric, numeric, boolean, text)
  FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION
  public.fn_submit_attempt(uuid, jsonb, numeric, numeric, numeric, boolean, text)
  TO authenticated;
