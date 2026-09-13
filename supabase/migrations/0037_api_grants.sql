-- M18 0037: least-privilege API grants for the authenticated role.
--
-- Finding: every migration defined RLS policies but none granted table
-- privileges, so in production ALL direct PostgREST reads (and the few
-- direct staff writes) fail with "permission denied". RLS policies
-- remain the enforcement; these grants only enable the mechanism.
--
-- Rule: SELECT everywhere (RLS restricts rows); writes ONLY where the
-- app writes directly today (staff course/batch/assignment management
-- plus the two column-guarded UPDATE policies). Every other mutation
-- goes through SECURITY DEFINER fns (which run as owner and need no
-- grants). Future tables get SELECT automatically; future direct
-- writes must add explicit grants in their own migration.

GRANT USAGE ON SCHEMA public TO authenticated;
GRANT USAGE ON SCHEMA public TO anon;

GRANT SELECT ON ALL TABLES IN SCHEMA public TO authenticated;

GRANT INSERT, UPDATE, DELETE ON public.courses TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.batches TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.teacher_assignments TO authenticated;
GRANT UPDATE ON public.batch_members TO authenticated;
GRANT UPDATE ON public.profiles TO authenticated;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated;

-- Future tables: SELECT flows automatically; direct writes stay
-- deny-by-default until their migration grants them explicitly.
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO authenticated;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated;
