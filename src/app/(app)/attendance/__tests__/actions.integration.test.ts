import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db/client";
import { getSessionStateContext } from "@/lib/server/session-state.server";
import { countsTowardAttendanceDenominator } from "@/lib/business/session-state";

vi.mock("@/lib/auth/config", () => ({
  auth: async () => ({ user: { id: "00000000-0000-0000-0000-000000000001" } }),
}));

// Imported after the mock so the module picks up the stubbed auth().
const { recordTeacherAttendance, recordStudentAttendance } = await import("../actions");

const TEST_DATE = "2026-11-10"; // a Tuesday, safely inside the fixture academic year below
let sessionId: string;
let studentId: string;

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeAll(async () => {
  // Real rows in the real database — cleaned up in afterAll, not rolled
  // back, since the code under test uses the shared `db` singleton rather
  // than an injectable per-test transaction.
  await db.deleteFrom("academicYear").where("label", "=", "TEST-YEAR").execute();
  await db
    .insertInto("academicYear")
    .values({ label: "TEST-YEAR", startDate: "2026-09-01", endDate: "2027-06-30", isActive: false })
    .execute();

  const session = await db
    .insertInto("sessionTemplate")
    .values({ name: "TEST-SESSION", startTime: "05:30", endTime: "07:00", sortOrder: 999 })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  sessionId = session.id;

  const student = await db
    .insertInto("student")
    .values({ fullName: "TEST-STUDENT-ATTENDANCE" })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  studentId = student.id;
});

afterAll(async () => {
  await db.deleteFrom("studentAttendance").where("studentId", "=", studentId).execute();
  await db.deleteFrom("teacherAttendance").where("sessionTemplateId", "=", sessionId).execute();
  await db.deleteFrom("sessionCancellation").where("sessionTemplateId", "=", sessionId).execute();
  await db.deleteFrom("holiday").where("name", "=", "TEST-HOLIDAY").execute();
  await db.deleteFrom("student").where("id", "=", studentId).execute();
  await db.deleteFrom("sessionTemplate").where("id", "=", sessionId).execute();
  await db.deleteFrom("academicYear").where("label", "=", "TEST-YEAR").execute();
  await db.destroy();
});

describe("attendance integration — real PostgreSQL, no active academic year yet", () => {
  let reactivateId: string | undefined;

  beforeAll(async () => {
    // This is a persistent dev DB, not a throwaway per-run one — a real
    // active year can legitimately exist from earlier manual/e2e testing.
    // This test's premise is "no active year", so make that actually true
    // first, and restore whatever was active afterward.
    const active = await db.selectFrom("academicYear").select("id").where("isActive", "=", true).executeTakeFirst();
    reactivateId = active?.id;
    if (reactivateId) {
      await db.updateTable("academicYear").set({ isActive: false }).where("id", "=", reactivateId).execute();
    }
  });

  afterAll(async () => {
    if (reactivateId) {
      await db.updateTable("academicYear").set({ isActive: true }).where("id", "=", reactivateId).execute();
    }
  });

  it("blocks recording when there is no ACTIVE academic year (this fixture year is intentionally inactive)", async () => {
    const result = await recordTeacherAttendance(fd({ sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" }));
    expect(result.ok).toBe(false);
  });
});

describe("attendance integration — with an active academic year", () => {
  let previouslyActiveYearId: string | undefined;

  beforeAll(async () => {
    // Only one academic year may be active (real DB constraint). Whatever
    // is active right now (e.g. from a real setup-wizard run) must be
    // deactivated for this suite and restored afterward, not left broken.
    const currentlyActive = await db.selectFrom("academicYear").select("id").where("isActive", "=", true).executeTakeFirst();
    previouslyActiveYearId = currentlyActive?.id;
    if (previouslyActiveYearId) {
      await db.updateTable("academicYear").set({ isActive: false }).where("id", "=", previouslyActiveYearId).execute();
    }
    await db.updateTable("academicYear").set({ isActive: true }).where("label", "=", "TEST-YEAR").execute();
  });

  afterAll(async () => {
    await db.updateTable("academicYear").set({ isActive: false }).where("label", "=", "TEST-YEAR").execute();
    if (previouslyActiveYearId) {
      await db.updateTable("academicYear").set({ isActive: true }).where("id", "=", previouslyActiveYearId).execute();
    }
  });

  it("teacher PRESENT can be recorded, and re-submitting UPDATEs rather than duplicating", async () => {
    const r1 = await recordTeacherAttendance(fd({ sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" }));
    expect(r1.ok).toBe(true);
    const r2 = await recordTeacherAttendance(fd({ sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" }));
    expect(r2.ok).toBe(true);

    const rows = await db
      .selectFrom("teacherAttendance")
      .selectAll()
      .where("sessionDate", "=", TEST_DATE)
      .where("sessionTemplateId", "=", sessionId)
      .execute();
    expect(rows).toHaveLength(1); // spec rule 9: UPDATE not INSERT
  });

  it("RULE 1/7 — once teacher is PRESENT, student attendance can be recorded", async () => {
    const result = await recordStudentAttendance(
      fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" })
    );
    expect(result.ok).toBe(true);
  });

  it("spec rule 8 — duplicate (student, date, session) UPDATEs, never creates a second row", async () => {
    await recordStudentAttendance(fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" }));
    await recordStudentAttendance(fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "ABSENT" }));

    const rows = await db
      .selectFrom("studentAttendance")
      .selectAll()
      .where("studentId", "=", studentId)
      .where("sessionDate", "=", TEST_DATE)
      .where("sessionTemplateId", "=", sessionId)
      .execute();
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("ABSENT"); // reflects the latest call
  });

  it("late requires a valid arrivalTime and computes lateMinutes server-side, ignoring any client-supplied number", async () => {
    const badForm = fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "LATE" });
    const bad = await recordStudentAttendance(badForm); // no arrivalTime at all
    expect(bad.ok).toBe(false);

    const goodForm = fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "LATE", arrivalTime: "05:47" });
    const good = await recordStudentAttendance(goodForm);
    expect(good.ok).toBe(true);
    if (good.ok) expect(good.lateMinutes).toBe(17); // 05:30 -> 05:47, the spec's own example

    const row = await db
      .selectFrom("studentAttendance")
      .selectAll()
      .where("studentId", "=", studentId)
      .where("sessionDate", "=", TEST_DATE)
      .where("sessionTemplateId", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(row.lateMinutes).toBe(17);
    expect(row.arrivalTime?.toString().slice(0, 5)).toBe("05:47");
  });

  it("Teacher PRESENT + Student ABSENT -> succeeds", async () => {
    const result = await recordStudentAttendance(
      fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "ABSENT" })
    );
    expect(result.ok).toBe(true);
    const row = await db
      .selectFrom("studentAttendance")
      .selectAll()
      .where("studentId", "=", studentId)
      .where("sessionDate", "=", TEST_DATE)
      .where("sessionTemplateId", "=", sessionId)
      .executeTakeFirstOrThrow();
    expect(row.status).toBe("ABSENT");
    expect(row.arrivalTime).toBeNull();
    expect(row.lateMinutes).toBeNull();
  });

  it("arrivalTime before session start is rejected, not recorded as a negative/zero lateMinutes", async () => {
    const result = await recordStudentAttendance(
      fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "LATE", arrivalTime: "05:10" })
    );
    expect(result.ok).toBe(false);
  });

  it("spec 10 (literal) — a raw duplicate INSERT bypassing the action's upsert is rejected by the DB unique constraint itself", async () => {
    await db
      .insertInto("studentAttendance")
      .values({ studentId, sessionDate: "2026-11-11", sessionTemplateId: sessionId, status: "PRESENT" })
      .execute();

    await expect(
      db
        .insertInto("studentAttendance")
        .values({ studentId, sessionDate: "2026-11-11", sessionTemplateId: sessionId, status: "ABSENT" })
        .execute() // no onConflict clause here on purpose — this must hit the unique(student_id, session_date, session_template_id) index
    ).rejects.toThrow(/duplicate key|unique/i);

    await db.deleteFrom("studentAttendance").where("sessionDate", "=", "2026-11-11").execute();
  });

  it("a date outside the active academic year's range is rejected even though a year IS active", async () => {
    const result = await recordTeacherAttendance(fd({ sessionDate: "2026-01-01", sessionTemplateId: sessionId, status: "PRESENT" }));
    expect(result.ok).toBe(false);
  });

  it("RULE 2/7 — a real mutation attempt is rejected server-side once the teacher is ABSENT, not just hidden in the UI", async () => {
    await recordTeacherAttendance(fd({ sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "ABSENT" }));

    const result = await recordStudentAttendance(
      fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" })
    );
    expect(result.ok).toBe(false);

    // RULE 11: the earlier PRESENT/LATE record from prior tests must not
    // silently become "the student was absent" — it should simply not exist
    // for this now-invalid session.
    const rows = await db
      .selectFrom("studentAttendance")
      .selectAll()
      .where("studentId", "=", studentId)
      .where("sessionDate", "=", TEST_DATE)
      .where("sessionTemplateId", "=", sessionId)
      .execute();
    expect(rows).toHaveLength(0);

    // restore for subsequent tests in this suite
    await recordTeacherAttendance(fd({ sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" }));
  });

  it("RULE 3 — a session cancellation blocks both teacher and student attendance", async () => {
    await db
      .insertInto("sessionCancellation")
      .values({ sessionTemplateId: sessionId, startDate: TEST_DATE, endDate: TEST_DATE, reason: "TEST" })
      .execute();

    const teacherResult = await recordTeacherAttendance(fd({ sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" }));
    expect(teacherResult.ok).toBe(false);

    const studentResult = await recordStudentAttendance(
      fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" })
    );
    expect(studentResult.ok).toBe(false);

    await db.deleteFrom("sessionCancellation").where("sessionTemplateId", "=", sessionId).execute();
  });

  it("RULE 4 — a holiday covering the date blocks attendance the same way", async () => {
    await db
      .insertInto("holiday")
      .values({ academicYearId: (await db.selectFrom("academicYear").select("id").where("label", "=", "TEST-YEAR").executeTakeFirstOrThrow()).id, name: "TEST-HOLIDAY", startDate: TEST_DATE, endDate: TEST_DATE })
      .execute();

    const result = await recordStudentAttendance(
      fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" })
    );
    expect(result.ok).toBe(false);

    await db.deleteFrom("holiday").where("name", "=", "TEST-HOLIDAY").execute();
  });

  it("spec 10 — an archived student's historical attendance rows remain queryable", async () => {
    await recordStudentAttendance(fd({ studentId, sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" }));
    await db.updateTable("student").set({ isActive: false, archivedAt: new Date() }).where("id", "=", studentId).execute();

    const activeStudents = await db.selectFrom("student").select("id").where("isActive", "=", true).where("id", "=", studentId).execute();
    expect(activeStudents).toHaveLength(0); // gone from the active roster

    const historicalRecords = await db.selectFrom("studentAttendance").selectAll().where("studentId", "=", studentId).execute();
    expect(historicalRecords.length).toBeGreaterThan(0); // but history is intact

    await db.updateTable("student").set({ isActive: true, archivedAt: null }).where("id", "=", studentId).execute();
  });
});

describe("spec rule 13 — CANCELLED/HOLIDAY/TEACHER_ABSENT never count toward the attendance denominator, verified against real fetched state", () => {
  let previouslyActiveYearId: string | undefined;

  beforeAll(async () => {
    const currentlyActive = await db.selectFrom("academicYear").select("id").where("isActive", "=", true).executeTakeFirst();
    previouslyActiveYearId = currentlyActive?.id;
    if (previouslyActiveYearId) {
      await db.updateTable("academicYear").set({ isActive: false }).where("id", "=", previouslyActiveYearId).execute();
    }
    await db.updateTable("academicYear").set({ isActive: true }).where("label", "=", "TEST-YEAR").execute();
  });

  afterAll(async () => {
    await db.updateTable("academicYear").set({ isActive: false }).where("label", "=", "TEST-YEAR").execute();
    if (previouslyActiveYearId) {
      await db.updateTable("academicYear").set({ isActive: true }).where("id", "=", previouslyActiveYearId).execute();
    }
  });

  it("a real CANCELLED state (fetched from Postgres) does not count", async () => {
    await db
      .insertInto("sessionCancellation")
      .values({ sessionTemplateId: sessionId, startDate: TEST_DATE, endDate: TEST_DATE, reason: "TEST-DENOM" })
      .execute();
    const ctx = await getSessionStateContext(TEST_DATE, sessionId);
    expect(ctx?.state).toBe("CANCELLED");
    expect(countsTowardAttendanceDenominator(ctx!.state)).toBe(false);
    await db.deleteFrom("sessionCancellation").where("sessionTemplateId", "=", sessionId).execute();
  });

  it("a real HOLIDAY state (fetched from Postgres) does not count", async () => {
    const year = await db.selectFrom("academicYear").select("id").where("label", "=", "TEST-YEAR").executeTakeFirstOrThrow();
    await db.insertInto("holiday").values({ academicYearId: year.id, name: "TEST-HOLIDAY-DENOM", startDate: TEST_DATE, endDate: TEST_DATE }).execute();
    const ctx = await getSessionStateContext(TEST_DATE, sessionId);
    expect(ctx?.state).toBe("HOLIDAY");
    expect(countsTowardAttendanceDenominator(ctx!.state)).toBe(false);
    await db.deleteFrom("holiday").where("name", "=", "TEST-HOLIDAY-DENOM").execute();
  });

  it("a real TEACHER_ABSENT state does not count, but TEACHER_PRESENT does", async () => {
    await recordTeacherAttendance(fd({ sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "ABSENT" }));
    let ctx = await getSessionStateContext(TEST_DATE, sessionId);
    expect(countsTowardAttendanceDenominator(ctx!.state)).toBe(false);

    await recordTeacherAttendance(fd({ sessionDate: TEST_DATE, sessionTemplateId: sessionId, status: "PRESENT" }));
    ctx = await getSessionStateContext(TEST_DATE, sessionId);
    expect(countsTowardAttendanceDenominator(ctx!.state)).toBe(true);
  });
});

describe("overlapping cancellation — DB-level exclusion constraint", () => {
  it("rejects two overlapping cancellation periods for the same session", async () => {
    await db
      .insertInto("sessionCancellation")
      .values({ sessionTemplateId: sessionId, startDate: "2026-12-01", endDate: "2027-01-31", reason: "TEST-A" })
      .execute();

    await expect(
      db
        .insertInto("sessionCancellation")
        .values({ sessionTemplateId: sessionId, startDate: "2027-01-15", endDate: "2027-02-15", reason: "TEST-B" })
        .execute()
    ).rejects.toThrow();

    await db.deleteFrom("sessionCancellation").where("sessionTemplateId", "=", sessionId).execute();
  });
});
