"use client";

import { useRouter } from "next/navigation";
import { Card, CardContent } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { ClassMonthlySummary } from "@/lib/server/statistics";

const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function StatisticsClient({ year, month, summary }: { year: number; month: number; summary: ClassMonthlySummary }) {
  const router = useRouter();

  function navigate(next: Partial<{ year: number; month: number }>) {
    const params = new URLSearchParams({ year: String(next.year ?? year), month: String(next.month ?? month) });
    router.push(`/statistics?${params.toString()}`);
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="font-display text-2xl text-foreground">الإحصائيات</h1>
        <div className="flex gap-2">
          <Select value={String(month)} onValueChange={(v) => navigate({ month: Number(v) })}>
            <SelectTrigger className="w-32">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {MONTH_NAMES.map((name, i) => (
                <SelectItem key={i + 1} value={String(i + 1)}>
                  {name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={(v) => navigate({ year: Number(v) })}>
            <SelectTrigger className="w-24">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {[year - 1, year, year + 1].map((y) => (
                <SelectItem key={y} value={String(y)}>
                  {y}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3">
        <StatCard label="حصص فعلية هذا الشهر" value={summary.sessionsHeld} />
        <StatCard label="حضور" value={summary.totalPresent} className="text-primary" />
        <StatCard label="تأخر" value={summary.totalLate} className="text-accent" />
        <StatCard label="غياب" value={summary.totalAbsent} className="text-destructive" />
        <StatCard label="إجمالي دقائق التأخر" value={summary.totalLateMinutes} />
        <StatCard label="سجلات التسميع" value={summary.memorizationEntryCount} />
      </div>

      <Card>
        <CardContent className="space-y-1 py-5">
          <h2 className="mb-3 text-sm font-medium text-foreground">نظرة على كل طالب (بالترتيب الأبجدي)</h2>
          {summary.perStudent.length === 0 && <p className="text-sm text-muted-foreground">لا يوجد طلاب نشطون</p>}
          <div className="divide-y divide-border">
            {summary.perStudent.map((s) => (
              <div key={s.studentId} className="flex items-center justify-between py-2.5 text-sm">
                <span className="text-foreground">{s.fullName}</span>
                <div className="flex items-center gap-3 tabular text-xs">
                  <span className="text-primary">{s.present} حاضر</span>
                  <span className="text-accent">{s.late} متأخر</span>
                  <span className="text-destructive">{s.absent} غائب</span>
                  {s.attendanceRate != null && <span className="text-muted-foreground">{s.attendanceRate}%</span>}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function StatCard({ label, value, className = "" }: { label: string; value: number; className?: string }) {
  return (
    <Card>
      <CardContent className="flex flex-col gap-1 py-5">
        <div className={`font-display text-2xl tabular text-foreground ${className}`}>{value}</div>
        <div className="text-xs text-muted-foreground">{label}</div>
      </CardContent>
    </Card>
  );
}
