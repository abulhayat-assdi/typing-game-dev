/**
 * Staff data boundary (M7). Teacher/admin/super-admin reads and admin writes
 * go through StaffStore — user-scoped Supabase in production (RLS + audit
 * triggers enforce), memory fixtures in tests. Scope checks that RLS cannot
 * express (org containment of a mutation target) run explicitly and throw
 * ForbiddenError/ConflictError/NotFoundError.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

export class ForbiddenError extends Error {
  constructor() {
    super("FORBIDDEN");
  }
}
export class ConflictError extends Error {
  constructor(code = "CONFLICT") {
    super(code);
  }
}
export class NotFoundError extends Error {
  constructor() {
    super("NOT_FOUND");
  }
}

export interface AssignmentState {
  id: string;
  userId: string;
  courseId: string | null;
  batchId: string | null;
  batchName: string;
  courseName: string;
}

export interface BatchMemberRow {
  memberId: string;
  userId: string;
  rollNumber: string;
  fullName: string;
  email: string;
  skillTrack: string;
  isActive: boolean;
  xpTotal: number;
  level: number;
  streak: number;
}

export interface CourseState {
  id: string;
  organizationId: string;
  title: string;
  slug: string;
  isActive: boolean;
}

export interface BatchState {
  id: string;
  courseId: string;
  courseName: string;
  organizationId: string;
  name: string;
  joinCode: string;
  isActive: boolean;
  memberCount: number;
}

export interface OrgState {
  id: string;
  name: string;
  slug: string;
}

export interface AuditRow {
  id: number;
  actor: string | null;
  action: string;
  entity: string;
  entityId: string;
  createdAt: string;
}

export interface FlagState {
  key: string;
  enabled: boolean;
  description: string;
}

export interface StaffStore {
  myAssignments(userId: string): Promise<AssignmentState[]>;
  batchInfo(batchId: string): Promise<BatchState | null>;
  getCourse(courseId: string): Promise<CourseState | null>;
  getMembershipRow(
    id: string,
  ): Promise<{ id: string; batchId: string; organizationId: string } | null>;
  membershipsOf(userId: string): Promise<
    Array<{
      memberId: string;
      batchId: string;
      batchName: string;
      rollNumber: string;
      isActive: boolean;
      organizationId: string;
    }>
  >;
  batchMembers(batchId: string): Promise<BatchMemberRow[]>;
  /** Recent validated runs for an explicit member set (RLS still applies). */
  memberAttempts(
    memberIds: string[],
    limit: number,
  ): Promise<Array<{ userId: string; gameSlug: string; status: string; score: number | null }>>;
  memberAggregates(
    userIds: string[],
  ): Promise<Record<string, { wpm: number; accuracy: number; runs: number }>>;
  listCourses(orgIds: string[] | null): Promise<CourseState[]>;
  listBatches(orgIds: string[] | null, courseId?: string): Promise<BatchState[]>;
  searchUsers(
    q: string,
    limit: number,
  ): Promise<
    Array<{
      userId: string;
      fullName: string;
      email: string;
      rollNumber: string;
      batchName: string;
      batchId: string;
      status: string;
    }>
  >;
  listAssignments(): Promise<AssignmentState[]>;
  listOrgs(): Promise<OrgState[]>;
  getAudit(limit: number): Promise<AuditRow[]>;
  getFlags(): Promise<FlagState[]>;
  getUserDetail(userId: string): Promise<{
    userId: string;
    fullName: string;
    email: string;
    status: string;
    xpTotal: number;
    level: number;
  } | null>;
  // Mutations (RLS + triggers enforce; scope pre-checked where stated).
  createCourse(input: { organizationId: string; title: string; slug: string }): Promise<{ id: string }>;
  updateCourse(id: string, patch: { title?: string; isActive?: boolean }): Promise<void>;
  createBatch(input: {
    courseId: string;
    name: string;
    joinCode: string;
    isActive?: boolean;
  }): Promise<{ id: string }>;
  updateBatch(
    id: string,
    patch: { name?: string; isActive?: boolean; joinCode?: string },
  ): Promise<void>;
  createAssignment(input: {
    userId: string;
    courseId?: string | undefined;
    batchId?: string | undefined;
  }): Promise<{ id: string }>;
  deleteAssignment(id: string): Promise<void>;
  updateMembership(
    id: string,
    patch: { batchId?: string; rollNumber?: string; isActive?: boolean },
  ): Promise<void>;
  updateAccountStatus(userId: string, status: string): Promise<void>;
  lookupUserByEmail(email: string): Promise<{ userId: string; fullName: string; email: string } | null>;
  grantRole(userId: string, role: string, orgId?: string): Promise<void>;
  revokeRole(userId: string, role: string): Promise<void>;
  setFlag(key: string, enabled: boolean): Promise<void>;
  setGameActive(slug: string, active: boolean): Promise<void>;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}
function str(v: unknown, fallback = ""): string {
  return typeof v === "string" ? v : fallback;
}
function num(v: unknown, fallback = 0): number {
  return typeof v === "number" && Number.isFinite(v) ? v : fallback;
}
function errMessage(e: unknown): string {
  return isRecord(e) && typeof e.message === "string" ? e.message : "FAILED";
}

function mapStoreError(e: unknown): Error {
  const message = errMessage(e);
  if (/row-level security|permission denied/i.test(message)) {
    return new ForbiddenError();
  }
  if (/duplicate|unique|already exists/i.test(message)) {
    return new ConflictError("CONFLICT");
  }
  return new Error(message);
}

/** In-memory store for offline tests: fixture reads + call-logging writes. */
export interface MemoryStaffFixtures {
  assignments?: AssignmentState[];
  batches?: BatchState[];
  members?: Record<string, BatchMemberRow[]>;
  attempts?: Array<{
    userId: string;
    gameSlug: string;
    status: string;
    score: number | null;
  }>;
  aggregates?: Record<string, { wpm: number; accuracy: number; runs: number }>;
  courses?: CourseState[];
  orgs?: OrgState[];
  searchResults?: Array<{
    userId: string;
    fullName: string;
    email: string;
    rollNumber: string;
    batchName: string;
    batchId: string;
    status: string;
  }>;
  audit?: AuditRow[];
  flags?: FlagState[];
  userDetails?: Record<
    string,
    {
      userId: string;
      fullName: string;
      email: string;
      status: string;
      xpTotal: number;
      level: number;
    }
  >;
  /** Methods that throw ForbiddenError (RLS-denied simulation). */
  deny?: string[];
  /** Methods that throw ConflictError (unique-violation simulation). */
  conflict?: string[];
  calls?: Array<{ method: string; args: unknown[] }>;
}

export function createMemoryStaffStore(
  fx: MemoryStaffFixtures = {},
): StaffStore {
  const log = (method: string, args: unknown[]): void => {
    fx.calls?.push({ method, args });
  };
  const guard = (method: string): void => {
    if (fx.deny?.includes(method)) throw new ForbiddenError();
    if (fx.conflict?.includes(method)) throw new ConflictError();
  };
  return {
    myAssignments: (userId) =>
      Promise.resolve(
        (fx.assignments ?? []).filter((a) => a.userId === userId),
      ),
    batchInfo: (batchId) =>
      Promise.resolve((fx.batches ?? []).find((b) => b.id === batchId) ?? null),
    getCourse: (courseId) =>
      Promise.resolve(
        (fx.courses ?? []).find((c) => c.id === courseId) ?? null,
      ),
    getMembershipRow: (id) => {
      for (const [batchId, members] of Object.entries(fx.members ?? {})) {
        const m = members.find((x) => x.memberId === id);
        if (!m) continue;
        const batch = (fx.batches ?? []).find((b) => b.id === batchId);
        if (!batch) continue;
        return Promise.resolve({
          id: m.memberId,
          batchId,
          organizationId: batch.organizationId,
        });
      }
      return Promise.resolve(null);
    },
    membershipsOf: (userId) => {
      const out: Array<{
        memberId: string;
        batchId: string;
        batchName: string;
        rollNumber: string;
        isActive: boolean;
        organizationId: string;
      }> = [];
      for (const [batchId, members] of Object.entries(fx.members ?? {})) {
        const batch = (fx.batches ?? []).find((b) => b.id === batchId);
        if (!batch) continue;
        for (const m of members) {
          if (m.userId !== userId) continue;
          out.push({
            memberId: m.memberId,
            batchId,
            batchName: batch.name,
            rollNumber: m.rollNumber,
            isActive: m.isActive,
            organizationId: batch.organizationId,
          });
        }
      }
      return Promise.resolve(out);
    },
    batchMembers: (batchId) =>
      Promise.resolve(fx.members?.[batchId] ?? []),
    memberAttempts: (memberIds, limit) =>
      Promise.resolve(
        (fx.attempts ?? [])
          .filter((a) => memberIds.includes(a.userId))
          .slice(0, limit),
      ),
    memberAggregates: (userIds) =>
      Promise.resolve(
        Object.fromEntries(
          userIds
            .filter((u) => fx.aggregates?.[u])
            .map((u) => [u, (fx.aggregates as Record<string, { wpm: number; accuracy: number; runs: number }>)[u] as { wpm: number; accuracy: number; runs: number }]),
        ),
      ),
    listCourses: (orgIds) =>
      Promise.resolve(
        (fx.courses ?? []).filter(
          (c) => !orgIds || orgIds.includes(c.organizationId),
        ),
      ),
    listBatches: (orgIds, courseId) =>
      Promise.resolve(
        (fx.batches ?? []).filter(
          (b) =>
            (!orgIds || orgIds.includes(b.organizationId)) &&
            (!courseId || b.courseId === courseId),
        ),
      ),
    searchUsers: (q, limit) =>
      Promise.resolve(
        (fx.searchResults ?? [])
          .filter((u) =>
            `${u.fullName} ${u.email} ${u.rollNumber}`
              .toLowerCase()
              .includes(q.toLowerCase()),
          )
          .slice(0, limit),
      ),
    listAssignments: () => Promise.resolve(fx.assignments ?? []),
    listOrgs: () => Promise.resolve(fx.orgs ?? []),
    getAudit: (limit) => Promise.resolve((fx.audit ?? []).slice(0, limit)),
    getFlags: () => Promise.resolve(fx.flags ?? []),
    getUserDetail: (userId) =>
      Promise.resolve(fx.userDetails?.[userId] ?? null),
    createCourse: (input) => {
      guard("createCourse");
      log("createCourse", [input]);
      return Promise.resolve({ id: "course-new" });
    },
    updateCourse: (id, patch) => {
      guard("updateCourse");
      log("updateCourse", [id, patch]);
      return Promise.resolve();
    },
    createBatch: (input) => {
      guard("createBatch");
      log("createBatch", [input]);
      return Promise.resolve({ id: "batch-new" });
    },
    updateBatch: (id, patch) => {
      guard("updateBatch");
      log("updateBatch", [id, patch]);
      return Promise.resolve();
    },
    createAssignment: (input) => {
      guard("createAssignment");
      log("createAssignment", [input]);
      return Promise.resolve({ id: "assign-new" });
    },
    deleteAssignment: (id) => {
      guard("deleteAssignment");
      log("deleteAssignment", [id]);
      return Promise.resolve();
    },
    updateMembership: (id, patch) => {
      guard("updateMembership");
      log("updateMembership", [id, patch]);
      return Promise.resolve();
    },
    updateAccountStatus: (userId, status) => {
      guard("updateAccountStatus");
      log("updateAccountStatus", [userId, status]);
      return Promise.resolve();
    },
    lookupUserByEmail: (email) =>
      Promise.resolve(
        (fx.searchResults ?? []).find(
          (u) => u.email.toLowerCase() === email.toLowerCase(),
        ) ?? null,
      ),
    grantRole: (userId, role, orgId) => {
      guard("grantRole");
      log("grantRole", [userId, role, orgId]);
      return Promise.resolve();
    },
    revokeRole: (userId, role) => {
      guard("revokeRole");
      log("revokeRole", [userId, role]);
      return Promise.resolve();
    },
    setFlag: (key, enabled) => {
      guard("setFlag");
      log("setFlag", [key, enabled]);
      return Promise.resolve();
    },
    setGameActive: (slug, active) => {
      guard("setGameActive");
      log("setGameActive", [slug, active]);
      return Promise.resolve();
    },
  };
}

/** Production store: user-scoped client; RLS + triggers do the enforcing. */
export function createSupabaseStaffStore(client: SupabaseClient): StaffStore {
  return {
    async myAssignments(userId) {
      const res = await client
        .from("teacher_assignments")
        .select("id, user_id, course_id, batch_id, batches(name), courses!teacher_assignments_course_id_fkey(title)")
        .eq("user_id", userId);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        if (typeof d.id !== "string") return [];
        const batch = isRecord(d.batches) ? d.batches : null;
        const course = Array.isArray(d.courses)
          ? d.courses.find(isRecord)
          : isRecord(d.courses)
            ? d.courses
            : null;
        return [
          {
            id: d.id,
            userId: str(d.user_id),
            courseId: typeof d.course_id === "string" ? d.course_id : null,
            batchId: typeof d.batch_id === "string" ? d.batch_id : null,
            batchName: batch ? str(batch.name) : "",
            courseName: course ? str(course.title) : "",
          },
        ];
      });
    },

    async batchInfo(batchId) {
      const res = await client
        .from("batches")
        .select("id, course_id, name, join_code, is_active, courses!inner(title, organization_id)")
        .eq("id", batchId)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      const course = isRecord(d.courses) ? d.courses : null;
      if (typeof d.id !== "string" || !course) return null;
      const count = await client
        .from("batch_members")
        .select("id", { count: "exact", head: true })
        .eq("batch_id", batchId)
        .eq("is_active", true);
      return {
        id: d.id,
        courseId: str(d.course_id),
        courseName: str(course.title),
        organizationId: str(course.organization_id),
        name: str(d.name),
        joinCode: str(d.join_code),
        isActive: d.is_active !== false,
        memberCount: typeof count.count === "number" ? count.count : 0,
      };
    },

    async getCourse(courseId) {
      const res = await client
        .from("courses")
        .select("id, organization_id, title, slug, is_active")
        .eq("id", courseId)
        .maybeSingle();
      if (res.error || !isRecord(res.data) || typeof res.data.id !== "string") {
        return null;
      }
      return {
        id: res.data.id,
        organizationId: str(res.data.organization_id),
        title: str(res.data.title),
        slug: str(res.data.slug),
        isActive: res.data.is_active !== false,
      };
    },

    async getMembershipRow(id) {
      const res = await client
        .from("batch_members")
        .select("id, batch_id, batches!inner(course_id, courses!inner(organization_id))")
        .eq("id", id)
        .maybeSingle();
      if (res.error || !isRecord(res.data) || typeof res.data.id !== "string") {
        return null;
      }
      const batch = isRecord(res.data.batches) ? res.data.batches : null;
      const course = batch && isRecord(batch.courses) ? batch.courses : null;
      if (
        typeof res.data.batch_id !== "string" ||
        !course ||
        typeof course.organization_id !== "string"
      ) {
        return null;
      }
      return {
        id: res.data.id,
        batchId: res.data.batch_id,
        organizationId: course.organization_id,
      };
    },

    async membershipsOf(userId) {
      const res = await client
        .from("batch_members")
        .select(
          "id, batch_id, roll_number, is_active, batches!inner(name, course_id, courses!inner(organization_id))",
        )
        .eq("user_id", userId);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        const batch = isRecord(d.batches) ? d.batches : null;
        const course =
          batch && isRecord(batch.courses) ? batch.courses : null;
        if (
          typeof d.id !== "string" ||
          typeof d.batch_id !== "string" ||
          !batch ||
          !course ||
          typeof course.organization_id !== "string"
        ) {
          return [];
        }
        return [
          {
            memberId: d.id,
            batchId: d.batch_id,
            batchName: str(batch.name),
            rollNumber: str(d.roll_number),
            isActive: d.is_active !== false,
            organizationId: course.organization_id,
          },
        ];
      });
    },

    async batchMembers(batchId) {      const res = await client
        .from("batch_members")
        .select(
          "id, user_id, roll_number, skill_track, is_active, profiles!inner(full_name, email, xp_total, current_level), streaks(current_count)",
        )
        .eq("batch_id", batchId)
        .order("roll_number");
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        const p = isRecord(d.profiles) ? d.profiles : null;
        if (typeof d.id !== "string" || typeof d.user_id !== "string" || !p) {
          return [];
        }
        const streak = Array.isArray(d.streaks)
          ? d.streaks.find(isRecord)
          : isRecord(d.streaks)
            ? d.streaks
            : null;
        return [
          {
            memberId: d.id,
            userId: d.user_id,
            rollNumber: str(d.roll_number),
            fullName: str(p.full_name),
            email: str(p.email),
            skillTrack: str(d.skill_track),
            isActive: d.is_active !== false,
            xpTotal: num(p.xp_total),
            level: num(p.current_level, 1),
            streak: streak ? num(streak.current_count) : 0,
          },
        ];
      });
    },

    async memberAttempts(memberIds, limit) {
      if (memberIds.length === 0) return [];
      const res = await client
        .from("game_attempts")
        .select("user_id, status, games!inner(slug), attempt_results(score)")
        .in("user_id", memberIds)
        .eq("status", "validated")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data
        .filter(isRecord)
        .flatMap((d) => {
          const g = isRecord(d.games) ? d.games : null;
          if (typeof d.user_id !== "string" || !g || typeof g.slug !== "string") {
            return [];
          }
          const r = Array.isArray(d.attempt_results)
            ? d.attempt_results.find(isRecord)
            : isRecord(d.attempt_results)
              ? d.attempt_results
              : null;
          return [
            {
              userId: d.user_id,
              gameSlug: g.slug,
              status: str(d.status),
              score: r ? num(r.score) : null,
            },
          ];
        })
        .slice(0, limit);
    },

    async memberAggregates(userIds) {
      if (userIds.length === 0) return {};
      const res = await client
        .from("game_attempts")
        .select("user_id, attempt_results!inner(effective_wpm, accuracy)")
        .eq("status", "validated")
        .in("user_id", userIds);
      if (res.error || !Array.isArray(res.data)) return {};
      const acc = new Map<string, { wpm: number[]; acc: number[] }>();
      for (const d of res.data.filter(isRecord)) {
        if (typeof d.user_id !== "string") continue;
        const r = Array.isArray(d.attempt_results)
          ? d.attempt_results.find(isRecord)
          : isRecord(d.attempt_results)
            ? d.attempt_results
            : null;
        if (!r) continue;
        const e = acc.get(d.user_id) ?? { wpm: [], acc: [] };
        e.wpm.push(num(r.effective_wpm));
        e.acc.push(num(r.accuracy));
        acc.set(d.user_id, e);
      }
      const out: Record<string, { wpm: number; accuracy: number; runs: number }> = {};
      for (const [u, v] of acc) {
        out[u] = {
          wpm: v.wpm.length ? v.wpm.reduce((a, b) => a + b, 0) / v.wpm.length : 0,
          accuracy: v.acc.length ? v.acc.reduce((a, b) => a + b, 0) / v.acc.length : 0,
          runs: v.wpm.length,
        };
      }
      return out;
    },

    async listCourses(orgIds) {
      let q = client
        .from("courses")
        .select("id, organization_id, title, slug, is_active")
        .order("title");
      if (orgIds) q = q.in("organization_id", orgIds);
      const res = await q;
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        if (typeof d.id !== "string") return [];
        return [
          {
            id: d.id,
            organizationId: str(d.organization_id),
            title: str(d.title),
            slug: str(d.slug),
            isActive: d.is_active !== false,
          },
        ];
      });
    },

    async listBatches(orgIds, courseId) {
      let q = client
        .from("batches")
        .select("id, course_id, name, join_code, is_active, courses!inner(title, organization_id)")
        .order("name");
      if (courseId) q = q.eq("course_id", courseId);
      if (orgIds) q = q.in("courses.organization_id", orgIds);
      const res = await q;
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        const c = isRecord(d.courses) ? d.courses : null;
        if (typeof d.id !== "string" || !c) return [];
        if (orgIds && !orgIds.includes(str(c.organization_id))) return [];
        return [
          {
            id: d.id,
            courseId: str(d.course_id),
            courseName: str(c.title),
            organizationId: str(c.organization_id),
            name: str(d.name),
            joinCode: str(d.join_code),
            isActive: d.is_active !== false,
            memberCount: 0,
          },
        ];
      });
    },

    async searchUsers(q, limit) {
      const like = `%${q.replace(/[%_]/g, "")}%`;
      const res = await client
        .from("profiles")
        .select(
          "id, full_name, email, account_status, batch_members!inner(roll_number, batches!inner(id, name))",
        )
        .or(`full_name.ilike.${like},email.ilike.${like}`)
        .limit(limit);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
          if (typeof d.id !== "string") return [];
          const members = Array.isArray(d.batch_members)
            ? d.batch_members.filter(isRecord)
            : [];
          if (members.length === 0) {
            return [
              {
                userId: d.id,
                fullName: str(d.full_name),
                email: str(d.email),
                rollNumber: "",
                batchName: "",
                batchId: "",
                status: str(d.account_status, "active"),
              },
            ];
          }
          return members.flatMap((m) => {
            const b = isRecord(m.batches) ? m.batches : null;
            if (!b || typeof b.id !== "string") return [];
            return [
              {
                userId: typeof d.id === "string" ? d.id : "",
                fullName: str(d.full_name),
                email: str(d.email),
                rollNumber: str(m.roll_number),
                batchName: str(b.name),
                batchId: b.id,
                status: str(d.account_status, "active"),
              },
            ];
          });
        });
    },

    async listAssignments() {
      const res = await client
        .from("teacher_assignments")
        .select(
          "id, user_id, course_id, batch_id, batches(name), courses!teacher_assignments_course_id_fkey(title)",
        );
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        if (typeof d.id !== "string") return [];
        const b = isRecord(d.batches) ? d.batches : null;
        const c = Array.isArray(d.courses)
          ? d.courses.find(isRecord)
          : isRecord(d.courses)
            ? d.courses
            : null;
        return [
          {
            id: d.id,
            userId: str(d.user_id),
            courseId: typeof d.course_id === "string" ? d.course_id : null,
            batchId: typeof d.batch_id === "string" ? d.batch_id : null,
            batchName: b ? str(b.name) : "",
            courseName: c ? str(c.title) : "",
          },
        ];
      });
    },

    async listOrgs() {
      const res = await client.from("organizations").select("id, name, slug").order("name");
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        if (typeof d.id !== "string") return [];
        return [{ id: d.id, name: str(d.name), slug: str(d.slug) }];
      });
    },

    async getAudit(limit) {
      // Org scoping enforced by RLS (admins see their org trail, super all).
      const res = await client
        .from("audit_logs")
        .select("id, actor_user_id, action, entity, entity_id, created_at")
        .order("created_at", { ascending: false })
        .limit(limit);
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        if (typeof d.id !== "number") return [];
        return [
          {
            id: d.id,
            actor: typeof d.actor_user_id === "string" ? d.actor_user_id : null,
            action: str(d.action),
            entity: str(d.entity),
            entityId: str(d.entity_id),
            createdAt: str(d.created_at),
          },
        ];
      });
    },

    async getFlags() {
      const res = await client
        .from("feature_flags")
        .select("key, enabled, description")
        .order("key");
      if (res.error || !Array.isArray(res.data)) return [];
      return res.data.filter(isRecord).flatMap((d) => {
        if (typeof d.key !== "string") return [];
        return [
          {
            key: d.key,
            enabled: d.enabled === true,
            description: str(d.description),
          },
        ];
      });
    },

    async getUserDetail(userId) {
      const res = await client
        .from("profiles")
        .select("id, full_name, email, account_status, xp_total, current_level")
        .eq("id", userId)
        .maybeSingle();
      if (res.error || !isRecord(res.data)) return null;
      const d = res.data;
      if (typeof d.id !== "string") return null;
      return {
        userId: d.id,
        fullName: str(d.full_name),
        email: str(d.email),
        status: str(d.account_status, "active"),
        xpTotal: num(d.xp_total),
        level: num(d.current_level, 1),
      };
    },

    async createCourse(input) {
      const res = await client
        .from("courses")
        .insert({
          organization_id: input.organizationId,
          title: input.title,
          slug: input.slug,
        })
        .select("id")
        .single();
      if (res.error || !isRecord(res.data) || typeof res.data.id !== "string") {
        throw mapStoreError(res.error);
      }
      return { id: res.data.id };
    },

    async updateCourse(id, patch) {
      const res = await client
        .from("courses")
        .update({
          ...(patch.title !== undefined ? { title: patch.title } : {}),
          ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
        })
        .eq("id", id);
      if (res.error) throw mapStoreError(res.error);
    },

    async createBatch(input) {
      const res = await client
        .from("batches")
        .insert({
          course_id: input.courseId,
          name: input.name,
          join_code: input.joinCode,
          is_active: input.isActive ?? true,
        })
        .select("id")
        .single();
      if (res.error || !isRecord(res.data) || typeof res.data.id !== "string") {
        throw mapStoreError(res.error);
      }
      return { id: res.data.id };
    },

    async updateBatch(id, patch) {
      const res = await client
        .from("batches")
        .update({
          ...(patch.name !== undefined ? { name: patch.name } : {}),
          ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
          ...(patch.joinCode !== undefined ? { join_code: patch.joinCode } : {}),
        })
        .eq("id", id);
      if (res.error) throw mapStoreError(res.error);
    },

    async createAssignment(input) {
      if (!input.courseId && !input.batchId) throw new ConflictError("TARGET_REQUIRED");
      const res = await client
        .from("teacher_assignments")
        .insert({
          user_id: input.userId,
          course_id: input.courseId ?? null,
          batch_id: input.batchId ?? null,
        })
        .select("id")
        .single();
      if (res.error || !isRecord(res.data) || typeof res.data.id !== "string") {
        throw mapStoreError(res.error);
      }
      return { id: res.data.id };
    },

    async deleteAssignment(id) {
      const res = await client.from("teacher_assignments").delete().eq("id", id);
      if (res.error) throw mapStoreError(res.error);
    },

    async updateMembership(id, patch) {
      const res = await client
        .from("batch_members")
        .update({
          ...(patch.batchId !== undefined ? { batch_id: patch.batchId } : {}),
          ...(patch.rollNumber !== undefined ? { roll_number: patch.rollNumber } : {}),
          ...(patch.isActive !== undefined ? { is_active: patch.isActive } : {}),
        })
        .eq("id", id);
      if (res.error) throw mapStoreError(res.error);
    },

    async updateAccountStatus(userId, status) {
      const res = await client
        .from("profiles")
        .update({ account_status: status })
        .eq("id", userId);
      if (res.error) throw mapStoreError(res.error);
    },

    async lookupUserByEmail(email) {
      const res = await client.rpc("fn_admin_lookup_user", { p_email: email });
      if (res.error || !Array.isArray(res.data)) {
        if (res.error) throw mapStoreError(res.error);
        return null;
      }
      const row = res.data.find(isRecord);
      if (!row || typeof row.user_id !== "string") return null;
      return {
        userId: row.user_id,
        fullName: str(row.full_name),
        email: str(row.email),
      };
    },

    async grantRole(userId, role, orgId) {
      const res = await client.rpc("fn_grant_role", {
        p_user: userId,
        p_role: role,
        p_organization: orgId ?? null,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async revokeRole(userId, role) {
      const res = await client.rpc("fn_revoke_role", {
        p_user: userId,
        p_role: role,
      });
      if (res.error) throw mapStoreError(res.error);
    },

    async setFlag(key, enabled) {
      const res = await client.from("feature_flags").update({ enabled }).eq("key", key);
      if (res.error) throw mapStoreError(res.error);
    },

    async setGameActive(slug, active) {
      const res = await client.from("games").update({ is_active: active }).eq("slug", slug);
      if (res.error) throw mapStoreError(res.error);
    },
  };
}
