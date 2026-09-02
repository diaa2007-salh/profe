"use server";

import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { BACKUP_VERSION, backupSchema } from "@/lib/backup/schema";
import type { Json } from "@/lib/db/types";

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session;
}

export async function exportBackup(): Promise<string> {
  await requireSession();

  const [
    teacherProfile,
    appSettings,
    students,
    academicYears,
    holidays,
    sessionTemplates,
    sessionCancellations,
    teacherAttendance,
    studentAttendance,
    weeklyMemorization,
    monthlyEvaluations,
    mushafEditions,
    mushafPages,
    mushafThumns,
  ] = await Promise.all([
    db.selectFrom("teacherProfile").selectAll().executeTakeFirst(),
    db.selectFrom("appSettings").selectAll().executeTakeFirst(),
    db.selectFrom("student").selectAll().execute(),
    db.selectFrom("academicYear").selectAll().execute(),
    db.selectFrom("holiday").selectAll().execute(),
    db.selectFrom("sessionTemplate").selectAll().execute(),
    db.selectFrom("sessionCancellation").selectAll().execute(),
    db.selectFrom("teacherAttendance").selectAll().execute(),
    db.selectFrom("studentAttendance").selectAll().execute(),
    db.selectFrom("weeklyMemorization").selectAll().execute(),
    db.selectFrom("monthlyEvaluation").selectAll().execute(),
    db.selectFrom("mushafEdition").selectAll().execute(),
    // These two were missing from the original export -- deleting a
    // mushaf_edition cascades and deletes its pages/thumns, so a backup
    // that excludes them was lossy on restore. Fixed here.
    db.selectFrom("mushafPage").selectAll().execute(),
    db.selectFrom("mushafThumn").selectAll().execute(),
  ]);

  const backup = {
    backupVersion: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    data: {
      teacherProfile: teacherProfile ?? null,
      appSettings: appSettings ?? null,
      students,
      academicYears,
      holidays,
      sessionTemplates,
      sessionCancellations,
      teacherAttendance,
      studentAttendance,
      weeklyMemorization,
      monthlyEvaluations,
      mushafEditions,
      mushafPages,
      mushafThumns,
    },
  };

  // Never touches app_user -- no email, no passwordHash, ever leaves this
  // function. See backupSchema's module comment for why that boundary is
  // deliberate.
  return JSON.stringify(backup, null, 2);
}

export type RestoreResult = { ok: true; counts: Record<string, number> } | { ok: false; error: string };

export async function restoreBackup(jsonText: string): Promise<RestoreResult> {
  const session = await requireSession();

  let parsedJson: unknown;
  try {
    parsedJson = JSON.parse(jsonText);
  } catch {
    return { ok: false, error: "الملف ليس بصيغة JSON صالحة" };
  }

  // Version is checked BEFORE full schema validation so the error message
  // can be specific ("wrong version") rather than a generic "invalid
  // format" when the real problem is simply an old backup file.
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
  const currentUserId = session.user!.id!;

  try {
    await db.transaction().execute(async (trx) => {
      // Children first. mushaf_page/mushaf_thumn cascade automatically
      // when mushaf_edition is deleted, but deleting them explicitly first
      // keeps the order self-documenting and doesn't rely on the cascade
      // firing correctly.
      await trx.deleteFrom("studentAttendance").execute();
      await trx.deleteFrom("teacherAttendance").execute();
      await trx.deleteFrom("weeklyMemorization").execute();
      await trx.deleteFrom("monthlyEvaluation").execute();
      await trx.deleteFrom("sessionCancellation").execute();
      await trx.deleteFrom("holiday").execute();
      await trx.deleteFrom("mushafPage").execute();
      await trx.deleteFrom("mushafThumn").execute();
      await trx.deleteFrom("mushafEdition").execute();
      await trx.deleteFrom("sessionTemplate").execute();
      await trx.deleteFrom("academicYear").execute();
      await trx.deleteFrom("student").execute();
      // teacherProfile IS deleted here (unlike the comment used to say) --
      // it's a true singleton for this single-teacher app, so delete-then-
      // insert is simpler and correct, matching every other table. An
      // ON CONFLICT(user_id) upsert was tried first and was a real bug:
      // the backup's row keeps its original id, which collides with the
      // still-existing row's PRIMARY KEY before the user_id conflict
      // target is ever reached, raising a raw Postgres error instead of
      // upserting. appSettings has only one unique column (id) so its
      // ON CONFLICT below is not subject to the same issue.
      await trx.deleteFrom("teacherProfile").execute();

      // Parents first on the way back in.
      if (data.students.length) await trx.insertInto("student").values(data.students).execute();
      if (data.academicYears.length) await trx.insertInto("academicYear").values(data.academicYears).execute();
      if (data.sessionTemplates.length) await trx.insertInto("sessionTemplate").values(data.sessionTemplates).execute();
      if (data.mushafEditions.length) await trx.insertInto("mushafEdition").values(data.mushafEditions).execute();
      if (data.mushafPages.length) await trx.insertInto("mushafPage").values(data.mushafPages).execute();
      if (data.mushafThumns.length) await trx.insertInto("mushafThumn").values(data.mushafThumns).execute();
      if (data.holidays.length) await trx.insertInto("holiday").values(data.holidays).execute();
      if (data.sessionCancellations.length) await trx.insertInto("sessionCancellation").values(data.sessionCancellations).execute();
      if (data.teacherAttendance.length) await trx.insertInto("teacherAttendance").values(data.teacherAttendance).execute();
      if (data.studentAttendance.length) await trx.insertInto("studentAttendance").values(data.studentAttendance).execute();
      if (data.weeklyMemorization.length) await trx.insertInto("weeklyMemorization").values(data.weeklyMemorization).execute();
      if (data.monthlyEvaluations.length) await trx.insertInto("monthlyEvaluation").values(data.monthlyEvaluations).execute();

      // userId is remapped to the CURRENT session's user, not the backed-
      // up value -- see the module-level reasoning above the transaction:
      // this is what makes a true disaster-recovery restore (fresh
      // database, setup wizard just created a brand-new user with a
      // brand-new UUID) work, not just a same-account restore.
      if (data.teacherProfile) {
        await trx
          .insertInto("teacherProfile")
          .values({ ...data.teacherProfile, userId: currentUserId })
          .execute();
      }

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
      teacherProfile: data.teacherProfile ? 1 : 0,
      appSettings: data.appSettings ? 1 : 0,
      students: data.students.length,
      academicYears: data.academicYears.length,
      holidays: data.holidays.length,
      sessionTemplates: data.sessionTemplates.length,
      sessionCancellations: data.sessionCancellations.length,
      teacherAttendance: data.teacherAttendance.length,
      studentAttendance: data.studentAttendance.length,
      weeklyMemorization: data.weeklyMemorization.length,
      monthlyEvaluations: data.monthlyEvaluations.length,
      mushafEditions: data.mushafEditions.length,
      mushafPages: data.mushafPages.length,
      mushafThumns: data.mushafThumns.length,
    },
  };
}
