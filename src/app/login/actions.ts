"use server";

import { redirect } from "next/navigation";
import { signIn } from "@/lib/auth/config";
import { loginSchema } from "@/lib/validation";

export type LoginFormState = { error?: string };

export async function loginAction(_prev: LoginFormState, formData: FormData): Promise<LoginFormState> {
  const parsed = loginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: "أدخل بريدًا إلكترونيًا وكلمة مرور صحيحين" };
  }

  const callbackUrl = (formData.get("callbackUrl") as string) || "/";

  try {
    await signIn("credentials", {
      email: parsed.data.email,
      password: parsed.data.password,
      redirect: false,
    });
  } catch {
    return { error: "البريد الإلكتروني أو كلمة المرور غير صحيحة" };
  }

  redirect(callbackUrl);
}
