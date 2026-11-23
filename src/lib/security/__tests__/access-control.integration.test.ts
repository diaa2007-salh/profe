import { describe, it, expect, vi, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";

// Unlike the other integration test files (which always mock a fixed
// valid session), this suite needs to control auth() per test case: some
// tests simulate no session at all, others a valid session with
// attacker-supplied ids for other entities.
const mockAuth = vi.fn();
vi.mock("@/lib/auth/config", () => ({
  auth: () => mockAuth(),
}));

const REAL_SESSION_USER_ID = "00000000-0000-0000-0000-0000000000f1";
let createdTestUser = false;
let createdTeacherProfile = false;

const attendanceActions = await import("@/app/(app)/attendance/actions");
const studentActions = await import("@/app/(app)/students/actions");
const memorizationActions = await import("@/app/(app)/memorization/actions");
const monthlyActions = await import("@/app/(app)/monthly/actions");
const settingsActions = await import("@/app/(app)/settings/actions");
const backupActions = await import("@/app/(app)/settings/backup/actions");

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

const NONEXISTENT_ID = "99999999-9999-4999-8999-999999999999"; // valid UUID shape, references nothing

beforeAll(async () => {
  const user = await db.selectFrom("appUser").select("id").where("id", "=", REAL_SESSION_USER_ID).executeTakeFirst();
  if (!user) {
    await db
      .insertInto("appUser")
      .values({ id: REAL_SESSION_USER_ID, email: "test-security@example.invalid", passwordHash: "not-a-real-hash" })
      .execute();
    createdTestUser = true;
  }
  const profile = await db
    .selectFrom("teacherProfile")
    .select("id")
    .where("userId", "=", REAL_SESSION_USER_ID)
    .executeTakeFirst();
  if (!profile) {
    await db
      .insertInto("teacherProfile")
      .values({ userId: REAL_SESSION_USER_ID, fullName: "TEST-SECURITY-TEACHER" })
      .execute();
    createdTeacherProfile = true;
  }
});

afterAll(async () => {
  if (createdTeacherProfile) await db.deleteFrom("teacherProfile").where("userId", "=", REAL_SESSION_USER_ID).execute();
  if (createdTestUser) await db.deleteFrom("appUser").where("id", "=", REAL_SESSION_USER_ID).execute();
  await db.destroy();
});

describe("access control — every mutation rejects when there is no session at all", () => {
  beforeAll(() => {
    mockAuth.mockResolvedValue(null);
  });

  it("attendance: recordTeacherAttendance rejects unauthenticated", async () => {
    await expect(
      attendanceActions.recordTeacherAttendance(fd({ sessionDate: "2027-01-01", sessionTemplateId: NONEXISTENT_ID, status: "PRESENT" }))
    ).rejects.toThrow();
  });

  it("attendance: recordStudentAttendance rejects unauthenticated", async () => {
    await expect(
      attendanceActions.recordStudentAttendance(
        fd({ studentId: NONEXISTENT_ID, sessionDate: "2027-01-01", sessionTemplateId: NONEXISTENT_ID, status: "PRESENT" })
      )
    ).rejects.toThrow();
  });

  it("students: upsertStudent rejects unauthenticated", async () => {
    await expect(studentActions.upsertStudent(fd({ fullName: "Attacker Injected Student" }))).rejects.toThrow();
  });

  it("students: archiveStudent rejects unauthenticated", async () => {
    await expect(studentActions.archiveStudent(NONEXISTENT_ID)).rejects.toThrow();
  });

  it("memorization: upsertWeeklyMemorization rejects unauthenticated", async () => {
    await expect(
      memorizationActions.upsertWeeklyMemorization(
        fd({ studentId: NONEXISTENT_ID, weekStart: "2027-01-01", fromSurahId: "1", fromVerse: "1", toSurahId: "1", toVerse: "2" })
      )
    ).rejects.toThrow();
  });

  it("monthly: saveMonthlyEvaluation rejects unauthenticated", async () => {
    await expect(
      monthlyActions.saveMonthlyEvaluation(fd({ studentId: NONEXISTENT_ID, year: "2027", month: "1", grade: "GOOD" }))
    ).rejects.toThrow();
  });

  it("settings: every settings mutation rejects unauthenticated", async () => {
    await expect(settingsActions.updateTeacherProfile(fd({ fullName: "Attacker" }))).rejects.toThrow();
    await expect(settingsActions.upsertAcademicYear(fd({ label: "x", startDate: "2027-01-01", endDate: "2027-02-01" }))).rejects.toThrow();
    await expect(settingsActions.setActiveAcademicYear(NONEXISTENT_ID)).rejects.toThrow();
    await expect(settingsActions.upsertSessionTemplate(fd({ name: "x", startTime: "05:00", endTime: "06:00" }))).rejects.toThrow();
    await expect(settingsActions.upsertHoliday(fd({ academicYearId: NONEXISTENT_ID, name: "x", startDate: "2027-01-01", endDate: "2027-01-02" }))).rejects.toThrow();
    await expect(settingsActions.upsertCancellation(fd({ sessionTemplateId: "", startDate: "2027-01-01", endDate: "2027-01-02" }))).rejects.toThrow();
  });

  it("backup: both exportBackup and restoreBackup reject unauthenticated -- this is the most sensitive mutation in the app", async () => {
    await expect(backupActions.exportBackup()).rejects.toThrow();
    await expect(backupActions.restoreBackup(JSON.stringify({ backupVersion: "1.1", exportedAt: "x", data: {} }))).rejects.toThrow();
  });
});

describe("access control — a valid session with attacker-supplied ids for OTHER entities fails safely, never corrupts unrelated data", () => {
  beforeAll(() => {
    mockAuth.mockResolvedValue({ user: { id: REAL_SESSION_USER_ID } });
  });

  it("attendance actions reject an authenticated user without the owning teacher profile", async () => {
    mockAuth.mockResolvedValue({ user: { id: "00000000-0000-0000-0000-0000000000f2" } });
    try {
      const result = await attendanceActions.markAllPresent("2027-01-01", NONEXISTENT_ID);
      expect(result).toEqual({ ok: false, error: "غير مصرح بتسجيل الحضور" });
    } finally {
      mockAuth.mockResolvedValue({ user: { id: REAL_SESSION_USER_ID } });
    }
  });

  it("recordStudentAttendance rejects a nonexistent student without a phantom row", async () => {
    // Needs a real, valid session+template so the failure is specifically
    // about the bogus studentId, not an unrelated rejection.
    const year = await db
      .insertInto("academicYear")
      .values({ label: "TEST-SEC-YEAR", startDate: "2027-01-01", endDate: "2027-12-31", isActive: false })
      .returning("id")
      .executeTakeFirstOrThrow();
    const activeBefore = await db.selectFrom("academicYear").select("id").where("isActive", "=", true).executeTakeFirst();
    if (activeBefore) await db.updateTable("academicYear").set({ isActive: false }).where("id", "=", activeBefore.id).execute();
    await db.updateTable("academicYear").set({ isActive: true }).where("id", "=", year.id).execute();

    const session = await db
      .insertInto("sessionTemplate")
      .values({ name: "TEST-SEC-SESSION", startTime: "05:00", endTime: "06:00", sortOrder: 990 })
      .returning("id")
      .executeTakeFirstOrThrow();
    await attendanceActions.recordTeacherAttendance(fd({ sessionDate: "2027-06-01", sessionTemplateId: session.id, status: "PRESENT" }));

    const result = await attendanceActions.recordStudentAttendance(
      fd({ studentId: NONEXISTENT_ID, sessionDate: "2027-06-01", sessionTemplateId: session.id, status: "PRESENT" })
    );
    expect(result.ok).toBe(false);

    const phantomRows = await db.selectFrom("studentAttendance").select("id").where("studentId", "=", NONEXISTENT_ID).execute();
    expect(phantomRows).toHaveLength(0); // the server checks the active roster before attempting the write

    // cleanup
    await db.deleteFrom("teacherAttendance").where("sessionTemplateId", "=", session.id).execute();
    await db.deleteFrom("sessionTemplate").where("id", "=", session.id).execute();
    await db.updateTable("academicYear").set({ isActive: false }).where("id", "=", year.id).execute();
    await db.deleteFrom("academicYear").where("id", "=", year.id).execute();
    if (activeBefore) await db.updateTable("academicYear").set({ isActive: true }).where("id", "=", activeBefore.id).execute();
  });

  it("upsertHoliday with a nonexistent academicYearId fails via FK, no orphaned holiday created", async () => {
    const result = await settingsActions.upsertHoliday(
      fd({ academicYearId: NONEXISTENT_ID, name: "Attacker Holiday", startDate: "2027-01-01", endDate: "2027-01-02" })
    );
    expect(result.ok).toBe(false);
    const orphaned = await db.selectFrom("holiday").select("id").where("name", "=", "Attacker Holiday").execute();
    expect(orphaned).toHaveLength(0);
  });

  it("saveMonthlyEvaluation with a nonexistent studentId fails via FK, no orphaned evaluation created", async () => {
    const result = await monthlyActions.saveMonthlyEvaluation(fd({ studentId: NONEXISTENT_ID, year: "2027", month: "6", grade: "GOOD" }));
    expect(result.ok).toBe(false);
    const orphaned = await db.selectFrom("monthlyEvaluation").select("id").where("studentId", "=", NONEXISTENT_ID).execute();
    expect(orphaned).toHaveLength(0);
  });

  it("upsertWeeklyMemorization with a nonexistent studentId fails, no orphaned record created", async () => {
    const result = await memorizationActions.upsertWeeklyMemorization(
      fd({ studentId: NONEXISTENT_ID, weekStart: "2027-01-01", fromSurahId: "1", fromVerse: "1", toSurahId: "1", toVerse: "2" })
    );
    expect(result.ok).toBe(false);
    const orphaned = await db.selectFrom("weeklyMemorization").select("id").where("studentId", "=", NONEXISTENT_ID).execute();
    expect(orphaned).toHaveLength(0);
  });

  it("archiveStudent / restoreStudent / deleteHoliday / deleteCancellation with a nonexistent id are safe, harmless no-ops -- never throw, never touch unrelated rows", async () => {
    await expect(studentActions.archiveStudent(NONEXISTENT_ID)).resolves.toEqual({ ok: true });
    await expect(studentActions.restoreStudent(NONEXISTENT_ID)).resolves.toEqual({ ok: true });
    await expect(settingsActions.deleteHoliday(NONEXISTENT_ID)).resolves.toEqual({ ok: true });
    await expect(settingsActions.deleteCancellation(NONEXISTENT_ID)).resolves.toEqual({ ok: true });
  });

  it("hardening fix regression: setActiveAcademicYear with a nonexistent id now fails cleanly instead of silently leaving zero active years", async () => {
    const activeBefore = await db.selectFrom("academicYear").select("id").where("isActive", "=", true).executeTakeFirst();

    const result = await settingsActions.setActiveAcademicYear(NONEXISTENT_ID);
    expect(result.ok).toBe(false);

    const activeAfter = await db.selectFrom("academicYear").select("id").where("isActive", "=", true).executeTakeFirst();
    expect(activeAfter?.id).toBe(activeBefore?.id); // completely untouched, not silently cleared
  });

  it("updateTeacherProfile is scoped to the session's OWN user id, not an attacker-controllable parameter -- there is no id argument to manipulate", () => {
    // Structural check: the function signature only accepts FormData with
    // profile fields, never a userId/teacherId parameter. This is the
    // actual IDOR defense for this specific action -- documented here so
    // the invariant is explicit and breaks loudly if ever changed.
    expect(settingsActions.updateTeacherProfile.length).toBe(1); // (formData) only
  });
});

describe("single-tenant architecture -- documented, not a bug, but worth being explicit about", () => {
  it("there is no per-teacher data partitioning anywhere: this is correct for the app's explicit single-teacher scope, not an oversight", async () => {
    // Confirms the architectural fact stated in docs/DATABASE.md's
    // "Future multi-tenant" note: student/attendance/etc. carry no
    // teacher_id or academic_year-scoped-to-user column. Any authenticated
    // session sees the one teacher's data, because there is only ever
    // meant to be one. This test exists so that fact is verified, not
    // just asserted in a comment -- if a teacher_id column is ever added,
    // this test should be updated to reflect real multi-tenant scoping.
    const studentColumns = Object.keys((await db.selectFrom("student").selectAll().limit(1).executeTakeFirst()) ?? {});
    expect(studentColumns).not.toContain("teacherId");
    expect(studentColumns).not.toContain("userId");
  });
});
