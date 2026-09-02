import { getClassMonthlySummary } from "@/lib/server/statistics";
import { getTodayISO } from "@/lib/business/date";
import { StatisticsClient } from "./StatisticsClient";

export const dynamic = "force-dynamic";

export default async function StatisticsPage({
  searchParams,
}: {
  searchParams: Promise<{ year?: string; month?: string }>;
}) {
  const params = await searchParams;
  const today = getTodayISO();
  const [todayYear, todayMonth] = today.split("-").map(Number);
  const year = Number(params.year) || todayYear;
  const month = Number(params.month) || todayMonth;

  const summary = await getClassMonthlySummary(year, month);

  return <StatisticsClient year={year} month={month} summary={summary} />;
}
