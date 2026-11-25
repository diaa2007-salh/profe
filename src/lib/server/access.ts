import "server-only";
import { auth } from "@/lib/auth/config";
import { db } from "@/lib/db/client";
import type { AppRole } from "@/lib/db/types";

export interface AccessContext {
  userId: string;
  role: AppRole;
  teacherProfileId: string | null;
  halaqaIds: string[];
}

export async function getAccessContext(): Promise<AccessContext> {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) throw new Error("UNAUTHORIZED");

  const user = await db.selectFrom("appUser").select(["id", "role"]).where("id", "=", userId).executeTakeFirst();
  if (!user) throw new Error("UNAUTHORIZED");

  const profile = await db
    .selectFrom("teacherProfile")
    .select("id")
    .where("userId", "=", userId)
    .executeTakeFirst();
  const halaqas = profile
    ? await db
        .selectFrom("teacherHalaqa")
        .select("halaqaId")
        .where("teacherProfileId", "=", profile.id)
        .execute()
    : [];

  return {
    userId,
    role: user.role,
    teacherProfileId: profile?.id ?? null,
    halaqaIds: halaqas.map(({ halaqaId }) => halaqaId),
  };
}

export async function getAccessibleStudentIds(access: AccessContext): Promise<string[]> {
  let query = db.selectFrom("student").select("id");
  if (access.role !== "ADMIN") {
    if (access.halaqaIds.length === 0) return [];
    query = query.where("halaqaId", "in", access.halaqaIds);
  }
  return (await query.execute()).map(({ id }) => id);
}

export async function canAccessStudent(access: AccessContext, studentId: string): Promise<boolean> {
  let query = db.selectFrom("student").select("id").where("id", "=", studentId);
  if (access.role !== "ADMIN") {
    if (access.halaqaIds.length === 0) return false;
    query = query.where("halaqaId", "in", access.halaqaIds);
  }
  return Boolean(await query.executeTakeFirst());
}

export function isAdmin(access: AccessContext): boolean {
  return access.role === "ADMIN";
}
