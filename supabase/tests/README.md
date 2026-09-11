# Supabase tests (M1 placeholder)

pgTAP / SQL RLS tests land in M2 with the identity/org migrations.

Planned coverage (20 critical scenarios from the spec):

1. Student registration (batch + roll uniqueness)
2. Student login
3. Batch isolation
4. RLS enforcement (private vs batch-public data)
5. Game unlock gating
6. Game attempt validation
7. Score validation
8. XP award (ledger append-only)
9. Coin award (ledger append-only)
10. Badge award
11. Streak logic
12. Leaderboard ranking (batch-scoped)
13. Competition submission
14. Clan membership
15. Clan help (bounded, rate-limited)
16. Clan war lifecycle
17. Reward verification (server-issued only)
18. Unauthorized access denial
19. Duplicate submission prevention (idempotency)
20. Impossible-score detection

Runbook: `supabase test db` (once the CLI is wired in M2).
