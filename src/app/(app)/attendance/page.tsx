import { db } from "@/lib/db/client";
import { getTodayISO } from "@/lib/business/date";
import { getSessionStateContext } from "@/lib/server/session-state.server";
import { z } from "zod";
import { AttendanceClient } from "./AttendanceClient";
import { getAccessContext, isAdmin } from "@/lib/server/access";

export const dynamic = "force-dynamic";

export default async function AttendancePage({
  searchParams,
}: {
  searchParams: Promise<{ session?: string; date?: string }>;
}) {
  const params = await searchParams;
  const access = await getAccessContext();
  const explicitDate = z.string().date().safeParse(params.date);
  const date = explicitDate.success ? explicitDate.data : getTodayISO();

  const sessionTemplates = await db
    .selectFrom("sessionTemplate")
    .selectAll()
    .where("isActive", "=", true)
    .orderBy("sortOrder", "asc")
    .execute();

  const activeSessionId = params.session ?? sessionTemplates[0]?.id;

  if (!activeSessionId) {
    return <p className="text-sm text-muted-foreground">لا توجد حصص مُعرَّفة بعد. أضفها من الإعدادات.</p>;
  }

  const ctx = await getSessionStateContext(date, activeSessionId, access.teacherProfileId ?? undefined);

  let studentsQuery = db.selectFrom("student").selectAll().where("isActive", "=", true);
  let recordsQuery = db
    .selectFrom("studentAttendance")
    .selectAll()
    .where("sessionDate", "=", date)
    .where("sessionTemplateId", "=", activeSessionId);
  if (!isAdmin(access)) {
    studentsQuery = studentsQuery.where("halaqaId", "in", access.halaqaIds);
    recordsQuery = recordsQuery.where("studentId", "in", db.selectFrom("student").select("id").where("halaqaId", "in", access.halaqaIds));
  }

  const [students, existingRecords, teacherRecord] = await Promise.all([
    studentsQuery.orderBy("fullName", "asc").execute(),
    recordsQuery.execute(),
    (() => {
      let teacherQuery = db
        .selectFrom("teacherAttendance")
        .selectAll()
        .where("sessionDate", "=", date)
        .where("sessionTemplateId", "=", activeSessionId);
      if (access.role !== "ADMIN" && access.teacherProfileId) {
        teacherQuery = teacherQuery.where("teacherProfileId", "=", access.teacherProfileId);
      }
      return teacherQuery.executeTakeFirst();
    })(),
  ]);

  return (
    <AttendanceClient
      key={`${date}:${activeSessionId}`}
      date={date}
      hasExplicitDate={explicitDate.success}
      sessionTemplates={sessionTemplates.map((s) => ({ id: s.id, name: s.name, startTime: s.startTime.toString().slice(0, 5), endTime: s.endTime.toString().slice(0, 5) }))}
      activeSessionId={activeSessionId}
      state={ctx?.state ?? "NOT_SCHOOL_DAY"}
      teacherStatus={teacherRecord?.status ?? null}
      students={students}
      existingRecords={existingRecords}
    />
  );
}
