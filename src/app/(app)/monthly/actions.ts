"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import { monthlyEvaluationSchema } from "@/lib/validation";

async function requireSession() {
  const session = await auth();
  if (!session?.user?.id) throw new Error("UNAUTHORIZED");
}

export type ActionResult = { ok: true } | { ok: false; error: string };

export async function saveMonthlyEvaluation(formData: FormData): Promise<ActionResult> {
  await requireSession();

  const raw = Object.fromEntries(formData);
  const parsed = monthlyEvaluationSchema.safeParse(raw);
  if (!parsed.success) return { ok: false, error: "بيانات غير صالحة" };
  const { studentId, year, month, grade, notes } = parsed.data;

  try {
    await db
      .insertInto("monthlyEvaluation")
      .values({ studentId, year, month, grade, notes: notes || null })
      .onConflict((oc) =>
        oc.columns(["studentId", "year", "month"]).doUpdateSet({ grade, notes: notes || null, updatedAt: new Date() })
      )
      .execute();
  } catch (err) {
    console.error("[monthly] save evaluation failed", err);
    return { ok: false, error: "تعذّر حفظ التقييم" };
  }

  revalidatePath("/monthly");
  return { ok: true };
}
