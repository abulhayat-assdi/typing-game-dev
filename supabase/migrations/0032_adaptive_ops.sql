-- M15 adaptive operations: evidence ingest from validated attempts,
-- cached profile refresh (post-attempt + sweep, never per render),
-- feedback, staff aggregates. Students can never write scores — fns
-- only insert evidence/events and recompute from stored history.

-- prompt_kind added for input-class dimensions (same milestone).
ALTER TABLE public.adaptive_attempt_samples
  ADD COLUMN IF NOT EXISTS prompt_kind text NOT NULL DEFAULT 'words'
    CHECK (prompt_kind IN ('letters', 'words', 'sentences', 'numbers', 'symbols'));

-- Pair class shared by ingest (mirrors @tap/adaptive classifyPair).
CREATE OR REPLACE FUNCTION public.adaptive_classify_pair(
  p_expected text, p_actual text
)
RETURNS text
LANGUAGE sql IMMUTABLE
AS $$
  SELECT CASE
    WHEN p_expected = ' ' OR p_actual = ' ' THEN 'space'
    WHEN lower(p_expected) = lower(p_actual)
         AND p_expected <> p_actual THEN 'capitalization'
    WHEN p_expected ~ '^[a-z]$' AND p_actual ~ '^[a-z]$'
         OR p_expected ~ '^[A-Z]$' AND p_actual ~ '^[A-Z]$'
         THEN 'letter_confusion'
    WHEN p_expected ~ '^[0-9]$' OR p_actual ~ '^[0-9]$' THEN 'number_row'
    WHEN p_expected ~ '^[.,;:!?''"()-]$'
         OR p_actual ~ '^[.,;:!?''"()-]$' THEN 'punctuation'
    WHEN char_length(p_expected) = 1
         AND char_length(p_actual) = 1 THEN 'symbol'
    ELSE 'other' END;
$$;

-- ---------------------------------------------------------------------------
-- Ingest: one validated attempt → sample + key/pair evidence + profile
-- bump. The route aligns expected vs typed position-wise and passes the
-- compact counts; SQL re-proves aggregates against stored results
-- (sum(exposures) must equal the prompt length) so forged payloads
-- cannot inflate evidence. Repeat delivery is a no-op (attempt UNIQUE).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_record_adaptive_attempt(
  p_attempt uuid, p_keys jsonb, p_pairs jsonb
)
RETURNS boolean
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
  v_att record;
  v_res record;
  v_game record;
  v_expected_len int;
  v_sum_exp int;
  v_sum_err int;
  v_pair jsonb;
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  SELECT * INTO v_att FROM public.game_attempts WHERE id = p_attempt;
  IF NOT FOUND OR v_att.user_id <> v_me THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF v_att.status <> 'validated' THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  SELECT * INTO v_res FROM public.attempt_results WHERE attempt_id = p_attempt;
  IF NOT FOUND OR NOT v_res.is_valid THEN
    RAISE EXCEPTION 'INVALID_STATE';
  END IF;
  SELECT slug, mechanic, prompt_set_ref INTO v_game
  FROM public.games WHERE id = v_att.game_id;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  IF jsonb_typeof(p_keys) <> 'array' THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF p_pairs IS NOT NULL AND jsonb_typeof(p_pairs) <> 'array' THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  v_expected_len := char_length(v_att.expected_text);
  SELECT COALESCE(sum((e ->> 'exposures')::int), 0),
         COALESCE(sum((e ->> 'errors')::int), 0)
    INTO v_sum_exp, v_sum_err
  FROM jsonb_array_elements(p_keys) AS e;
  -- The payload must account for exactly one exposure per prompt char.
  IF v_sum_exp <> v_expected_len THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF v_sum_err > COALESCE((v_res.raw ->> 'incorrectCharacters')::int, 0)
                + COALESCE((v_res.raw ->> 'errorStrokes')::int, 0) THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;

  INSERT INTO public.adaptive_attempt_samples
    (user_id, attempt_id, game_slug, mechanic, difficulty, accuracy, wpm,
     completion, error_strokes, corrections, duration_ms, prompt_len,
     has_numbers, has_punct, has_caps, has_symbols, prompt_kind,
     submitted_at)
  SELECT v_me, p_attempt, v_game.slug,
         COALESCE(NULLIF(v_game.mechanic, ''), 'mixed'), v_att.difficulty,
         v_res.accuracy, v_res.effective_wpm,
         COALESCE((v_res.raw ->> 'completion')::numeric, 0),
         COALESCE((v_res.raw ->> 'errorStrokes')::int, 0),
         COALESCE((v_res.raw ->> 'correctedCharacters')::int, 0),
         COALESCE((v_res.raw ->> 'durationMs')::int, 0),
         v_expected_len,
         v_att.expected_text ~ '[0-9]',
         v_att.expected_text ~ '[.,;:!?''"()-]',
         v_att.expected_text ~ '[A-Z]',
         v_att.expected_text ~ '[^a-zA-Z0-9 .,;:!?''"()-]',
         COALESCE((SELECT kind FROM public.prompt_sets
                   WHERE ref = v_game.prompt_set_ref), 'words'),
         -- Time windows follow the attempt's real submit time so bulk
         -- or backfilled ingest keeps true chronological order.
         COALESCE(v_att.submitted_at, now())
  ON CONFLICT (attempt_id) DO NOTHING;
  IF NOT FOUND THEN
    RETURN false;
  END IF;

  -- Aggregate repeat keys inside one payload (one row per key).
  INSERT INTO public.adaptive_key_stats
    (user_id, key_char, exposures, errors, samples)
  SELECT v_me, e.key, sum(e.exp), sum(e.err), 1
  FROM (
    SELECT e ->> 'key' AS key,
           (e ->> 'exposures')::int AS exp,
           (e ->> 'errors')::int AS err
    FROM jsonb_array_elements(p_keys) AS e
    WHERE char_length(e ->> 'key') = 1
      AND (e ->> 'exposures')::int >= 0
      AND (e ->> 'errors')::int >= 0
      AND (e ->> 'errors')::int <= (e ->> 'exposures')::int
  ) AS e
  GROUP BY e.key
  ON CONFLICT (user_id, key_char) DO UPDATE SET
    exposures = adaptive_key_stats.exposures + EXCLUDED.exposures,
    errors = adaptive_key_stats.errors + EXCLUDED.errors,
    samples = adaptive_key_stats.samples + 1,
    last_observed = now();

  IF p_pairs IS NOT NULL THEN
    FOR v_pair IN SELECT * FROM jsonb_array_elements(p_pairs)
    LOOP
      IF char_length(v_pair ->> 'expected') = 1
         AND char_length(v_pair ->> 'actual') = 1
         AND (v_pair ->> 'expected') <> (v_pair ->> 'actual')
         AND COALESCE((v_pair ->> 'count')::int, 0) BETWEEN 1 AND 500 THEN
        INSERT INTO public.adaptive_error_pairs
          (user_id, expected_char, actual_char, pair_class, count)
        VALUES (v_me, v_pair ->> 'expected', v_pair ->> 'actual',
          public.adaptive_classify_pair(
            v_pair ->> 'expected', v_pair ->> 'actual'),
          (v_pair ->> 'count')::int)
        ON CONFLICT (user_id, expected_char, actual_char) DO UPDATE SET
          count = adaptive_error_pairs.count + EXCLUDED.count,
          pair_class = EXCLUDED.pair_class,
          last_observed = now();
      END IF;
    END LOOP;
  END IF;

  INSERT INTO public.learner_skill_profiles
    (user_id, evidence_count, last_attempt_at, rec_cache_version)
  VALUES (v_me, 1, now(), 1)
  ON CONFLICT (user_id) DO UPDATE SET
    evidence_count = learner_skill_profiles.evidence_count + 1,
    last_attempt_at = now(),
    rec_cache_version = learner_skill_profiles.rec_cache_version + 1,
    updated_at = now();
  RETURN true;
END;
$$;

-- ---------------------------------------------------------------------------
-- Refresh: recompute dimensions, fingers, trends, weaknesses, band,
-- per-game difficulty, and the ranked recommendation cache for one
-- learner. Runs post-attempt and on sweep — never per UI render.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_adaptive_recompute(p_user uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_acc numeric;
  v_wpm numeric;
  v_band text := 'beginner';
  v_game_band text := 'beginner';
  v_n int := 0;
  v_sig record;
  v_cand record;
  v_rank int := 0;
  v_recs int := 0;
  v_g text;
  v_mid uuid;
  v_reason text;
  v_msg text;
  v_benefit text;
  v_trend_u numeric;
  v_fresh numeric;
  v_fit numeric;
  v_unl boolean;
  v_shows int;
  v_priority numeric;
BEGIN
  INSERT INTO public.learner_skill_profiles (user_id)
  VALUES (p_user)
  ON CONFLICT (user_id) DO NOTHING;

  -- Dimensions from the last 50 samples (conditional means + counts).
  INSERT INTO public.learner_skill_dimensions
    (user_id, dimension, value, evidence)
  SELECT p_user, d.dim, COALESCE(d.val, 0), d.n
  FROM (
    SELECT 'accuracy' AS dim, avg(s.accuracy) AS val, count(*) AS n
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'wpm', avg(s.wpm), count(*)
    FROM (SELECT wpm FROM public.adaptive_attempt_samples
          WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'completion', avg(s.completion), count(*)
    FROM (SELECT completion FROM public.adaptive_attempt_samples
          WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'error_rate',
      CASE WHEN sum(s.prompt_len) > 0
           THEN sum(s.error_strokes)::numeric / sum(s.prompt_len) * 100
           ELSE 0 END,
      count(*)
    FROM (SELECT error_strokes, prompt_len FROM public.adaptive_attempt_samples
          WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'consistency',
      CASE WHEN avg(s.accuracy) > 0 AND count(*) > 1
           THEN 100 * (1 - LEAST(stddev_pop(s.accuracy)
                                 / NULLIF(avg(s.accuracy), 0), 1))
           ELSE 0 END,
      count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'input_letters', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND prompt_kind = 'letters'
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'input_words', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND prompt_kind = 'words'
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'input_sentences', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND prompt_kind = 'sentences'
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'input_numbers', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND prompt_kind = 'numbers'
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'input_punctuation', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND has_punct AND prompt_kind <> 'symbols'
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'input_capitalization', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND has_caps
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'input_symbols', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND (has_symbols OR prompt_kind = 'symbols')
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'input_mixed', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND (has_numbers OR has_caps OR has_symbols)
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'mech_reaction', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND mechanic = 'reaction'
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'mech_race', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND mechanic = 'race'
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'mech_survival', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND mechanic = 'survival'
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'mech_sentence', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND mechanic = 'sentence'
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'mech_word', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND mechanic = 'word'
          ORDER BY submitted_at DESC LIMIT 50) AS s
    UNION ALL
    SELECT 'mech_mixed', avg(s.accuracy), count(*)
    FROM (SELECT accuracy FROM public.adaptive_attempt_samples
          WHERE user_id = p_user AND mechanic NOT IN
            ('reaction', 'race', 'survival', 'sentence', 'word')
          ORDER BY submitted_at DESC LIMIT 50) AS s
  ) AS d
  ON CONFLICT (user_id, dimension) DO UPDATE SET
    value = EXCLUDED.value, evidence = EXCLUDED.evidence,
    updated_at = now();

  SELECT value INTO v_acc FROM public.learner_skill_dimensions
  WHERE user_id = p_user AND dimension = 'accuracy';
  SELECT value INTO v_wpm FROM public.learner_skill_dimensions
  WHERE user_id = p_user AND dimension = 'wpm';
  SELECT evidence INTO v_n FROM public.learner_skill_dimensions
  WHERE user_id = p_user AND dimension = 'accuracy';

  -- Fingers re-derive from key evidence (same QWERTY map as TS).
  INSERT INTO public.adaptive_finger_stats
    (user_id, finger, exposures, errors)
  SELECT p_user, public.adaptive_finger_for(key_char),
         sum(exposures), sum(errors)
  FROM public.adaptive_key_stats
  WHERE user_id = p_user
    AND public.adaptive_finger_for(key_char) IS NOT NULL
  GROUP BY public.adaptive_finger_for(key_char)
  ON CONFLICT (user_id, finger) DO UPDATE SET
    exposures = EXCLUDED.exposures, errors = EXCLUDED.errors,
    last_observed = now();

  -- Trends: recent-10 median vs prior-40 median (robust to anomalies).
  -- Either side under 5 samples stays "insufficient".
  INSERT INTO public.adaptive_skill_trends
    (user_id, metric, recent_value, baseline_value, trend, evidence)
  SELECT p_user, t.metric, t.recent, t.base,
    CASE WHEN t.recent IS NULL OR t.base IS NULL THEN 'insufficient'
         WHEN (t.recent - t.base) * t.better > t.eps THEN 'improving'
         WHEN (t.recent - t.base) * t.better < -t.eps THEN 'declining'
         ELSE 'stable' END,
    t.n
  FROM (
    SELECT 'accuracy' AS metric,
      CASE WHEN (SELECT count(*) FROM public.adaptive_attempt_samples
                 WHERE user_id = p_user) >= 5 THEN
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY accuracy)
         FROM (SELECT accuracy FROM public.adaptive_attempt_samples
               WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 10) AS r)
      END AS recent,
      CASE WHEN (SELECT count(*) FROM public.adaptive_attempt_samples
                 WHERE user_id = p_user) >= 15 THEN
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY accuracy)
         FROM (SELECT accuracy FROM public.adaptive_attempt_samples
               WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 50 OFFSET 10) AS b)
      END AS base,
      1.5::numeric AS eps, 1::numeric AS better,
      (SELECT count(*) FROM public.adaptive_attempt_samples WHERE user_id = p_user) AS n
    UNION ALL
    SELECT 'wpm',
      CASE WHEN (SELECT count(*) FROM public.adaptive_attempt_samples
                 WHERE user_id = p_user) >= 5 THEN
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY wpm)
         FROM (SELECT wpm FROM public.adaptive_attempt_samples
               WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 10) AS r)
      END,
      CASE WHEN (SELECT count(*) FROM public.adaptive_attempt_samples
                 WHERE user_id = p_user) >= 15 THEN
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY wpm)
         FROM (SELECT wpm FROM public.adaptive_attempt_samples
               WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 50 OFFSET 10) AS b)
      END,
      2::numeric, 1::numeric,
      (SELECT count(*) FROM public.adaptive_attempt_samples WHERE user_id = p_user)
    UNION ALL
    SELECT 'error_rate',
      CASE WHEN (SELECT count(*) FROM public.adaptive_attempt_samples
                 WHERE user_id = p_user) >= 5 THEN
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY e)
         FROM (SELECT CASE WHEN prompt_len > 0
                      THEN error_strokes::numeric / prompt_len * 100 ELSE 0 END AS e
               FROM public.adaptive_attempt_samples
               WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 10) AS r)
      END,
      CASE WHEN (SELECT count(*) FROM public.adaptive_attempt_samples
                 WHERE user_id = p_user) >= 15 THEN
        (SELECT percentile_cont(0.5) WITHIN GROUP (ORDER BY e)
         FROM (SELECT CASE WHEN prompt_len > 0
                      THEN error_strokes::numeric / prompt_len * 100 ELSE 0 END AS e
               FROM public.adaptive_attempt_samples
               WHERE user_id = p_user ORDER BY submitted_at DESC LIMIT 50 OFFSET 10) AS b)
      END,
      1.5::numeric, -1::numeric,
      (SELECT count(*) FROM public.adaptive_attempt_samples WHERE user_id = p_user)
  ) AS t
  ON CONFLICT (user_id, metric) DO UPDATE SET
    recent_value = EXCLUDED.recent_value,
    baseline_value = EXCLUDED.baseline_value,
    trend = EXCLUDED.trend, evidence = EXCLUDED.evidence,
    updated_at = now();

  -- Weakness ranking: weakness = errorRate × recurrence × confidence.
  -- Key trend inherits the accuracy trend (documented simplification);
  -- dimension rows carry their own metric trend.
  DELETE FROM public.adaptive_weaknesses WHERE user_id = p_user;
  INSERT INTO public.adaptive_weaknesses
    (user_id, target_type, target, prompt_kind, score, confidence,
     evidence, trend)
  SELECT p_user, w.target_type, w.target, w.prompt_kind, w.score,
         w.confidence, w.evidence, w.trend
  FROM (
    SELECT 'key' AS target_type, ks.key_char AS target,
      CASE WHEN ks.key_char ~ '^[0-9]$' THEN 'numbers'
           WHEN ks.key_char ~ '^[.,;:!?''"()-]$' THEN 'symbols'
           WHEN EXISTS (SELECT 1 FROM public.adaptive_error_pairs ep
                        WHERE ep.user_id = p_user
                          AND ep.expected_char = ks.key_char) THEN 'words'
           ELSE 'letters' END AS prompt_kind,
      (ks.errors::numeric / NULLIF(ks.exposures, 0))
        * LEAST(ks.samples::numeric / 8, 1)
        * LEAST(ks.exposures::numeric / 50, 1) AS score,
      LEAST(ks.exposures::numeric / 50, 1) AS confidence,
      ks.samples AS evidence,
      COALESCE((SELECT trend FROM public.adaptive_skill_trends
                WHERE user_id = p_user AND metric = 'accuracy'),
               'insufficient') AS trend
    FROM public.adaptive_key_stats ks
    WHERE ks.user_id = p_user AND ks.errors > 0 AND ks.exposures >= 5
    UNION ALL
    SELECT 'finger', fs.finger, 'words',
      (fs.errors::numeric / NULLIF(fs.exposures, 0))
        * LEAST(fs.exposures::numeric / 80, 1)
        * LEAST(fs.exposures::numeric / 50, 1),
      LEAST(fs.exposures::numeric / 50, 1),
      (fs.exposures / 10),
      COALESCE((SELECT trend FROM public.adaptive_skill_trends
                WHERE user_id = p_user AND metric = 'accuracy'),
               'insufficient')
    FROM public.adaptive_finger_stats fs
    WHERE fs.user_id = p_user AND fs.errors > 0 AND fs.exposures >= 10
    UNION ALL
    SELECT 'dimension', 'accuracy', 'words',
      GREATEST((93 - d.value) / 93, 0),
      LEAST(d.evidence::numeric / 10, 1), d.evidence,
      COALESCE((SELECT trend FROM public.adaptive_skill_trends
                WHERE user_id = p_user AND metric = 'accuracy'),
               'insufficient')
    FROM public.learner_skill_dimensions d
    WHERE d.user_id = p_user AND d.dimension = 'accuracy'
      AND d.value < 93 AND d.evidence >= 3
    UNION ALL
    SELECT 'dimension', 'wpm', 'words',
      GREATEST(1 - d.value / 50, 0),
      LEAST(d.evidence::numeric / 10, 1), d.evidence,
      COALESCE((SELECT trend FROM public.adaptive_skill_trends
                WHERE user_id = p_user AND metric = 'wpm'),
               'insufficient')
    FROM public.learner_skill_dimensions d
    WHERE d.user_id = p_user AND d.dimension = 'wpm'
      AND d.value < 40 AND d.evidence >= 3
  ) AS w
  WHERE w.score > 0
  ORDER BY w.score DESC
  LIMIT 20;

  -- Practice band from overall level (same cutoffs as TS bandFor).
  IF v_acc IS NOT NULL AND v_wpm IS NOT NULL
     AND ((v_acc >= 95 OR v_wpm >= 50) AND v_acc >= 90) THEN
    v_band := 'expert';
  ELSIF v_acc IS NOT NULL AND v_wpm IS NOT NULL
     AND ((v_acc >= 85 OR v_wpm >= 25) AND v_acc >= 80) THEN
    v_band := 'intermediate';
  ELSE
    v_band := 'beginner';
  END IF;
  UPDATE public.learner_skill_profiles
  SET practice_band = v_band, algo_version = 'adaptive-v1', updated_at = now()
  WHERE user_id = p_user;

  -- Per-game runtime difficulty (layered; game definitions untouched).
  -- Form is judged against the game's own current band (beginner until
  -- played), never the fresh overall band — otherwise strong overall
  -- targets would freeze every game at its starting rung.
  FOR v_cand IN
    SELECT DISTINCT s.game_slug AS g
    FROM public.adaptive_attempt_samples s
    WHERE s.user_id = p_user
      AND s.submitted_at > now() - interval '30 days'
    LIMIT 20
  LOOP
    SELECT band INTO v_game_band FROM public.adaptive_game_difficulty
    WHERE user_id = p_user AND game_slug = v_cand.g;
    IF NOT FOUND OR v_game_band IS NULL THEN
      v_game_band := 'beginner';
    END IF;
    INSERT INTO public.adaptive_game_difficulty
      (user_id, game_slug, band, prompt_min_len, prompt_max_len,
       target_wpm, target_accuracy)
    SELECT p_user, v_cand.g, nb.band,
           GREATEST(1, round(nb.prompt_min_len * nb.step)::int),
           GREATEST(1, round(nb.prompt_max_len * nb.step)::int),
           round(nb.target_wpm * nb.step, 1),
           LEAST(GREATEST(nb.target_accuracy, 50), 99)
    FROM (
      SELECT
        CASE WHEN count(*) = 3
                  AND bool_and(f.accuracy >= dp.target_accuracy + 2
                               AND f.wpm >= dp.target_wpm) THEN 'up'
             WHEN count(*) = 3
                  AND bool_and(f.accuracy < 80) THEN 'down'
             ELSE 'same' END AS dir
      FROM (SELECT accuracy, wpm FROM public.adaptive_attempt_samples
            WHERE user_id = p_user AND game_slug = v_cand.g
            ORDER BY submitted_at DESC LIMIT 3) AS f,
           (SELECT target_accuracy, target_wpm FROM public.difficulty_profiles
            WHERE id = v_game_band) AS dp
    ) AS form,
    LATERAL (
      SELECT
        CASE WHEN form.dir = 'up' AND v_game_band = 'beginner' THEN 'intermediate'
             WHEN form.dir = 'up' AND v_game_band = 'intermediate' THEN 'expert'
             WHEN form.dir = 'down' AND v_game_band = 'expert' THEN 'intermediate'
             WHEN form.dir = 'down' AND v_game_band = 'intermediate' THEN 'beginner'
             ELSE v_game_band END AS band
    ) AS nb2,
    LATERAL (
      SELECT nb2.band AS band,
        CASE WHEN nb2.band = 'expert' THEN 1.25
             WHEN nb2.band = 'intermediate' THEN 1.0
             ELSE 0.8 END AS step,
        dp2.prompt_min_len, dp2.prompt_max_len,
        dp2.target_wpm, dp2.target_accuracy
      FROM public.difficulty_profiles dp2 WHERE dp2.id = nb2.band
    ) AS nb
    ON CONFLICT (user_id, game_slug) DO UPDATE SET
      band = EXCLUDED.band, prompt_min_len = EXCLUDED.prompt_min_len,
      prompt_max_len = EXCLUDED.prompt_max_len,
      target_wpm = EXCLUDED.target_wpm,
      target_accuracy = EXCLUDED.target_accuracy,
      updated_at = now();
  END LOOP;

  -- Recommendations: top weakness signals × matching unlocked games,
  -- mission-aligned where today's assignments fit, fatigue-filtered.
  UPDATE public.adaptive_recommendations SET status = 'superseded'
  WHERE user_id = p_user AND status = 'active';
  FOR v_sig IN
    SELECT target_type, target, prompt_kind, score, confidence, trend
    FROM public.adaptive_weaknesses
    WHERE user_id = p_user
    ORDER BY score DESC
    LIMIT 5
  LOOP
    -- Best unlocked game of the matching kind (unlock rules respected).
    SELECT gs.slug INTO v_g
    FROM public.games gs
    JOIN public.prompt_sets ps ON ps.ref = gs.prompt_set_ref
    WHERE gs.is_active AND ps.kind = v_sig.prompt_kind
      AND (
        EXISTS (SELECT 1 FROM public.game_unlocks u
                WHERE u.user_id = p_user AND u.game_slug = gs.slug
                  AND u.unlocked)
        OR COALESCE(gs.unlock_rule ->> 'type', 'open') = 'open')
      AND NOT EXISTS (SELECT 1 FROM public.adaptive_exposure e
                      WHERE e.user_id = p_user AND e.game_slug = gs.slug
                        AND e.shows_in_window >= 2
                        AND e.last_shown > now() - interval '7 days')
    ORDER BY CASE WHEN gs.difficulty = v_band THEN 0 ELSE 1 END,
             gs.slug
    LIMIT 1;
    v_unl := FOUND;
    IF NOT FOUND THEN
      -- Preparation path: an unlocked game of the same kind first.
      SELECT gs.slug INTO v_g
      FROM public.games gs
      JOIN public.prompt_sets ps ON ps.ref = gs.prompt_set_ref
      WHERE gs.is_active AND ps.kind = v_sig.prompt_kind
        AND (
          EXISTS (SELECT 1 FROM public.game_unlocks u
                  WHERE u.user_id = p_user AND u.game_slug = gs.slug
                    AND u.unlocked)
          OR COALESCE(gs.unlock_rule ->> 'type', 'open') = 'open')
      ORDER BY gs.slug
      LIMIT 1;
    END IF;
    IF NOT FOUND OR v_g IS NULL THEN
      CONTINUE;
    END IF;
    -- Mission alignment: today's assigned daily instance constraining
    -- this game stays inside M9 (we only reference the instance).
    SELECT m.id INTO v_mid
    FROM public.daily_mission_assignments a
    JOIN public.missions m ON m.id = a.mission_id
    WHERE a.user_id = p_user AND a.day = CURRENT_DATE
      AND EXISTS (SELECT 1
                  FROM jsonb_array_elements_text(
                    COALESCE(m.game_constraints -> 'games', '[]'::jsonb)) AS gc(slug)
                  WHERE gc.slug = v_g)
    LIMIT 1;
    IF FOUND THEN
      v_reason := 'DAILY_MISSION';
    ELSE
      SELECT m.id INTO v_mid
      FROM public.weekly_challenges a
      JOIN public.missions m ON m.id = a.mission_id
      WHERE a.user_id = p_user
        AND a.week_start <= CURRENT_DATE
        AND a.week_start > CURRENT_DATE - 7
        AND EXISTS (SELECT 1
                    FROM jsonb_array_elements_text(
                      COALESCE(m.game_constraints -> 'games', '[]'::jsonb)) AS gc(slug)
                    WHERE gc.slug = v_g)
      LIMIT 1;
      IF FOUND THEN
        v_reason := 'WEEKLY_CHALLENGE';
      ELSIF v_sig.target_type = 'finger' THEN
        v_reason := 'WEAK_FINGER';
        v_mid := NULL;
      ELSIF v_sig.target_type = 'dimension' AND v_sig.target = 'wpm' THEN
        v_reason := 'LOW_WPM';
        v_mid := NULL;
      ELSIF v_sig.target_type = 'dimension' AND v_sig.target = 'accuracy' THEN
        v_reason := 'LOW_ACCURACY';
        v_mid := NULL;
      ELSIF v_sig.trend = 'declining' THEN
        v_reason := 'DECLINING_TREND';
        v_mid := NULL;
      ELSIF NOT v_unl THEN
        v_reason := 'UNLOCK_PREPARATION';
        v_mid := NULL;
      ELSE
        v_reason := 'WEAK_KEY';
        v_mid := NULL;
      END IF;
    END IF;
    v_msg := CASE v_reason
      WHEN 'WEAK_KEY' THEN v_sig.target || ' needs a little more practice.'
      WHEN 'WEAK_FINGER' THEN 'Your ' || replace(v_sig.target, '_', ' ')
        || ' could use a focused drill.'
      WHEN 'LOW_ACCURACY' THEN 'Steady accuracy practice will lock in your progress.'
      WHEN 'LOW_WPM' THEN 'A speed session is ready when you are.'
      WHEN 'DECLINING_TREND' THEN 'A short refresher will get you back on track.'
      WHEN 'UNLOCK_PREPARATION' THEN 'Warm up here to unlock your next game.'
      WHEN 'DAILY_MISSION' THEN 'Today''s mission lines up with your practice.'
      WHEN 'WEEKLY_CHALLENGE' THEN 'This week''s challenge fits your current focus.'
      ELSE 'A good next step for your practice.' END;
    v_benefit := CASE
      WHEN v_reason IN ('WEAK_KEY', 'WEAK_FINGER')
        THEN 'Targeted play, about 5 minutes.'
      WHEN v_reason = 'LOW_WPM' THEN 'Builds comfortable speed without pressure.'
      WHEN v_reason = 'LOW_ACCURACY' THEN 'Locks in clean, confident keystrokes.'
      ELSE 'Keeps your streak of improvement going.' END;
    v_trend_u := CASE v_sig.trend
      WHEN 'declining' THEN 1 WHEN 'stable' THEN 0.5
      WHEN 'insufficient' THEN 0.4 ELSE 0.2 END;
    SELECT COALESCE(e.shows_in_window, 0) INTO v_shows
    FROM public.adaptive_exposure e
    WHERE e.user_id = p_user AND e.game_slug = v_g;
    IF NOT FOUND THEN
      v_shows := 0;
    END IF;
    v_fresh := GREATEST(0, 1 - v_shows::numeric / 7);
    SELECT CASE WHEN gs.difficulty = v_band THEN 1 ELSE 0.5 END INTO v_fit
    FROM public.games gs WHERE gs.slug = v_g;
    v_priority :=
      0.3 * v_sig.score + 0.15 * v_sig.confidence + 0.15 * v_trend_u +
      0.1 * 1.0 + 0.1 * COALESCE(v_fit, 0.5) + 0.1 * v_fresh +
      0.05 * CASE WHEN v_mid IS NOT NULL THEN 1 ELSE 0 END +
      0.05 * CASE WHEN v_unl THEN 1 ELSE 0.5 END;
    v_rank := v_rank + 1;
    INSERT INTO public.adaptive_recommendations
      (user_id, rank, game_slug, difficulty, mission_id, reason_code,
       message, expected_benefit, confidence, priority,
       targets, status, algo_version)
    VALUES (p_user, v_rank, v_g, v_band, v_mid, v_reason,
      v_msg, v_benefit, LEAST(v_sig.confidence, 1), v_priority,
      ARRAY[v_sig.target], 'active', 'adaptive-v1');
    v_recs := v_recs + 1;
    INSERT INTO public.adaptive_exposure (user_id, game_slug, shows_in_window)
    VALUES (p_user, v_g, 1)
    ON CONFLICT (user_id, game_slug) DO UPDATE SET
      shows_in_window = CASE
        WHEN adaptive_exposure.last_shown < now() - interval '7 days' THEN 1
        ELSE adaptive_exposure.shows_in_window + 1 END,
      last_shown = now();
    EXIT WHEN v_recs >= 5;
  END LOOP;

  -- Starter fallback: no evidence yet → first unlocked beginner game.
  IF v_recs = 0 THEN
    SELECT gs.slug INTO v_g
    FROM public.games gs
    WHERE gs.is_active AND gs.difficulty = 'beginner'
      AND (
        EXISTS (SELECT 1 FROM public.game_unlocks u
                WHERE u.user_id = p_user AND u.game_slug = gs.slug
                  AND u.unlocked)
        OR COALESCE(gs.unlock_rule ->> 'type', 'open') = 'open')
    ORDER BY gs.slug
    LIMIT 1;
    IF FOUND THEN
      INSERT INTO public.adaptive_recommendations
        (user_id, rank, game_slug, difficulty, reason_code, message,
         expected_benefit, confidence, priority, targets, status,
         algo_version)
      VALUES (p_user, 1, v_g, 'beginner', 'LOW_ACCURACY',
        'A gentle warm-up to begin.',
        'Builds a baseline for personal practice.',
        0.3, 0.3, '{}', 'active', 'adaptive-v1');
      v_recs := 1;
    END IF;
  END IF;

  UPDATE public.learner_skill_profiles
  SET rec_cache_version = rec_cache_version + 1, updated_at = now()
  WHERE user_id = p_user;
  RETURN jsonb_build_object('user_id', p_user, 'band', v_band,
    'recommendations', v_recs);
END;
$$;

-- Self refresh (post-attempt hook + manual "refresh my plan").
CREATE OR REPLACE FUNCTION public.fn_refresh_adaptive_profile()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  RETURN public.fn_adaptive_recompute(v_me);
END;
$$;

-- Cheap cached summary for dashboards (never recomputes).
CREATE OR REPLACE FUNCTION public.fn_get_adaptive_summary()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  RETURN jsonb_build_object(
    'profile', (SELECT to_jsonb(p) FROM public.learner_skill_profiles p
                WHERE p.user_id = v_me),
    'dimensions', (SELECT COALESCE(jsonb_agg(
      jsonb_build_object('dimension', dimension, 'value', value,
                         'evidence', evidence)
      ORDER BY dimension), '[]'::jsonb)
      FROM public.learner_skill_dimensions WHERE user_id = v_me),
    'trends', (SELECT COALESCE(jsonb_agg(
      jsonb_build_object('metric', metric, 'recent', recent_value,
                         'baseline', baseline_value, 'trend', trend,
                         'evidence', evidence)
      ORDER BY metric), '[]'::jsonb)
      FROM public.adaptive_skill_trends WHERE user_id = v_me),
    'weaknesses', (SELECT COALESCE(jsonb_agg(
      jsonb_build_object('type', target_type, 'target', target,
                         'prompt_kind', prompt_kind, 'score', score,
                         'confidence', confidence, 'trend', trend)
      ORDER BY score DESC), '[]'::jsonb)
      FROM public.adaptive_weaknesses WHERE user_id = v_me),
    'recommendations', (SELECT COALESCE(jsonb_agg(
      jsonb_build_object('id', id, 'rank', rank, 'game_slug', game_slug,
                         'difficulty', difficulty, 'mission_id', mission_id,
                         'reason', reason_code, 'message', message,
                         'benefit', expected_benefit,
                         'confidence', confidence, 'targets', targets,
                         'drill_words', drill_words)
      ORDER BY rank), '[]'::jsonb)
      FROM public.adaptive_recommendations
      WHERE user_id = v_me AND status = 'active'
        AND expires_at > now()),
    'difficulty', (SELECT COALESCE(jsonb_agg(
      jsonb_build_object('game_slug', game_slug, 'band', band,
                         'prompt_min_len', prompt_min_len,
                         'prompt_max_len', prompt_max_len,
                         'target_wpm', target_wpm,
                         'target_accuracy', target_accuracy)
      ORDER BY game_slug), '[]'::jsonb)
      FROM public.adaptive_game_difficulty WHERE user_id = v_me));
END;
$$;

-- Feedback: students report what happened (never scores).
CREATE OR REPLACE FUNCTION public.fn_adaptive_feedback(
  p_recommendation uuid, p_event text
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF v_me IS NULL THEN
    RAISE EXCEPTION 'NOT_AUTHENTICATED';
  END IF;
  IF p_event NOT IN ('shown', 'started', 'completed', 'abandoned', 'skipped') THEN
    RAISE EXCEPTION 'MALFORMED';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.adaptive_recommendations
                 WHERE id = p_recommendation AND user_id = v_me) THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  INSERT INTO public.adaptive_recommendation_events
    (recommendation_id, user_id, event)
  VALUES (p_recommendation, v_me, p_event);
  IF p_event = 'started' THEN
    UPDATE public.adaptive_recommendations SET status = 'accepted'
    WHERE id = p_recommendation AND status = 'active';
  ELSIF p_event = 'completed' THEN
    UPDATE public.adaptive_recommendations SET status = 'completed'
    WHERE id = p_recommendation AND status IN ('active', 'accepted');
  ELSIF p_event = 'skipped' THEN
    UPDATE public.adaptive_recommendations SET status = 'dismissed'
    WHERE id = p_recommendation AND status = 'active';
  END IF;
END;
$$;

-- Teacher batch summary: attention flags + aggregates only — never
-- another student's key-level weakness detail.
CREATE OR REPLACE FUNCTION public.fn_adaptive_batch_summary(p_batch uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_teacher_of_batch(p_batch)
     AND NOT public.fn_is_mission_admin()
     AND NOT public.is_super_admin()
     AND NOT public.is_org_admin(
       public.batch_organization_id(p_batch)) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN jsonb_build_object(
    'batch_id', p_batch,
    'attention', (SELECT COALESCE(jsonb_agg(x ORDER BY x.user_id), '[]'::jsonb)
      FROM (
        SELECT bm.user_id,
          EXISTS (SELECT 1 FROM public.adaptive_skill_trends t
                  WHERE t.user_id = bm.user_id AND t.metric = 'accuracy'
                    AND t.trend = 'declining') AS accuracy_declining,
          EXISTS (SELECT 1 FROM public.adaptive_skill_trends t
                  WHERE t.user_id = bm.user_id AND t.metric = 'wpm'
                    AND t.trend = 'declining') AS wpm_declining,
          (SELECT count(*) FROM public.adaptive_key_stats ks
           WHERE ks.user_id = bm.user_id AND ks.exposures >= 20
             AND ks.errors::numeric / NULLIF(ks.exposures, 0) > 0.2) AS critical_keys
        FROM public.batch_members bm
        WHERE bm.batch_id = p_batch AND bm.is_active
      ) AS x
      WHERE x.accuracy_declining OR x.wpm_declining OR x.critical_keys >= 3),
    'averages', (SELECT jsonb_build_object(
        'accuracy', avg(d.value) FILTER (WHERE d.dimension = 'accuracy'),
        'wpm', avg(d.value) FILTER (WHERE d.dimension = 'wpm'),
        'students', count(DISTINCT d.user_id))
      FROM public.learner_skill_dimensions d
      JOIN public.batch_members bm ON bm.user_id = d.user_id
      WHERE bm.batch_id = p_batch AND bm.is_active),
    'weak_mechanics', (SELECT COALESCE(jsonb_agg(x ORDER BY x.err DESC), '[]'::jsonb)
      FROM (
        SELECT replace(d.dimension, 'mech_', '') AS mechanic,
               avg(100 - d.value) AS err
        FROM public.learner_skill_dimensions d
        JOIN public.batch_members bm ON bm.user_id = d.user_id
        WHERE bm.batch_id = p_batch AND bm.is_active
          AND d.dimension LIKE 'mech\_%' AND d.evidence >= 3
        GROUP BY d.dimension
      ) AS x),
    'bands', (SELECT COALESCE(jsonb_agg(x), '[]'::jsonb)
      FROM (
        SELECT p.practice_band AS band, count(*) AS students
        FROM public.learner_skill_profiles p
        JOIN public.batch_members bm ON bm.user_id = p.user_id
        WHERE bm.batch_id = p_batch AND bm.is_active
        GROUP BY p.practice_band
      ) AS x));
END;
$$;

-- Global aggregates for admins (effectiveness + content signals).
CREATE OR REPLACE FUNCTION public.fn_adaptive_global_summary()
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_mission_admin() AND NOT public.is_super_admin() THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  RETURN jsonb_build_object(
    'learners', (SELECT count(*) FROM public.learner_skill_profiles),
    'avg_accuracy', (SELECT avg(value) FROM public.learner_skill_dimensions
                     WHERE dimension = 'accuracy' AND evidence >= 3),
    'avg_wpm', (SELECT avg(value) FROM public.learner_skill_dimensions
                WHERE dimension = 'wpm' AND evidence >= 3),
    'funnel', (SELECT jsonb_build_object(
        'shown', count(*) FILTER (WHERE event = 'shown'),
        'started', count(*) FILTER (WHERE event = 'started'),
        'completed', count(*) FILTER (WHERE event = 'completed'),
        'skipped', count(*) FILTER (WHERE event = 'skipped'))
      FROM public.adaptive_recommendation_events
      WHERE created_at > now() - interval '30 days'),
    'game_completion', (SELECT COALESCE(jsonb_agg(x ORDER BY x.completion DESC), '[]'::jsonb)
      FROM (
        SELECT game_slug, avg(completion) AS completion, count(*) AS attempts
        FROM public.adaptive_attempt_samples
        WHERE submitted_at > now() - interval '30 days'
        GROUP BY game_slug
      ) AS x));
END;
$$;

-- Scheduler sweep: recompute stale profiles (never assumes always-on).
CREATE OR REPLACE FUNCTION public.fn_adaptive_sweep()
RETURNS int
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_n int := 0;
BEGIN
  FOR r IN
    SELECT user_id FROM public.learner_skill_profiles
    WHERE evidence_count > 0
      AND (last_attempt_at > updated_at
           OR updated_at < now() - interval '1 day')
    ORDER BY updated_at ASC
    LIMIT 50
  LOOP
    BEGIN
      PERFORM public.fn_adaptive_recompute(r.user_id);
      v_n := v_n + 1;
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
  RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.adaptive_finger_for(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adaptive_finger_for(text) TO authenticated;
REVOKE ALL ON FUNCTION public.adaptive_classify_pair(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.adaptive_classify_pair(text, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_record_adaptive_attempt(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_record_adaptive_attempt(uuid, jsonb, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_adaptive_recompute(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_adaptive_recompute(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_refresh_adaptive_profile() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_refresh_adaptive_profile() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_get_adaptive_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_get_adaptive_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_adaptive_feedback(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_adaptive_feedback(uuid, text) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_adaptive_batch_summary(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_adaptive_batch_summary(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_adaptive_global_summary() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_adaptive_global_summary() TO authenticated;
REVOKE ALL ON FUNCTION public.fn_adaptive_sweep() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_adaptive_sweep() TO authenticated;
