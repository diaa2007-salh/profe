import type { AttendanceStatus } from "@/lib/db/types";
import { collapseStudentDayStatuses } from "./attendance-aggregation";

export interface MonthlyAttendanceStudent {
  id: string;
  fullName: string;
}

export interface MonthlyAttendanceRecord {
  studentId: string;
  sessionDate: string;
  status: AttendanceStatus;
}

export interface MonthlyAttendanceRow extends MonthlyAttendanceStudent {
  days: (AttendanceStatus | null)[];
  present: number;
  absent: number;
  late: number;
}

export function aggregateMonthlyAttendance(
  students: MonthlyAttendanceStudent[],
  records: MonthlyAttendanceRecord[],
  year: number,
  month: number
): { daysInMonth: number; rows: MonthlyAttendanceRow[] } {
  const daysInMonth = new Date(year, month, 0).getDate();
  const monthPrefix = `${year}-${String(month).padStart(2, "0")}`;
  const validRecords = records.filter((record) => {
    const day = Number(record.sessionDate.slice(8, 10));
    return day >= 1 && day <= daysInMonth && record.sessionDate.slice(0, 7) === monthPrefix;
  });
  const statusByStudentDay = new Map<string, AttendanceStatus>();
  for (const [key, status] of collapseStudentDayStatuses(validRecords)) {
    const [, date] = key.split(":");
    const day = Number(date.slice(-2));
    statusByStudentDay.set(`${key.split(":")[0]}:${day}`, status);
  }

  return {
    daysInMonth,
    rows: students.map((student) => {
      const days = Array.from({ length: daysInMonth }, (_, index) => statusByStudentDay.get(`${student.id}:${index + 1}`) ?? null);
      return {
        ...student,
        days,
        present: days.filter((status) => status === "PRESENT").length,
        absent: days.filter((status) => status === "ABSENT").length,
        late: days.filter((status) => status === "LATE").length,
      };
    }),
  };
}
