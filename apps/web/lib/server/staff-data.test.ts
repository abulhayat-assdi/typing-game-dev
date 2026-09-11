import { describe, expect, it } from "vitest";
import { createMemoryStudentStore } from "./student-store";
import {
  createMemoryStaffStore,
  ForbiddenError,
} from "./staff-store";
import {
  getAdminOverview,
  getTeacherBatch,
  getTeacherDashboard,
  getTeacherStudent,
} from "./staff-data";

function teacherStore() {
  return createMemoryStaffStore({
    assignments: [
      {
        id: "a1",
        userId: "t",
        courseId: null,
        batchId: "b1",
        batchName: "Batch 101",
        courseName: "Sales",
      },
    ],
    batches: [
      {
        id: "b1",
        courseId: "c1",
        courseName: "Sales",
        organizationId: "o1",
        name: "Batch 101",
        joinCode: "B1",
        isActive: true,
        memberCount: 2,
      },
      {
        id: "b2",
        courseId: "c1",
        courseName: "Sales",
        organizationId: "o1",
        name: "Batch 102",
        joinCode: "B2",
        isActive: true,
        memberCount: 1,
      },
    ],
    members: {
      b1: [
        {
          memberId: "m1",
          userId: "s1",
          rollNumber: "R-01",
          fullName: "Stu One",
          email: "s1@e.c",
          skillTrack: "beginner",
          isActive: true,
          xpTotal: 100,
          level: 3,
          streak: 4,
        },
        {
          memberId: "m2",
          userId: "s2",
          rollNumber: "R-02",
          fullName: "Stu Two",
          email: "s2@e.c",
          skillTrack: "beginner",
          isActive: true,
          xpTotal: 10,
          level: 1,
          streak: 0,
        },
      ],
      b2: [
        {
          memberId: "m3",
          userId: "s3",
          rollNumber: "R-01",
          fullName: "Stu Three",
          email: "s3@e.c",
          skillTrack: "beginner",
          isActive: true,
          xpTotal: 5,
          level: 1,
          streak: 0,
        },
      ],
    },
    attempts: [
      { userId: "s1", gameSlug: "g", status: "validated", score: 90 },
    ],
    aggregates: {
      s1: { wpm: 30, accuracy: 95, runs: 2 },
    },
    courses: [{ id: "c1", organizationId: "o1", title: "Sales", slug: "sales", isActive: true }],
    orgs: [{ id: "o1", name: "Org", slug: "org" }],
    audit: [
      { id: 1, actor: "a", action: "course.insert", entity: "courses", entityId: "c", createdAt: "2026-01-01" },
    ],
    flags: [{ key: "X", enabled: true, description: "d" }],
    userDetails: {
      s1: { userId: "s1", fullName: "Stu One", email: "s1@e.c", status: "active", xpTotal: 100, level: 3 },
    },
  });
}

function studentStore() {
  return createMemoryStudentStore({
    aggregates: {
      s1: { count: 2, avgWpm: 30, avgAccuracy: 95, bestWpm: 33, bestAccuracy: 96 },
    },
    records: [
      { userId: "s1", gameSlug: "g", metric: "best_score", value: 90, attemptId: "a" },
    ],
    streaks: { s1: { current: 4, best: 4, activeDays: 4 } },
  });
}

describe("getTeacherDashboard", () => {
  it("summarizes assigned batches with attention list", async () => {
    const d = await getTeacherDashboard("t", teacherStore());
    expect(d.batches).toHaveLength(1);
    expect(d.batches[0]).toMatchObject({ batchId: "b1", members: 2 });
    expect(d.batches[0]?.avgWpm).toBe(30);
    expect(d.students).toBe(2);
    expect(d.attention.map((s) => s.userId)).toEqual(["s2"]);
  });

  it("returns empty scope for unassigned teachers", async () => {
    const d = await getTeacherDashboard("nobody", teacherStore());
    expect(d.batches).toEqual([]);
    expect(d.students).toBe(0);
  });
});

describe("getTeacherBatch", () => {
  it("returns detail for covered batches", async () => {
    const b = await getTeacherBatch("t", "b1", teacherStore());
    expect(b.members).toHaveLength(2);
    expect(b.aggregates["s1"]).toMatchObject({ wpm: 30, runs: 2 });
    expect(b.recent).toHaveLength(1);
  });

  it("throws ForbiddenError outside scope", async () => {
    await expect(getTeacherBatch("t", "b2", teacherStore())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    await expect(getTeacherBatch("t", "nope", teacherStore())).rejects.toBeInstanceOf(
      ForbiddenError,
    );
  });
});

describe("getTeacherStudent", () => {
  it("returns permitted student data for shared batches", async () => {
    const s = await getTeacherStudent("t", "s1", teacherStore(), studentStore());
    expect(s.detail.fullName).toBe("Stu One");
    expect(s.records).toHaveLength(1);
    expect(s.aggregates.count).toBe(2);
  });

  it("rejects students outside the teacher scope", async () => {
    await expect(
      getTeacherStudent("t", "s3", teacherStore(), studentStore()),
    ).rejects.toBeInstanceOf(ForbiddenError);
    await expect(
      getTeacherStudent("t", "ghost", teacherStore(), studentStore()),
    ).rejects.toBeInstanceOf(ForbiddenError);
  });
});

describe("getAdminOverview", () => {
  it("counts scoped inventory", async () => {
    const o = await getAdminOverview(["o1"], teacherStore());
    expect(o.courses).toBe(1);
    expect(o.batches).toBe(2);
    expect(o.teachers).toBe(1);
    expect(o.orgs).toHaveLength(1);
    expect(o.recentAudit).toHaveLength(1);
    expect(o.flags).toHaveLength(1);
  });
});
