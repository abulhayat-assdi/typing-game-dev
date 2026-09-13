-- STAGING seed only — never apply to production.
-- Realistic but sanitized structure for staging E2E: a staging org with
-- one course + batch. NO user accounts, NO demo students, NO real PII.
-- All rows idempotent (ON CONFLICT DO NOTHING) with fixed UUIDs so
-- staging E2E scripts can reference them deterministically.

INSERT INTO public.organizations (id, name, slug) VALUES
  ('e0000000-0000-0000-0000-000000000001', 'Staging Academy', 'staging-academy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.courses (id, organization_id, title, slug) VALUES
  ('e0000000-0000-0000-0000-000000000002',
   'e0000000-0000-0000-0000-000000000001',
   'Staging Course', 'staging-course')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.batches (id, course_id, name, join_code, is_active) VALUES
  ('e0000000-0000-0000-0000-000000000003',
   'e0000000-0000-0000-0000-000000000002',
   'Staging Batch', 'STAGING-1', true)
ON CONFLICT (id) DO NOTHING;
