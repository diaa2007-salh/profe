import "server-only";
import { db } from "@/lib/db/client";
import { getTodayISO } from "@/lib/business/date";
import { getSessionStateContext } from "@/lib/server/session-state.server";
import type { DailySessionState } from "@/lib/business/session-state";

export interface TodaySessionOverview {
  sessionTemplateId: string;
  name: string;
  startTime: string;
  endTime: string;
  state: DailySessionState;
  presentCount: number;
  lateCount: number;
  absentCount: number;
}

export async function getTodayOverview(): Promise<{ date: string; sessions: TodaySessionOverview[] }> {
  const date = getTodayISO();

  const sessionTemplates = await db
    .selectFrom("sessionTemplate")
    .select(["id"])
    .where("isActive", "=", true)
    .orderBy("sortOrder", "asc")
    .execute();

  const sessions: TodaySessionOverview[] = [];
  for (const tmpl of sessionTemplates) {
    const ctx = await getSessionStateContext(date, tmpl.id);
    if (!ctx) continue;

    let presentCount = 0,
      lateCount = 0,
      absentCount = 0;

    if (ctx.state === "TEACHER_PRESENT") {
      const records = await db
        .selectFrom("studentAttendance")
        .select(["status"])
        .where("sessionDate", "=", date)
        .where("sessionTemplateId", "=", tmpl.id)
        .execute();
      presentCount = records.filter((r) => r.status === "PRESENT").length;
      lateCount = records.filter((r) => r.status === "LATE").length;
      absentCount = records.filter((r) => r.status === "ABSENT").length;
    }

    sessions.push({
      sessionTemplateId: ctx.sessionTemplate.id,
      name: ctx.sessionTemplate.name,
      startTime: ctx.sessionTemplate.startTime,
      endTime: ctx.sessionTemplate.endTime,
      state: ctx.state,
      presentCount,
      lateCount,
      absentCount,
    });
  }

  return { date, sessions };
}
