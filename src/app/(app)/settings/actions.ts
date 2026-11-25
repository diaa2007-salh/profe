"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { holidaySchema, cancellationSchema } from "@/lib/validation";
import { getAccessContext, isAdmin } from "@/lib/server/access";
import { hashPassword } from "@/lib/auth/password";
import { z } from "zod";

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session;
}

async function requireAdmin() {
  const session = await requireSession();
  if (!isAdmin(await getAccessContext())) throw new Error("FORBIDDEN");
  return session;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

function revalidateEverything() {
  // Session-time/calendar edits affect the dashboard and attendance's live
  // computation (spec: a time change must show up everywhere immediately) —
  // there is no cache to invalidate for the DB reads themselves (force-
  // dynamic everywhere already), but Next's router cache for these routes
  // still needs a nudge.
  revalidatePath("/");
  revalidatePath("/attendance");
  revalidatePath("/settings");
}

// ---------- Teacher profile ----------

const teacherProfileSchema = z.object({
  fullName: z.string().trim().min(2),
  phone: z.string().trim().optional().or(z.literal("")),
});

export async function updateTeacherProfile(formData: FormData): Promise<ActionResult> {
  const session = await requireSession();
  const access = await getAccessContext();
  if (!access.teacherProfileId) return { ok: false, error: "ملف الأستاذ غير موجود" };
  const parsed = teacherProfileSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  const d = parsed.data;

  await db
    .updateTable("teacherProfile")
    .set({ fullName: d.fullName, phone: d.phone || null, updatedAt: new Date() })
    .where("userId", "=", session.user!.id!)
    .execute();

  revalidateEverything();
  return { ok: true };
}

// ---------- Academic year ----------

const academicYearSchema = z.object({
  id: z.string().uuid().optional(),
  label: z.string().trim().min(1),
  startDate: z.string().date(),
  endDate: z.string().date(),
});

export async function upsertAcademicYear(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = academicYearSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  const d = parsed.data;
  if (d.endDate <= d.startDate) return { ok: false, error: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية" };

  try {
    if (d.id) {
      await db.updateTable("academicYear").set({ label: d.label, startDate: d.startDate, endDate: d.endDate }).where("id", "=", d.id).execute();
    } else {
      await db.insertInto("academicYear").values({ label: d.label, startDate: d.startDate, endDate: d.endDate, isActive: false }).execute();
    }
  } catch (err) {
    console.error("[settings] academic year upsert failed", err);
    return { ok: false, error: "تعذّر الحفظ" };
  }
  revalidateEverything();
  return { ok: true };
}

export async function setActiveAcademicYear(id: string): Promise<ActionResult> {
  await requireAdmin();

  const target = await db.selectFrom("academicYear").select("id").where("id", "=", id).executeTakeFirst();
  if (!target) {
    // Found during a hardening review: without this check, an
    // id that doesn't exist would still deactivate the real active year
    // in the first statement below, then silently affect zero rows in
    // the second — leaving the app with NO active academic year at all,
    // while still reporting ok:true. Checking existence first means a
    // bogus id has exactly zero effect, not a partially-corrupting one.
    return { ok: false, error: "السنة الدراسية غير موجودة" };
  }

  // Partial unique index (is_active WHERE true) means only one row can be
  // active — deactivate the rest first inside the same transaction.
  await db.transaction().execute(async (trx) => {
    await trx.updateTable("academicYear").set({ isActive: false }).where("isActive", "=", true).execute();
    await trx.updateTable("academicYear").set({ isActive: true }).where("id", "=", id).execute();
  });
  revalidateEverything();
  return { ok: true };
}

// ---------- Session templates ----------

const sessionTemplateSchema = z.object({
  id: z.string().uuid().optional(),
  name: z.string().trim().min(1),
  startTime: z.string().regex(/^\d{2}:\d{2}$/),
  endTime: z.string().regex(/^\d{2}:\d{2}$/),
});

export async function upsertSessionTemplate(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = sessionTemplateSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  const d = parsed.data;
  if (d.endTime <= d.startTime) return { ok: false, error: "وقت النهاية يجب أن يكون بعد وقت البداية" };

  try {
    if (d.id) {
      await db.updateTable("sessionTemplate").set({ name: d.name, startTime: d.startTime, endTime: d.endTime }).where("id", "=", d.id).execute();
    } else {
      const maxSort = await db.selectFrom("sessionTemplate").select((eb) => eb.fn.max("sortOrder").as("max")).executeTakeFirst();
      await db.insertInto("sessionTemplate").values({ name: d.name, startTime: d.startTime, endTime: d.endTime, sortOrder: (maxSort?.max ?? 0) + 1 }).execute();
    }
  } catch (err) {
    console.error("[settings] session template upsert failed", err);
    return { ok: false, error: "تعذّر الحفظ" };
  }
  // This is the exact propagation the spec calls out explicitly: a time
  // change here must be reflected in the dashboard, attendance, and late
  // calculation immediately. There is nothing to invalidate beyond the
  // route cache — every read in those places queries session_template live.
  revalidateEverything();
  return { ok: true };
}

// ---------- Holidays ----------

export async function upsertHoliday(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = holidaySchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  const d = parsed.data;
  if (d.endDate < d.startDate) return { ok: false, error: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية" };

  try {
    if (d.id) {
      await db.updateTable("holiday").set({ name: d.name, startDate: d.startDate, endDate: d.endDate, description: d.description || null }).where("id", "=", d.id).execute();
    } else {
      await db.insertInto("holiday").values({ academicYearId: d.academicYearId, name: d.name, startDate: d.startDate, endDate: d.endDate, description: d.description || null }).execute();
    }
  } catch (err) {
    console.error("[settings] holiday upsert failed", err);
    return { ok: false, error: "تعذّر الحفظ" };
  }
  revalidateEverything();
  return { ok: true };
}

export async function deleteHoliday(id: string): Promise<ActionResult> {
  await requireAdmin();
  await db.deleteFrom("holiday").where("id", "=", id).execute();
  revalidateEverything();
  return { ok: true };
}

// ---------- Session cancellations ----------

export async function upsertCancellation(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const raw = Object.fromEntries(formData);
  // FormData turns an intentionally-empty "all sessions" selection into "",
  // which Zod's .nullable() doesn't accept directly — normalize first.
  const normalized = { ...raw, sessionTemplateId: raw.sessionTemplateId === "" ? null : raw.sessionTemplateId };
  const parsed = cancellationSchema.safeParse(normalized);
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  const d = parsed.data;
  if (d.endDate < d.startDate) return { ok: false, error: "تاريخ النهاية يجب أن يكون بعد تاريخ البداية" };

  try {
    if (d.id) {
      await db
        .updateTable("sessionCancellation")
        .set({ sessionTemplateId: d.sessionTemplateId, startDate: d.startDate, endDate: d.endDate, reason: d.reason || null })
        .where("id", "=", d.id)
        .execute();
    } else {
      await db
        .insertInto("sessionCancellation")
        .values({ sessionTemplateId: d.sessionTemplateId, startDate: d.startDate, endDate: d.endDate, reason: d.reason || null })
        .execute();
    }
  } catch (err) {
    // The real, tested EXCLUDE constraint from db/migrations/0001_init.sql
    // surfaces here as a Postgres error for any overlapping period — this
    // is not a generic catch-all, it's the specific case the spec asks to
    // verify: "يجب أن يرفض PostgreSQL التداخل".
    const message = err instanceof Error ? err.message : String(err);
    if (/exclusion|conflicting key value/i.test(message)) {
      return { ok: false, error: "تتداخل هذه الفترة مع فترة إلغاء أخرى لنفس الحصة" };
    }
    console.error("[settings] cancellation upsert failed", err);
    return { ok: false, error: "تعذّر الحفظ" };
  }
  revalidateEverything();
  return { ok: true };
}

export async function deleteCancellation(id: string): Promise<ActionResult> {
  await requireAdmin();
  await db.deleteFrom("sessionCancellation").where("id", "=", id).execute();
  revalidateEverything();
  return { ok: true };
}

const halaqaNameSchema = z.object({ name: z.string().trim().min(2).max(100) });

export async function createHalaqa(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = halaqaNameSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: "اسم الحلقة غير صالح" };
  try {
    await db.insertInto("halaqa").values({ name: parsed.data.name }).execute();
  } catch (err) {
    console.error("[settings] create halaqa failed", err);
    return { ok: false, error: "تعذّر إنشاء الحلقة" };
  }
  revalidateEverything();
  return { ok: true };
}

const teacherAccountSchema = z.object({
  fullName: z.string().trim().min(2),
  email: z.string().trim().email(),
  password: z.string().min(8),
  halaqaId: z.string().uuid(),
  role: z.enum(["ADMIN", "TEACHER"]),
});

export async function createTeacherAccount(formData: FormData): Promise<ActionResult> {
  await requireAdmin();
  const parsed = teacherAccountSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  const data = parsed.data;
  const halaqa = await db.selectFrom("halaqa").select(["id", "name"]).where("id", "=", data.halaqaId).executeTakeFirst();
  if (!halaqa) return { ok: false, error: "الحلقة غير موجودة" };

  try {
    const passwordHash = await hashPassword(data.password);
    await db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto("appUser")
        .values({ email: data.email.toLowerCase(), passwordHash, role: data.role })
        .returning("id")
        .executeTakeFirstOrThrow();
      const profile = await trx
        .insertInto("teacherProfile")
        .values({ userId: user.id, fullName: data.fullName, halaqaName: halaqa.name })
        .returning("id")
        .executeTakeFirstOrThrow();
      await trx.insertInto("teacherHalaqa").values({ teacherProfileId: profile.id, halaqaId: halaqa.id }).execute();
    });
  } catch (err) {
    console.error("[settings] create teacher failed", err);
    return { ok: false, error: "تعذّر إنشاء حساب المعلم؛ تحقق من عدم تكرار البريد الإلكتروني" };
  }
  revalidateEverything();
  return { ok: true };
}

export async function assignTeacherToHalaqa(userId: string, halaqaId: string): Promise<ActionResult> {
  await requireAdmin();
  const parsed = z.object({ userId: z.string().uuid(), halaqaId: z.string().uuid() }).safeParse({ userId, halaqaId });
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  const profile = await db.selectFrom("teacherProfile").select("id").where("userId", "=", userId).executeTakeFirst();
  const halaqa = await db.selectFrom("halaqa").select("id").where("id", "=", halaqaId).executeTakeFirst();
  if (!profile || !halaqa) return { ok: false, error: "المعلم أو الحلقة غير موجود" };
  await db
    .insertInto("teacherHalaqa")
    .values({ teacherProfileId: profile.id, halaqaId })
    .onConflict((oc) => oc.columns(["teacherProfileId", "halaqaId"]).doNothing())
    .execute();
  revalidateEverything();
  return { ok: true };
}
