"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { studentSchema } from "@/lib/validation";
import { canAccessStudent, getAccessContext } from "@/lib/server/access";

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function upsertStudent(formData: FormData): Promise<ActionResult> {
  await requireSession();
  const access = await getAccessContext();

  const raw = Object.fromEntries(formData);
  const parsed = studentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const d = parsed.data;
  const selectedHalaqaId = d.halaqaId ?? (access.role === "ADMIN" ? undefined : access.halaqaIds[0]);
  if (!selectedHalaqaId || (access.role !== "ADMIN" && !access.halaqaIds.includes(selectedHalaqaId))) {
    return { ok: false, error: "الحلقة غير متاحة لهذا المستخدم" };
  }
  const halaqa = await db.selectFrom("halaqa").select("id").where("id", "=", selectedHalaqaId).executeTakeFirst();
  if (!halaqa) return { ok: false, error: "الحلقة غير موجودة" };
  if (d.id && !(await canAccessStudent(access, d.id))) {
    return { ok: false, error: "غير مصرح بتعديل هذا التلميذ" };
  }

  try {
    if (d.id) {
      await db
        .updateTable("student")
        .set({
          fullName: d.fullName,
          birthDate: d.birthDate || null,
          birthPlace: d.birthPlace || null,
          address: d.address || null,
          guardianName: d.guardianName || null,
          guardianPhone: d.guardianPhone || null,
          halaqaId: selectedHalaqaId,
          updatedAt: new Date(),
        })
        .where("id", "=", d.id)
        .execute();
    } else {
      await db
        .insertInto("student")
        .values({
          fullName: d.fullName,
          birthDate: d.birthDate || null,
          birthPlace: d.birthPlace || null,
          address: d.address || null,
          guardianName: d.guardianName || null,
          guardianPhone: d.guardianPhone || null,
          halaqaId: selectedHalaqaId,
        })
        .execute();
    }
  } catch (err) {
    console.error("[students] upsert failed", err);
    return { ok: false, error: "تعذّر حفظ بيانات الطالب" };
  }

  revalidatePath("/students");
  return { ok: true };
}

export async function archiveStudent(studentId: string): Promise<ActionResult> {
  await requireSession();
  const access = await getAccessContext();
  if (!(await canAccessStudent(access, studentId))) return { ok: false, error: "غير مصرح بتعديل هذا التلميذ" };
  await db
    .updateTable("student")
    .set({ isActive: false, archivedAt: new Date(), updatedAt: new Date() })
    .where("id", "=", studentId)
    .execute();
  revalidatePath("/students");
  return { ok: true };
}

export async function restoreStudent(studentId: string): Promise<ActionResult> {
  await requireSession();
  const access = await getAccessContext();
  if (!(await canAccessStudent(access, studentId))) return { ok: false, error: "غير مصرح بتعديل هذا التلميذ" };
  await db
    .updateTable("student")
    .set({ isActive: true, archivedAt: null, updatedAt: new Date() })
    .where("id", "=", studentId)
    .execute();
  revalidatePath("/students");
  return { ok: true };
}
