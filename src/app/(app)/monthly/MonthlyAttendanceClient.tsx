"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import type { MonthlyAttendanceRow } from "@/lib/business/monthly-attendance";
import type { AttendanceStatus } from "@/lib/db/types";

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
  PRESENT: "bg-emerald-100 text-emerald-800",
  ABSENT: "bg-red-100 text-red-800",
  LATE: "bg-orange-100 text-orange-800",
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
    }
  }

  return (
    <div className="space-y-5" dir="rtl">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">الجدول الشهري</h1>
          <p className="text-sm text-muted-foreground">سجل الحضور والغياب والتأخر حسب اليوم</p>
        </div>
        <Button onClick={exportExcel} disabled={loading || table.rows.length === 0}>
          تصدير إلى Excel
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="space-y-1 text-xs text-muted-foreground">
          الشهر
          <select
            value={month}
            onChange={(event) => setMonth(Number(event.target.value))}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            {MONTH_NAMES.map((name, index) => <option key={name} value={index + 1}>{name}</option>)}
          </select>
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          السنة
          <Input type="number" min={2000} max={2100} value={year} onChange={(event) => setYear(Number(event.target.value))} />
        </label>
        <label className="space-y-1 text-xs text-muted-foreground">
          الحلقة
          <select
            value={halaqaId}
            onChange={(event) => setHalaqaId(event.target.value)}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="">كل الحلقات المتاحة</option>
            {halaqas.map((halaqa) => <option key={halaqa.id} value={halaqa.id}>{halaqa.name}</option>)}
          </select>
        </label>
      </div>

      {table.rows.length === 0 ? (
        <Card><CardContent className="py-10 text-center text-sm text-muted-foreground">لا يوجد تلاميذ نشطون في هذه الحلقة.</CardContent></Card>
      ) : (
        <>
          {!hasRecords && <p className="text-sm text-muted-foreground">لا توجد سجلات حضور لهذا الشهر بعد.</p>}
          <div className={`overflow-x-auto rounded-lg border border-border ${loading ? "opacity-60" : ""}`}>
            <table className="min-w-max border-collapse text-center text-xs">
              <thead>
                <tr className="bg-muted text-foreground">
                  <th className="sticky right-0 z-10 min-w-48 border-b border-border bg-muted px-3 py-2 text-right">اسم التلميذ</th>
                  {Array.from({ length: table.daysInMonth }, (_, index) => (
                    <th key={index + 1} className="min-w-9 border-b border-border px-1 py-2">{index + 1}</th>
                  ))}
                  <th className="min-w-16 border-b border-border px-2 py-2 text-emerald-800">الحضور</th>
                  <th className="min-w-16 border-b border-border px-2 py-2 text-red-800">الغياب</th>
                  <th className="min-w-16 border-b border-border px-2 py-2 text-orange-800">التأخر</th>
                </tr>
              </thead>
              <tbody>
                {table.rows.map((student) => (
                  <tr key={student.id} className="border-b border-border last:border-0">
                    <th className="sticky right-0 z-10 bg-background px-3 py-2 text-right font-medium text-foreground">{student.fullName}</th>
                    {student.days.map((status, index) => (
                      <td key={index + 1} className={`border-s border-border px-1 py-2 font-semibold ${status ? STATUS_STYLE[status] : "text-muted-foreground"}`}>
                        {status ? SYMBOL[status] : "-"}
                      </td>
                    ))}
                    <td className="px-2 py-2 font-semibold text-emerald-800">{student.present}</td>
                    <td className="px-2 py-2 font-semibold text-red-800">{student.absent}</td>
                    <td className="px-2 py-2 font-semibold text-orange-800">{student.late}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="flex flex-wrap gap-4 text-xs text-muted-foreground" aria-label="دليل الرموز">
            <span className="text-emerald-700">ح حاضر</span>
            <span className="text-red-700">غ غائب</span>
            <span className="text-orange-700">م متأخر</span>
            <span>- غير مسجّل</span>
          </div>
        </>
      )}
    </div>
  );
}
