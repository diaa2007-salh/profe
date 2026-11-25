import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { CalendarCheck2 } from "lucide-react";
import { getAccessContext } from "@/lib/server/access";
import { getDisciplineDashboard } from "@/lib/server/today";
import { formatFullDate } from "@/lib/domain";

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const access = await getAccessContext();
  const dashboard = await getDisciplineDashboard(access);
  const metrics = [
    { label: "نسبة الحضور اليوم", value: dashboard.attendanceRate === null ? "—" : `${dashboard.attendanceRate}%`, color: "text-primary" },
    { label: "الحاضرون", value: dashboard.present, color: "text-emerald-700" },
    { label: "الغائبون", value: dashboard.absent, color: "text-destructive" },
    { label: "المتأخرون", value: dashboard.late, color: "text-orange-700" },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="text-sm text-muted-foreground">{formatFullDate(dashboard.date)}</p>
          <h1 className="font-display text-2xl text-foreground">لوحة انضباط التلاميذ</h1>
        </div>
        {dashboard.sessions[0] && (
          <Button asChild className="gap-2">
            <Link href={`/attendance?session=${dashboard.sessions[0].id}`}>
              <CalendarCheck2 className="h-4 w-4" />
              فتح كشف اليوم
            </Link>
          </Button>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {metrics.map((metric) => (
          <Card key={metric.label}>
            <CardContent className="py-5">
              <div className={`font-display text-3xl tabular ${metric.color}`}>{metric.value}</div>
              <div className="mt-1 text-xs text-muted-foreground">{metric.label}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="font-display text-base font-normal text-foreground">الأكثر غياباً هذا الشهر</CardTitle>
          <p className="text-xs text-muted-foreground">أعلى خمسة تلاميذ بحسب أيام الغياب المسجّلة</p>
        </CardHeader>
        <CardContent>
          {dashboard.topAbsentees.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا توجد سجلات غياب هذا الشهر.</p>
          ) : (
            <ol className="divide-y divide-border">
              {dashboard.topAbsentees.map((student, index) => (
                <li key={student.studentId} className="flex items-center justify-between py-3 text-sm">
                  <span className="text-foreground">{index + 1}. {student.fullName}</span>
                  <span className="text-destructive">{student.absences} غياب</span>
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
