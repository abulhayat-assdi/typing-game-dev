# Adaptive Privacy (M15)

Adaptive data is student-specific and key-level detail is sensitive.

## Access matrix

| Capability | Student | Teacher | Org admin | Super admin |
|---|---|---|---|---|
| Own profile/dims/trends/recs | ✅ (RLS `user_id = auth.uid()`) | ❌ | ❌ | ❌ |
| Record own evidence | ✅ (validated + owned attempts only) | ❌ | ❌ | ❌ |
| Feedback on own recs | ✅ (events only, never scores) | ❌ | ❌ | ❌ |
| Batch attention + aggregates | ❌ | own batches | own org | ✅ |
| Global funnel/content stats | ❌ | ❌ | ❌ | ✅ (+mission admin) |

There are **no write policies** on any adaptive table — every mutation
is a role-checked `SECURITY DEFINER` fn.

## What staff see (and don't)

- Teachers (`fn_adaptive_batch_summary`, `is_teacher_of_batch`
  gated): per-student attention flags (declining accuracy/speed,
  critical-key *counts*), batch averages, weak-mechanic ranking, band
  distribution. Never which keys a student misses.
- Admins (`fn_adaptive_global_summary`): learner counts, averages,
  30-day recommendation funnel, per-game completion. Never
  learner-level weakness rows.

## Anti-manipulation

- `fn_record_adaptive_attempt` re-proves aggregates
  (Σexposures = prompt length; errors ≤ incorrect + strokes) and is
  idempotent per attempt; forged payloads yield `MALFORMED`.
- `fn_adaptive_feedback` accepts only the five observed events on
  owned recommendations; nothing a student sends can alter a score —
  scores exist only as recomputed columns.
- Cross-user reads return zero rows by RLS (tested); cross-user
  feedback raises `NOT_FOUND` (no existence oracle).
