import "server-only";
import { db } from "@/lib/db/client";

/** This app has exactly one teacher/user. "Set up" means that row exists. */
export async function getSetupState() {
  const user = await db.selectFrom("appUser").select(["id"]).executeTakeFirst();
  return { isSetUp: Boolean(user) };
}

export async function getTeacherProfile(userId: string) {
  return db
    .selectFrom("teacherProfile")
    .selectAll()
    .where("userId", "=", userId)
    .executeTakeFirst();
}

export async function getActiveAcademicYear() {
  return db
    .selectFrom("academicYear")
    .selectAll()
    .where("isActive", "=", true)
    .executeTakeFirst();
}

export async function getActiveSessionTemplates() {
  return db
    .selectFrom("sessionTemplate")
    .selectAll()
    .where("isActive", "=", true)
    .orderBy("sortOrder", "asc")
    .execute();
}
