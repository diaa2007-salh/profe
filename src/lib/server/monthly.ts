import "server-only";
import { db } from "@/lib/db/client";
import { getValidSessionsInRange } from "./session-state.server";

export interface MonthlySummary {
  sessionsHeld: number;
  present: number;
  late: number;
  absent: number;
  notRecorded: number; // sessionsHeld minus what's actually logged for this student — a data gap, not an assumption
  totalLateMinutes: number;
  attendanceRate: number | null; // null when sessionsHeld is 0 — avoids a misleading 0% or divide-by-zero
  memorization: {
    id: string;
    weekStart: string;
    fromSurahName: string;
    fromVerse: number;
    toSurahName: string;
    toVerse: number;
    notes: string | null;
  }[];
}

function monthRange(year: number, month: number) {
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const lastDay = new Date(year, month, 0).getDate(); // month is 1-indexed here, Date's day-0 trick
  const end = `${year}-${String(month).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
  return { start, end };
}

export async function getMonthlySummary(studentId: string, year: number, month: number): Promise<MonthlySummary> {
  const { start, end } = monthRange(year, month);

  const [validSessions, studentRows, memoRows] = await Promise.all([
    getValidSessionsInRange(start, end),
    db
      .selectFrom("studentAttendance")
      .select(["status", "lateMinutes", "sessionDate", "sessionTemplateId"])
      .where("studentId", "=", studentId)
      .where("sessionDate", ">=", start)
      .where("sessionDate", "<=", end)
      .execute(),
    db
      .selectFrom("weeklyMemorization")
      .innerJoin("quranSurah as fromS", "fromS.id", "weeklyMemorization.fromSurahId")
      .innerJoin("quranSurah as toS", "toS.id", "weeklyMemorization.toSurahId")
      .select([
        "weeklyMemorization.id",
        "weeklyMemorization.weekStart",
        "fromS.nameAr as fromSurahName",
        "weeklyMemorization.fromVerse",
        "toS.nameAr as toSurahName",
        "weeklyMemorization.toVerse",
        "weeklyMemorization.notes",
      ])
      .where("weeklyMemorization.studentId", "=", studentId)
      .where("weeklyMemorization.weekStart", ">=", start)
      .where("weeklyMemorization.weekStart", "<=", end)
      .orderBy("weeklyMemorization.weekStart", "asc")
      .execute(),
  ]);

  const sessionsHeld = validSessions.length;
  const validKeys = new Set(validSessions.map((s) => `${s.sessionDate}|${s.sessionTemplateId}`));
  // A retroactively-added holiday/cancellation can leave old student_attendance
  // rows on the books for a date that's no longer a valid session — those
  // rows stay in the database (historical record, never deleted) but are
  // excluded here, the same way the session itself is excluded above.
  const validStudentRows = studentRows.filter((r) => validKeys.has(`${r.sessionDate}|${r.sessionTemplateId}`));

  const present = validStudentRows.filter((r) => r.status === "PRESENT").length;
  const late = validStudentRows.filter((r) => r.status === "LATE").length;
  const absent = validStudentRows.filter((r) => r.status === "ABSENT").length;
  const totalLateMinutes = validStudentRows.reduce((sum, r) => sum + (r.lateMinutes ?? 0), 0);
  const recorded = present + late + absent;

  return {
    sessionsHeld,
    present,
    late,
    absent,
    notRecorded: Math.max(0, sessionsHeld - recorded),
    totalLateMinutes,
    attendanceRate: sessionsHeld > 0 ? Math.round(((present + late) / sessionsHeld) * 100) : null,
    memorization: memoRows,
  };
}
