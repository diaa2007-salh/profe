"use client";

import { useState, useTransition } from "react";
import { toast } from "sonner";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Plus, Star, Trash2, Pencil, Download, Upload, TriangleAlert } from "lucide-react";
import { Ltr } from "@/components/Ltr";
import { formatShortDate } from "@/lib/domain";
import {
  updateTeacherProfile,
  upsertAcademicYear,
  setActiveAcademicYear,
  upsertSessionTemplate,
  upsertHoliday,
  deleteHoliday,
  upsertCancellation,
  deleteCancellation,
  createMushafEdition,
} from "./actions";
import { exportBackup, restoreBackup } from "./backup/actions";
import type { Selectable } from "kysely";
import type { TeacherProfile, AcademicYear, Holiday, MushafEdition } from "@/lib/db/types";

interface CancellationRow {
  id: string;
  sessionTemplateId: string | null;
  sessionTemplateName: string | null;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export function SettingsClient({
  teacher,
  academicYears,
  sessionTemplates,
  holidays,
  cancellations,
  mushafEditions,
}: {
  teacher: Selectable<TeacherProfile> | undefined;
  academicYears: Selectable<AcademicYear>[];
  sessionTemplates: { id: string; name: string; startTime: string; endTime: string }[];
  holidays: Selectable<Holiday>[];
  cancellations: CancellationRow[];
  mushafEditions: Selectable<MushafEdition>[];
}) {
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-foreground">الإعدادات</h1>
      <Tabs defaultValue="profile" dir="rtl">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">الأستاذ</TabsTrigger>
          <TabsTrigger value="year">السنة الدراسية</TabsTrigger>
          <TabsTrigger value="sessions">الحصص</TabsTrigger>
          <TabsTrigger value="holidays">العطل</TabsTrigger>
          <TabsTrigger value="cancellations">فترات الإلغاء</TabsTrigger>
          <TabsTrigger value="mushaf">نسخة المصحف</TabsTrigger>
          <TabsTrigger value="backup">النسخ الاحتياطي</TabsTrigger>
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileSection teacher={teacher} />
        </TabsContent>
        <TabsContent value="year" className="mt-4">
          <AcademicYearSection years={academicYears} />
        </TabsContent>
        <TabsContent value="sessions" className="mt-4">
          <SessionsSection sessions={sessionTemplates} />
        </TabsContent>
        <TabsContent value="holidays" className="mt-4">
          <HolidaysSection holidays={holidays} academicYearId={academicYears.find((y) => y.isActive)?.id ?? academicYears[0]?.id} />
        </TabsContent>
        <TabsContent value="cancellations" className="mt-4">
          <CancellationsSection cancellations={cancellations} sessionTemplates={sessionTemplates} />
        </TabsContent>
        <TabsContent value="mushaf" className="mt-4">
          <MushafSection editions={mushafEditions} />
        </TabsContent>
        <TabsContent value="backup" className="mt-4">
          <BackupSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function ProfileSection({ teacher }: { teacher: Selectable<TeacherProfile> | undefined }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ fullName: teacher?.fullName ?? "", phone: teacher?.phone ?? "", halaqaName: teacher?.halaqaName ?? "" });

  function handleSave() {
    const fd = new FormData();
    fd.set("fullName", form.fullName);
    if (form.phone) fd.set("phone", form.phone);
    if (form.halaqaName) fd.set("halaqaName", form.halaqaName);
    startTransition(async () => {
      const result = await updateTeacherProfile(fd);
      if (result.ok) toast.success("تم حفظ البيانات");
      else toast.error(result.error);
    });
  }

  return (
    <Card>
      <CardContent className="space-y-4 py-5">
        <div className="space-y-1.5">
          <Label>اسم الأستاذ</Label>
          <Input value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>رقم الهاتف</Label>
          <Input dir="ltr" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </div>
        <div className="space-y-1.5">
          <Label>اسم الحلقة أو المسجد</Label>
          <Input value={form.halaqaName} onChange={(e) => setForm({ ...form, halaqaName: e.target.value })} />
        </div>
        <Button onClick={handleSave} disabled={pending}>
          حفظ
        </Button>
      </CardContent>
    </Card>
  );
}

function AcademicYearSection({ years }: { years: Selectable<AcademicYear>[] }) {
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ id: "", label: "", startDate: "", endDate: "" });

  function openAdd() {
    setForm({ id: "", label: "", startDate: "", endDate: "" });
    setDialogOpen(true);
  }
  function openEdit(y: Selectable<AcademicYear>) {
    setForm({ id: y.id, label: y.label, startDate: y.startDate, endDate: y.endDate });
    setDialogOpen(true);
  }
  function handleSave() {
    const fd = new FormData();
    if (form.id) fd.set("id", form.id);
    fd.set("label", form.label);
    fd.set("startDate", form.startDate);
    fd.set("endDate", form.endDate);
    startTransition(async () => {
      const result = await upsertAcademicYear(fd);
      if (result.ok) {
        toast.success("تم الحفظ");
        setDialogOpen(false);
      } else toast.error(result.error);
    });
  }
  function handleActivate(id: string) {
    startTransition(async () => {
      await setActiveAcademicYear(id);
      toast.success("تم تفعيل السنة الدراسية");
    });
  }

  return (
    <div className="space-y-3">
      <Button onClick={openAdd} size="sm" className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        إضافة سنة دراسية
      </Button>
      {years.map((y) => (
        <Card key={y.id}>
          <CardContent className="flex items-center justify-between py-3.5">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                {y.label}
                {y.isActive && <Badge className="bg-primary text-primary-foreground">نشطة</Badge>}
              </div>
              <div className="text-xs text-muted-foreground">
                <Ltr>{formatShortDate(y.startDate)} – {formatShortDate(y.endDate)}</Ltr>
              </div>
            </div>
            <div className="flex items-center gap-1.5">
              {!y.isActive && (
                <Button variant="outline" size="sm" onClick={() => handleActivate(y.id)} disabled={pending}>
                  تفعيل
                </Button>
              )}
              <Button variant="ghost" size="icon" onClick={() => openEdit(y)}>
                <Pencil className="h-3.5 w-3.5" />
              </Button>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display font-normal">{form.id ? "تعديل السنة الدراسية" : "سنة دراسية جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>التسمية</Label>
              <Input value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} placeholder="2026/2027" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>البداية</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>النهاية</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={pending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SessionsSection({ sessions }: { sessions: { id: string; name: string; startTime: string; endTime: string }[] }) {
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ id: "", name: "", startTime: "", endTime: "" });

  function openEdit(s: { id: string; name: string; startTime: string; endTime: string }) {
    setForm(s);
    setDialogOpen(true);
  }
  function openAdd() {
    setForm({ id: "", name: "", startTime: "", endTime: "" });
    setDialogOpen(true);
  }
  function handleSave() {
    const fd = new FormData();
    if (form.id) fd.set("id", form.id);
    fd.set("name", form.name);
    fd.set("startTime", form.startTime);
    fd.set("endTime", form.endTime);
    startTransition(async () => {
      const result = await upsertSessionTemplate(fd);
      if (result.ok) {
        toast.success("تم الحفظ — سيظهر التغيير فورًا في الرئيسية والحضور");
        setDialogOpen(false);
      } else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <Button onClick={openAdd} size="sm" className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        إضافة حصة
      </Button>
      {sessions.map((s) => (
        <Card key={s.id}>
          <CardContent className="flex items-center justify-between py-3.5">
            <div>
              <div className="text-sm font-medium text-foreground">{s.name}</div>
              <div className="text-xs text-muted-foreground">
                <Ltr>{s.startTime} – {s.endTime}</Ltr>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => openEdit(s)}>
              <Pencil className="h-3.5 w-3.5" />
            </Button>
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display font-normal">{form.id ? "تعديل الحصة" : "حصة جديدة"}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>الاسم</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>البداية</Label>
                <Input type="time" value={form.startTime} onChange={(e) => setForm({ ...form, startTime: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>النهاية</Label>
                <Input type="time" value={form.endTime} onChange={(e) => setForm({ ...form, endTime: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={pending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function HolidaysSection({ holidays, academicYearId }: { holidays: Selectable<Holiday>[]; academicYearId?: string }) {
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", startDate: "", endDate: "", description: "" });

  function handleSave() {
    if (!academicYearId) {
      toast.error("أضف سنة دراسية أولًا");
      return;
    }
    const fd = new FormData();
    fd.set("academicYearId", academicYearId);
    fd.set("name", form.name);
    fd.set("startDate", form.startDate);
    fd.set("endDate", form.endDate);
    if (form.description) fd.set("description", form.description);
    startTransition(async () => {
      const result = await upsertHoliday(fd);
      if (result.ok) {
        toast.success("تمت إضافة العطلة");
        setDialogOpen(false);
        setForm({ name: "", startDate: "", endDate: "", description: "" });
      } else toast.error(result.error);
    });
  }
  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteHoliday(id);
      toast.success("تم الحذف");
    });
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        إضافة عطلة
      </Button>
      {holidays.map((h) => (
        <Card key={h.id}>
          <CardContent className="flex items-center justify-between py-3.5">
            <div>
              <div className="text-sm font-medium text-foreground">{h.name}</div>
              <div className="text-xs text-muted-foreground">
                <Ltr>{formatShortDate(h.startDate)} – {formatShortDate(h.endDate)}</Ltr>
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(h.id)} disabled={pending}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </CardContent>
        </Card>
      ))}
      {holidays.length === 0 && <p className="text-sm text-muted-foreground">لا توجد عطل مسجَّلة</p>}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display font-normal">عطلة جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>الاسم</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="عطلة الشتاء" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>البداية</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>النهاية</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>وصف (اختياري)</Label>
              <Textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={pending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CancellationsSection({
  cancellations,
  sessionTemplates,
}: {
  cancellations: CancellationRow[];
  sessionTemplates: { id: string; name: string }[];
}) {
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ sessionTemplateId: "", startDate: "", endDate: "", reason: "" });

  function handleSave() {
    const fd = new FormData();
    fd.set("sessionTemplateId", form.sessionTemplateId); // "" means "all sessions" — normalized server-side
    fd.set("startDate", form.startDate);
    fd.set("endDate", form.endDate);
    if (form.reason) fd.set("reason", form.reason);
    startTransition(async () => {
      const result = await upsertCancellation(fd);
      if (result.ok) {
        toast.success("تم إنشاء فترة الإلغاء");
        setDialogOpen(false);
        setForm({ sessionTemplateId: "", startDate: "", endDate: "", reason: "" });
      } else toast.error(result.error); // this is where the real DB exclusion-constraint rejection surfaces
    });
  }
  function handleDelete(id: string) {
    startTransition(async () => {
      await deleteCancellation(id);
      toast.success("تم الحذف");
    });
  }

  return (
    <div className="space-y-3">
      <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        إضافة فترة إلغاء
      </Button>
      {cancellations.map((c) => (
        <Card key={c.id}>
          <CardContent className="flex items-center justify-between py-3.5">
            <div>
              <div className="text-sm font-medium text-foreground">{c.sessionTemplateName ?? "كل الحصص"}</div>
              <div className="text-xs text-muted-foreground">
                <Ltr>{formatShortDate(c.startDate)} – {formatShortDate(c.endDate)}</Ltr>
                {c.reason && ` · ${c.reason}`}
              </div>
            </div>
            <Button variant="ghost" size="icon" onClick={() => handleDelete(c.id)} disabled={pending}>
              <Trash2 className="h-3.5 w-3.5 text-destructive" />
            </Button>
          </CardContent>
        </Card>
      ))}
      {cancellations.length === 0 && <p className="text-sm text-muted-foreground">لا توجد فترات إلغاء</p>}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display font-normal">فترة إلغاء جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>الحصة</Label>
              <Select value={form.sessionTemplateId || "all"} onValueChange={(v) => setForm({ ...form, sessionTemplateId: v === "all" ? "" : v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">كل الحصص</SelectItem>
                  {sessionTemplates.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>من</Label>
                <Input type="date" value={form.startDate} onChange={(e) => setForm({ ...form, startDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label>إلى</Label>
                <Input type="date" value={form.endDate} onChange={(e) => setForm({ ...form, endDate: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label>السبب (اختياري)</Label>
              <Input value={form.reason} onChange={(e) => setForm({ ...form, reason: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={pending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function BackupSection() {
  const [pending, startTransition] = useTransition();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingFile, setPendingFile] = useState<string | null>(null);
  const [lastResult, setLastResult] = useState<Record<string, number> | null>(null);

  function handleExport() {
    startTransition(async () => {
      const json = await exportBackup();
      const blob = new Blob([json], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `hifz-backup-${new Date().toISOString().slice(0, 10)}.json`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      toast.success("تم تصدير النسخة الاحتياطية");
    });
  }

  function handleFileSelected(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      setPendingFile(reader.result as string);
      setConfirmOpen(true);
    };
    reader.readAsText(file);
    e.target.value = ""; // allow re-selecting the same file later
  }

  function handleConfirmRestore() {
    if (!pendingFile) return;
    startTransition(async () => {
      const result = await restoreBackup(pendingFile);
      if (result.ok) {
        toast.success("تمت الاستعادة بنجاح");
        setLastResult(result.counts);
      } else {
        toast.error(result.error);
      }
      setConfirmOpen(false);
      setPendingFile(null);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="text-sm font-medium text-foreground">تصدير نسخة احتياطية</h2>
          <p className="text-xs text-muted-foreground">
            ملف JSON يحتوي بيانات التلاميذ والحضور والتسميع والتقييمات والتقويم الدراسي. لا يحتوي كلمات مرور أو أسرار الحساب.
          </p>
          <Button onClick={handleExport} disabled={pending} className="gap-1.5">
            <Download className="h-4 w-4" />
            تصدير الآن
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="text-sm font-medium text-foreground">استعادة من نسخة احتياطية</h2>
          <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
            <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
            <span>تستبدل الاستعادة جميع البيانات الحالية بمحتوى الملف المرفوع. هذا الإجراء لا رجعة فيه.</span>
          </div>
          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-border bg-background px-4 py-2 text-sm hover:border-accent">
            <Upload className="h-4 w-4" />
            اختر ملف النسخة الاحتياطية
            <input type="file" accept="application/json" className="hidden" onChange={handleFileSelected} />
          </label>

          {lastResult && (
            <div className="rounded-lg bg-muted p-3 text-xs text-muted-foreground">
              تمت استعادة: {Object.entries(lastResult).map(([k, v]) => `${k} (${v})`).join(" · ")}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display font-normal text-destructive">تأكيد الاستعادة</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-foreground">
            سيتم حذف جميع بيانات التلاميذ والحضور والتسميع الحالية واستبدالها بمحتوى هذا الملف. هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              إلغاء
            </Button>
            <Button variant="destructive" onClick={handleConfirmRestore} disabled={pending}>
              نعم، استبدل البيانات
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function MushafSection({ editions }: { editions: Selectable<MushafEdition>[] }) {
  const [pending, startTransition] = useTransition();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState({ name: "", publisher: "", edition: "", description: "" });

  function handleSave() {
    const fd = new FormData();
    fd.set("name", form.name);
    if (form.publisher) fd.set("publisher", form.publisher);
    if (form.edition) fd.set("edition", form.edition);
    if (form.description) fd.set("description", form.description);
    startTransition(async () => {
      const result = await createMushafEdition(fd);
      if (result.ok) {
        toast.success("تمت الإضافة");
        setDialogOpen(false);
      } else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-xs text-muted-foreground">
        بيانات الصفحات والأثمان تبقى غير متوفرة حتى استيراد مصدر موثوق لرواية ورش عن نافع — راجع docs/QURAN_DATA_SOURCE.md
      </div>
      <Button onClick={() => setDialogOpen(true)} size="sm" className="gap-1.5">
        <Plus className="h-3.5 w-3.5" />
        إضافة طبعة
      </Button>
      {editions.map((e) => (
        <Card key={e.id}>
          <CardContent className="flex items-center justify-between py-3.5">
            <div>
              <div className="flex items-center gap-2 text-sm font-medium text-foreground">
                {e.name}
                {e.isDefault && <Star className="h-3.5 w-3.5 fill-accent text-accent" />}
              </div>
              <div className="text-xs text-muted-foreground">
                {e.riwayah} {e.publisher && `· ${e.publisher}`}
              </div>
              <Badge variant="outline" className="mt-1 text-[10px] text-muted-foreground">
                {e.isVerified ? "بيانات موثوقة" : "بيانات الصفحات/الأثمان غير موثوقة بعد"}
              </Badge>
            </div>
          </CardContent>
        </Card>
      ))}

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display font-normal">طبعة مصحف جديدة</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>الاسم</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="ورش عن نافع" />
            </div>
            <div className="space-y-1.5">
              <Label>الناشر (اختياري)</Label>
              <Input value={form.publisher} onChange={(e) => setForm({ ...form, publisher: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSave} disabled={pending}>
              حفظ
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
