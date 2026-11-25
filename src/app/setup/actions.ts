"use server";

import { redirect } from "next/navigation";
import { db } from "@/lib/db/client";
import { hashPassword } from "@/lib/auth/password";
import { setupSchema } from "@/lib/validation";
import { signIn } from "@/lib/auth/config";
import { getSetupState } from "@/lib/server/app-state";

export type SetupFormState = { error?: string };

export async function completeSetup(_prev: SetupFormState, formData: FormData): Promise<SetupFormState> {
  // RULE: setup wizard only ever runs once (spec section 7).
  const { isSetUp } = await getSetupState();
  if (isSetUp) {
    redirect("/login");
  }

  const parsed = setupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "بيانات غير صالحة" };
  }
  const data = parsed.data;

  if (data.academicYearEnd <= data.academicYearStart) {
    return { error: "تاريخ نهاية السنة الدراسية يجب أن يكون بعد تاريخ البداية" };
  }
  if (data.session1End <= data.session1Start || data.session2End <= data.session2Start) {
    return { error: "وقت نهاية الحصة يجب أن يكون بعد وقت البداية" };
  }

  const passwordHash = await hashPassword(data.password);

  try {
    await db.transaction().execute(async (trx) => {
      const user = await trx
        .insertInto("appUser")
        .values({ email: data.email.toLowerCase().trim(), passwordHash, role: "ADMIN" })
        .returning(["id"])
        .executeTakeFirstOrThrow();

      const teacher = await trx
        .insertInto("teacherProfile")
        .values({
          userId: user.id,
          fullName: data.teacherName,
          phone: data.teacherPhone || null,
          halaqaName: data.halaqaName || null,
        })
        .returning("id")
        .executeTakeFirstOrThrow();

      const halaqa = await trx
        .insertInto("halaqa")
        .values({ name: data.halaqaName?.trim() || "الحلقة الافتراضية" })
        .returning("id")
        .executeTakeFirstOrThrow();

      await trx
        .insertInto("teacherHalaqa")
        .values({ teacherProfileId: teacher.id, halaqaId: halaqa.id })
        .execute();

      await trx
        .insertInto("academicYear")
        .values({
          label: data.academicYearLabel,
          startDate: data.academicYearStart,
          endDate: data.academicYearEnd,
          isActive: true,
        })
        .execute();

      await trx
        .insertInto("sessionTemplate")
        .values([
          { name: "الحصة الأولى", startTime: data.session1Start, endTime: data.session1End, sortOrder: 1 },
          { name: "الحصة الثانية", startTime: data.session2Start, endTime: data.session2End, sortOrder: 2 },
        ])
        .execute();
    });
  } catch (err) {
    console.error("[setup] transaction failed", err); // internal log only — no secrets, no stack trace to the user
    return { error: "حدث خطأ أثناء إنشاء الحساب. حاول مجددًا." };
  }

  await signIn("credentials", { email: data.email, password: data.password, redirect: false });
  redirect("/");
}
