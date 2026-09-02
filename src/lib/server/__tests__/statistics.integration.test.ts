import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { db } from "@/lib/db/client";
import { getClassMonthlySummary } from "../statistics";
import { getMonthlySummary } from "../monthly";

let studentA: string;
let studentB: string;
let sessionId: string;

const YEAR = 2027;
const MONTH = 4;
function d(day: number) {
  return `${YEAR}-${String(MONTH).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

beforeAll(async () => {
  const a = await db.insertInto("student").values({ fullName: "TEST-STATS-Zaid" }).returning(["id"]).executeTakeFirstOrThrow();
  const b = await db.insertInto("student").values({ fullName: "TEST-STATS-Amina" }).returning(["id"]).executeTakeFirstOrThrow();
  studentA = a.id;
  studentB = b.id;

  const session = await db
    .insertInto("sessionTemplate")
    .values({ name: "TEST-STATS-SESSION", startTime: "18:00", endTime: "20:00", sortOrder: 997 })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  sessionId = session.id;

  await db.insertInto("teacherAttendance").values({ sessionDate: d(1), sessionTemplateId: sessionId, status: "PRESENT" }).execute();
  await db.insertInto("studentAttendance").values({ studentId: studentA, sessionDate: d(1), sessionTemplateId: sessionId, status: "PRESENT" }).execute();
  await db.insertInto("studentAttendance").values({ studentId: studentB, sessionDate: d(1), sessionTemplateId: sessionId, status: "ABSENT" }).execute();

  await db.insertInto("teacherAttendance").values({ sessionDate: d(2), sessionTemplateId: sessionId, status: "PRESENT" }).execute();
  await db.insertInto("studentAttendance").values({ studentId: studentA, sessionDate: d(2), sessionTemplateId: sessionId, status: "LATE", arrivalTime: "18:20", lateMinutes: 20 }).execute();
  await db.insertInto("studentAttendance").values({ studentId: studentB, sessionDate: d(2), sessionTemplateId: sessionId, status: "PRESENT" }).execute();

  await db.insertInto("weeklyMemorization").values({ studentId: studentA, weekStart: d(3), fromSurahId: 1, fromVerse: 1, toSurahId: 1, toVerse: 3 }).execute();
});

afterAll(async () => {
  await db.deleteFrom("weeklyMemorization").where("studentId", "in", [studentA, studentB]).execute();
  await db.deleteFrom("studentAttendance").where("sessionTemplateId", "=", sessionId).execute();
  await db.deleteFrom("teacherAttendance").where("sessionTemplateId", "=", sessionId).execute();
  await db.deleteFrom("student").where("id", "in", [studentA, studentB]).execute();
  await db.deleteFrom("sessionTemplate").where("id", "=", sessionId).execute();
  await db.destroy();
});

describe("getClassMonthlySummary — real PostgreSQL", () => {
  it("aggregates present/late/absent across all active students correctly", async () => {
    const summary = await getClassMonthlySummary(YEAR, MONTH);
    expect(summary.sessionsHeld).toBe(2);
    expect(summary.totalPresent).toBe(2);
    expect(summary.totalLate).toBe(1);
    expect(summary.totalAbsent).toBe(1);
    expect(summary.totalLateMinutes).toBe(20);
    expect(summary.memorizationEntryCount).toBe(1);
  });

  it("perStudent list is alphabetical by name, never sorted by attendance rate (no ranking)", async () => {
    const summary = await getClassMonthlySummary(YEAR, MONTH);
    const names = summary.perStudent.map((s) => s.fullName);
    const sortedAlphabetically = [...names].sort((a, b) => a.localeCompare(b));
    expect(names).toEqual(sortedAlphabetically);
  });

  it("the shape contains no ranking/position/best-worst field of any kind", async () => {
    const summary = await getClassMonthlySummary(YEAR, MONTH);
    const json = JSON.stringify(summary).toLowerCase();
    expect(json).not.toMatch(/rank|best|worst|top|position/);
  });

  it("a student's rate here matches getMonthlySummary's rate for the same student/month exactly (same denominator definition)", async () => {
    const classSummary = await getClassMonthlySummary(YEAR, MONTH);
    const perStudentSummary = await getMonthlySummary(studentA, YEAR, MONTH);
    const inClassList = classSummary.perStudent.find((s) => s.studentId === studentA)!;
    expect(inClassList.attendanceRate).toBe(perStudentSummary.attendanceRate);
  });
});
