"use client";

import { useMemo, useState, useTransition } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Plus, Search, MoreVertical, Phone, ArchiveRestore, Archive } from "lucide-react";
import { Ltr } from "@/components/Ltr";
import { upsertStudent, archiveStudent, restoreStudent } from "./actions";
import type { Selectable } from "kysely";
import type { Student as StudentTable } from "@/lib/db/types";

type Student = Selectable<StudentTable>;

const EMPTY_FORM = {
  id: "",
  fullName: "",
  halaqaId: "",
  birthDate: "",
  birthPlace: "",
  address: "",
  guardianName: "",
  guardianPhone: "",
};

export function StudentsClient({
  initialStudents,
  halaqas,
}: {
  initialStudents: Student[];
  halaqas: { id: string; name: string }[];
}) {
  const [query, setQuery] = useState("");
  const [showArchived, setShowArchived] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(EMPTY_FORM);
  const [pending, startTransition] = useTransition();

  const visible = useMemo(() => {
    return initialStudents.filter((s) => (showArchived ? !s.isActive : s.isActive) && s.fullName.includes(query.trim()));
  }, [initialStudents, showArchived, query]);

  function openAdd() {
    setForm({ ...EMPTY_FORM, halaqaId: halaqas[0]?.id ?? "" });
    setDialogOpen(true);
  }

  function openEdit(s: Student) {
    setForm({
      id: s.id,
      fullName: s.fullName,
      halaqaId: s.halaqaId ?? halaqas[0]?.id ?? "",
      birthDate: s.birthDate ?? "",
      birthPlace: s.birthPlace ?? "",
      address: s.address ?? "",
      guardianName: s.guardianName ?? "",
      guardianPhone: s.guardianPhone ?? "",
    });
    setDialogOpen(true);
  }

  function handleSubmit() {
    const fd = new FormData();
    Object.entries(form).forEach(([k, v]) => v && fd.set(k, v));
    startTransition(async () => {
      const result = await upsertStudent(fd);
      if (result.ok) {
        toast.success(form.id ? "تم تحديث بيانات الطالب" : "تمت إضافة الطالب");
        setDialogOpen(false);
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleArchive(id: string) {
    startTransition(async () => {
      await archiveStudent(id);
      toast.success("تمت أرشفة الطالب — تبقى سجلاته التاريخية محفوظة");
    });
  }

  function handleRestore(id: string) {
    startTransition(async () => {
      await restoreStudent(id);
      toast.success("تمت استعادة الطالب");
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="font-display text-2xl text-foreground">الطلاب</h1>
          <p className="text-sm text-muted-foreground">
            {initialStudents.filter((s) => s.isActive).length} طالبًا نشطًا
            {initialStudents.some((s) => !s.isActive) && ` · ${initialStudents.filter((s) => !s.isActive).length} مؤرشف`}
          </p>
        </div>
        <Button onClick={openAdd} className="gap-1.5">
          <Plus className="h-4 w-4" />
          إضافة طالب
        </Button>
      </div>

      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input placeholder="ابحث بالاسم..." value={query} onChange={(e) => setQuery(e.target.value)} className="pe-9" />
        </div>
        <Button variant={showArchived ? "default" : "outline"} onClick={() => setShowArchived((v) => !v)} className="shrink-0 gap-1.5">
          <Archive className="h-4 w-4" />
          الأرشيف
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((student) => (
          <Card key={student.id} className={!student.isActive ? "opacity-70" : ""}>
            <CardContent className="flex items-start justify-between gap-3 py-4">
              <div className="flex items-start gap-3">
                <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-secondary-foreground">
                  {student.fullName.charAt(0)}
                </div>
                <div className="space-y-1">
                  <div className="text-sm font-medium text-foreground">{student.fullName}</div>
                  <div className="text-xs text-muted-foreground">
                    {halaqas.find((halaqa) => halaqa.id === student.halaqaId)?.name}
                  </div>
                  {student.guardianPhone && (
                    <div className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Phone className="h-3 w-3" />
                      <Ltr>{student.guardianPhone}</Ltr>
                    </div>
                  )}
                  {!student.isActive && (
                    <Badge variant="outline" className="text-[11px] text-muted-foreground">
                      مؤرشف
                    </Badge>
                  )}
                </div>
              </div>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="rounded-md p-1.5 text-muted-foreground hover:bg-secondary">
                    <MoreVertical className="h-4 w-4" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  {student.isActive ? (
                    <>
                      <DropdownMenuItem onClick={() => openEdit(student)}>تعديل</DropdownMenuItem>
                      <DropdownMenuItem onClick={() => handleArchive(student.id)} className="text-destructive">
                        <Archive className="me-2 h-4 w-4" />
                        أرشفة
                      </DropdownMenuItem>
                    </>
                  ) : (
                    <DropdownMenuItem onClick={() => handleRestore(student.id)}>
                      <ArchiveRestore className="me-2 h-4 w-4" />
                      استعادة
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </CardContent>
          </Card>
        ))}
        {visible.length === 0 && (
          <div className="col-span-2 space-y-2 py-10 text-center">
            <p className="text-sm text-muted-foreground">
              {showArchived ? "لا يوجد طلاب مؤرشفون" : "لم تتم إضافة أي طالب بعد"}
            </p>
            {!showArchived && (
              <Button variant="outline" size="sm" onClick={openAdd} className="gap-1.5">
                <Plus className="h-3.5 w-3.5" />
                إضافة طالب
              </Button>
            )}
          </div>
        )}
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-display font-normal">{form.id ? "تعديل بيانات الطالب" : "إضافة طالب جديد"}</DialogTitle>
          </DialogHeader>
          <div className="max-h-[60vh] space-y-3 overflow-y-auto">
            <div className="space-y-1.5">
              <Label htmlFor="fullName">الاسم الكامل</Label>
              <Input id="fullName" value={form.fullName} onChange={(e) => setForm({ ...form, fullName: e.target.value })} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="studentHalaqa">الحلقة</Label>
              <select
                id="studentHalaqa"
                value={form.halaqaId}
                onChange={(e) => setForm({ ...form, halaqaId: e.target.value })}
                className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground"
                disabled={halaqas.length < 2}
              >
                {halaqas.map((halaqa) => (
                  <option key={halaqa.id} value={halaqa.id}>
                    {halaqa.name}
                  </option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="birthDate">تاريخ الميلاد</Label>
                <Input id="birthDate" type="date" value={form.birthDate} onChange={(e) => setForm({ ...form, birthDate: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="birthPlace">مكان الميلاد</Label>
                <Input id="birthPlace" value={form.birthPlace} onChange={(e) => setForm({ ...form, birthPlace: e.target.value })} />
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="address">العنوان</Label>
              <Input id="address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label htmlFor="guardianName">اسم ولي الأمر</Label>
                <Input id="guardianName" value={form.guardianName} onChange={(e) => setForm({ ...form, guardianName: e.target.value })} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="guardianPhone">هاتف ولي الأمر</Label>
                <Input id="guardianPhone" dir="ltr" value={form.guardianPhone} onChange={(e) => setForm({ ...form, guardianPhone: e.target.value })} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button onClick={handleSubmit} disabled={pending || form.fullName.trim().length < 2}>
              {form.id ? "حفظ التعديلات" : "إضافة"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
