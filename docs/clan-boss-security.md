# Clan boss security (M12)

Visibility (`fn_is_boss_viewer` over the instance clan: member, batch
teacher, mission admin/super, org admin) gates all boss tables; there
are no INSERT/UPDATE/DELETE policies — every write is a checked
SECURITY DEFINER fn:

- Students cannot schedule/activate battles, modify HP or phases,
  submit damage amounts, finalize, or grant rewards. Forged instance
  and attempt ids fail (`NOT_FOUND`, `ATTEMPT_FORBIDDEN`); foreign
  attempts, unvalidated attempts, off-pool games, over-limit and
  duplicate submissions each fail distinctly.
- Non-participant staff cannot deal damage (`NOT_PARTICIPANT`);
  outsiders resolve to nothing (`NOT_FOUND`) and see null state.
- Rewards are key-idempotent per member per kind
  (`boss:{instance}:member:{user}:{participation,defeat}:v1`) through
  the M5 ledgers; finalized bosses are immutable.
- The state projection (`fn_boss_state`) exposes display names,
  damage and feed only — no emails, auth data or moderation fields.

44 pgTAP tests cover definitions, instances, damage gates,
concurrency effects (exact HP math, floor at zero, single phase
events), rewards, expiry and every boundary above. Seasons and raid
events reuse the viewer predicate, key conventions and sweep
contract.
