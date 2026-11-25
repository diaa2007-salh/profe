"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import { Loader2, Download } from "lucide-react";
import type { MonthlyAttendanceRow } from "@/lib/business/monthly-attendance";
import type { AttendanceStatus } from "@/lib/db/types";
import { getLocalTodayISO } from "@/lib/business/date";

interface MonthlyTable {
  daysInMonth: number;
  rows: MonthlyAttendanceRow[];
}

const MONTH_NAMES = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const SYMBOL: Record<AttendanceStatus, string> = {
  PRESENT: "ح",
  ABSENT: "غ",
  LATE: "م",
};

const STATUS_STYLE: Record<AttendanceStatus, string> = {
  PRESENT: "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300",
  ABSENT: "bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300",
  LATE: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300",
};

export function MonthlyAttendanceClient({
  year: initialYear,
  month: initialMonth,
  initialHalaqaId,
  halaqas,
  initialTable,
}: {
  year: number;
  month: number;
  initialHalaqaId: string;
  halaqas: { id: string; name: string }[];
  initialTable: MonthlyTable;
}) {
  const [year, setYear] = useState(initialYear);
  const [month, setMonth] = useState(initialMonth);
  const [halaqaId, setHalaqaId] = useState(initialHalaqaId);
  const [table, setTable] = useState(initialTable);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const firstRender = useRef(true);

  const hasRecords = useMemo(
    () => table.rows.some((row) => row.present + row.absent + row.late > 0),
    [table.rows]
  );

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }

    const controller = new AbortController();
    const params = new URLSearchParams({ year: String(year), month: String(month) });
    if (halaqaId) params.set("halaqaId", halaqaId);
    setLoading(true);
    void fetch(`/api/monthly-attendance?${params}`, { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const payload = (await response.json()) as MonthlyTable | { error?: string };
        if (!response.ok) throw new Error("error" in payload ? payload.error : "تعذّر تحميل الجدول");
        setTable(payload as MonthlyTable);
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === "AbortError") return;
        toast.error(error instanceof Error ? error.message : "تعذّر تحميل الجدول الشهري");
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });

    return () => controller.abort();
  }, [year, month, halaqaId]);

  async function exportExcel() {
    setExporting(true);
    try {
      const { createMonthlyAttendanceWorkbook } = await import("@/lib/monthly/excel");
      const workbook = createMonthlyAttendanceWorkbook(table, year, month);
      const buffer = await workbook.xlsx.writeBuffer();
      const blob = new Blob([new Uint8Array(buffer)], {
        type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      });
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = `الجدول-الشهري_${year}-${String(month).padStart(2, "0")}.xlsx`;
      link.click();
      URL.revokeObjectURL(link.href);
    } catch (error) {
      console.error("[monthly] Excel export failed", error);
      toast.error("تعذّر إنشاء ملف Excel");
    } finally {
      setExporting(false);
    }
  }

  const today = getLocalTodayISO();
  const todayParts = today.split("-").map(Number);
  const isCurrentMonth = todayParts[0] === year && todayParts[1] === month;

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl font-semibold text-foreground">الكشف الشهري</h1>
          <p className="text-sm text-muted-foreground">سجل الحضور والغياب والتأخر حسب اليوم</p>
        </div>
        <Button onClick={exportExcel} disabled={loading || exporting || table.rows.length === 0} className="min-h-11 rounded-xl">
          {exporting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Download className="h-4 w-4" />}
          {exporting ? "جاري التصدير..." : "تصدير Excel (.xlsx)"}
        </Button>
      </div>

      <div className="grid gap-3 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:grid-cols-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          الشهر
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground"
          >
            {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          السنة
          <Input type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} className="h-11 rounded-xl tabular-nums" />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          الحلقة
          <select
            value={halaqaId}
            onChange={(event) => setHalaqaId(event.target.value)}
            className="h-11 w-full rounded-xl border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">كل الحلقات المتاحة</option>
            {halaqas.map((halaqa) => <option key={halaqa.id} value={halaqa.id}>{halaqa.name}</option>)}
          </select>
        </label>
      </div>

      {table.rows.length === 0 ? (
        <Card className="rounded-2xl border-dashed"><CardContent className="py-12 text-center text-sm text-muted-foreground">لا يوجد تلاميذ نشطون في هذه الحلقة.</CardContent></Card>
      ) : (
        <>
          {!hasRecords && <p className="text-sm text-muted-foreground">لا توجد سجلات حضور لهذا الشهر بعد.</p>}
          <div aria-busy={loading} className={`relative max-h-[72vh] overflow-auto rounded-2xl border border-border/80 bg-card shadow-sm ${loading ? "opacity-70" : ""}`}>
            <table className="min-w-max border-separate border-spacing-0 text-center text-xs">
              <thead>
                <tr className="bg-muted text-foreground">
                  <th rowSpan={2} className="sticky right-0 top-0 z-30 min-w-48 border-b border-e border-border bg-muted px-3 py-3 text-right">اسم التلميذ</th>
                  {Array.from({ length: table.daysInMonth }, (_, index) => {
                    const day = index + 1;
                    const weekday = new Date(year, month - 1, day).getDay();
                    const isWeekend = weekday === 5 || weekday === 6;
                    const isToday = isCurrentMonth && todayParts[2] === day;
                    return (
                    <th key={day} colSpan={2} className={`sticky top-0 z-20 min-w-16 border-b border-border px-1 py-2 tabular-nums ${isToday ? "bg-emerald-100 text-emerald-900 dark:bg-emerald-950 dark:text-emerald-200" : isWeekend ? "bg-slate-100 text-slate-500 dark:bg-slate-800" : "bg-muted"}`}>
                      {day}
                    </th>
                    );
                  })}
                  <th rowSpan={2} className="sticky top-0 z-20 min-w-16 border-b border-border bg-emerald-50 px-2 py-3 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">الحضور</th>
                  <th rowSpan={2} className="sticky top-0 z-20 min-w-16 border-b border-border bg-rose-50 px-2 py-3 text-rose-800 dark:bg-rose-950 dark:text-rose-300">الغياب</th>
                  <th rowSpan={2} className="sticky top-0 z-20 min-w-16 border-b border-border bg-amber-50 px-2 py-3 text-amber-800 dark:bg-amber-950 dark:text-amber-300">التأخر</th>
                </tr>
                <tr className="bg-muted text-foreground">
                  {Array.from({ length: table.daysInMonth }, (_, index) => (
                    [1, 2].map((period) => (
                      <th key={`${index + 1}-${period}`} className="sticky top-8 z-20 min-w-8 border-b border-border px-1 py-1 text-[10px] text-muted-foreground">
                        ح{period}
                      </th>
                    ))
                  ))}
                </tr>
              </thead>
              <tbody>
                {table.rows.map((student) => (
                  <tr key={student.id} className="group">
                    <th className="sticky right-0 z-10 border-b border-e border-border/70 bg-card px-3 py-2.5 text-right font-medium text-foreground group-hover:bg-muted/70">{student.fullName}</th>
                    {student.days.flatMap(({ period1, period2 }, index) =>
                      [period1, period2].map((status, periodIndex) => (
                        <td key={`${index + 1}-${periodIndex + 1}`} className={`border-b border-s border-border/60 px-1 py-2 ${status ? STATUS_STYLE[status] : "text-muted-foreground"} ${isCurrentMonth && todayParts[2] === index + 1 ? "ring-1 ring-inset ring-emerald-400/50" : ""}`}>
                          <span
                            title={`${String(index + 1).padStart(2, "0")}-${String(month).padStart(2, "0")}-${year} · الحصة ${periodIndex + 1} · ${status === "PRESENT" ? "حاضر" : status === "ABSENT" ? "غائب" : status === "LATE" ? "متأخر" : "غير مسجل"}`}
                            aria-label={`اليوم ${index + 1} الحصة ${periodIndex + 1}: ${status === "PRESENT" ? "حاضر" : status === "ABSENT" ? "غائب" : status === "LATE" ? "متأخر" : "غير مسجل"}`}
                            className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full font-semibold tabular-nums ${status ? "" : "text-muted-foreground"}`}
                          >
                            {status ? SYMBOL[status] : "-"}
                          </span>
                        </td>
                      ))
                    )}
                    <td className="border-b border-border/60 bg-emerald-50/70 px-2 py-2 font-semibold tabular-nums text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">{student.present}</td>
                    <td className="border-b border-border/60 bg-rose-50/70 px-2 py-2 font-semibold tabular-nums text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">{student.absent}</td>
                    <td className="border-b border-border/60 bg-amber-50/70 px-2 py-2 font-semibold tabular-nums text-amber-800 dark:bg-amber-950/40 dark:text-amber-300">{student.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-background/40 backdrop-blur-[1px]">
                <span className="inline-flex items-center gap-2 rounded-full bg-card px-4 py-2 text-xs text-muted-foreground shadow-sm">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  جارٍ تحديث الكشف
                </span>
              </div>
            )}
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="دليل الرموز">
            <span className="text-emerald-700">ح حاضر</span>
            <span className="text-rose-700">غ غائب</span>
            <span className="text-amber-700">م متأخر</span>
            <span>- غير مسجّل</span>
            {isCurrentMonth && <span className="text-emerald-700">إطار أخضر: اليوم</span>}
          </div>
        </>
      )}
    </div>
  );
}
