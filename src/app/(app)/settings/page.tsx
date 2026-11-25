import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth/config";
import { SettingsClient } from "./SettingsClient";
import { getAccessContext } from "@/lib/server/access";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();
  const access = await getAccessContext();

  const [teacher, academicYears, sessionTemplates, holidays, cancellations, halaqas, teachers] = await Promise.all([
    db.selectFrom("teacherProfile").selectAll().where("userId", "=", session!.user!.id!).executeTakeFirst(),
    access.role === "ADMIN" ? db.selectFrom("academicYear").selectAll().orderBy("startDate", "desc").execute() : Promise.resolve([]),
    access.role === "ADMIN" ? db.selectFrom("sessionTemplate").selectAll().orderBy("sortOrder", "asc").execute() : Promise.resolve([]),
    access.role === "ADMIN" ? db.selectFrom("holiday").selectAll().orderBy("startDate", "desc").execute() : Promise.resolve([]),
    access.role === "ADMIN"
      ? db
          .selectFrom("sessionCancellation")
          .leftJoin("sessionTemplate", "sessionTemplate.id", "sessionCancellation.sessionTemplateId")
          .select([
            "sessionCancellation.id",
            "sessionCancellation.sessionTemplateId",
            "sessionTemplate.name as sessionTemplateName",
            "sessionCancellation.startDate",
            "sessionCancellation.endDate",
            "sessionCancellation.reason",
          ])
          .orderBy("sessionCancellation.startDate", "desc")
          .execute()
      : Promise.resolve([]),
    access.role === "ADMIN"
      ? db.selectFrom("halaqa").select(["id", "name"]).orderBy("name", "asc").execute()
      : access.halaqaIds.length
        ? db.selectFrom("halaqa").select(["id", "name"]).where("id", "in", access.halaqaIds).orderBy("name", "asc").execute()
        : Promise.resolve([]),
    access.role === "ADMIN"
      ? db
          .selectFrom("teacherProfile")
          .innerJoin("appUser", "appUser.id", "teacherProfile.userId")
          .leftJoin("teacherHalaqa", "teacherHalaqa.teacherProfileId", "teacherProfile.id")
          .leftJoin("halaqa", "halaqa.id", "teacherHalaqa.halaqaId")
          .select([
            "appUser.id as userId",
            "appUser.email",
            "teacherProfile.fullName",
            "halaqa.id as halaqaId",
            "halaqa.name as halaqaName",
          ])
          .orderBy("teacherProfile.fullName", "asc")
          .execute()
      : Promise.resolve([]),
  ]);

  return (
    <SettingsClient
      isAdmin={access.role === "ADMIN"}
      teacher={teacher}
      academicYears={academicYears}
      sessionTemplates={sessionTemplates.map((s) => ({ ...s, startTime: s.startTime.toString().slice(0, 5), endTime: s.endTime.toString().slice(0, 5) }))}
      holidays={holidays}
      cancellations={cancellations}
      halaqas={halaqas}
      teachers={teachers}
    />
  );
}
