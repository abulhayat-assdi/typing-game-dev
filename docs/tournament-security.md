# Tournament Security (M14)

RLS is authoritative for reads; **all writes go through role-checked
`SECURITY DEFINER` functions**. There are no write policies on any
tournament table, so students, teachers, and forged requests cannot
write tournament state directly.

## Role matrix

| Capability | Student | Teacher | Org admin | Global admin |
|---|---|---|---|---|
| View non-draft brackets | ✅ | ✅ | ✅ | ✅ |
| View drafts | ❌ | ❌ | own org | ✅ |
| Register/withdraw self (or own clan via staff) | ✅ | ❌ | ❌ | ❌ |
| Create/configure tournaments | ❌ | ❌ | own org | ✅ |
| Seed / start / advance / finalize | ❌ | ❌ | own org | ✅ |
| Attest match scores | ❌ | ❌ | own org | ✅ |
| Audited pre-live substitution | ❌ | ❌ | own org | ✅ |

Teachers are read-only by construction. Organization isolation is
enforced in `fn_require_tournament_admin` (`is_org_admin` of the
tournament's `organization_id`; global tournaments require
mission/super admin).

## Explicit rejections (tested in pgTAP + API tests)

- `FORBIDDEN`: student create/seed/finalize, clan registration by
  non-staff, forged callers.
- `NOT_FOUND`: forged tournament/match IDs.
- `DUPLICATE`: double registration, double advancement, round
  duplication, re-seeding an occupant slot.
- `INELIGIBLE` / `REGISTRATION_CLOSED` / `REGISTRATION_LOCKED`:
  suspended or out-of-scope entrants, late entries, post-seed roster
  edits.
- `INVALID_STATE` / `IMMUTABLE`: illegal transitions, re-finalizing
  matches, editing finalized tournaments (also blocked by the
  `fn_guard_tournament_immutable` trigger).
- `SOURCE_NOT_FINAL`: scoring from an unfinished war.
- `PARTICIPANT_CAP`: over-cap registration.

## Integrity constraints (DB-level)

- One participant row per tournament; one seed per participant;
  contiguous seeds via `(tournament_id, seed)` uniqueness.
- One match per `(tournament_id, round_id, slot)`.
- One side per participant per match (`tournament_match_participants`
  PK).
- Winner/loser constrained to the match's two participants and to
  each other (`winner <> loser`).
- Finalized rows immutable (trigger); finalized tournaments and
  matches reject every mutation path.

## Determinism guarantees

Seeding, placement, tie-breaks, advancement, and placements are pure
functions of stored inputs (`@tap/tournament` mirrors the SQL). The
frontend never computes a winner, a seed, or a placement.
