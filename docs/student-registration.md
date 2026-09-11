# Student Registration (M7)

Five gentle steps (batch → details → skill → account → welcome) reusing the
M2 atomic `fn_register_with_batch` — no duplicated business logic in
TypeScript: the UI validates shape, SQL enforces truth.

## Validation mapping (server codes → localized UI)

- `INVALID_JOIN_CODE` → unknown/inactive batch (400)
- `ROLL_TAKEN` → duplicate roll in batch (409)
- `ALREADY_ENROLLED` → existing active membership (409)
- shape/skill/terms failures → 400 before any Auth call

Signup errors stay generic ("check your email") so address enumeration is
impossible through our copy. Skill track persists to `batch_members` as the
diagnostic starting point; progression adapts from real performance later
and never locks the learner to a track.
