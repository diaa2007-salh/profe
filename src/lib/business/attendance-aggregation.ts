import type { AttendanceStatus } from "@/lib/db/types";

export interface DatedAttendance {
  studentId: string;
  sessionDate: string;
  status: AttendanceStatus;
}

const STATUS_PRIORITY: Record<AttendanceStatus, number> = {
  PRESENT: 1,
  LATE: 2,
  ABSENT: 3,
};

export function collapseStudentDayStatuses(records: DatedAttendance[]): Map<string, AttendanceStatus> {
  const statuses = new Map<string, AttendanceStatus>();
  for (const record of records) {
    const key = `${record.studentId}:${record.sessionDate}`;
    const previous = statuses.get(key);
    if (!previous || STATUS_PRIORITY[record.status] > STATUS_PRIORITY[previous]) {
      statuses.set(key, record.status);
    }
  }
  return statuses;
}
