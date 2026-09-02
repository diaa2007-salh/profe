import { db } from "@/lib/db/client";
import { StudentsClient } from "./StudentsClient";

export const dynamic = "force-dynamic";

export default async function StudentsPage() {
  const students = await db
    .selectFrom("student")
    .selectAll()
    .orderBy("isActive", "desc")
    .orderBy("fullName", "asc")
    .execute();

  return <StudentsClient initialStudents={students} />;
}
