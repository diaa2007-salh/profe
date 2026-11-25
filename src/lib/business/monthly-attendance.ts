import type { AttendancePeriod, AttendanceStatus } from "@/lib/db/types";

export interface MonthlyAttendanceStudent {
  id: string;
  fullName: string;
}

export interface MonthlyAttendanceRecord {
  studentId: string;
  sessionDate: string;
  period: AttendancePeriod;
  status: AttendanceStatus;
}

export interface MonthlyAttendanceDay {
  period1: AttendanceStatus | null;
  period2: AttendanceStatus | null;
}

export interface MonthlyAttendanceRow extends MonthlyAttendanceStudent {
  days: MonthlyAttendanceDay[];
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
  const statusPriority: Record<AttendanceStatus, number> = { PRESENT: 1, LATE: 2, ABSENT: 3 };
  const statusByStudentDayPeriod = new Map<string, AttendanceStatus>();
  for (const record of validRecords) {
    const day = Number(record.sessionDate.slice(-2));
    const key = `${record.studentId}:${day}:${record.period}`;
    const current = statusByStudentDayPeriod.get(key);
    if (!current || statusPriority[record.status] > statusPriority[current]) {
      statusByStudentDayPeriod.set(key, record.status);
    }
  }

  return {
    daysInMonth,
    rows: students.map((student) => {
      const days = Array.from({ length: daysInMonth }, (_, index) => ({
        period1: statusByStudentDayPeriod.get(`${student.id}:${index + 1}:1`) ?? null,
        period2: statusByStudentDayPeriod.get(`${student.id}:${index + 1}:2`) ?? null,
      }));
      const statuses = days.flatMap(({ period1, period2 }) => [period1, period2]);
      return {
        ...student,
        days,
        present: statuses.filter((status) => status === "PRESENT").length,
        absent: statuses.filter((status) => status === "ABSENT").length,
        late: statuses.filter((status) => status === "LATE").length,
      };
    }),
  };
}
