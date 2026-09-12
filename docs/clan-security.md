# Clan security (M10)

Boundaries (RLS authoritative, `fn_is_clan_viewer`: active member,
batch teacher, mission admin/super admin, org admin):

- Members see their own clan only; unrelated students read nothing
  (clans, roster, missions, help, activity all filtered).
- Teachers see assigned batches' clans; out-of-batch teachers see
  nothing. Admins see their org (`is_org_admin`); super admins global.
- No INSERT/UPDATE/DELETE policies exist on any clan table — all
  writes go through SECURITY DEFINER fns with role checks, or sync
  triggers. Students cannot create clans/memberships, promote
  themselves, alter contribution, complete missions, self-fulfill help,
  or exceed support limits; every path is tested (46 pgTAP tests).
- Help: requester ≠ supporter enforced with distinct error codes
  (`SELF_FULFILL`, `CROSS_CLAN`, `DUPLICATE`, `SUPPORTER_LIMIT`,
  `REQUESTER_LIMIT`, `INSUFFICIENT_COINS`, `CLOSED`).
- Audit: leadership changes (`clan_leadership_audit`), joins/leaves,
  mission completions, help open/fulfill/expire (feed + `clan_events`
  hooks for future notification delivery), admin profile/status/role
  mutations via the API layer.

Future wars/bosses consume the same viewer predicate, contribution
aggregate and idempotency-key conventions — no new trust model needed.
