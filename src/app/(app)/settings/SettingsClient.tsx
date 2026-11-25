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
import { Plus, Trash2, Pencil, Download, Upload, TriangleAlert } from "lucide-react";
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
  createHalaqa,
  createTeacherAccount,
  assignTeacherToHalaqa,
} from "./actions";
import { exportBackup, restoreBackup } from "./backup/actions";
import type { Selectable } from "kysely";
import type { TeacherProfile, AcademicYear, Holiday } from "@/lib/db/types";

interface CancellationRow {
  id: string;
  sessionTemplateId: string | null;
  sessionTemplateName: string | null;
  startDate: string;
  endDate: string;
  reason: string | null;
}

export function SettingsClient({
  isAdmin,
  teacher,
  academicYears,
  sessionTemplates,
  holidays,
  cancellations,
  halaqas,
  teachers,
}: {
  isAdmin: boolean;
  teacher: Selectable<TeacherProfile> | undefined;
  academicYears: Selectable<AcademicYear>[];
  sessionTemplates: { id: string; name: string; startTime: string; endTime: string }[];
  holidays: Selectable<Holiday>[];
  cancellations: CancellationRow[];
  halaqas: { id: string; name: string }[];
  teachers: { userId: string; fullName: string; email: string; halaqaId: string | null; halaqaName: string | null }[];
}) {
  return (
    <div className="space-y-5">
      <h1 className="font-display text-2xl text-foreground">الإعدادات</h1>
      <Tabs defaultValue="profile" dir="rtl">
        <TabsList className="flex-wrap">
          <TabsTrigger value="profile">الأستاذ</TabsTrigger>
          {isAdmin && (
            <>
              <TabsTrigger value="groups">الحلقات والمعلمون</TabsTrigger>
              <TabsTrigger value="year">السنة الدراسية</TabsTrigger>
              <TabsTrigger value="sessions">الحصص</TabsTrigger>
              <TabsTrigger value="holidays">العطل</TabsTrigger>
              <TabsTrigger value="cancellations">فترات الإلغاء</TabsTrigger>
              <TabsTrigger value="backup">النسخ الاحتياطي</TabsTrigger>
            </>
          )}
        </TabsList>

        <TabsContent value="profile" className="mt-4">
          <ProfileSection teacher={teacher} />
        </TabsContent>
        {isAdmin && (
          <TabsContent value="groups" className="mt-4">
            <HalaqasSection halaqas={halaqas} teachers={teachers} />
          </TabsContent>
        )}
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
        <TabsContent value="backup" className="mt-4">
          <BackupSection />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function HalaqasSection({
  halaqas,
  teachers,
}: {
  halaqas: { id: string; name: string }[];
  teachers: { userId: string; fullName: string; email: string; halaqaId: string | null; halaqaName: string | null }[];
}) {
  const [pending, startTransition] = useTransition();
  const [groupName, setGroupName] = useState("");
  const [teacherForm, setTeacherForm] = useState({
    fullName: "",
    email: "",
    password: "",
    halaqaId: halaqas[0]?.id ?? "",
    role: "TEACHER",
  });
  const [assignments, setAssignments] = useState<Record<string, string>>({});

  function submitGroup() {
    const formData = new FormData();
    formData.set("name", groupName);
    startTransition(async () => {
      const result = await createHalaqa(formData);
      if (result.ok) {
        toast.success("تم إنشاء الحلقة");
        setGroupName("");
      } else toast.error(result.error);
    });
  }

  function submitTeacher() {
    const formData = new FormData();
    Object.entries(teacherForm).forEach(([key, value]) => formData.set(key, value));
    startTransition(async () => {
      const result = await createTeacherAccount(formData);
      if (result.ok) {
        toast.success("تم إنشاء حساب المعلم");
        setTeacherForm({ fullName: "", email: "", password: "", halaqaId: halaqas[0]?.id ?? "", role: "TEACHER" });
      } else toast.error(result.error);
    });
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="text-sm font-medium text-foreground">إضافة حلقة</h2>
          <div className="flex gap-2">
            <Input value={groupName} onChange={(event) => setGroupName(event.target.value)} placeholder="اسم الحلقة" />
            <Button onClick={submitGroup} disabled={pending || groupName.trim().length < 2}>إضافة</Button>
          </div>
          <ul className="space-y-1 text-sm text-muted-foreground">
            {halaqas.map((halaqa) => <li key={halaqa.id}>{halaqa.name}</li>)}
          </ul>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="text-sm font-medium text-foreground">إنشاء حساب معلم</h2>
          <Input value={teacherForm.fullName} onChange={(event) => setTeacherForm({ ...teacherForm, fullName: event.target.value })} placeholder="اسم المعلم" />
          <Input type="email" dir="ltr" value={teacherForm.email} onChange={(event) => setTeacherForm({ ...teacherForm, email: event.target.value })} placeholder="البريد الإلكتروني" />
          <Input type="password" dir="ltr" value={teacherForm.password} onChange={(event) => setTeacherForm({ ...teacherForm, password: event.target.value })} placeholder="كلمة المرور (8 أحرف على الأقل)" />
          <select
            value={teacherForm.role}
            onChange={(event) => setTeacherForm({ ...teacherForm, role: event.target.value })}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            <option value="TEACHER">معلم</option>
            <option value="ADMIN">مسؤول</option>
          </select>
          <select
            value={teacherForm.halaqaId}
            onChange={(event) => setTeacherForm({ ...teacherForm, halaqaId: event.target.value })}
            className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
          >
            {halaqas.map((halaqa) => <option key={halaqa.id} value={halaqa.id}>{halaqa.name}</option>)}
          </select>
          <Button onClick={submitTeacher} disabled={pending || !teacherForm.halaqaId || teacherForm.fullName.trim().length < 2 || teacherForm.password.length < 8}>
            إنشاء الحساب
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="space-y-3 py-5">
          <h2 className="text-sm font-medium text-foreground">المعلمون وتوزيع الحلقات</h2>
          {teachers.map((teacher) => (
            <div key={`${teacher.userId}:${teacher.halaqaId ?? "none"}`} className="flex flex-wrap items-center justify-between gap-2 border-b border-border py-2 text-sm">
              <span>{teacher.fullName} <span className="text-muted-foreground">({teacher.email})</span></span>
              <span className="text-xs text-muted-foreground">{teacher.halaqaName ?? "غير معيّن"}</span>
              <div className="flex gap-2">
                <select
                  value={assignments[teacher.userId] ?? halaqas[0]?.id ?? ""}
                  onChange={(event) => setAssignments({ ...assignments, [teacher.userId]: event.target.value })}
                  className="h-9 rounded-md border border-input bg-background px-2 text-xs text-foreground"
                >
                  {halaqas.map((halaqa) => <option key={halaqa.id} value={halaqa.id}>{halaqa.name}</option>)}
                </select>
                <Button
                  size="sm"
                  variant="outline"
                  disabled={pending || !halaqas.length}
                  onClick={() => startTransition(async () => {
                    const result = await assignTeacherToHalaqa(teacher.userId, assignments[teacher.userId] ?? halaqas[0]?.id ?? "");
                    if (result.ok) toast.success("تم ربط المعلم بالحلقة");
                    else toast.error(result.error);
                  })}
                >
                  ربط
                </Button>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
}

function ProfileSection({ teacher }: { teacher: Selectable<TeacherProfile> | undefined }) {
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({ fullName: teacher?.fullName ?? "", phone: teacher?.phone ?? "" });

  function handleSave() {
    const fd = new FormData();
    fd.set("fullName", form.fullName);
    if (form.phone) fd.set("phone", form.phone);
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
            ملف JSON يحتوي بيانات التلاميذ والحضور والحلقات والتقويم الدراسي. لا يحتوي كلمات مرور أو أسرار الحساب.
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
            سيتم حذف جميع بيانات التلاميذ والحضور والحلقات الحالية واستبدالها بمحتوى هذا الملف. هذا الإجراء لا يمكن التراجع عنه. هل أنت متأكد؟
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
