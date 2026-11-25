import { getTodayISO } from "@/lib/business/date";
import { getAccessContext } from "@/lib/server/access";
import { getAccessibleHalaqas, getMonthlyAttendanceTable } from "@/lib/server/monthly-attendance";
import { MonthlyAttendanceClient } from "./MonthlyAttendanceClient";
import { z } from "zod";

export const dynamic = "force-dynamic";

export default async function MonthlyPage({
  searchParams,
}: {
  searchParams: Promise<{ halaqaId?: string; year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const today = getTodayISO();
  const [todayYear, todayMonth] = today.split("-").map(Number);

  const access = await getAccessContext();
  const yearResult = z.coerce.number().int().min(2000).max(2100).safeParse(params.year);
  const monthResult = z.coerce.number().int().min(1).max(12).safeParse(params.month);
  const year = yearResult.success ? yearResult.data : todayYear;
  const month = monthResult.success ? monthResult.data : todayMonth;
  const halaqas = await getAccessibleHalaqas(access);
  const requestedHalaqa = z.string().uuid().safeParse(params.halaqaId);
  const halaqaId = requestedHalaqa.success && halaqas.some((halaqa) => halaqa.id === requestedHalaqa.data)
    ? requestedHalaqa.data
    : undefined;
  const table = await getMonthlyAttendanceTable(year, month, halaqaId, access);

  return (
    <MonthlyAttendanceClient
      year={year}
      month={month}
      initialHalaqaId={halaqaId ?? ""}
      halaqas={halaqas}
      initialTable={table}
    />
  );
}
