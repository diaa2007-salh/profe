import { describe, it, expect } from "vitest";
import { computeDailySessionState, canRecordStudentAttendance, countsTowardAttendanceDenominator } from "../session-state";

const YEAR = { startDate: "2026-09-21", endDate: "2027-06-30" };
const SESSION_A = "session-a";

describe("computeDailySessionState — spec acceptance tests 1-4", () => {
  it("TEST 1 — school day, teacher present -> TEACHER_PRESENT, and student attendance allowed", () => {
    const state = computeDailySessionState({
      date: "2026-10-05",
      sessionTemplateId: SESSION_A,
      academicYear: YEAR,
      holidays: [],
      cancellations: [],
      teacherStatus: "PRESENT",
    });
    expect(state).toBe("TEACHER_PRESENT");
    expect(canRecordStudentAttendance(state)).toBe(true);
  });

  it("TEST 2 — teacher absent -> student attendance must be blocked (RULE 7)", () => {
    const state = computeDailySessionState({
      date: "2026-10-05",
      sessionTemplateId: SESSION_A,
      academicYear: YEAR,
      holidays: [],
      cancellations: [],
      teacherStatus: "ABSENT",
    });
    expect(state).toBe("TEACHER_ABSENT");
    expect(canRecordStudentAttendance(state)).toBe(false);
  });

  it("TEST 3 — cancelled session -> no attendance at all, even if teacher was marked present earlier", () => {
    const state = computeDailySessionState({
      date: "2026-12-10",
      sessionTemplateId: SESSION_A,
      academicYear: YEAR,
      holidays: [],
      cancellations: [{ sessionTemplateId: SESSION_A, startDate: "2026-12-01", endDate: "2027-01-31" }],
      teacherStatus: "PRESENT", // even if somehow recorded, cancellation wins
    });
    expect(state).toBe("CANCELLED");
    expect(canRecordStudentAttendance(state)).toBe(false);
  });

  it("TEST 4 — holiday -> no attendance", () => {
    const state = computeDailySessionState({
      date: "2027-03-20",
      sessionTemplateId: SESSION_A,
      academicYear: YEAR,
      holidays: [{ startDate: "2027-03-19", endDate: "2027-03-22" }],
      cancellations: [],
      teacherStatus: null,
    });
    expect(state).toBe("HOLIDAY");
    expect(canRecordStudentAttendance(state)).toBe(false);
  });

  it("RULE 3 — holiday and cancellation are distinguishable, not collapsed into one status", () => {
    const holidayState = computeDailySessionState({
      date: "2027-03-20",
      sessionTemplateId: SESSION_A,
      academicYear: YEAR,
      holidays: [{ startDate: "2027-03-19", endDate: "2027-03-22" }],
      cancellations: [],
      teacherStatus: null,
    });
    const cancelledState = computeDailySessionState({
      date: "2026-12-10",
      sessionTemplateId: SESSION_A,
      academicYear: YEAR,
      holidays: [],
      cancellations: [{ sessionTemplateId: SESSION_A, startDate: "2026-12-01", endDate: "2027-01-31" }],
      teacherStatus: null,
    });
    expect(holidayState).not.toBe(cancelledState);
  });

  it("date outside the academic year -> NOT_SCHOOL_DAY", () => {
    const state = computeDailySessionState({
      date: "2026-08-01",
      sessionTemplateId: SESSION_A,
      academicYear: YEAR,
      holidays: [],
      cancellations: [],
      teacherStatus: null,
    });
    expect(state).toBe("NOT_SCHOOL_DAY");
  });

  it("a cancellation with sessionTemplateId=null applies to every session", () => {
    const state = computeDailySessionState({
      date: "2026-12-10",
      sessionTemplateId: "some-other-session",
      academicYear: YEAR,
      holidays: [],
      cancellations: [{ sessionTemplateId: null, startDate: "2026-12-01", endDate: "2027-01-31" }],
      teacherStatus: null,
    });
    expect(state).toBe("CANCELLED");
  });

  it("RULE 5 — only TEACHER_PRESENT counts toward the attendance denominator", () => {
    expect(countsTowardAttendanceDenominator("TEACHER_PRESENT")).toBe(true);
    expect(countsTowardAttendanceDenominator("TEACHER_ABSENT")).toBe(false);
    expect(countsTowardAttendanceDenominator("CANCELLED")).toBe(false);
    expect(countsTowardAttendanceDenominator("HOLIDAY")).toBe(false);
    expect(countsTowardAttendanceDenominator("NOT_SCHOOL_DAY")).toBe(false);
  });
});
