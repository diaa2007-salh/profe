export type DailySessionState =
  | "NOT_SCHOOL_DAY"
  | "HOLIDAY"
  | "CANCELLED"
  | "SCHEDULED"
  | "TEACHER_ABSENT"
  | "TEACHER_PRESENT";

export interface DateRange {
  startDate: string; // ISO date "YYYY-MM-DD"
  endDate: string;
}

export interface CancellationRange extends DateRange {
  sessionTemplateId: string | null; // null = applies to every session
}

export interface ComputeSessionStateInput {
  date: string; // ISO date
  sessionTemplateId: string;
  academicYear: DateRange | null;
  holidays: DateRange[];
  cancellations: CancellationRange[];
  teacherStatus: "PRESENT" | "ABSENT" | null; // null = not recorded yet
}

function withinRange(date: string, range: DateRange): boolean {
  return date >= range.startDate && date <= range.endDate;
}

/**
 * RULE 3 (holiday != cancelled), RULE 2 (cancelled != teacher absent) — this
 * function keeps those three concepts as distinct, mutually exclusive
 * outcomes rather than collapsing them, because callers (attendance
 * recording, monthly aggregation) need to tell them apart: a holiday and a
 * cancellation both block attendance recording, but only a cancellation
 * should ever ask "which session, which reason", and neither should ever be
 * confused with the teacher actually being absent on a real school day.
 */
export function computeDailySessionState(input: ComputeSessionStateInput): DailySessionState {
  const { date, sessionTemplateId, academicYear, holidays, cancellations, teacherStatus } = input;

  if (!academicYear || !withinRange(date, academicYear)) {
    return "NOT_SCHOOL_DAY";
  }

  if (holidays.some((h) => withinRange(date, h))) {
    return "HOLIDAY";
  }

  const isCancelled = cancellations.some(
    (c) => (c.sessionTemplateId === null || c.sessionTemplateId === sessionTemplateId) && withinRange(date, c)
  );
  if (isCancelled) {
    return "CANCELLED";
  }

  if (teacherStatus === "ABSENT") return "TEACHER_ABSENT";
  if (teacherStatus === "PRESENT") return "TEACHER_PRESENT";
  return "SCHEDULED";
}

/** RULE 7: student attendance can only be recorded when the teacher is PRESENT. */
export function canRecordStudentAttendance(state: DailySessionState): boolean {
  return state === "TEACHER_PRESENT";
}

/**
 * RULE 5: cancelled sessions don't enter the attendance denominator.
 * A teacher-absent session is, in effect, a session that didn't happen
 * either — no student could have attended — so it's excluded the same way
 * holidays and cancellations are. Only a session where the teacher actually
 * showed up is a "valid session" for attendance-rate purposes.
 */
export function countsTowardAttendanceDenominator(state: DailySessionState): boolean {
  return state === "TEACHER_PRESENT";
}
