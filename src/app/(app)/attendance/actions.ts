"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { getSessionStateContext } from "@/lib/server/session-state.server";
import { calculateLateMinutes } from "@/lib/business/attendance";
import { canRecordStudentAttendance } from "@/lib/business/session-state";
import { teacherAttendanceSchema, studentAttendanceSchema } from "@/lib/validation";

export type ActionResult = { ok: true; lateMinutes?: number } | { ok: false; error: string };

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session;
}

export async function recordTeacherAttendance(formData: FormData): Promise<ActionResult> {
  await requireSession();

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
  await requireSession();

  const raw = Object.fromEntries(formData);
  const parsed = studentAttendanceSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const { studentId, sessionDate, sessionTemplateId, status, arrivalTime } = parsed.data;

  // RULE 1/7: server-side re-derivation, not a trusted client flag. This is
  // the exact check the spec says to also verify by attempting a direct
  // mutation while the teacher is ABSENT — see the integration test.
  const ctx = await getSessionStateContext(sessionDate, sessionTemplateId);
  if (!ctx || !canRecordStudentAttendance(ctx.state)) {
    return { ok: false, error: "لا يمكن تسجيل حضور الطلاب لهذه الحصة (المعلم غائب أو الحصة غير فعالة)" };
  }

  let lateMinutes: number | null = null;
  if (status === "LATE") {
    if (!arrivalTime) return { ok: false, error: "وقت الوصول مطلوب" };
    // RULE 6: computed server-side from the real session template times,
    // never from a client-supplied number.
    const calc = calculateLateMinutes(ctx.sessionTemplate.startTime, ctx.sessionTemplate.endTime, arrivalTime);
    if (!calc.ok) return { ok: false, error: calc.error ?? "وقت غير صالح" };
    lateMinutes = calc.lateMinutes ?? null;
  }

  try {
    await db
      .insertInto("studentAttendance")
      .values({
        studentId,
        sessionDate,
        sessionTemplateId,
        status,
        arrivalTime: status === "LATE" ? arrivalTime : null,
        lateMinutes: status === "LATE" ? lateMinutes : null,
      })
      .onConflict((oc) =>
        oc.columns(["studentId", "sessionDate", "sessionTemplateId"]).doUpdateSet({
          status,
          arrivalTime: status === "LATE" ? arrivalTime : null,
          lateMinutes: status === "LATE" ? lateMinutes : null,
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
  return { ok: true, lateMinutes: lateMinutes ?? undefined };
}

export async function markAllPresent(sessionDate: string, sessionTemplateId: string, studentIds: string[]): Promise<ActionResult> {
  await requireSession();

  const ctx = await getSessionStateContext(sessionDate, sessionTemplateId);
  if (!ctx || !canRecordStudentAttendance(ctx.state)) {
    return { ok: false, error: "لا يمكن تسجيل حضور الطلاب لهذه الحصة" };
  }
  if (studentIds.length === 0) return { ok: true };

  try {
    await db
      .insertInto("studentAttendance")
      .values(
        studentIds.map((studentId) => ({
          studentId,
          sessionDate,
          sessionTemplateId,
          status: "PRESENT" as const,
          arrivalTime: null,
          lateMinutes: null,
        }))
      )
      .onConflict((oc) =>
        oc
          .columns(["studentId", "sessionDate", "sessionTemplateId"])
          .doUpdateSet({ status: "PRESENT", arrivalTime: null, lateMinutes: null, updatedAt: new Date() })
      )
      .execute();
  } catch (err) {
    console.error("[attendance] mark-all-present failed", err);
    return { ok: false, error: "تعذّر تحديث الحضور" };
  }

  revalidatePath("/attendance");
  revalidatePath("/");
  return { ok: true };
}
