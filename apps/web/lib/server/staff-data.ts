/**
 * Staff composition (M7). Pure joins over StaffStore reads; scope is verified
 * explicitly (assignment coverage / org containment) before any detail
 * leaves, and RLS enforces underneath regardless.
 */
import { ForbiddenError, type StaffStore } from "./staff-store";
import type { StudentStore } from "./student-store";

export interface TeacherBatchSummary {
  batchId: string;
  batchName: string;
  courseName: string;
  members: number;
  avgWpm: number;
  avgAccuracy: number;
  activeRuns: number;
}

export async function getTeacherDashboard(
  userId: string,
  store: StaffStore,
): Promise<{
  batches: TeacherBatchSummary[];
  students: number;
  attention: Array<{ userId: string; fullName: string; rollNumber: string }>;
}> {
  const assignments = await store.myAssignments(userId);
  const batchIds = [...new Set(assignments.flatMap((a) => (a.batchId ? [a.batchId] : [])))];
  const batches: TeacherBatchSummary[] = [];
  let students = 0;
  const attention: Array<{ userId: string; fullName: string; rollNumber: string }> = [];
  for (const batchId of batchIds) {
    const [info, members] = await Promise.all([
      store.batchInfo(batchId),
      store.batchMembers(batchId),
    ]);
    if (!info) continue;
    const ids = members.map((m) => m.userId);
    const [agg, recent] = await Promise.all([
      store.memberAggregates(ids),
      store.memberAttempts(ids, 10),
    ]);
    const vals = Object.values(agg);
    batches.push({
      batchId,
      batchName: info.name,
      courseName: info.courseName,
      members: members.length,
      avgWpm: vals.length
        ? vals.reduce((a, v) => a + v.wpm, 0) / vals.length
        : 0,
      avgAccuracy: vals.length
        ? vals.reduce((a, v) => a + v.accuracy, 0) / vals.length
        : 0,
      activeRuns: recent.length,
    });
    students += members.length;
    for (const m of members) {
      if ((agg[m.userId]?.runs ?? 0) === 0) {
        attention.push({
          userId: m.userId,
          fullName: m.fullName,
          rollNumber: m.rollNumber,
        });
      }
    }
  }
  return { batches, students, attention };
}

async function teacherBatchIds(
  userId: string,
  store: StaffStore,
): Promise<{ courseIds: string[]; batchIds: string[] }> {
  const assignments = await store.myAssignments(userId);
  return {
    courseIds: assignments.flatMap((a) => (a.courseId ? [a.courseId] : [])),
    batchIds: assignments.flatMap((a) => (a.batchId ? [a.batchId] : [])),
  };
}

/** Teacher batch detail; throws ForbiddenError when not assigned. */
export async function getTeacherBatch(
  userId: string,
  batchId: string,
  store: StaffStore,
) {
  const info = await store.batchInfo(batchId);
  if (!info) throw new ForbiddenError();
  const scope = await teacherBatchIds(userId, store);
  const covered =
    scope.batchIds.includes(batchId) || scope.courseIds.includes(info.courseId);
  if (!covered) throw new ForbiddenError();
  const members = await store.batchMembers(batchId);
  const ids = members.map((m) => m.userId);
  const [agg, recent] = await Promise.all([
    store.memberAggregates(ids),
    store.memberAttempts(ids, 20),
  ]);
  return { info, members, aggregates: agg, recent };
}

/** Teacher student detail; same-batch membership required. */
export async function getTeacherStudent(
  userId: string,
  targetUserId: string,
  staff: StaffStore,
  students: StudentStore,
) {
  const scope = await teacherBatchIds(userId, staff);
  let shared = false;
  for (const batchId of scope.batchIds) {
    const members = await staff.batchMembers(batchId);
    if (members.some((m) => m.userId === targetUserId)) {
      shared = true;
      break;
    }
  }
  // Course-level assignments cover whole-course batches.
  if (!shared) {
    for (const courseId of scope.courseIds) {
      const batches = await staff.listBatches(null, courseId);
      for (const b of batches) {
        const members = await staff.batchMembers(b.id);
        if (members.some((m) => m.userId === targetUserId)) {
          shared = true;
          break;
        }
      }
      if (shared) break;
    }
  }
  if (!shared) throw new ForbiddenError();
  const [detail, records, streak, agg] = await Promise.all([
    staff.getUserDetail(targetUserId),
    students.listRecords(targetUserId),
    students.getStreak(targetUserId),
    students.aggregateResults(targetUserId),
  ]);
  if (!detail) throw new ForbiddenError();
  return { detail, records, streak, aggregates: agg };
}

export async function getAdminOverview(
  orgIds: string[] | null,
  store: StaffStore,
) {
  const [courses, batches, assignments, audit, orgs, flags] = await Promise.all([
    store.listCourses(orgIds),
    store.listBatches(orgIds),
    store.listAssignments(),
    store.getAudit(10),
    store.listOrgs(),
    store.getFlags(),
  ]);
  return {
    courses: courses.length,
    batches: batches.length,
    teachers: new Set(assignments.map((a) => a.userId)).size,
    orgs: orgIds ? orgs.filter((o) => orgIds.includes(o.id)) : orgs,
    recentAudit: audit,
    flags,
  };
}
