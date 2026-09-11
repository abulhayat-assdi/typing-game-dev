-- M2 0004: Row Level Security matrix (deny-by-default).
--
-- Model (mirrors docs/rls-matrix.md):
--   student       → own rows + same active batch peers + own batch scopes; NO writes
--                   except through SECURITY DEFINER functions (0005).
--   teacher       → assigned courses/batches only (course and/or batch assignments).
--   admin         → own organization only (content + roll fixes; roll changes are
--                   audit-logged by the 0005 trigger regardless of writer).
--   super_admin   → FOR ALL on management tables; SELECT-only elsewhere, with all
--                   privileged writes going through service_role / functions.
--   audit_logs    → append-only: SELECT policies exist, NO insert/update/delete
--                   policies for API roles (trigger + functions write as owner).
--
-- Plain ENABLE ROW LEVEL SECURITY (never FORCE): table owners and service_role
-- must keep bypassing RLS so triggers/functions work. Client access always
-- flows through PostgREST as anon/authenticated.
--
-- RECURSION RULE: a policy body must reference only row columns, auth.uid(),
-- and SECURITY DEFINER helpers from 0003. Direct subqueries against other
-- RLS-protected tables create mutual policy evaluation
-- (courses ↔ teacher_assignments) and Postgres aborts with
-- "infinite recursion detected in policy".

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.courses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batches ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.teacher_assignments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.batch_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------------
-- organizations: tenant roots. Writes are super_admin-only (new tenants).
-- ---------------------------------------------------------------------------
CREATE POLICY organizations_super_admin_all ON public.organizations
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY organizations_select_scoped ON public.organizations
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(id)
    OR id IN (SELECT public.my_member_orgs())
    OR id IN (SELECT public.my_teacher_orgs())
  );

-- ---------------------------------------------------------------------------
-- courses: org admin manages; members/teachers read their scope.
-- ---------------------------------------------------------------------------
CREATE POLICY courses_super_admin_all ON public.courses
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY courses_write_org_admin ON public.courses
  FOR ALL TO authenticated
  USING (public.is_org_admin(organization_id))
  WITH CHECK (public.is_org_admin(organization_id));

CREATE POLICY courses_select_scoped ON public.courses
  FOR SELECT TO authenticated
  USING (
    public.is_org_admin(organization_id)
    OR id IN (SELECT public.my_member_courses())
    OR id IN (SELECT public.my_teacher_courses())
  );

-- ---------------------------------------------------------------------------
-- batches: org admin manages; students see own batch; Batch B invisible.
-- ---------------------------------------------------------------------------
CREATE POLICY batches_super_admin_all ON public.batches
  FOR ALL TO authenticated
  USING (public.is_super_admin()) WITH CHECK (public.is_super_admin());

CREATE POLICY batches_write_org_admin ON public.batches
  FOR ALL TO authenticated
  -- USING reads the existing row; WITH CHECK resolves the incoming course.
  -- (batch_organization_id() cannot serve INSERT: the row does not exist yet.)
  USING (public.is_org_admin(public.batch_organization_id(batches.id)))
  WITH CHECK (public.is_org_admin(
    public.course_organization_id(batches.course_id)
  ));

CREATE POLICY batches_select_scoped ON public.batches
  FOR SELECT TO authenticated
  USING (
    public.is_batch_member(batches.id)
    OR public.is_teacher_of_batch(batches.id)
    OR public.is_org_admin(public.batch_organization_id(batches.id))
  );

-- ---------------------------------------------------------------------------
-- profiles: own private data + staff-scoped reads. No API writes in M2
-- (creation via fn_register_with_batch; profile edits land in M6).
-- ---------------------------------------------------------------------------
CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated USING (id = auth.uid());

CREATE POLICY profiles_select_staff ON public.profiles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR EXISTS (
      SELECT 1 FROM public.batch_members bm
      WHERE bm.user_id = profiles.id AND bm.is_active
        AND (
          public.is_teacher_of_batch(bm.batch_id)
          OR public.is_org_admin(public.batch_organization_id(bm.batch_id))
        )
    )
  );

-- ---------------------------------------------------------------------------
-- user_roles: own roles readable; role grants are service_role/function-only.
-- ---------------------------------------------------------------------------
CREATE POLICY user_roles_select_own ON public.user_roles
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY user_roles_select_staff ON public.user_roles
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      organization_id IS NOT NULL
      AND public.is_org_admin(organization_id)
    )
  );

-- ---------------------------------------------------------------------------
-- teacher_assignments: teachers read their own scope; org admin manages.
-- ---------------------------------------------------------------------------
CREATE POLICY teacher_assignments_select_own ON public.teacher_assignments
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY teacher_assignments_select_staff ON public.teacher_assignments
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR public.is_org_admin(public.assignment_organization_id(
      teacher_assignments.course_id, teacher_assignments.batch_id
    ))
  );

CREATE POLICY teacher_assignments_write_org_admin ON public.teacher_assignments
  FOR ALL TO authenticated
  USING (public.is_org_admin(public.assignment_organization_id(
    teacher_assignments.course_id, teacher_assignments.batch_id
  )))
  WITH CHECK (public.is_org_admin(public.assignment_organization_id(
    teacher_assignments.course_id, teacher_assignments.batch_id
  )));

-- ---------------------------------------------------------------------------
-- batch_members: peers see each other (privacy-safe columns only from M6);
-- students CANNOT insert/update/delete (roll immutability); org admin may
-- correct rolls — every change fires the audit trigger in 0005.
-- ---------------------------------------------------------------------------
CREATE POLICY batch_members_select_own ON public.batch_members
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY batch_members_select_peers ON public.batch_members
  FOR SELECT TO authenticated USING (public.is_batch_member(batch_id));

CREATE POLICY batch_members_select_staff ON public.batch_members
  FOR SELECT TO authenticated
  USING (
    public.is_teacher_of_batch(batch_id)
    OR public.is_org_admin(public.batch_organization_id(batch_id))
  );

CREATE POLICY batch_members_update_org_admin ON public.batch_members
  FOR UPDATE TO authenticated
  USING (public.is_org_admin(public.batch_organization_id(batch_id)))
  WITH CHECK (public.is_org_admin(public.batch_organization_id(batch_id)));

-- ---------------------------------------------------------------------------
-- audit_logs: append-only. No insert/update/delete policies for API roles.
-- Org admins read their own org's trail via trigger-written metadata.
-- ---------------------------------------------------------------------------
CREATE POLICY audit_logs_select_scoped ON public.audit_logs
  FOR SELECT TO authenticated
  USING (
    public.is_super_admin()
    OR (
      (metadata ->> 'organization_id') IS NOT NULL
      AND public.is_org_admin((metadata ->> 'organization_id')::uuid)
    )
  );

-- ---------------------------------------------------------------------------
-- feature_flags (M1 table hardening): world-readable, service_role-only writes.
-- ---------------------------------------------------------------------------
CREATE POLICY feature_flags_select_public ON public.feature_flags
  FOR SELECT TO anon, authenticated USING (true);
