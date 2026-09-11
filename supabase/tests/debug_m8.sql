BEGIN;
INSERT INTO auth.users (id, email) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'dbg8@example.com'),
  ('e4e4e4e4-4444-4444-4444-444444444444', 'm8su@example.com');
INSERT INTO public.profiles (id, email, full_name) VALUES
  ('f0000000-0000-0000-0000-000000000001', 'dbg8@example.com', 'Dbg'),
  ('e4e4e4e4-4444-4444-4444-444444444444', 'm8su@example.com', 'Super Su');
INSERT INTO public.user_roles (user_id, role) VALUES
  ('e4e4e4e4-4444-4444-4444-444444444444', 'super_admin');
INSERT INTO public.worlds (id, sort_order, name_en) VALUES ('dbg-w', 93, 'W');
INSERT INTO public.prompt_sets (ref, version, kind, language, items) VALUES
  ('dbg-ps', 1, 'letters', 'en', '["a"]');
INSERT INTO public.games
  (slug, world_id, category, mechanic, mode, difficulty,
   prompt_set_ref, scoring_profile_id, is_active, current_version)
VALUES ('dbg-game', 'dbg-w', 't', 'target-press', 'letter', 'beginner',
  'dbg-ps', 'standard', true, 1);
INSERT INTO public.game_versions (game_id, version, definition)
SELECT id, 1, '{}' FROM public.games WHERE slug = 'dbg-game';
GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA auth TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;
SET ROLE authenticated;
SELECT tests.set_claims('e4e4e4e4-4444-4444-4444-444444444444', 'm8su@example.com');
SELECT public.fn_create_competition(
  'dbg-c', 't', '', 'SCORE_ATTACK', 'batch',
  '{}', '{}', '{}', NULL, NULL, NULL, ARRAY['dbg-game'], NULL,
  '{"metric":"score"}'::jsonb, ARRAY['score'], 'BEST_SCORE', 5,
  NULL, NULL,
  '{"xp":{"1":100,"participation":10},"coins":{"1":20}}'::jsonb,
  now() - interval '1 hour', now() + interval '1 hour', NULL, NULL);
SELECT slug, reward_policy, scoring FROM public.competitions WHERE slug = 'dbg-c';
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'dbg-c'), 'scheduled');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'dbg-c'), 'registration_open');
SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT public.fn_register_entry(
  (SELECT id FROM public.competitions WHERE slug = 'dbg-c')) AS entry;
SELECT tests.set_claims('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'dbg-c'), 'live');
SELECT tests.set_claims('e5e5e5e5-5555-5555-5555-555555555555', 'm8s1@example.com');
SELECT public.fn_start_attempt('dbg-game', 'beginner', 's', 'DBG RUN', 900) AS started;
SELECT public.fn_submit_attempt(
  (SELECT id FROM public.game_attempts WHERE expected_text = 'DBG RUN'),
  '{"totalCharacters":50}'::jsonb, 100, 95, 20, true) AS submitted;
SELECT public.fn_attach_attempt(
  (SELECT id FROM public.competitions WHERE slug = 'dbg-c'),
  (SELECT id FROM public.game_attempts WHERE expected_text = 'DBG RUN')) AS attached;
SELECT tests.set_claims('e1e1e1e1-1111-1111-1111-111111111111', 'm8t@example.com');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'dbg-c'), 'ended');
SELECT public.fn_transition_competition(
  (SELECT id FROM public.competitions WHERE slug = 'dbg-c'), 'processing');
SELECT public.fn_finalize_competition(
  (SELECT id FROM public.competitions WHERE slug = 'dbg-c')) AS summary;
SELECT user_id, amount, reference_id FROM public.xp_ledger WHERE source = 'competition';
SELECT competition_id, scope, ref_id, rank, score FROM public.competition_results;
ROLLBACK;
