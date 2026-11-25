import { db } from "@/lib/db/client";
import { StudentsClient } from "./StudentsClient";
import { getAccessContext } from "@/lib/server/access";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const access = await getAccessContext();
  let studentsQuery = db
    .selectFrom("student")
    .selectAll()
    .orderBy("isActive", "desc")
    .orderBy("fullName", "asc");
  let halaqasQuery = db.selectFrom("halaqa").select(["id", "name"]).orderBy("name", "asc");

  if (access.role !== "ADMIN") {
    if (access.halaqaIds.length === 0) {
      studentsQuery = studentsQuery.where("id", "in", []);
      halaqasQuery = halaqasQuery.where("id", "in", []);
    } else {
      studentsQuery = studentsQuery.where("halaqaId", "in", access.halaqaIds);
      halaqasQuery = halaqasQuery.where("id", "in", access.halaqaIds);
    }
  }

  const [students, halaqas] = await Promise.all([studentsQuery.execute(), halaqasQuery.execute()]);

  return <StudentsClient initialStudents={students} halaqas={halaqas} />;
}
