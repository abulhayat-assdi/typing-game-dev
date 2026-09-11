# Teacher Console (M7)

Read-only by design (no teacher mutations exist). Routes:
`/teacher` (assigned batches, member counts, averages, attention list of
zero-run students), `/teacher/batches/[id]`, `/teacher/students/[userId]`
(permitted profile, aggregates, records — never private fields).

Scope comes from `teacher_assignments` (course and/or batch rows): batch
detail and student detail both re-verify coverage and `notFound()` outside
it (no existence oracle for unassigned batches). Averages aggregate the
teacher-visible validated runs; the dashboard degrades gracefully when
batches are empty.
