-- DEV seed only — never apply to production.
-- Mirrors the spec §4 example: Demo Academy → Sales & Marketing (101/102),
-- Telesales (201/202). Fixed UUIDs keep local dev + pgTAP tests deterministic.

INSERT INTO public.organizations (id, name, slug) VALUES
  ('11111111-1111-1111-1111-111111111111', 'Demo Academy', 'demo-academy')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.courses (id, organization_id, title, slug) VALUES
  ('22222222-2222-2222-2222-222222222222',
   '11111111-1111-1111-1111-111111111111',
   'The Art of Sales & Marketing', 'sales-marketing'),
  ('33333333-3333-3333-3333-333333333333',
   '11111111-1111-1111-1111-111111111111',
   'Telesales', 'telesales')
ON CONFLICT (id) DO NOTHING;

INSERT INTO public.batches (id, course_id, name, join_code, is_active) VALUES
  ('aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
   '22222222-2222-2222-2222-222222222222', 'Batch 101', 'SALES-101', true),
  ('bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
   '22222222-2222-2222-2222-222222222222', 'Batch 102', 'SALES-102', true),
  ('cccccccc-cccc-cccc-cccc-cccccccccccc',
   '33333333-3333-3333-3333-333333333333', 'Batch 201', 'TELE-201', true),
  ('dddddddd-dddd-dddd-dddd-dddddddddddd',
   '33333333-3333-3333-3333-333333333333', 'Batch 202', 'TELE-202', true)
ON CONFLICT (id) DO NOTHING;
