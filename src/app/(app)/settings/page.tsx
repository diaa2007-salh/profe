import { db } from "@/lib/db/client";
import { auth } from "@/lib/auth/config";
import { SettingsClient } from "./SettingsClient";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const session = await auth();

  const [teacher, academicYears, sessionTemplates, holidays, cancellations, mushafEditions] = await Promise.all([
    db.selectFrom("teacherProfile").selectAll().where("userId", "=", session!.user!.id!).executeTakeFirst(),
    db.selectFrom("academicYear").selectAll().orderBy("startDate", "desc").execute(),
    db.selectFrom("sessionTemplate").selectAll().orderBy("sortOrder", "asc").execute(),
    db.selectFrom("holiday").selectAll().orderBy("startDate", "desc").execute(),
    db
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
      .execute(),
    db.selectFrom("mushafEdition").selectAll().execute(),
  ]);

  return (
    <SettingsClient
      teacher={teacher}
      academicYears={academicYears}
      sessionTemplates={sessionTemplates.map((s) => ({ ...s, startTime: s.startTime.toString().slice(0, 5), endTime: s.endTime.toString().slice(0, 5) }))}
      holidays={holidays}
      cancellations={cancellations}
      mushafEditions={mushafEditions}
    />
  );
}
