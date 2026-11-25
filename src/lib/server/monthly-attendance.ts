import "server-only";
import { db } from "@/lib/db/client";
import { aggregateMonthlyAttendance } from "@/lib/business/monthly-attendance";
import type { AccessContext } from "./access";

export async function getAccessibleHalaqas(access: AccessContext) {
  let query = db.selectFrom("halaqa").select(["id", "name"]).orderBy("name", "asc");
  if (access.role !== "ADMIN") {
    if (access.halaqaIds.length === 0) return [];
    query = query.where("id", "in", access.halaqaIds);
  }
  return query.execute();
}

export async function getMonthlyAttendanceTable(
  year: number,
  month: number,
  halaqaId: string | undefined,
  access: AccessContext
) {
  let studentsQuery = db
    .selectFrom("student")
    .select(["id", "fullName"])
    .where("isActive", "=", true)
    .orderBy("fullName", "asc");

  if (access.role !== "ADMIN") {
    if (access.halaqaIds.length === 0) {
      studentsQuery = studentsQuery.where("id", "in", []);
    } else {
      studentsQuery = studentsQuery.where("halaqaId", "in", access.halaqaIds);
    }
  }
  if (halaqaId) studentsQuery = studentsQuery.where("halaqaId", "=", halaqaId);

  const students = await studentsQuery.execute();
  const daysInMonth = new Date(year, month, 0).getDate();
  if (students.length === 0) return aggregateMonthlyAttendance([], [], year, month);

  const start = `${year}-${String(month).padStart(2, "0")}-01`;
  const end = `${year}-${String(month).padStart(2, "0")}-${String(daysInMonth).padStart(2, "0")}`;
  const records = await db
    .selectFrom("studentAttendance")
    .select(["studentId", "sessionDate", "period", "status"])
    .where("sessionDate", ">=", start)
    .where("sessionDate", "<=", end)
    .where("studentId", "in", students.map(({ id }) => id))
    .execute();

  return aggregateMonthlyAttendance(students, records, year, month);
}
