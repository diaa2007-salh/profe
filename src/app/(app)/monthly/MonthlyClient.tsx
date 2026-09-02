"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TriangleAlert } from "lucide-react";
import { formatShortDate } from "@/lib/domain";
import { saveMonthlyEvaluation } from "./actions";
import type { MonthlySummary } from "@/lib/server/monthly";

const GRADE_LABEL: Record<string, string> = {
  EXCELLENT: "ممتاز",
  VERY_GOOD: "جيد جدًا",
  GOOD: "جيد",
  NEEDS_FOLLOW_UP: "يحتاج متابعة",
};
const GRADE_ORDER = ["EXCELLENT", "VERY_GOOD", "GOOD", "NEEDS_FOLLOW_UP"] as const;
const GRADE_STYLE: Record<string, string> = {
  EXCELLENT: "data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:border-primary",
  VERY_GOOD: "data-[state=on]:bg-primary/70 data-[state=on]:text-primary-foreground data-[state=on]:border-primary/70",
  GOOD: "data-[state=on]:bg-accent data-[state=on]:text-accent-foreground data-[state=on]:border-accent",
  NEEDS_FOLLOW_UP: "data-[state=on]:bg-destructive data-[state=on]:text-destructive-foreground data-[state=on]:border-destructive",
};

const MONTH_NAMES = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];

export function MonthlyClient({
  students,
  studentId,
  year,
  month,
  summary,
  existingGrade,
  existingNotes,
}: {
  students: { id: string; fullName: string; isActive: boolean }[];
  studentId: string;
  year: number;
  month: number;
  summary: MonthlySummary;
  existingGrade: string | null;
  existingNotes: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [grade, setGrade] = useState<string | null>(existingGrade);
  const [notes, setNotes] = useState(existingNotes);

  function navigate(next: Partial<{ student: string; year: number; month: number }>) {
    const params = new URLSearchParams({
      student: next.student ?? studentId,
      year: String(next.year ?? year),
      month: String(next.month ?? month),
    });
    router.push(`/monthly?${params.toString()}`);
  }

  function handleSave() {
    const fd = new FormData();
    fd.set("studentId", studentId);
    fd.set("year", String(year));
    fd.set("month", String(month));
    if (grade) fd.set("grade", grade);
    if (notes) fd.set("notes", notes);
    startTransition(async () => {
      const result = await saveMonthlyEvaluation(fd);
      if (result.ok) toast.success("تم حفظ التقييم");
      else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-foreground">المتابعة الشهرية</h1>
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <Select value={studentId} onValueChange={(v) => navigate({ student: v })}>
          <SelectTrigger className="col-span-2 sm:col-span-1">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {students.map((s) => (
              <SelectItem key={s.id} value={s.id}>
                {s.fullName}
                {!s.isActive && " (مؤرشف)"}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={String(month)} onValueChange={(v) => navigate({ month: Number(v) })}>
          <SelectTrigger>
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
          <SelectTrigger>
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

      <Card>
        <CardContent className="grid grid-cols-2 gap-4 py-5 sm:grid-cols-4">
          <Stat label="حصص فعلية" value={summary.sessionsHeld} />
          <Stat label="حضور" value={summary.present} className="text-primary" />
          <Stat label="تأخر" value={summary.late} className="text-accent" />
          <Stat label="غياب" value={summary.absent} className="text-destructive" />
          <Stat label="إجمالي دقائق التأخر" value={summary.totalLateMinutes} />
          <Stat label="نسبة الحضور" value={summary.attendanceRate != null ? `${summary.attendanceRate}%` : "—"} />
          {summary.notRecorded > 0 && <Stat label="غير مسجَّل" value={summary.notRecorded} className="text-muted-foreground" />}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-2 py-5">
          <h2 className="text-sm font-medium text-foreground">التسميع خلال الشهر</h2>
          {summary.memorization.length === 0 ? (
            <p className="text-sm text-muted-foreground">لا يوجد تسميع مسجَّل لهذا الشهر</p>
          ) : (
            <div className="space-y-1.5">
              {summary.memorization.map((m) => (
                <div key={m.id} className="flex items-center justify-between text-sm">
                  <span className="text-foreground">
                    {m.fromSurahName} ({m.fromVerse}) ← {m.toSurahName} ({m.toVerse})
                  </span>
                  <Badge variant="outline" className="text-[11px]">
                    {formatShortDate(m.weekStart)}
                  </Badge>
                </div>
              ))}
            </div>
          )}
          <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
            <TriangleAlert className="h-3.5 w-3.5 shrink-0" />
            بيانات الصفحات والأثمان غير متوفرة بعد لهذه الطبعة من المصحف
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-4 py-5">
          <h2 className="text-sm font-medium text-foreground">التقييم</h2>
          <ToggleGroup type="single" value={grade ?? undefined} onValueChange={(v) => setGrade(v || null)} className="flex-wrap justify-start gap-1.5">
            {GRADE_ORDER.map((g) => (
              <ToggleGroupItem key={g} value={g} className={`h-9 rounded-lg border border-border bg-background px-3 text-xs font-medium text-foreground/70 ${GRADE_STYLE[g]}`}>
                {GRADE_LABEL[g]}
              </ToggleGroupItem>
            ))}
          </ToggleGroup>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="ملاحظات الأستاذ..." />
          <Button onClick={handleSave} disabled={pending}>
            حفظ التقييم
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: string | number; className?: string }) {
  return (
    <div className="space-y-1">
      <div className={`font-display text-xl tabular text-foreground ${className}`}>{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}
