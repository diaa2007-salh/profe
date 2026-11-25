"use server";

import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { BACKUP_VERSION, backupSchema } from "@/lib/backup/schema";
import type { Json } from "@/lib/db/types";
import { getAccessContext, isAdmin } from "@/lib/server/access";

async function requireAdmin() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  if (!isAdmin(await getAccessContext())) throw new Error("FORBIDDEN");
}

export async function exportBackup(): Promise<string> {
  await requireAdmin();

  const [
    appSettings,
    halaqas,
    students,
    academicYears,
    holidays,
    sessionTemplates,
    sessionCancellations,
    teacherAttendance,
    studentAttendance,
  ] = await Promise.all([
    db.selectFrom("appSettings").selectAll().executeTakeFirst(),
    db.selectFrom("halaqa").selectAll().execute(),
    db.selectFrom("student").selectAll().execute(),
    db.selectFrom("academicYear").selectAll().execute(),
    db.selectFrom("holiday").selectAll().execute(),
    db.selectFrom("sessionTemplate").selectAll().execute(),
    db.selectFrom("sessionCancellation").selectAll().execute(),
    db.selectFrom("teacherAttendance").selectAll().execute(),
    db.selectFrom("studentAttendance").selectAll().execute(),
  ]);

  return JSON.stringify(
    {
      backupVersion: BACKUP_VERSION,
      exportedAt: new Date().toISOString(),
      data: {
        appSettings: appSettings ?? null,
        halaqas,
        students,
        academicYears,
        holidays,
        sessionTemplates,
        sessionCancellations,
        teacherAttendance,
        studentAttendance,
      },
    },
    null,
    2
  );
}

export type RestoreResult = { ok: true; counts: Record<string, number> } | { ok: false; error: string };

export async function restoreBackup(jsonText: string): Promise<RestoreResult> {
  await requireAdmin();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "الملف ليس بصيغة JSON صالحة" };
  }

  const versionCheck = (parsedJson as { backupVersion?: unknown })?.backupVersion;
  if (versionCheck !== BACKUP_VERSION) {
    return {
      ok: false,
      error: `إصدار النسخة الاحتياطية غير مدعوم (${String(versionCheck ?? "غير معروف")}). الإصدار المطلوب: ${BACKUP_VERSION}`,
    };
  }

  const parsed = backupSchema.safeParse(parsedJson);
  if (!parsed.success) {
    return { ok: false, error: "صيغة النسخة الاحتياطية غير متوافقة مع البنية المتوقعة لهذا الإصدار" };
  }
  const { data } = parsed.data;

  try {
    await db.transaction().execute(async (trx) => {
      await trx.deleteFrom("studentAttendance").execute();
      await trx.deleteFrom("teacherAttendance").execute();
      await trx.deleteFrom("sessionCancellation").execute();
      await trx.deleteFrom("holiday").execute();
      await trx.deleteFrom("sessionTemplate").execute();
      await trx.deleteFrom("academicYear").execute();
      await trx.deleteFrom("student").execute();

      if (data.halaqas.length) {
        await trx
          .insertInto("halaqa")
          .values(data.halaqas)
          .onConflict((oc) => oc.column("id").doUpdateSet({ name: (eb) => eb.ref("excluded.name") }))
          .execute();
      }
      if (data.students.length) await trx.insertInto("student").values(data.students).execute();
      if (data.academicYears.length) await trx.insertInto("academicYear").values(data.academicYears).execute();
      if (data.sessionTemplates.length) await trx.insertInto("sessionTemplate").values(data.sessionTemplates).execute();
      if (data.holidays.length) await trx.insertInto("holiday").values(data.holidays).execute();
      if (data.sessionCancellations.length) await trx.insertInto("sessionCancellation").values(data.sessionCancellations).execute();
      if (data.teacherAttendance.length) await trx.insertInto("teacherAttendance").values(data.teacherAttendance).execute();
      if (data.studentAttendance.length) await trx.insertInto("studentAttendance").values(data.studentAttendance).execute();

      if (data.appSettings) {
        const settingsData = data.appSettings.data as Json;
        await trx
          .insertInto("appSettings")
          .values({ id: true, data: settingsData })
          .onConflict((oc) => oc.column("id").doUpdateSet({ data: settingsData, updatedAt: new Date() }))
          .execute();
      }
    });
  } catch (err) {
    console.error("[backup] restore failed, transaction rolled back", err);
    return { ok: false, error: "فشلت عملية الاستعادة — لم يتم تغيير أي بيانات (تراجع كامل)" };
  }

  return {
    ok: true,
    counts: {
      appSettings: data.appSettings ? 1 : 0,
      halaqas: data.halaqas.length,
      students: data.students.length,
      academicYears: data.academicYears.length,
      holidays: data.holidays.length,
      sessionTemplates: data.sessionTemplates.length,
      sessionCancellations: data.sessionCancellations.length,
      teacherAttendance: data.teacherAttendance.length,
      studentAttendance: data.studentAttendance.length,
    },
  };
}
