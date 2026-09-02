import "server-only";
import { db } from "@/lib/db/client";
import { getValidSessionsInRange } from "./session-state.server";

export interface ClassMonthlySummary {
  sessionsHeld: number;
  activeStudentCount: number;
  totalPresent: number;
  totalLate: number;
  totalAbsent: number;
  totalLateMinutes: number;
  memorizationEntryCount: number;
  perStudent: {
    studentId: string;
    fullName: string;
    present: number;
    late: number;
    absent: number;
    attendanceRate: number | null;
  }[]; // alphabetical by name — never sorted by any performance metric
}

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function getClassMonthlySummary(year: number, month: number): Promise<ClassMonthlySummary> {
  const { start, end } = monthRange(year, month);

  const [validSessions, students, allAttendanceRows, memoRow] = await Promise.all([
    getValidSessionsInRange(start, end),
    db.selectFrom("student").select(["id", "fullName"]).where("isActive", "=", true).orderBy("fullName", "asc").execute(),
    db
      .selectFrom("studentAttendance")
      .select(["studentId", "status", "lateMinutes", "sessionDate", "sessionTemplateId"])
      .where("sessionDate", ">=", start)
      .where("sessionDate", "<=", end)
      .execute(),
    db
      .selectFrom("weeklyMemorization")
      .select((eb) => eb.fn.countAll<number>().as("count"))
      .where("weekStart", ">=", start)
      .where("weekStart", "<=", end)
      .executeTakeFirst(),
  ]);

  const sessionsHeld = validSessions.length;
  const validKeys = new Set(validSessions.map((s) => `${s.sessionDate}|${s.sessionTemplateId}`));
  const validAttendanceRows = allAttendanceRows.filter((r) => validKeys.has(`${r.sessionDate}|${r.sessionTemplateId}`));

  const byStudent = new Map<string, { present: number; late: number; absent: number; lateMinutes: number }>();
  for (const row of validAttendanceRows) {
    const bucket = byStudent.get(row.studentId) ?? { present: 0, late: 0, absent: 0, lateMinutes: 0 };
    if (row.status === "PRESENT") bucket.present++;
    if (row.status === "LATE") {
      bucket.late++;
      bucket.lateMinutes += row.lateMinutes ?? 0;
    }
    if (row.status === "ABSENT") bucket.absent++;
    byStudent.set(row.studentId, bucket);
  }

  let totalPresent = 0,
    totalLate = 0,
    totalAbsent = 0,
    totalLateMinutes = 0;

  const perStudent = students.map((s) => {
    const b = byStudent.get(s.id) ?? { present: 0, late: 0, absent: 0, lateMinutes: 0 };
    totalPresent += b.present;
    totalLate += b.late;
    totalAbsent += b.absent;
    totalLateMinutes += b.lateMinutes;
    return {
      studentId: s.id,
      fullName: s.fullName,
      present: b.present,
      late: b.late,
      absent: b.absent,
      // Same denominator as getMonthlySummary (class-wide sessionsHeld, not
      // this student's own recorded-row count) so the two pages can never
      // disagree about the same student's rate for the same month.
      attendanceRate: sessionsHeld > 0 ? Math.round(((b.present + b.late) / sessionsHeld) * 100) : null,
    };
  });

  return {
    sessionsHeld,
    activeStudentCount: students.length,
    totalPresent,
    totalLate,
    totalAbsent,
    totalLateMinutes,
    memorizationEntryCount: Number(memoRow?.count ?? 0),
    perStudent, // already alphabetical from the query's ORDER BY
  };
}
