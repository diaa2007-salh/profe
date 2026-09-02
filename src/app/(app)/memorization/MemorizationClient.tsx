"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { BookPlus, MoreVertical, TriangleAlert } from "lucide-react";
import { formatShortDate } from "@/lib/domain";
import { upsertWeeklyMemorization, deleteWeeklyMemorization } from "./actions";

interface StudentOption {
  id: string;
  fullName: string;
}
interface SurahOption {
  id: number;
  nameAr: string;
  verseCount: number | null;
}
interface EntryRow {
  id: string;
  studentId: string;
  studentName: string;
  weekStart: string;
  fromSurahId: number;
  fromVerse: number;
  toSurahId: number;
  toVerse: number;
  notes: string | null;
  fromSurahName: string;
  toSurahName: string;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function MemorizationClient({
  students,
  surahs,
  entries,
}: {
  students: StudentOption[];
  surahs: SurahOption[];
  entries: EntryRow[];
}) {
  const [pending, startTransition] = useTransition();
  const surahById = useMemo(() => new Map(surahs.map((s) => [s.id, s])), [surahs]);

  const [form, setForm] = useState({
    studentId: students[0]?.id ?? "",
    weekStart: todayISO(),
    fromSurahId: surahs[0]?.id ?? 1,
    fromVerse: "1",
    toSurahId: surahs[0]?.id ?? 1,
    toVerse: "1",
    notes: "",
  });

  const fromSurah = surahById.get(form.fromSurahId);
  const toSurah = surahById.get(form.toSurahId);

  function handleSubmit() {
    const fd = new FormData();
    fd.set("studentId", form.studentId);
    fd.set("weekStart", form.weekStart);
    fd.set("fromSurahId", String(form.fromSurahId));
    fd.set("fromVerse", form.fromVerse);
    fd.set("toSurahId", String(form.toSurahId));
    fd.set("toVerse", form.toVerse);
    if (form.notes) fd.set("notes", form.notes);

    startTransition(async () => {
      const result = await upsertWeeklyMemorization(fd);
      if (!result.ok) {
        toast.error(result.error);
        return;
      }
      toast.success(
        result.fullyVerified
          ? "تم حفظ التسميع"
          : "تم الحفظ — لم يُتحقق من الحد الأقصى لرقم الآية (بيانات هذه السورة غير متوفرة بعد)"
      );
      if (result.overlaps.length > 0) {
        result.overlaps.forEach((o) => {
          toast.warning(`يوجد تداخل مع سجل سابق (${o.surahFrom} ← ${o.surahTo}، أسبوع ${formatShortDate(o.weekStart)})`, {
            duration: 6000,
          });
        });
      }
      setForm((f) => ({ ...f, notes: "" }));
    });
  }

  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteWeeklyMemorization(id);
      toast.success("تم حذف السجل");
    });
  }

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl text-foreground">التسميع الأسبوعي</h1>
        <p className="text-sm text-muted-foreground">تسجيل ما حفظه كل طالب خلال الأسبوع</p>
      </div>

      <Card>
        <CardContent className="space-y-4 py-5">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>الطالب</Label>
              <Select value={form.studentId} onValueChange={(v) => setForm({ ...form, studentId: v })}>
                <SelectTrigger>
                  <SelectValue placeholder={students.length ? "اختر طالبًا" : "لا يوجد طلاب"} />
                </SelectTrigger>
                <SelectContent>
                  {students.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.fullName}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>بداية الأسبوع</Label>
              <Input type="date" value={form.weekStart} onChange={(e) => setForm({ ...form, weekStart: e.target.value })} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>من سورة</Label>
              <Select value={String(form.fromSurahId)} onValueChange={(v) => setForm({ ...form, fromSurahId: Number(v) })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {surahs.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>رقم الآية{fromSurah?.verseCount ? ` (١–${fromSurah.verseCount})` : ""}</Label>
              <Input
                type="number"
                min={1}
                max={fromSurah?.verseCount ?? undefined}
                value={form.fromVerse}
                onChange={(e) => setForm({ ...form, fromVerse: e.target.value })}
                className="tabular"
              />
            </div>
          </div>
          {!fromSurah?.verseCount && (
            <p className="text-xs text-muted-foreground">بيانات عدد آيات هذه السورة غير متوفرة بعد — لن يُتحقق من الحد الأقصى تلقائيًا.</p>
          )}

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>إلى سورة</Label>
              <Select value={String(form.toSurahId)} onValueChange={(v) => setForm({ ...form, toSurahId: Number(v) })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="max-h-64">
                  {surahs.map((s) => (
                    <SelectItem key={s.id} value={String(s.id)}>
                      {s.nameAr}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>رقم الآية{toSurah?.verseCount ? ` (١–${toSurah.verseCount})` : ""}</Label>
              <Input
                type="number"
                min={1}
                max={toSurah?.verseCount ?? undefined}
                value={form.toVerse}
                onChange={(e) => setForm({ ...form, toVerse: e.target.value })}
                className="tabular"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label>ملاحظات (اختياري)</Label>
            <Textarea
              value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })}
              rows={2}
              placeholder="مثال: يحتاج مراجعة أحكام المد..."
            />
          </div>

          <Button onClick={handleSubmit} disabled={pending || !form.studentId} className="w-full gap-1.5 sm:w-auto">
            <BookPlus className="h-4 w-4" />
            حفظ التسميع
          </Button>
        </CardContent>
      </Card>

      <div className="space-y-2">
        <h2 className="text-sm font-medium text-muted-foreground">آخر السجلات</h2>
        {entries.map((entry) => (
          <Card key={entry.id}>
            <CardContent className="flex items-start justify-between gap-3 py-3.5">
              <div>
                <div className="text-sm font-medium text-foreground">{entry.studentName}</div>
                <div className="text-xs text-muted-foreground">
                  {entry.fromSurahName} ({entry.fromVerse}) ← {entry.toSurahName} ({entry.toVerse})
                </div>
                {entry.notes && <div className="mt-1 text-xs text-muted-foreground/80">{entry.notes}</div>}
              </div>
              <div className="flex items-center gap-2">
                <Badge variant="outline" className="text-[11px]">
                  {formatShortDate(entry.weekStart)}
                </Badge>
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button className="rounded-md p-1 text-muted-foreground hover:bg-secondary">
                      <MoreVertical className="h-4 w-4" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem onClick={() => handleDelete(entry.id)} className="text-destructive">
                      حذف
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </CardContent>
          </Card>
        ))}
        {entries.length === 0 && (
          <div className="flex items-center gap-2 rounded-lg bg-muted p-4 text-sm text-muted-foreground">
            <TriangleAlert className="h-4 w-4 shrink-0" />
            لا توجد سجلات تسميع بعد
          </div>
        )}
      </div>
    </div>
  );
}
