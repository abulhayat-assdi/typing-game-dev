# Clan war security (M11)

Visibility (`fn_is_war_viewer`: member of either clan, teacher of
either batch, mission admin/super, either org admin) gates all ten
war tables; there are no INSERT/UPDATE/DELETE policies — every write
is a checked SECURITY DEFINER fn:

- Only challenger leaders/co-leaders challenge; only defender
  leadership accepts; challengers cannot accept their own war;
  members cannot cancel (leaders/managers can, until live).
- Forged clan/war ids fail (`NOT_FOUND`, `SELF_CHALLENGE`,
  `CLAN_INACTIVE`, `SCOPE_FORBIDDEN`); duplicate active wars and
  duplicate submissions rejected; per-player caps enforced.
- Participants cannot alter contributions or scores; finalized wars
  reject adjustments (`IMMUTABLE`); rewards are key-idempotent.
- Opponent individuals beyond top-5 are hidden from the board; no
  emails or auth data ever leave the server.
- Cross-org wars require a super-admin challenger; cross-course is
  opt-in per war via the scope field (never hard-coded).
- Admin interventions (cancel, advance, finalize, adjustments) run
  through the same fns and land in the state-event log.

51 pgTAP tests cover the map, invitations, eligibility, attempts,
scoring, finalization and every boundary above. Future bosses,
seasons and brackets reuse this viewer predicate, key convention and
transition discipline.
