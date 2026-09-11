# Authentication (M7)

Single system: Supabase Auth → `auth.users` → `profiles` → `user_roles`.
No second identity, no custom JWT, no other provider.

## Flows

- **Student registration** (stepped UI: batch → details → skill → account):
  client validates → `signUp` → session present? `POST /api/auth/register`
  (atomic `fn_register_with_batch` as the user) : "check email" state.
  Skill track is an onboarding preference only — never a restriction.
- **Login**: `signInWithPassword` → `GET /api/auth/actor` (roles, scopes,
  status) → suspended/inactive sign out with a message, else role landing
  (`super-admin` → `admin` → `teacher` → `dashboard`, resolved server-side).
  Failure messages stay generic (no account-existence oracle).
- **Logout**: `POST /api/auth/logout` (server clears httpOnly cookies),
  idempotent, never strands UI.
- **Reset**: forgot form always shows the same message (enumeration-safe);
  reset form calls `updateUser` inside the recovery session.

## Session model

Middleware redirects by cookie *presence* (UX only). Enforcement lives in
layouts (`requireTeacher`/`requireAdmin`/`requireSuperAdmin`, student shell
additionally checks `account_status`) and in every API route. Account states:
`active` (full access), `inactive`/`suspended` (bounced to `/suspended`,
zero private data rendered). The browser anon key is the only client
credential (`lib/supabase-browser.ts` with explicit cookie methods).
