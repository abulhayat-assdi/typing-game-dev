# Admin Console (M7)

Org-scoped management under `/admin` (courses, batches, students, teachers);
super-admin foundation under `/super-admin` (global overview, audit,
feature flags). Every mutation travels
UI → `/api/admin/*` → scope pre-check → user-scoped store call → RLS →
audit trigger. Silent RLS no-ops are converted to 403s by the pre-checks.

## Operations

- Courses/batches: create, rename/slug-safe edit, activate/deactivate
  (courses gained `is_active`; batches gained optional dates). Join codes
  auto-generate (`B-XXXXXXXX`) when omitted; uniqueness is a DB constraint
  surfaced as 409.
- Students: search (name/email/roll), detail, batch move, roll correction,
  membership activate/deactivate, account suspend/activate — each audited
  with actor, old/new values and timestamp.
- Teachers: assign by email to course/batch (grants the teacher role),
  remove assignments, grant/revoke teacher/student roles (admin grants of
  `admin`/`super_admin` are forbidden by `fn_grant_role` itself).
- Forbidden by design: editing XP/coins/streaks/badges/records/results —
  no UI, no API, and the column guard rejects it at the database.

## Super-admin

Global overview (orgs, counts, recent audit), audit browser, feature-flag
kill switches, game-catalog toggle API. Advanced analytics, clan/war and
monetization tooling stay out of scope.
