"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCheck, Search, TriangleAlert, Users, Loader2, Clock3 } from "lucide-react";
import { Ltr } from "@/components/Ltr";
import { StatusToggle } from "@/components/StatusToggle";
import { formatFullDate } from "@/lib/domain";
import { getLocalTodayISO } from "@/lib/business/date";
import { recordTeacherAttendance, recordStudentAttendance, markAllPresent } from "./actions";
import type { Selectable } from "kysely";
import type { Student, StudentAttendance } from "@/lib/db/types";
import type { DailySessionState } from "@/lib/business/session-state";

type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT";
type AttendanceFilter = "ALL" | AttendanceStatus | "UNMARKED";

const FILTERS: { value: AttendanceFilter; label: string }[] = [
  { value: "ALL", label: "الكل" },
  { value: "PRESENT", label: "حاضر" },
  { value: "ABSENT", label: "غائب" },
  { value: "LATE", label: "متأخر" },
  { value: "UNMARKED", label: "غير مسجل" },
];

function subscribeToNoChanges() {
  return () => {};
}

const STATE_MESSAGE: Partial<Record<DailySessionState, string>> = {
  NOT_SCHOOL_DAY: "هذا اليوم خارج السنة الدراسية — لا يمكن تسجيل الحضور.",
  HOLIDAY: "هذا اليوم عطلة — لا يمكن تسجيل الحضور.",
  CANCELLED: "هذه الحصة ملغاة لهذه الفترة — لا يمكن تسجيل الحضور.",
};

interface SessionTemplateInfo {
  id: string;
  name: string;
  startTime: string;
  endTime: string;
}

export function AttendanceClient({
  date,
  period,
  hasExplicitDate,
  sessionTemplates,
  activeSessionId,
  state,
  teacherStatus,
  students,
  existingRecords,
}: {
  date: string;
  period: 1 | 2;
  hasExplicitDate: boolean;
  sessionTemplates: SessionTemplateInfo[];
  activeSessionId: string;
  state: DailySessionState;
  teacherStatus: "PRESENT" | "ABSENT" | null;
  students: Selectable<Student>[];
  existingRecords: Selectable<StudentAttendance>[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<AttendanceFilter>("ALL");
  const getDisplayedDate = useCallback(
    () => (hasExplicitDate ? date : getLocalTodayISO()),
    [date, hasExplicitDate]
  );
  const displayedDate = useSyncExternalStore(subscribeToNoChanges, getDisplayedDate, () => date);
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [optimisticArrivalTimes, setOptimisticArrivalTimes] = useState<Record<string, string>>({});
  const [savingStudents, setSavingStudents] = useState<Record<string, boolean>>({});
  const studentWrites = useRef(new Map<string, Promise<void>>());
  const requestSequences = useRef(new Map<string, number>());
  const bulkInFlight = useRef(false);

  const activeSession = sessionTemplates.find((s) => s.id === activeSessionId)!;
  const recordsByStudent = useMemo(() => new Map(existingRecords.map((r) => [r.studentId, r])), [existingRecords]);
  const pendingStatuses = useMemo(() => {
    const pending: Record<string, AttendanceStatus> = {};
    for (const [studentId, status] of Object.entries(optimisticStatuses)) {
      if (recordsByStudent.get(studentId)?.status !== status) pending[studentId] = status;
    }
    return pending;
  }, [optimisticStatuses, recordsByStudent]);
  const attendanceLocked = state !== "TEACHER_PRESENT";
  const canConfirmAttendance = STATE_MESSAGE[state] === undefined;

  const statusForStudent = (studentId: string): AttendanceStatus | null =>
    pendingStatuses[studentId] ?? recordsByStudent.get(studentId)?.status ?? null;
  const filteredStudents = useMemo(
    () =>
      students.filter((student) => {
        const status = pendingStatuses[student.id] ?? recordsByStudent.get(student.id)?.status ?? null;
        const matchesQuery = student.fullName.includes(query.trim());
        const matchesFilter =
          filter === "ALL" ||
          (filter === "UNMARKED" ? status === null : status === filter);
        return matchesQuery && matchesFilter;
      }),
    [students, query, filter, pendingStatuses, recordsByStudent]
  );
  const visibleCounts = useMemo(() => {
    return students.reduce(
      (counts, student) => {
        const status = pendingStatuses[student.id] ?? recordsByStudent.get(student.id)?.status;
        if (!status) {
          counts.UNMARKED++;
          return counts;
        }
        counts[status]++;
        return counts;
      },
      { PRESENT: 0, LATE: 0, ABSENT: 0, UNMARKED: 0 }
    );
  }, [students, pendingStatuses, recordsByStudent]);

  useEffect(() => {
    if (!hasExplicitDate) {
      const localToday = getLocalTodayISO();
      router.replace(`/attendance?session=${activeSessionId}&date=${localToday}&period=${period}`, { scroll: false });
    }
  }, [activeSessionId, hasExplicitDate, period, router]);

  function setTeacher(status: "PRESENT" | "ABSENT") {
    const fd = new FormData();
    fd.set("sessionDate", displayedDate);
    fd.set("sessionTemplateId", activeSessionId);
    fd.set("period", String(period));
    fd.set("status", status);
    startTransition(async () => {
      try {
        const result = await recordTeacherAttendance(fd);
        if (result.ok) {
          toast.success(status === "PRESENT" ? "تم تسجيل حضور المعلم" : "تم تسجيل غياب المعلم");
          router.refresh();
        } else {
          toast.error(result.error);
        }
      } catch {
        toast.error("تعذّر حفظ حضور المعلم");
      }
    });
  }

  function setStudentStatus(studentId: string, status: AttendanceStatus) {
    const sequence = (requestSequences.current.get(studentId) ?? 0) + 1;
    requestSequences.current.set(studentId, sequence);
    setOptimisticStatuses((current) => ({ ...current, [studentId]: status }));
    setSavingStudents((current) => ({ ...current, [studentId]: true }));
    if (status !== "LATE") {
      setOptimisticArrivalTimes((current) => {
        const next = { ...current };
        delete next[studentId];
        return next;
      });
    }

    const fd = new FormData();
    fd.set("studentId", studentId);
    fd.set("sessionDate", displayedDate);
    fd.set("sessionTemplateId", activeSessionId);
    fd.set("period", String(period));
    fd.set("status", status);

    const previousWrite = studentWrites.current.get(studentId) ?? Promise.resolve();
    const write = previousWrite.catch(() => undefined).then(async () => {
      const result = await recordStudentAttendance(fd);
      if (!result.ok) throw new Error(result.error);
      if (
        status === "LATE" &&
        result.arrivalTime &&
        requestSequences.current.get(studentId) === sequence
      ) {
        setOptimisticArrivalTimes((current) => ({ ...current, [studentId]: result.arrivalTime! }));
      }
    });
    studentWrites.current.set(studentId, write);

    void write
      .then(
        () => {
          if (requestSequences.current.get(studentId) === sequence) {
            setSavingStudents((current) => ({ ...current, [studentId]: false }));
            toast.success("تم حفظ الحالة", { duration: 1200 });
            router.refresh();
          }
        },
        (error: unknown) => {
          if (requestSequences.current.get(studentId) === sequence) {
            setSavingStudents((current) => ({ ...current, [studentId]: false }));
            toast.error(error instanceof Error ? error.message : "تعذّر حفظ حالة التلميذ");
            setOptimisticStatuses((current) => {
              const next = { ...current };
              delete next[studentId];
              return next;
            });
            router.refresh();
          }
        }
      )
      .finally(() => {
        if (studentWrites.current.get(studentId) === write) studentWrites.current.delete(studentId);
      });
  }

  function handleMarkAllPresent() {
    if (bulkInFlight.current) return;
    bulkInFlight.current = true;
    startTransition(async () => {
      try {
        const result = await markAllPresent(displayedDate, activeSessionId, period);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        if (result.activeCount === 0) {
          toast.info("تم تأكيد حضورك؛ لا يوجد تلاميذ نشطون.");
        } else {
          toast.success(
            `تم تأكيد حضورك. حُضّر ${result.preparedCount ?? 0} وأُبقيت حالة ${result.preservedCount ?? 0} مسجلاً دون تغيير.`
          );
        }
        router.refresh();
      } catch {
        toast.error("تعذّر تأكيد الحضور وتحضير التلاميذ");
      } finally {
        bulkInFlight.current = false;
      }
    });
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-4 shadow-sm sm:flex-row sm:items-end sm:justify-between sm:p-5">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{formatFullDate(displayedDate)}</p>
          <h1 className="font-display text-2xl font-semibold text-foreground">الحضور اليومي</h1>
          <p className="text-sm text-muted-foreground">{students.length} تلميذاً نشطاً في هذه الحلقة</p>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            aria-label="تاريخ الحضور"
            type="date"
            value={displayedDate}
            onChange={(event) => {
              if (event.target.value) {
                router.push(`/attendance?session=${activeSessionId}&date=${event.target.value}&period=${period}`);
              }
            }}
            className="h-11 rounded-xl sm:w-44"
          />
          {canConfirmAttendance && (
            <Button onClick={handleMarkAllPresent} disabled={pending} className="min-h-11 gap-2 whitespace-nowrap rounded-xl shadow-sm transition-all duration-150">
              {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />}
              {pending ? "جارٍ التحضير..." : "تأكيد حضوري وتحضير الجميع"}
            </Button>
          )}
        </div>
      </div>

      {sessionTemplates.length > 1 && (
        <Tabs value={activeSessionId} onValueChange={(v) => router.push(`/attendance?session=${v}&date=${displayedDate}&period=${period}`)}>
          <TabsList className="h-auto rounded-xl bg-secondary/70 p-1">
            {sessionTemplates.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <div className="space-y-2">
        <p className="text-sm font-medium text-foreground">فترة التسجيل</p>
        <Tabs
          value={String(period)}
          onValueChange={(value) => router.push(`/attendance?session=${activeSessionId}&date=${displayedDate}&period=${value}`)}
        >
          <TabsList className="h-auto rounded-xl bg-secondary/70 p-1">
            <TabsTrigger value="1" className="min-h-10 px-5">الحصة الأولى</TabsTrigger>
            <TabsTrigger value="2" className="min-h-10 px-5">الحصة الثانية</TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground">الحالة المعروضة والحفظ الجماعي يخصان هذه الحصة فقط.</p>
      </div>
      <p className="flex items-center gap-2 text-sm text-muted-foreground">
        <Clock3 className="h-4 w-4" />
        <Ltr>{activeSession.startTime} – {activeSession.endTime}</Ltr>
      </p>

      <Card className="rounded-2xl border-border/80 shadow-sm">
        <CardContent className="space-y-4 py-5">
          {STATE_MESSAGE[state] ? (
            <div className="flex items-center gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              <TriangleAlert className="h-4 w-4 shrink-0" />
              {STATE_MESSAGE[state]}
            </div>
          ) : (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <span className="text-sm font-medium text-foreground">حضور المعلم</span>
              <StatusToggle
                value={teacherStatus === "ABSENT" ? "absent" : "present"}
                onChange={(v) => setTeacher(v === "absent" ? "ABSENT" : "PRESENT")}
                disabled={pending}
              />
            </div>
          )}
          {teacherStatus === "ABSENT" && (
            <div className="flex items-start gap-2 rounded-lg bg-destructive/10 p-3 text-xs text-destructive">
              <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0" />
              <span>الأستاذ غائب — تم تعطيل تسجيل حضور التلاميذ لهذه الحصة.</span>
            </div>
          )}
        </CardContent>
      </Card>

      {!attendanceLocked && (
        <>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
            {[
              { label: "إجمالي الطلاب", value: students.length, color: "text-foreground", icon: Users },
              { label: "حاضر", value: visibleCounts.PRESENT, percent: students.length ? Math.round((visibleCounts.PRESENT / students.length) * 100) : 0, color: "text-emerald-700 dark:text-emerald-400" },
              { label: "غائب", value: visibleCounts.ABSENT, percent: students.length ? Math.round((visibleCounts.ABSENT / students.length) * 100) : 0, color: "text-rose-700 dark:text-rose-400" },
              { label: "متأخر", value: visibleCounts.LATE, percent: students.length ? Math.round((visibleCounts.LATE / students.length) * 100) : 0, color: "text-amber-700 dark:text-amber-400" },
              { label: "غير مسجل", value: visibleCounts.UNMARKED, percent: students.length ? Math.round((visibleCounts.UNMARKED / students.length) * 100) : 0, color: "text-muted-foreground" },
            ].map((metric) => (
              <Card key={metric.label} className="rounded-2xl border-border/80 shadow-sm">
                <CardContent className="flex items-center justify-between gap-2 py-3 sm:block sm:py-4">
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-muted-foreground">{metric.label}</span>
                    {"percent" in metric && <span className="text-[11px] tabular-nums text-muted-foreground">{metric.percent}%</span>}
                  </div>
                  <span className={`font-display text-2xl font-semibold tabular-nums ${metric.color}`}>{metric.value}</span>
                </CardContent>
              </Card>
            ))}
          </div>

          <div className="space-y-3 rounded-2xl border border-border/80 bg-card p-3 shadow-sm sm:p-4">
            <div className="relative">
              <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input placeholder="ابحث عن اسم تلميذ..." value={query} onChange={(e) => setQuery(e.target.value)} className="h-11 rounded-xl pe-9" />
            </div>
            <div className="flex gap-2 overflow-x-auto pb-1">
              {FILTERS.map((item) => (
                <button
                  type="button"
                  key={item.value}
                  aria-pressed={filter === item.value}
                  onClick={() => setFilter(item.value)}
                  className={`min-h-10 shrink-0 rounded-full border px-4 text-xs font-medium transition-all duration-150 ${
                    filter === item.value
                      ? "border-primary bg-primary text-primary-foreground shadow-sm"
                      : "border-border/80 bg-background text-muted-foreground hover:bg-secondary"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5">
            {filteredStudents.map((student) => {
              const record = recordsByStudent.get(student.id);
              const status = statusForStudent(student.id);
              const arrivalTime =
                optimisticArrivalTimes[student.id]?.slice(0, 5) ??
                (status === "LATE" ? record?.arrivalTime?.toString().slice(0, 5) : undefined);

              return (
                <Card key={student.id} className={`rounded-2xl border-border/80 shadow-sm transition-all duration-150 hover:border-primary/20 hover:shadow-md ${status === "PRESENT" ? "border-s-4 border-s-emerald-500" : status === "ABSENT" ? "border-s-4 border-s-rose-500" : status === "LATE" ? "border-s-4 border-s-amber-500" : ""}`}>
                  <CardContent className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-secondary font-display text-sm text-secondary-foreground">
                        {student.fullName.charAt(0)}
                      </div>
                      <div className="min-w-0">
                        <span className="block truncate text-sm font-semibold text-foreground">{student.fullName}</span>
                        {status === null && <span className="text-xs text-muted-foreground">لم تُسجّل الحالة بعد</span>}
                      </div>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 sm:justify-end">
                      <StatusToggle
                        value={status === "PRESENT" ? "present" : status === "LATE" ? "late" : status === "ABSENT" ? "absent" : null}
                        onChange={(value) =>
                          setStudentStatus(student.id, value === "present" ? "PRESENT" : value === "late" ? "LATE" : "ABSENT")
                        }
                      />
                      {savingStudents[student.id] && (
                        <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground" aria-live="polite">
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          جارٍ الحفظ
                        </span>
                      )}
                      {status === "LATE" && arrivalTime && (
                        <span className="inline-flex min-h-8 items-center gap-1 rounded-full bg-amber-50 px-3 text-xs font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">
                          <Clock3 className="h-3.5 w-3.5" />
                          <Ltr>{arrivalTime}</Ltr>
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
            {filteredStudents.length === 0 && (
              <Card className="rounded-2xl border-dashed border-border/80 shadow-none">
                <CardContent className="py-10 text-center text-sm text-muted-foreground">
                  {students.length === 0 ? "لا يوجد تلاميذ نشطون في هذه الحلقة." : "لا توجد نتائج تطابق البحث أو التصفية."}
                </CardContent>
              </Card>
            )}
          </div>
        </>
      )}
    </div>
  );
}
