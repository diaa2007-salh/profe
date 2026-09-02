import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Ltr } from "@/components/Ltr";
import { CalendarCheck2, ChevronLeft, Users, TrendingUp } from "lucide-react";
import { db } from "@/lib/db/client";
import { getTodayOverview } from "@/lib/server/today";
import { getClassMonthlySummary } from "@/lib/server/statistics";
import { formatFullDate } from "@/lib/domain";

const STATE_LABEL: Record<string, string> = {
  NOT_SCHOOL_DAY: "خارج السنة الدراسية",
  HOLIDAY: "عطلة",
  CANCELLED: "ملغاة",
  SCHEDULED: "لم يُسجَّل حضور المعلم بعد",
  TEACHER_ABSENT: "المعلم غائب",
  TEACHER_PRESENT: "جارية",
};

export const dynamic = "force-dynamic";

export default async function HomePage() {
  const { date, sessions } = await getTodayOverview();
  const [year, month] = date.split("-").map(Number);

  const [activeStudentsRow, monthSummary] = await Promise.all([
    db.selectFrom("student").select((eb) => eb.fn.countAll<number>().as("count")).where("isActive", "=", true).executeTakeFirst(),
    getClassMonthlySummary(year, month),
  ]);
  const activeStudents = Number(activeStudentsRow?.count ?? 0);

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sm text-muted-foreground">{formatFullDate(date)}</p>
        <h1 className="font-display text-2xl text-foreground">مرحبًا بك في دفتر الحلقة</h1>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {sessions.map((s) => (
          <Card key={s.sessionTemplateId} className={s.state === "TEACHER_PRESENT" ? "border-primary/20 bg-primary text-primary-foreground" : ""}>
            <CardContent className="flex flex-col gap-4 py-5">
              <div className="flex items-center gap-3">
                <div
                  className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl ${
                    s.state === "TEACHER_PRESENT" ? "bg-primary-foreground/10" : "bg-secondary"
                  }`}
                >
                  <CalendarCheck2 className="h-5 w-5" />
                </div>
                <div>
                  <div className={s.state === "TEACHER_PRESENT" ? "text-sm text-primary-foreground/70" : "text-sm text-muted-foreground"}>
                    {s.name}
                  </div>
                  <div className="font-display text-lg">
                    <Ltr>{s.startTime} – {s.endTime}</Ltr>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-between">
                <Badge
                  variant={s.state === "TEACHER_PRESENT" ? "secondary" : "outline"}
                  className={s.state === "TEACHER_PRESENT" ? "" : "border-current"}
                >
                  {STATE_LABEL[s.state]}
                </Badge>
                {(s.state === "TEACHER_PRESENT" || s.state === "SCHEDULED") && (
                  <Button asChild variant={s.state === "TEACHER_PRESENT" ? "secondary" : "default"} size="sm" className="gap-1.5">
                    <Link href={`/attendance?session=${s.sessionTemplateId}`}>
                      فتح كشف الحضور
                      <ChevronLeft className="h-4 w-4" />
                    </Link>
                  </Button>
                )}
              </div>

              {s.state === "TEACHER_PRESENT" && (
                <div className="flex items-center gap-3 text-sm tabular">
                  <span>{s.presentCount} حاضر</span>
                  <span>{s.lateCount} متأخر</span>
                  <span>{s.absentCount} غائب</span>
                </div>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid grid-cols-2 gap-4">
        <Link href="/students">
          <Card className="transition-colors hover:border-accent/50">
            <CardContent className="flex flex-col gap-2 py-5">
              <Users className="h-5 w-5 text-accent" />
              <div className="font-display text-2xl tabular text-foreground">{activeStudents}</div>
              <div className="text-xs text-muted-foreground">عدد الطلاب النشطين</div>
            </CardContent>
          </Card>
        </Link>
        <Link href="/statistics">
          <Card className="transition-colors hover:border-accent/50">
            <CardContent className="flex flex-col gap-2 py-5">
              <TrendingUp className="h-5 w-5 text-accent" />
              <div className="font-display text-2xl tabular text-foreground">
                {monthSummary.sessionsHeld > 0 && monthSummary.activeStudentCount > 0
                  ? `${Math.round(((monthSummary.totalPresent + monthSummary.totalLate) / (monthSummary.sessionsHeld * monthSummary.activeStudentCount)) * 100)}%`
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground">نسبة الحضور هذا الشهر</div>
            </CardContent>
          </Card>
        </Link>
      </div>

      {sessions.length === 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="font-display text-base font-normal text-foreground">لا توجد حصص مُعرَّفة</CardTitle>
          </CardHeader>
          <CardContent className="text-sm text-muted-foreground">
            أضف حصصًا من صفحة الإعدادات لتبدأ بتسجيل الحضور.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
