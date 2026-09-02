"use client";

import { useActionState, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ChevronRight, ChevronLeft, Loader2 } from "lucide-react";
import { completeSetup, type SetupFormState } from "./actions";

const STEPS = ["الأستاذ", "الحساب", "السنة الدراسية", "أوقات الحصص", "مراجعة"] as const;

const initialState: SetupFormState = {};

export function SetupWizard() {
  const [step, setStep] = useState(0);
  const [state, formAction, pending] = useActionState(completeSetup, initialState);

  const [form, setForm] = useState({
    teacherName: "",
    teacherPhone: "",
    halaqaName: "",
    email: "",
    password: "",
    academicYearLabel: "2026/2027",
    academicYearStart: "2026-09-21",
    academicYearEnd: "2027-06-30",
    session1Start: "05:30",
    session1End: "07:00",
    session2Start: "18:00",
    session2End: "20:00",
  });

  function update<K extends keyof typeof form>(key: K, value: (typeof form)[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function canAdvance() {
    if (step === 0) return form.teacherName.trim().length >= 2;
    if (step === 1) return form.email.includes("@") && form.password.length >= 8;
    if (step === 2) return form.academicYearLabel.trim().length > 0;
    return true;
  }

  return (
    <Card>
      <CardContent className="space-y-5 py-6">
        <div className="flex items-center justify-center gap-1.5">
          {STEPS.map((label, i) => (
            <div
              key={label}
              className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-primary" : "bg-muted"}`}
              title={label}
            />
          ))}
        </div>
        <p className="text-center text-xs text-muted-foreground">
          الخطوة {step + 1} من {STEPS.length} — {STEPS[step]}
        </p>

        <form action={formAction} className="space-y-4">
          {/* hidden fields carry every step's data so the final submit has it all */}
          {Object.entries(form).map(([k, v]) => (
            <input key={k} type="hidden" name={k} value={v} />
          ))}

          {step === 0 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="teacherName">اسم الأستاذ</Label>
                <Input id="teacherName" value={form.teacherName} onChange={(e) => update("teacherName", e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="teacherPhone">رقم الهاتف (اختياري)</Label>
                <Input id="teacherPhone" dir="ltr" value={form.teacherPhone} onChange={(e) => update("teacherPhone", e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="halaqaName">اسم الحلقة أو المسجد (اختياري)</Label>
                <Input id="halaqaName" value={form.halaqaName} onChange={(e) => update("halaqaName", e.target.value)} />
              </div>
            </div>
          )}

          {step === 1 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="email">البريد الإلكتروني</Label>
                <Input id="email" type="email" dir="ltr" value={form.email} onChange={(e) => update("email", e.target.value)} autoFocus />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="password">كلمة المرور (8 أحرف على الأقل)</Label>
                <Input id="password" type="password" value={form.password} onChange={(e) => update("password", e.target.value)} />
              </div>
            </div>
          )}

          {step === 2 && (
            <div className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="academicYearLabel">السنة الدراسية</Label>
                <Input id="academicYearLabel" value={form.academicYearLabel} onChange={(e) => update("academicYearLabel", e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1.5">
                  <Label htmlFor="academicYearStart">تاريخ البداية</Label>
                  <Input id="academicYearStart" type="date" value={form.academicYearStart} onChange={(e) => update("academicYearStart", e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="academicYearEnd">تاريخ النهاية</Label>
                  <Input id="academicYearEnd" type="date" value={form.academicYearEnd} onChange={(e) => update("academicYearEnd", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-4">
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">الحصة الأولى</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="time" value={form.session1Start} onChange={(e) => update("session1Start", e.target.value)} />
                  <Input type="time" value={form.session1End} onChange={(e) => update("session1End", e.target.value)} />
                </div>
              </div>
              <div>
                <p className="mb-2 text-sm font-medium text-foreground">الحصة الثانية</p>
                <div className="grid grid-cols-2 gap-3">
                  <Input type="time" value={form.session2Start} onChange={(e) => update("session2Start", e.target.value)} />
                  <Input type="time" value={form.session2End} onChange={(e) => update("session2End", e.target.value)} />
                </div>
              </div>
            </div>
          )}

          {step === 4 && (
            <div className="space-y-2 rounded-lg bg-muted p-4 text-sm">
              <Row label="الأستاذ" value={form.teacherName} />
              <Row label="البريد الإلكتروني" value={form.email} ltr />
              <Row label="السنة الدراسية" value={form.academicYearLabel} />
              <Row label="الحصة الأولى" value={`${form.session1Start} – ${form.session1End}`} ltr />
              <Row label="الحصة الثانية" value={`${form.session2Start} – ${form.session2End}`} ltr />
            </div>
          )}

          {state.error && <p className="text-sm text-destructive">{state.error}</p>}

          <div className="flex items-center justify-between pt-2">
            <Button type="button" variant="outline" disabled={step === 0} onClick={() => setStep((s) => s - 1)} className="gap-1.5">
              <ChevronRight className="h-4 w-4" />
              السابق
            </Button>

            {step < STEPS.length - 1 ? (
              <Button type="button" disabled={!canAdvance()} onClick={() => setStep((s) => s + 1)} className="gap-1.5">
                التالي
                <ChevronLeft className="h-4 w-4" />
              </Button>
            ) : (
              <Button type="submit" disabled={pending} className="gap-1.5">
                {pending && <Loader2 className="h-4 w-4 animate-spin" />}
                إنشاء النظام
              </Button>
            )}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function Row({ label, value, ltr }: { label: string; value: string; ltr?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-muted-foreground">{label}</span>
      <span dir={ltr ? "ltr" : undefined} className="font-medium text-foreground">
        {value}
      </span>
    </div>
  );
}
