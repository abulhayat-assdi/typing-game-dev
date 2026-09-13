-- M18: post-restore / staging data-integrity gate.
-- Fails closed (RAISE) on any violation. Run with -v ON_ERROR_STOP=1.
-- Covers: balances, ledgers, uniqueness anchors, FK orphans on
-- nullable references, RLS presence on milestone tables.

DO $$
DECLARE
  v_bad int;
BEGIN
  -- Balances never negative.
  SELECT count(*)::int INTO v_bad FROM public.profiles
  WHERE coin_balance < 0 OR xp_total < 0;
  IF v_bad > 0 THEN RAISE EXCEPTION 'INTEGRITY: % profiles with negative balances', v_bad; END IF;

  SELECT count(*)::int INTO v_bad FROM public.coin_ledger WHERE balance_after < 0;
  IF v_bad > 0 THEN RAISE EXCEPTION 'INTEGRITY: % coin ledger rows negative', v_bad; END IF;

  SELECT count(*)::int INTO v_bad FROM public.xp_ledger WHERE balance_after < 0;
  IF v_bad > 0 THEN RAISE EXCEPTION 'INTEGRITY: % xp ledger rows negative', v_bad; END IF;

  -- Business-event uniqueness anchors hold (constraints + content).
  SELECT count(*)::int INTO v_bad FROM (
    SELECT key FROM public.reward_events GROUP BY key HAVING count(*) > 1) AS d;
  IF v_bad > 0 THEN RAISE EXCEPTION 'INTEGRITY: duplicate reward_events keys'; END IF;

  SELECT count(*)::int INTO v_bad FROM (
    SELECT idempotency_key FROM public.purchase_records
    GROUP BY idempotency_key HAVING count(*) > 1) AS d;
  IF v_bad > 0 THEN RAISE EXCEPTION 'INTEGRITY: duplicate purchase keys'; END IF;

  SELECT count(*)::int INTO v_bad FROM (
    SELECT session_id FROM public.rewarded_ad_grants
    GROUP BY session_id HAVING count(*) > 1) AS d;
  IF v_bad > 0 THEN RAISE EXCEPTION 'INTEGRITY: duplicate ad grants'; END IF;

  -- Nullable-reference orphans (non-nullable FKs are constraint-safe).
  SELECT count(*)::int INTO v_bad FROM public.item_grants g
  WHERE g.purchase_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.purchase_records p WHERE p.id = g.purchase_id);
  IF v_bad > 0 THEN RAISE EXCEPTION 'INTEGRITY: % orphaned item grants', v_bad; END IF;

  SELECT count(*)::int INTO v_bad FROM public.streak_events e
  WHERE e.attempt_id IS NOT NULL
    AND NOT EXISTS (SELECT 1 FROM public.game_attempts a WHERE a.id = e.attempt_id);
  IF v_bad > 0 THEN RAISE EXCEPTION 'INTEGRITY: % orphaned streak events', v_bad; END IF;

  -- RLS present on every milestone write surface.
  SELECT count(*)::int INTO v_bad FROM (
    VALUES ('game_attempts'), ('attempt_results'), ('xp_ledger'), ('coin_ledger'),
           ('competitions'), ('clan_wars'), ('boss_instances'), ('seasons'),
           ('season_point_events'), ('tournaments'), ('tournament_matches'),
           ('shop_items'), ('shop_inventory'), ('purchase_records'),
           ('adaptive_attempt_samples'), ('rewarded_ad_sessions'),
           ('rewarded_ad_grants')) AS t(tbl)
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = t.tbl AND rowsecurity);
  IF v_bad > 0 THEN RAISE EXCEPTION 'INTEGRITY: % tables missing RLS', v_bad; END IF;

  RAISE NOTICE 'INTEGRITY_OK';
END;
$$;
