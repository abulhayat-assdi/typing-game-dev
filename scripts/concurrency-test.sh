#!/usr/bin/env bash
# M18: real concurrency verification against PostgreSQL.
# Races two simultaneous callers at the same business operation and
# asserts the invariants — not timing — hold every round:
#   shop purchase   → exactly one debit, no negative balance
#   rewarded grant  → exactly one grant row
#   progression     → single processing (idempotent replay)
#   tournament vote → single advancement (second IMMUTABLE)
#   season ingest   → single point event
#
# Auth model: every statement needing auth.uid() runs inside ONE
# explicit transaction with SET LOCAL ROLE + tests.set_claims
# (SET LOCAL dies at commit, so per-statement psql calls lose auth).
# Requires a scratch DB with supabase/tests/bootstrap_auth_stub.sql
# applied (verify-migrations.sh scratch DBs qualify) and a superuser
# DATABASE_URL for fixture setup.
#
# Usage: DATABASE_URL=postgres://... ./scripts/concurrency-test.sh
set -euo pipefail

: "${DATABASE_URL:?DATABASE_URL is required}"

USERID=e8e8e8e8-0000-0000-0000-000000000002
ADMINID=e8e8e8e8-0000-0000-0000-000000000001
USER3=e8e8e8e8-0000-0000-0000-000000000003
USER4=e8e8e8e8-0000-0000-0000-000000000004

# Test bootstrap provides auth.uid()/set_claims on scratch databases.
if [[ "$(psql "$DATABASE_URL" -t -A -q -c "SELECT to_regprocedure('tests.set_claims(uuid,text)') IS NOT NULL;")" != "t" ]]; then
  echo "concurrency-test needs tests.set_claims (apply supabase/tests/bootstrap_auth_stub.sql on a scratch DB)"
  exit 2
fi

# q: superuser read/write (fixtures + assertions; bypasses RLS).
q() { psql "$DATABASE_URL" -t -A -q -c "$1"; }

# as <user-uuid> <email> <sql...> — one transaction as authenticated
# with JWT claims (role + claims revert at COMMIT).
as() {
  local uuid="$1" email="$2"
  shift 2
  psql "$DATABASE_URL" -t -A -q -c "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$uuid', '$email'); $*; COMMIT;"
}

run2() { # run2 <sql-a> <sql-b> : launch simultaneously, wait
  local a="$1" b="$2"
  psql "$DATABASE_URL" -q -c "$a" >/dev/null 2>&1 &
  local pa=$!
  psql "$DATABASE_URL" -q -c "$b" >/dev/null 2>&1 &
  local pb=$!
  wait "$pa" || true
  wait "$pb" || true
}

pass=0
fail=0
check() { # check <desc> <actual> <expected>
  if [[ "$2" == "$3" ]]; then
    pass=$((pass + 1)); echo "  ok - $1 ($2)"
  else
    fail=$((fail + 1)); echo "  NOT OK - $1 (have $2, want $3)"
  fi
}

echo "==> fixtures"
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q <<'SQL'
GRANT USAGE ON SCHEMA public, auth, tests TO authenticated;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA tests TO authenticated;
INSERT INTO auth.users (id, email) VALUES
  ('e8e8e8e8-0000-0000-0000-000000000001', 'load-admin@x'),
  ('e8e8e8e8-0000-0000-0000-000000000002', 'load-user@x'),
  ('e8e8e8e8-0000-0000-0000-000000000003', 'load-u3@x'),
  ('e8e8e8e8-0000-0000-0000-000000000004', 'load-u4@x')
ON CONFLICT DO NOTHING;
INSERT INTO public.profiles (id, email, full_name, timezone, coin_balance) VALUES
  ('e8e8e8e8-0000-0000-0000-000000000001', 'load-admin@x', 'A', 'UTC', 0),
  ('e8e8e8e8-0000-0000-0000-000000000002', 'load-user@x', 'U', 'UTC', 100000),
  ('e8e8e8e8-0000-0000-0000-000000000003', 'load-u3@x', 'U3', 'UTC', 0),
  ('e8e8e8e8-0000-0000-0000-000000000004', 'load-u4@x', 'U4', 'UTC', 0)
ON CONFLICT (id) DO UPDATE SET coin_balance = EXCLUDED.coin_balance;
INSERT INTO public.user_roles (user_id, role) VALUES
  ('e8e8e8e8-0000-0000-0000-000000000001', 'super_admin'),
  ('e8e8e8e8-0000-0000-0000-000000000002', 'student'),
  ('e8e8e8e8-0000-0000-0000-000000000003', 'student'),
  ('e8e8e8e8-0000-0000-0000-000000000004', 'student')
ON CONFLICT DO NOTHING;
INSERT INTO public.worlds (id, sort_order, name_en) VALUES
  ('load-world', 999, 'Load') ON CONFLICT (id) DO NOTHING;
INSERT INTO public.prompt_sets (ref, kind, items) VALUES
  ('load-words', 'words', '["hi"]'::jsonb) ON CONFLICT (ref) DO NOTHING;
INSERT INTO public.games
  (slug, world_id, category, mechanic, mode, difficulty, prompt_set_ref,
   scoring_profile_id, unlock_rule, is_active)
VALUES ('load-game', 'load-world', 'drill', 'word', 'standard', 'beginner',
  'load-words', 'standard', '{"type":"open"}', true)
ON CONFLICT (slug) DO NOTHING;
INSERT INTO public.game_versions (game_id, version, definition)
SELECT id, 1, '{}'::jsonb FROM public.games WHERE slug = 'load-game'
ON CONFLICT (game_id, version) DO NOTHING;
SQL
as "$ADMINID" load-admin@x \
  "SELECT public.fn_create_shop_item(jsonb_build_object('slug', 'retry-token', 'name', 'Retry Token', 'category', 'utility', 'item_type', 'utility', 'price_coins', 30, 'max_own', 5, 'consumable', true, 'equippable', false, 'effect', 'retry_credit'));" >/dev/null 2>&1 || true
as "$ADMINID" load-admin@x \
  "SELECT public.fn_set_item_active((SELECT id FROM public.shop_items WHERE slug = 'retry-token'), true);" >/dev/null

echo "==> race 1: shop double-purchase (distinct requests, max_own=1)"
for round in 1 2 3; do
  SLUG="load-r$round"
  q "INSERT INTO public.shop_items (slug, name, category, item_type, price_coins, max_own, is_active) VALUES ('$SLUG', 'Load $round', 'titles', 'profile', 10, 1, true) ON CONFLICT (slug) DO NOTHING;" >/dev/null
  IID=$(q "SELECT id FROM public.shop_items WHERE slug='$SLUG';")
  run2 "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$USERID', 'load-user@x'); SELECT public.fn_purchase_item('$IID', NULL, 'race-a'); COMMIT;" \
       "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$USERID', 'load-user@x'); SELECT public.fn_purchase_item('$IID', NULL, 'race-b'); COMMIT;"
  check "round $round single purchase row" \
    "$(q "SELECT count(*) FROM public.purchase_records WHERE user_id='$USERID' AND item_id='$IID';")" "1"
done
check "balance consistent (3 debits of 10)" \
  "$(q "SELECT coin_balance FROM public.profiles WHERE id='$USERID';")" "99970"
check "no negative balances" \
  "$(q "SELECT count(*) FROM public.profiles WHERE coin_balance < 0;")" "0"

echo "==> race 2: rewarded double-grant (same verified session)"
as "$ADMINID" load-admin@x \
  "SELECT public.fn_set_rewarded_flag('REWARDED_ADS_ENABLED', true); SELECT public.fn_set_rewarded_policy('{\"enabled\": true, \"provider\": \"mock\", \"mock_allowed\": true, \"daily_limit\": 100, \"cooldown_minutes\": 0, \"max_rewards_per_day\": 100}'::jsonb);" >/dev/null
for round in 1 2 3; do
  SID=$(as "$USERID" load-user@x "SELECT public.fn_rewarded_offer('load', 'retry-token');" | tail -n 1)
  as "$USERID" load-user@x \
    "SELECT public.fn_rewarded_opt_in('$SID'); SELECT public.fn_rewarded_start('$SID');" >/dev/null
  REF=$(q "SELECT provider_reference FROM public.rewarded_ad_sessions WHERE id='$SID';")
  as "$USERID" load-user@x \
    "SELECT public.fn_rewarded_complete('$SID', jsonb_build_object('provider_reference', '$REF')); SELECT public.fn_rewarded_verify('$SID');" >/dev/null
  run2 "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$USERID', 'load-user@x'); SELECT public.fn_rewarded_grant('$SID'); COMMIT;" \
       "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$USERID', 'load-user@x'); SELECT public.fn_rewarded_grant('$SID'); COMMIT;"
  check "round $round single grant" \
    "$(q "SELECT count(*) FROM public.rewarded_ad_grants WHERE session_id='$SID';")" "1"
done

echo "==> race 3: progression double-process (same attempt)"
GID=$(q "SELECT id FROM public.games WHERE slug='load-game';")
GVID=$(q "SELECT id FROM public.game_versions WHERE game_id='$GID' ORDER BY version DESC LIMIT 1;")
for round in 1 2 3; do
  AID=$(q "INSERT INTO public.game_attempts (user_id, game_id, game_version_id, prompt_seed, expected_text, difficulty, status, submitted_at, finalized_at) VALUES ('$USERID', '$GID', '$GVID', 'load-$round', 'hello world', 'beginner', 'validated', now(), now()) RETURNING id;")
  q "INSERT INTO public.attempt_results (attempt_id, raw, score, accuracy, effective_wpm, is_valid) VALUES ('$AID', '{\"completion\": 100, \"totalCharacters\": 11, \"correctCharacters\": 11, \"incorrectCharacters\": 0, \"errorStrokes\": 0, \"correctedCharacters\": 0, \"durationMs\": 5000, \"completedWords\": 2}', 10, 100, 20, true) ON CONFLICT DO NOTHING;" >/dev/null
  run2 "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$USERID', 'load-user@x'); SELECT public.fn_process_progression('$AID'); COMMIT;" \
       "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$USERID', 'load-user@x'); SELECT public.fn_process_progression('$AID'); COMMIT;"
  check "round $round single progression" \
    "$(q "SELECT count(*) FROM public.reward_events WHERE attempt_id='$AID';")" "1"
done

echo "==> race 4: tournament double-finalize (same match)"
as "$ADMINID" load-admin@x \
  "SELECT public.fn_create_tournament(jsonb_build_object('slug','load-cup','name','Load','participant_type','student'));" >/dev/null
TID=$(q "SELECT id FROM public.tournaments WHERE slug='load-cup';")
as "$ADMINID" load-admin@x "SELECT public.fn_publish_tournament('$TID');" >/dev/null
as "$USERID" load-user@x "SELECT public.fn_register_tournament('$TID');" >/dev/null
as "$USER3" load-u3@x "SELECT public.fn_register_tournament('$TID');" >/dev/null
as "$USER4" load-u4@x "SELECT public.fn_register_tournament('$TID');" >/dev/null
as "$ADMINID" load-admin@x "SELECT public.fn_register_tournament('$TID');" >/dev/null
as "$ADMINID" load-admin@x \
  "SELECT public.fn_close_registration('$TID'); SELECT public.fn_seed_tournament('$TID', 'manual', ARRAY['$USERID'::uuid, '$USER3'::uuid, '$USER4'::uuid, '$ADMINID'::uuid], NULL); SELECT public.fn_start_tournament('$TID');" >/dev/null
MID=$(q "SELECT m.id FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id=m.round_id WHERE m.tournament_id='$TID' AND r.round_no=1 ORDER BY m.slot LIMIT 1;")
as "$ADMINID" load-admin@x "SELECT public.fn_open_tmatch('$MID');" >/dev/null
run2 "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$ADMINID', 'load-admin@x'); SELECT public.fn_finalize_tmatch('$MID', 10, 5); COMMIT;" \
     "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$ADMINID', 'load-admin@x'); SELECT public.fn_finalize_tmatch('$MID', 10, 5); COMMIT;"
check "winner advanced exactly once" \
  "$(q "SELECT count(*) FROM public.tournament_matches m JOIN public.tournament_rounds r ON r.id=m.round_id WHERE m.tournament_id='$TID' AND r.round_no=2 AND (m.participant_a IS NOT NULL OR m.participant_b IS NOT NULL);")" "1"
check "match finalized once" \
  "$(q "SELECT status FROM public.tournament_matches WHERE id='$MID';")" "finalized"

echo "==> race 5: season double-ingest (same outcome)"
as "$ADMINID" load-admin@x \
  "SELECT public.fn_create_season(jsonb_build_object('slug','load-season','name','Load','start_at', now() - interval '1 day','end_at', now() + interval '30 days'));" >/dev/null
SEASON=$(q "SELECT id FROM public.seasons WHERE slug='load-season';")
as "$ADMINID" load-admin@x \
  "SELECT public.fn_schedule_season('$SEASON'); SELECT public.fn_activate_season('$SEASON'); SELECT public.fn_set_season_source('$SEASON','MISSION', true, '{}'::jsonb);" >/dev/null
MID2=$(q "INSERT INTO public.missions (slug, title, status) VALUES ('load-m', 'Load', 'active') ON CONFLICT (slug) DO UPDATE SET status='active' RETURNING id;")
INST=$(q "INSERT INTO public.mission_instances (mission_id, user_id, period, period_start, status, completed_at) VALUES ('$MID2', '$USERID', 'daily', CURRENT_DATE, 'completed', now()) ON CONFLICT DO NOTHING RETURNING id;")
if [[ -z "$INST" ]]; then INST=$(q "SELECT id FROM public.mission_instances WHERE mission_id='$MID2' AND user_id='$USERID' AND period_start=CURRENT_DATE;"); fi
q "INSERT INTO public.season_participants (season_id, participant_type, participant_id, display_name, eligible) VALUES ('$SEASON', 'student', '$USERID', 'Load', true) ON CONFLICT DO NOTHING;" >/dev/null
run2 "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$ADMINID', 'load-admin@x'); SELECT public.fn_record_season_points('$SEASON','MISSION','$INST','student','$USERID',5,now()); COMMIT;" \
     "BEGIN; SET LOCAL ROLE authenticated; SELECT tests.set_claims('$ADMINID', 'load-admin@x'); SELECT public.fn_record_season_points('$SEASON','MISSION','$INST','student','$USERID',5,now()); COMMIT;"
check "single point event" \
  "$(q "SELECT count(*) FROM public.season_point_events WHERE season_id='$SEASON' AND participant_id='$USERID';")" "1"

echo "----------------------------------------"
echo "pass=$pass fail=$fail"
if [[ "$fail" -ne 0 ]]; then echo CONCURRENCY_FAILURES; exit 1; fi
echo CONCURRENCY_OK
