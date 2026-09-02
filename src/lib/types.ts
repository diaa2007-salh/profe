export type SessionSlot = "morning" | "evening";
export type AttendanceStatus = "present" | "late" | "absent";
export type MemorizationQuality = "excellent" | "very_good" | "good" | "weak";
export type NavKey =
  | "home"
  | "students"
  | "attendance"
  | "memorization"
  | "monthly"
  | "statistics"
  | "settings";

export interface Student {
  id: string;
  fullName: string;
  guardianName: string;
  guardianPhone: string;
  joinDate: string;
  currentJuz: number;
  notes?: string;
}

export interface StudentAttendanceRecord {
  studentId: string;
  status: AttendanceStatus;
  delayMinutes?: number;
}

export interface DailySession {
  id: string;
  date: string;
  slot: SessionSlot;
  cancelled: boolean;
  cancelReason?: string;
  teacherStatus: AttendanceStatus | "not_recorded";
  teacherDelayMinutes?: number;
  records: StudentAttendanceRecord[];
}

export interface WeeklyMemorizationEntry {
  id: string;
  studentId: string;
  weekStart: string;
  surahFrom: string;
  ayahFrom: number;
  surahTo: string;
  ayahTo: number;
  quality: MemorizationQuality;
  notes?: string;
}

export interface MonthlySummary {
  studentId: string;
  monthLabel: string;
  sessionsHeld: number;
  present: number;
  late: number;
  absent: number;
  attendanceRate: number;
  pagesMemorized: number;
  teacherNote?: string;
}
