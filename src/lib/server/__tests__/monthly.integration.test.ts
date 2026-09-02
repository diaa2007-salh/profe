import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { getMonthlySummary } from "../monthly";

let studentId: string;
let otherStudentId: string;
let sessionId: string;

const YEAR = 2027;
const MONTH = 3; // isolated month, unlikely to collide with other manual testing

function d(day: number) {
  return `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

beforeAll(async () => {
  const s1 = await db.insertInto("student").values({ fullName: "TEST-MONTHLY-A" }).returning(["id"]).executeTakeFirstOrThrow();
  const s2 = await db.insertInto("student").values({ fullName: "TEST-MONTHLY-B" }).returning(["id"]).executeTakeFirstOrThrow();
  studentId = s1.id;
  otherStudentId = s2.id;

  const session = await db
    .insertInto("sessionTemplate")
    .values({ name: "TEST-MONTHLY-SESSION", startTime: "05:30", endTime: "07:00", sortOrder: 998 })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  sessionId = session.id;

  // Day 1: teacher present, studentId=PRESENT, otherStudent=ABSENT
  await db.insertInto("teacherAttendance").values({ sessionDate: d(1), sessionTemplateId: sessionId, status: "PRESENT" }).execute();
  await db.insertInto("studentAttendance").values({ studentId, sessionDate: d(1), sessionTemplateId: sessionId, status: "PRESENT" }).execute();
  await db.insertInto("studentAttendance").values({ studentId: otherStudentId, sessionDate: d(1), sessionTemplateId: sessionId, status: "ABSENT" }).execute();

  // Day 2: teacher present, studentId=LATE 12 min (recorded directly, bypassing the action, to isolate the aggregation logic under test)
  await db.insertInto("teacherAttendance").values({ sessionDate: d(2), sessionTemplateId: sessionId, status: "PRESENT" }).execute();
  await db
    .insertInto("studentAttendance")
    .values({ studentId, sessionDate: d(2), sessionTemplateId: sessionId, status: "LATE", arrivalTime: "05:42", lateMinutes: 12 })
    .execute();

  // Day 3: teacher ABSENT — must not count toward sessionsHeld, and studentId has no row (correctly, since the app never lets one be created here)
  await db.insertInto("teacherAttendance").values({ sessionDate: d(3), sessionTemplateId: sessionId, status: "ABSENT" }).execute();

  // Day 4: teacher present, studentId has NO recorded row at all -> a genuine "not recorded" gap
  await db.insertInto("teacherAttendance").values({ sessionDate: d(4), sessionTemplateId: sessionId, status: "PRESENT" }).execute();

  // Weekly memorization inside and outside the month
  await db
    .insertInto("weeklyMemorization")
    .values({ studentId, weekStart: d(7), fromSurahId: 1, fromVerse: 1, toSurahId: 1, toVerse: 5 })
    .execute();
  await db
    .insertInto("weeklyMemorization")
    .values({ studentId, weekStart: `${YEAR}-01-01`, fromSurahId: 2, fromVerse: 1, toSurahId: 2, toVerse: 5 }) // different month — must be excluded
    .execute();
});

afterAll(async () => {
  await db.deleteFrom("weeklyMemorization").where("studentId", "=", studentId).execute();
  await db.deleteFrom("studentAttendance").where("sessionTemplateId", "=", sessionId).execute();
  await db.deleteFrom("teacherAttendance").where("sessionTemplateId", "=", sessionId).execute();
  await db.deleteFrom("student").where("id", "in", [studentId, otherStudentId]).execute();
  await db.deleteFrom("sessionTemplate").where("id", "=", sessionId).execute();
  await db.destroy();
});

describe("getMonthlySummary — real PostgreSQL, computed live (spec 28: nothing pre-stored)", () => {
  it("sessionsHeld counts only TEACHER_PRESENT days (2 of the 3 teacher_attendance rows), never the ABSENT one", async () => {
    const summary = await getMonthlySummary(studentId, YEAR, MONTH);
    expect(summary.sessionsHeld).toBe(3); // days 1, 2, 4 — day 3 (teacher absent) excluded
  });

  it("present/late/absent counts reflect only this student's own rows", async () => {
    const summary = await getMonthlySummary(studentId, YEAR, MONTH);
    expect(summary.present).toBe(1);
    expect(summary.late).toBe(1);
    expect(summary.absent).toBe(0);
    expect(summary.totalLateMinutes).toBe(12);
  });

  it("a session where the teacher was present but this student was never marked shows up as notRecorded, not silently ABSENT", async () => {
    const summary = await getMonthlySummary(studentId, YEAR, MONTH);
    expect(summary.notRecorded).toBe(1); // day 4
  });

  it("attendanceRate = (present + late) / sessionsHeld, matching the spec's own formula", async () => {
    const summary = await getMonthlySummary(studentId, YEAR, MONTH);
    expect(summary.attendanceRate).toBe(Math.round((2 / 3) * 100));
  });

  it("a different student's ABSENT-only record doesn't leak into this student's summary", async () => {
    const otherSummary = await getMonthlySummary(otherStudentId, YEAR, MONTH);
    expect(otherSummary.present).toBe(0);
    expect(otherSummary.absent).toBe(1);
  });

  it("memorization list includes only entries within the requested month", async () => {
    const summary = await getMonthlySummary(studentId, YEAR, MONTH);
    expect(summary.memorization).toHaveLength(1);
    expect(summary.memorization[0].fromSurahName).toBeTruthy();
  });

  it("a holiday added AFTER attendance was already recorded retroactively excludes that date from sessionsHeld — the exact gap the hardening review caught", async () => {
    // Day 1 already has a real teacher_attendance PRESENT row from the
    // beforeAll fixture, counted in earlier tests. Add a holiday covering
    // it NOW, after the fact, and confirm the aggregation re-derives
    // validity from current calendar state rather than trusting the
    // already-existing row.
    const year = await db.selectFrom("academicYear").select("id").limit(1).executeTakeFirst();
    const academicYearId =
      year?.id ??
      (await db.insertInto("academicYear").values({ label: "TEST-MONTHLY-RETRO", startDate: `${YEAR}-01-01`, endDate: `${YEAR}-12-31`, isActive: false }).returning("id").executeTakeFirstOrThrow()).id;

    const before = await getMonthlySummary(studentId, YEAR, MONTH);
    const beforeSessionsHeld = before.sessionsHeld;

    await db.insertInto("holiday").values({ academicYearId, name: "TEST-RETRO-HOLIDAY", startDate: d(1), endDate: d(1) }).execute();

    const after = await getMonthlySummary(studentId, YEAR, MONTH);
    expect(after.sessionsHeld).toBe(beforeSessionsHeld - 1); // day 1 no longer counts
    expect(after.present).toBe(0); // day 1's PRESENT row for this student is now excluded too, not just the session count

    await db.deleteFrom("holiday").where("name", "=", "TEST-RETRO-HOLIDAY").execute();
    if (!year) await db.deleteFrom("academicYear").where("id", "=", academicYearId).execute();
  });

  it("a month with zero sessions returns attendanceRate=null, not 0 or NaN", async () => {
    const summary = await getMonthlySummary(studentId, 2019, 1);
    expect(summary.sessionsHeld).toBe(0);
    expect(summary.attendanceRate).toBeNull();
  });
});
