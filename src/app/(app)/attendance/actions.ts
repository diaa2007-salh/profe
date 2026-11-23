"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { getSessionStateContext } from "@/lib/server/session-state.server";
import { getNowTimeHHMM } from "@/lib/business/date";
import { canRecordStudentAttendance } from "@/lib/business/session-state";
import { bulkAttendanceSchema, teacherAttendanceSchema, studentAttendanceSchema } from "@/lib/validation";

export type ActionResult =
  | { ok: true; preparedCount?: number; activeCount?: number; arrivalTime?: string }
  | { ok: false; error: string };

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session;
}

async function isAttendanceOwner(): Promise<boolean> {
  const session = await requireSession();
  const userId = session.user?.id;
  if (!userId) return false;
  const profile = await db
    .selectFrom("teacherProfile")
    .select("id")
    .where("userId", "=", userId)
    .executeTakeFirst();
  return Boolean(profile);
}

export async function recordTeacherAttendance(formData: FormData): Promise<ActionResult> {
  if (!(await isAttendanceOwner())) return { ok: false, error: "غير مصرح بتسجيل الحضور" };

  const parsed = teacherAttendanceSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  const { sessionDate, sessionTemplateId, status } = parsed.data;

  // RULE 2/3/4: cancelled/holiday/out-of-year sessions can't have any
  // attendance recorded at all, teacher included. Re-derive from the DB —
  // never trust that the UI only offered this action when it was legal.
  const ctx = await getSessionStateContext(sessionDate, sessionTemplateId);
  if (!ctx) return { ok: false, error: "الحصة غير موجودة" };
  if (!["SCHEDULED", "TEACHER_PRESENT", "TEACHER_ABSENT"].includes(ctx.state)) {
    return { ok: false, error: "لا يمكن تسجيل الحضور — الحصة ملغاة أو في عطلة أو خارج السنة الدراسية" };
  }

  try {
    // Real UPDATE-not-INSERT on edit (spec rule 9), backed by the DB's own
    // unique(session_date, session_template_id) constraint (spec rule 8).
    await db
      .insertInto("teacherAttendance")
      .values({ sessionDate, sessionTemplateId, status })
      .onConflict((oc) =>
        oc.columns(["sessionDate", "sessionTemplateId"]).doUpdateSet({ status, updatedAt: new Date() })
      )
      .execute();

    // RULE: if the teacher is switched to ABSENT after students were
    // already marked, those records no longer represent a valid session
    // (RULE 11: teacher absence never implies student absence either —
    // the correct move is to remove the now-invalid records, not silently
    // reinterpret them).
    if (status === "ABSENT") {
      await db
        .deleteFrom("studentAttendance")
        .where("sessionDate", "=", sessionDate)
        .where("sessionTemplateId", "=", sessionTemplateId)
        .execute();
    }
  } catch (err) {
    console.error("[attendance] teacher upsert failed", err);
    return { ok: false, error: "تعذّر حفظ حضور المعلم" };
  }

  revalidatePath("/attendance");
  revalidatePath("/");
  return { ok: true };
}

export async function recordStudentAttendance(formData: FormData): Promise<ActionResult> {
  if (!(await isAttendanceOwner())) return { ok: false, error: "غير مصرح بتسجيل الحضور" };

  const raw = Object.fromEntries(formData);
  const parsed = studentAttendanceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const { studentId, sessionDate, sessionTemplateId, status } = parsed.data;

  const student = await db
    .selectFrom("student")
    .select("id")
    .where("id", "=", studentId)
    .where("isActive", "=", true)
    .executeTakeFirst();
  if (!student) return { ok: false, error: "التلميذ غير موجود أو غير نشط" };

  // RULE 1/7: server-side re-derivation, not a trusted client flag. This is
  // the exact check the spec says to also verify by attempting a direct
  // mutation while the teacher is ABSENT — see the integration test.
  const ctx = await getSessionStateContext(sessionDate, sessionTemplateId);
  if (!ctx || !canRecordStudentAttendance(ctx.state)) {
    return { ok: false, error: "لا يمكن تسجيل حضور الطلاب لهذه الحصة (المعلم غائب أو الحصة غير فعالة)" };
  }

  const arrivalTime = status === "LATE" ? getNowTimeHHMM() : null;

  try {
    await db
      .insertInto("studentAttendance")
      .values({
        studentId,
        sessionDate,
        sessionTemplateId,
        status,
        arrivalTime,
        lateMinutes: null,
      })
      .onConflict((oc) =>
        oc.columns(["studentId", "sessionDate", "sessionTemplateId"]).doUpdateSet({
          status,
          arrivalTime,
          lateMinutes: null,
          updatedAt: new Date(),
        })
      )
      .execute();
  } catch (err) {
    console.error("[attendance] student upsert failed", err);
    return { ok: false, error: "تعذّر حفظ حضور الطالب" };
  }

  revalidatePath("/attendance");
  revalidatePath("/");
  return status === "LATE" && arrivalTime
    ? { ok: true, arrivalTime }
    : { ok: true };
}

export async function markAllPresent(sessionDate: string, sessionTemplateId: string): Promise<ActionResult> {
  if (!(await isAttendanceOwner())) return { ok: false, error: "غير مصرح بتسجيل الحضور" };

  const parsed = bulkAttendanceSchema.safeParse({ sessionDate, sessionTemplateId });
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  const { sessionDate: validDate, sessionTemplateId: validSessionId } = parsed.data;
  const ctx = await getSessionStateContext(validDate, validSessionId);
  if (!ctx || !["SCHEDULED", "TEACHER_PRESENT", "TEACHER_ABSENT"].includes(ctx.state)) {
    return { ok: false, error: "لا يمكن تسجيل حضور الطلاب لهذه الحصة" };
  }

  try {
    const result = await db.transaction().execute(async (trx) => {
      await trx
        .insertInto("teacherAttendance")
        .values({ sessionDate: validDate, sessionTemplateId: validSessionId, status: "PRESENT" })
        .onConflict((oc) =>
          oc.columns(["sessionDate", "sessionTemplateId"]).doUpdateSet({ status: "PRESENT", updatedAt: new Date() })
        )
        .execute();

      const activeStudents = await trx
        .selectFrom("student")
        .select("id")
        .where("isActive", "=", true)
        .execute();

      if (activeStudents.length === 0) return { preparedCount: 0, activeCount: 0 };

      const inserted = await trx
        .insertInto("studentAttendance")
        .values(
          activeStudents.map(({ id: studentId }) => ({
            studentId,
            sessionDate: validDate,
            sessionTemplateId: validSessionId,
            status: "PRESENT" as const,
            arrivalTime: null,
            lateMinutes: null,
          }))
        )
        .onConflict((oc) => oc.columns(["studentId", "sessionDate", "sessionTemplateId"]).doNothing())
        .returning("studentId")
        .execute();

      return { preparedCount: inserted.length, activeCount: activeStudents.length };
    });

    revalidatePath("/attendance");
    revalidatePath("/");
    return { ok: true, ...result };
  } catch (err) {
    console.error("[attendance] mark-all-present failed", err);
    return { ok: false, error: "تعذّر تحديث الحضور" };
  }
}
