-- M10 clan operations: leadership, roster/board (derived aggregates),
-- clan missions over member activity, bounded help. Students can never
-- write clan state directly (no INSERT/UPDATE policies anywhere).

-- Who may mutate a clan: mission admin, super admin, or the org admin
-- of the clan's organization.
CREATE OR REPLACE FUNCTION public.fn_can_manage_clan(p_clan uuid)
RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN false;
  END IF;
  IF public.is_super_admin() OR public.fn_is_mission_admin() THEN
    RETURN true;
  END IF;
  SELECT organization_id INTO v_org FROM public.clans WHERE id = p_clan;
  IF NOT FOUND THEN
    RETURN false;
  END IF;
  RETURN public.is_org_admin(v_org);
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_is_clan_staff(p_clan uuid, p_user uuid)
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.clan_members
    WHERE clan_id = p_clan AND user_id = p_user AND status = 'active'
      AND role IN ('leader', 'co_leader'));
$$;

-- ---------------------------------------------------------------------------
-- Leadership (audited; single leader enforced; no self-promotion path).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_assign_clan_role(
  p_clan uuid, p_user uuid, p_role public.clan_member_role
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_me uuid := auth.uid();
BEGIN
  IF NOT public.fn_can_manage_clan(p_clan) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.clan_members
                 WHERE clan_id = p_clan AND user_id = p_user
                   AND status = 'active') THEN
    RAISE EXCEPTION 'NOT_MEMBER';
  END IF;
  IF p_role = 'leader' THEN
    UPDATE public.clan_members SET role = 'member'
    WHERE clan_id = p_clan AND role = 'leader' AND user_id <> p_user;
    INSERT INTO public.clan_leadership_audit
      (clan_id, actor_user_id, action, target_user_id)
    SELECT p_clan, v_me, 'transfer_leadership', p_user
    WHERE EXISTS (SELECT 1 FROM public.clan_members
                  WHERE clan_id = p_clan AND role = 'leader');
  END IF;
  UPDATE public.clan_members SET role = p_role
  WHERE clan_id = p_clan AND user_id = p_user;
  INSERT INTO public.clan_leadership_audit
    (clan_id, actor_user_id, action, target_user_id)
  VALUES (p_clan, v_me,
    CASE WHEN p_role = 'leader' THEN 'assign_leader'
         WHEN p_role = 'co_leader' THEN 'assign_co_leader'
         ELSE 'demote' END,
    p_user);
  PERFORM public.fn_log_clan(p_clan, 'leadership_changed', v_me,
    jsonb_build_object('target', p_user, 'role', p_role));
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_remove_clan_co_leader(
  p_clan uuid, p_user uuid
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_can_manage_clan(p_clan) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.clan_members SET role = 'member'
  WHERE clan_id = p_clan AND user_id = p_user AND role = 'co_leader';
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
  INSERT INTO public.clan_leadership_audit
    (clan_id, actor_user_id, action, target_user_id)
  VALUES (p_clan, auth.uid(), 'remove_co_leader', p_user);
  PERFORM public.fn_log_clan(p_clan, 'leadership_changed', auth.uid(),
    jsonb_build_object('target', p_user, 'role', 'member'));
END;
$$;

-- ---------------------------------------------------------------------------
-- Profile + status (org/admin only; batch link itself never moves).
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_set_clan_profile(
  p_clan uuid, p_patch jsonb
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_can_manage_clan(p_clan) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.clans SET
    name = COALESCE(NULLIF(p_patch ->> 'name', ''), name),
    motto = COALESCE(p_patch ->> 'motto', motto),
    description = COALESCE(p_patch ->> 'description', description),
    banner_key = COALESCE(p_patch ->> 'banner_key', banner_key),
    emblem_key = COALESCE(p_patch ->> 'emblem_key', emblem_key),
    updated_at = now()
  WHERE id = p_clan;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.fn_set_clan_status(
  p_clan uuid, p_status public.clan_status
)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_can_manage_clan(p_clan) THEN
    RAISE EXCEPTION 'FORBIDDEN';
  END IF;
  UPDATE public.clans SET status = p_status, updated_at = now()
  WHERE id = p_clan;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'NOT_FOUND';
  END IF;
END;
$$;

-- ---------------------------------------------------------------------------
-- Derived aggregates: clan XP is ALWAYS sum(contributions), never stored.
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.fn_clan_xp(
  p_clan uuid, p_from timestamptz DEFAULT NULL, p_to timestamptz DEFAULT NULL
)
RETURNS int
LANGUAGE sql STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(sum(points), 0)::int FROM public.clan_contributions
  WHERE clan_id = p_clan
    AND (p_from IS NULL OR created_at >= p_from)
    AND (p_to IS NULL OR created_at < p_to);
$$;

-- Privacy-safe roster: display name, roll, level, totals, streak, badges,
-- contribution. No emails, no auth data, no moderation fields.
CREATE OR REPLACE FUNCTION public.fn_clan_roster(p_clan uuid)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  roll_number text,
  member_role public.clan_member_role,
  member_status public.clan_member_status,
  level int,
  xp_total int,
  best_wpm numeric,
  best_accuracy numeric,
  streak_current int,
  badge_count int,
  contribution int,
  is_me boolean
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.fn_is_clan_viewer(p_clan) THEN
    RETURN;
  END IF;
  RETURN QUERY
  SELECT m.user_id,
         COALESCE(NULLIF(p.full_name, ''), 'Player'),
         COALESCE((SELECT bm.roll_number FROM public.batch_members bm
                   JOIN public.clans c ON c.batch_id = bm.batch_id
                   WHERE c.id = p_clan AND bm.user_id = m.user_id
                   LIMIT 1), ''),
         m.role, m.status,
         COALESCE(p.current_level, 1), COALESCE(p.xp_total, 0),
         (SELECT max(value) FROM public.personal_records pr
          WHERE pr.user_id = m.user_id AND pr.metric = 'best_wpm'),
         (SELECT max(value) FROM public.personal_records pr
          WHERE pr.user_id = m.user_id AND pr.metric = 'best_accuracy'),
         COALESCE((SELECT current_count FROM public.streaks s
                   WHERE s.user_id = m.user_id), 0),
         (SELECT count(*)::int FROM public.badge_awards b
          WHERE b.user_id = m.user_id),
         COALESCE((SELECT sum(points)::int FROM public.clan_contributions c2
                   WHERE c2.clan_id = p_clan AND c2.user_id = m.user_id), 0),
         (m.user_id = auth.uid())
  FROM public.clan_members m
  JOIN public.profiles p ON p.id = m.user_id
  WHERE m.clan_id = p_clan
  ORDER BY 12 DESC, 2 ASC;
END;
$$;

-- Clan board across viewer-visible clans (windows: all|weekly|daily).
-- Reuses the contribution aggregate — no second ranking engine.
CREATE OR REPLACE FUNCTION public.fn_clan_board(
  p_window text DEFAULT 'all', p_limit int DEFAULT 20
)
RETURNS TABLE (
  clan_id uuid,
  clan_name text,
  member_count int,
  total_points int,
  rank int
)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_from timestamptz := NULL;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN;
  END IF;
  IF p_window = 'weekly' THEN
    v_from := date_trunc('week', now());
  ELSIF p_window = 'daily' THEN
    v_from := date_trunc('day', now());
  END IF;
  RETURN QUERY
  WITH agg AS (
    SELECT c.id, c.name,
           (SELECT count(*)::int FROM public.clan_members m
            WHERE m.clan_id = c.id AND m.status = 'active'),
           public.fn_clan_xp(c.id, v_from, NULL)
    FROM public.clans c
    WHERE c.status = 'active' AND public.fn_is_clan_viewer(c.id)
  )
  SELECT a.id, a.name, a.count, a.fn_clan_xp,
         ROW_NUMBER() OVER (ORDER BY a.fn_clan_xp DESC, a.name ASC)::int
  FROM agg a
  ORDER BY 5 ASC
  LIMIT GREATEST(p_limit, 1);
END;
$$;

REVOKE ALL ON FUNCTION public.fn_can_manage_clan(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_can_manage_clan(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_assign_clan_role(uuid, uuid, public.clan_member_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_assign_clan_role(uuid, uuid, public.clan_member_role) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_remove_clan_co_leader(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_remove_clan_co_leader(uuid, uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_clan_profile(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_clan_profile(uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_set_clan_status(uuid, public.clan_status) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_set_clan_status(uuid, public.clan_status) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_clan_xp(uuid, timestamptz, timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_clan_xp(uuid, timestamptz, timestamptz) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_clan_roster(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_clan_roster(uuid) TO authenticated;
REVOKE ALL ON FUNCTION public.fn_clan_board(text, int) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.fn_clan_board(text, int) TO authenticated;
