import "server-only";
import { db } from "@/lib/db/client";
import { getTodayISO } from "@/lib/business/date";
import { collapseStudentDayStatuses } from "@/lib/business/attendance-aggregation";
import type { AccessContext } from "./access";

export interface DisciplineDashboard {
  date: string;
  present: number;
  absent: number;
  late: number;
  attendanceRate: number | null;
  topAbsentees: { studentId: string; fullName: string; absences: number }[];
  sessions: { id: string; name: string }[];
}

export async function getDisciplineDashboard(access: AccessContext): Promise<DisciplineDashboard> {
  const date = getTodayISO();
  const [year, month] = date.split("-").map(Number);
  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const daysInMonth = new Date(year, month, 0).getDate();
  const end = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;

  let studentsQuery = db.selectFrom("student").select(["id", "fullName"]).where("isActive", "=", true);
  if (access.role !== "ADMIN") {
    studentsQuery = access.halaqaIds.length
      ? studentsQuery.where("halaqaId", "in", access.halaqaIds)
      : studentsQuery.where("id", "in", []);
  }
  const [students, sessions] = await Promise.all([
    studentsQuery.orderBy("fullName", "asc").execute(),
    db.selectFrom("sessionTemplate").select(["id", "name"]).where("isActive", "=", true).orderBy("sortOrder", "asc").execute(),
  ]);
  const studentIds = students.map(({ id }) => id);
  if (studentIds.length === 0) {
    return { date, present: 0, absent: 0, late: 0, attendanceRate: null, topAbsentees: [], sessions };
  }

  const [todayRows, absenceRows] = await Promise.all([
    db
      .selectFrom("studentAttendance")
      .select(["studentId", "sessionDate", "status"])
      .where("sessionDate", "=", date)
      .where("studentId", "in", studentIds)
      .execute(),
    db
      .selectFrom("studentAttendance")
      .select(["studentId", "sessionDate"])
      .distinct()
      .where("status", "=", "ABSENT")
      .where("sessionDate", ">=", start)
      .where("sessionDate", "<=", end)
      .where("studentId", "in", studentIds)
      .execute(),
  ]);

  const dailyStatuses = collapseStudentDayStatuses(todayRows);
  let present = 0;
  let absent = 0;
  let late = 0;
  for (const status of dailyStatuses.values()) {
    if (status === "PRESENT") present++;
    if (status === "ABSENT") absent++;
    if (status === "LATE") late++;
  }
  const recordedCount = present + absent + late;
  const studentNames = new Map(students.map((student) => [student.id, student.fullName]));
  const absenceCounts = new Map<string, number>();
  for (const record of absenceRows) absenceCounts.set(record.studentId, (absenceCounts.get(record.studentId) ?? 0) + 1);
  const topAbsentees = [...absenceCounts]
    .map(([studentId, absences]) => ({ studentId, fullName: studentNames.get(studentId) ?? "", absences }))
    .sort((a, b) => b.absences - a.absences || a.fullName.localeCompare(b.fullName, "ar"))
    .slice(0, 5);

  return {
    date,
    present,
    absent,
    late,
    attendanceRate: recordedCount > 0 ? Math.round(((present + late) / students.length) * 100) : null,
    topAbsentees,
    sessions,
  };
}
