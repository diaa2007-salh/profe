"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { studentSchema } from "@/lib/validation";

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
  return session;
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function upsertStudent(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const raw = Object.fromEntries(formData);
  const parsed = studentSchema.safeParse(raw);
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const d = parsed.data;

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
  await db
    .updateTable("student")
    .set({ isActive: true, archivedAt: null, updatedAt: new Date() })
    .where("id", "=", studentId)
    .execute();
  revalidatePath("/students");
  return { ok: true };
}
