# Season security (M13)

- Students cannot create/configure seasons, add points, change ranks,
  or finalize; teachers cannot configure (403); admins manage within
  role, super admins globally. Forged season ids fail `NOT_FOUND`.
- Point ingest proves finalized status, real participation and
  policy-exact amounts per source — students calling the open record
  path with inflated or fabricated outcomes get `false`, never rows.
  Duplicates collapse on keys; caps bound accrual.
- Boards expose frozen display names and points only; point events
  are own-or-admin until finalization opens them; reward rows are
  own-or-admin.
- Finalized seasons are immutable: points, results, rankings and
  reward outcomes sealed; corrections are append-only adjustments.
- Overlap abuse is blocked (`OVERLAP_FORBIDDEN`); cross-org scoping
  rides the existing org helpers; batch moves post-freeze cannot
  rewrite snapshots.

47 pgTAP tests cover lifecycle, eligibility, points (valid, duplicate,
out-of-window, disabled, capped, forged, inflated), ranking, tiers,
finalization and every boundary above. Tournaments consume the result
snapshots and reward-key conventions without new trust machinery.
