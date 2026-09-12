# Mission admin guide (M9)

Admins and super admins (`/[locale]/admin/missions`, `requireAdmin`
layout gate + `fn_is_mission_admin` in every write fn): create drafts
with objectives through the configuration form (deliberately not a
visual editor), edit drafts (versioned snapshots), activate/deactivate,
append objectives to drafts. Teachers cannot redefine mission logic —
they view assigned-batch mission performance through the student
projection (`fn_student_missions`, same rule that gates RLS:
self, batch teacher, mission admin, super admin).

API (admin role + DB re-check): `GET/POST /api/admin/missions`
(201, 400 validation, 403 non-admins), `PATCH .../[id]` (drafts only,
409 `NOT_DRAFT`), `POST .../[id]/activate|deactivate`,
`POST .../[id]/objectives` (201).

Student surface (all authenticated, RLS underneath):
`GET /api/missions` (assign + sync + `{daily, weekly, event}`),
`GET .../[instanceId]` (opaque 404), `POST .../[instanceId]/start`
(409 `INVALID_STATE`/`PREREQUISITE`), `POST /api/missions/sync`.
Students can never create/modify missions, mark completion, alter
progress, or touch rewards — there are no INSERT/UPDATE policies for
them on any mission table, and completion is computed from validated
attempts only. Cross-user reads 404/empty by RLS; forged instance ids
are opaque.
