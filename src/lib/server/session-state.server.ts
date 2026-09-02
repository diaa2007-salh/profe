import "server-only";
import { db } from "@/lib/db/client";
import { computeDailySessionState, type DailySessionState, type CancellationRange } from "@/lib/business/session-state";

export interface ValidSession {
  sessionDate: string;
  sessionTemplateId: string;
}

/**
 * Every (date, session) where the teacher was marked PRESENT, re-filtered
 * against the CURRENT holiday/cancellation configuration — not just "a
 * teacher_attendance PRESENT row exists". Without this re-check, adding a
 * holiday or cancellation *after* attendance was already recorded for a
 * date inside it would leave the old row silently still counting toward
 * sessionsHeld in monthly/statistics aggregation, even though that date is
 * now, by the calendar's current configuration, not a valid session.
 * Historical rows are never deleted for this (spec: keep accurate
 * historical records) — they're just excluded from live aggregation.
 */
export async function getValidSessionsInRange(startDate: string, endDate: string): Promise<ValidSession[]> {
  const [presentRows, holidays, cancellations] = await Promise.all([
    db
      .selectFrom("teacherAttendance")
      .select(["sessionDate", "sessionTemplateId"])
      .where("status", "=", "PRESENT")
      .where("sessionDate", ">=", startDate)
      .where("sessionDate", "<=", endDate)
      .execute(),
    db
      .selectFrom("holiday")
      .select(["startDate", "endDate"])
      .where("startDate", "<=", endDate)
      .where("endDate", ">=", startDate)
      .execute(),
    db
      .selectFrom("sessionCancellation")
      .select(["sessionTemplateId", "startDate", "endDate"])
      .where("startDate", "<=", endDate)
      .where("endDate", ">=", startDate)
      .execute(),
  ]);

  const isHoliday = (date: string) => holidays.some((h) => date >= h.startDate && date <= h.endDate);
  const isCancelled = (date: string, sessionTemplateId: string) =>
    cancellations.some(
      (c) => (c.sessionTemplateId === null || c.sessionTemplateId === sessionTemplateId) && date >= c.startDate && date <= c.endDate
    );

  return presentRows.filter((r) => !isHoliday(r.sessionDate) && !isCancelled(r.sessionDate, r.sessionTemplateId));
}

export interface SessionStateContext {
  state: DailySessionState;
  sessionTemplate: { id: string; name: string; startTime: string; endTime: string };
}

/**
 * Recomputes session state straight from the database for one date+session.
 * This is called from server actions on every mutation attempt — never
 * trust a client-supplied state, only ever this fresh read (spec RULE 7,
 * section 16: "لا تعتمد فقط على تعطيل زر في UI").
 */
export async function getSessionStateContext(
  date: string,
  sessionTemplateId: string
): Promise<SessionStateContext | null> {
  const sessionTemplate = await db
    .selectFrom("sessionTemplate")
    .select(["id", "name", "startTime", "endTime"])
    .where("id", "=", sessionTemplateId)
    .executeTakeFirst();
  if (!sessionTemplate) return null;

  const [academicYear, holidays, cancellations, teacherRow] = await Promise.all([
    db.selectFrom("academicYear").select(["startDate", "endDate"]).where("isActive", "=", true).executeTakeFirst(),
    db.selectFrom("holiday").select(["startDate", "endDate"]).execute(),
    db.selectFrom("sessionCancellation").select(["sessionTemplateId", "startDate", "endDate"]).execute(),
    db
      .selectFrom("teacherAttendance")
      .select(["status"])
      .where("sessionDate", "=", date)
      .where("sessionTemplateId", "=", sessionTemplateId)
      .executeTakeFirst(),
  ]);

  const state = computeDailySessionState({
    date,
    sessionTemplateId,
    academicYear: academicYear ? { startDate: academicYear.startDate, endDate: academicYear.endDate } : null,
    holidays: holidays.map((h) => ({ startDate: h.startDate, endDate: h.endDate })),
    cancellations: cancellations.map(
      (c): CancellationRange => ({
        sessionTemplateId: c.sessionTemplateId,
        startDate: c.startDate,
        endDate: c.endDate,
      })
    ),
    teacherStatus: teacherRow?.status ?? null,
  });

  return {
    state,
    sessionTemplate: {
      id: sessionTemplate.id,
      name: sessionTemplate.name,
      startTime: sessionTemplate.startTime.toString().slice(0, 5),
      endTime: sessionTemplate.endTime.toString().slice(0, 5),
    },
  };
}
