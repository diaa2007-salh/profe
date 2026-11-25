import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCheck2, UserCheck, UserX, Clock3, TrendingUp } from "lucide-react";
import { getAccessContext } from "@/lib/server/access";
import { getDisciplineDashboard } from "@/lib/server/today";
import { formatFullDate } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const access = await getAccessContext();
  const dashboard = await getDisciplineDashboard(access);
  const metrics = [
    { label: "نسبة الحضور اليوم", value: dashboard.attendanceRate === null ? "—" : `${dashboard.attendanceRate}%`, color: "text-primary", icon: TrendingUp, background: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
    { label: "الحاضرون", value: dashboard.present, color: "text-emerald-700 dark:text-emerald-300", icon: UserCheck, background: "bg-emerald-50 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300" },
    { label: "الغائبون", value: dashboard.absent, color: "text-rose-700 dark:text-rose-300", icon: UserX, background: "bg-rose-50 text-rose-700 dark:bg-rose-950 dark:text-rose-300" },
    { label: "المتأخرون", value: dashboard.late, color: "text-amber-700 dark:text-amber-300", icon: Clock3, background: "bg-amber-50 text-amber-700 dark:bg-amber-950 dark:text-amber-300" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-sm sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{formatFullDate(dashboard.date)}</p>
          <h1 className="mt-1 font-display text-2xl font-semibold text-foreground">لوحة انضباط التلاميذ</h1>
          <p className="mt-1 text-sm text-muted-foreground">نظرة سريعة على حضور الحلقة اليوم</p>
        </div>
        {dashboard.sessions[0] && (
          <Button asChild className="min-h-11 gap-2 rounded-xl shadow-sm">
            <Link href={`/attendance?session=${dashboard.sessions[0].id}`}>
              <CalendarCheck2 className="h-4 w-4" />
              فتح كشف اليوم
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label} className="overflow-hidden">
            <CardContent className="flex items-center justify-between gap-2 p-4 sm:p-5">
              <div>
                <div className={`font-display text-3xl font-semibold tabular-nums ${metric.color}`}>{metric.value}</div>
                <div className="mt-1 text-xs text-muted-foreground">{metric.label}</div>
              </div>
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl ${metric.background}`}>
                <metric.icon className="h-5 w-5" />
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base font-semibold text-foreground">الأكثر غياباً هذا الشهر</CardTitle>
          <p className="text-xs text-muted-foreground">أعلى خمسة تلاميذ بحسب أيام الغياب المسجّلة</p>
        </CardHeader>
        <CardContent>
          {dashboard.topAbsentees.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد سجلات غياب هذا الشهر.</p>
          ) : (
            <ol className="divide-y divide-border">
              {dashboard.topAbsentees.map((student, index) => (
                <li key={student.studentId} className="flex items-center justify-between gap-3 py-3 text-sm">
                  <span className="flex min-w-0 items-center gap-3 text-foreground">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary text-xs font-semibold tabular-nums text-muted-foreground">{index + 1}</span>
                    <span className="truncate">{student.fullName}</span>
                  </span>
                  <span className="shrink-0 rounded-full bg-rose-50 px-3 py-1 text-xs font-semibold tabular-nums text-rose-700 dark:bg-rose-950 dark:text-rose-300">{student.absences} غياب</span>
                </li>
              ))}
            </ol>
          )}
        </CardContent>
      </Card>

      {dashboard.sessions.length === 0 && (
        <Card>
          <CardContent className="py-5 text-sm text-muted-foreground">لا توجد حصص فعّالة. أضف الحصص من الإعدادات.</CardContent>
        </Card>
      )}
    </div>
  );
}
