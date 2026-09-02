import { db } from "@/lib/db/client";
import { getMonthlySummary } from "@/lib/server/monthly";
import { getTodayISO } from "@/lib/business/date";
import { MonthlyClient } from "./MonthlyClient";

export const dynamic = "force-dynamic";

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ student?: string; year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const today = getTodayISO();
  const [todayYear, todayMonth] = today.split("-").map(Number);

  const students = await db
    .selectFrom("student")
    .select(["id", "fullName", "isActive"])
    .orderBy("isActive", "desc")
    .orderBy("fullName", "asc")
    .execute();

  const studentId = params.student ?? students[0]?.id;
  const year = Number(params.year) || todayYear;
  const month = Number(params.month) || todayMonth;

  if (!studentId) {
    return <p className="text-sm text-muted-foreground">لا يوجد طلاب بعد. أضف طلابًا أولًا من صفحة الطلاب.</p>;
  }

  const [summary, existingEvaluation] = await Promise.all([
    getMonthlySummary(studentId, year, month),
    db
      .selectFrom("monthlyEvaluation")
      .selectAll()
      .where("studentId", "=", studentId)
      .where("year", "=", year)
      .where("month", "=", month)
      .executeTakeFirst(),
  ]);

  return (
    <MonthlyClient
      students={students}
      studentId={studentId}
      year={year}
      month={month}
      summary={summary}
      existingGrade={existingEvaluation?.grade ?? null}
      existingNotes={existingEvaluation?.notes ?? ""}
    />
  );
}
