import "server-only";
import { db } from "@/lib/db/client";
import { computeDailySessionState, type DailySessionState, type CancellationRange } from "@/lib/business/session-state";
import type { AttendancePeriod } from "@/lib/db/types";

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
  sessionTemplateId: string,
  teacherProfileId?: string,
  period: AttendancePeriod = 1
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
    (() => {
      let query = db
        .selectFrom("teacherAttendance")
        .select(["status"])
        .where("sessionDate", "=", date)
        .where("sessionTemplateId", "=", sessionTemplateId)
        .where("period", "=", period);
      if (teacherProfileId) query = query.where("teacherProfileId", "=", teacherProfileId);
      return query.executeTakeFirst();
    })(),
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
