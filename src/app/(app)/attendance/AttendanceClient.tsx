"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { CheckCheck, Search, TriangleAlert } from "lucide-react";
import { Ltr } from "@/components/Ltr";
import { StatusToggle } from "@/components/StatusToggle";
import { formatFullDate } from "@/lib/domain";
import { getLocalTodayISO } from "@/lib/business/date";
import { recordTeacherAttendance, recordStudentAttendance, markAllPresent } from "./actions";
import type { Selectable } from "kysely";
import type { Student, StudentAttendance } from "@/lib/db/types";
import type { DailySessionState } from "@/lib/business/session-state";

type AttendanceStatus = "PRESENT" | "LATE" | "ABSENT";

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
  hasExplicitDate,
  sessionTemplates,
  activeSessionId,
  state,
  teacherStatus,
  students,
  existingRecords,
}: {
  date: string;
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
  const [optimisticStatuses, setOptimisticStatuses] = useState<Record<string, AttendanceStatus>>({});
  const [optimisticArrivalTimes, setOptimisticArrivalTimes] = useState<Record<string, string>>({});
  const studentWrites = useRef(new Map<string, Promise<void>>());
  const requestSequences = useRef(new Map<string, number>());
  const bulkInFlight = useRef(false);

  const displayedDate = hasExplicitDate ? date : getLocalTodayISO();

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

  const filteredStudents = useMemo(() => students.filter((s) => s.fullName.includes(query.trim())), [students, query]);
  const visibleCounts = useMemo(() => {
    const statuses = new Map(existingRecords.map((record) => [record.studentId, record.status]));
    for (const [studentId, status] of Object.entries(pendingStatuses)) statuses.set(studentId, status);
    return [...statuses.values()].reduce(
      (counts, status) => {
        counts[status]++;
        return counts;
      },
      { PRESENT: 0, LATE: 0, ABSENT: 0 }
    );
  }, [existingRecords, pendingStatuses]);

  useEffect(() => {
    if (!hasExplicitDate) {
      const localToday = getLocalTodayISO();
      router.replace(`/attendance?session=${activeSessionId}&date=${localToday}`, { scroll: false });
    }
  }, [activeSessionId, hasExplicitDate, router]);

  function setTeacher(status: "PRESENT" | "ABSENT") {
    const fd = new FormData();
    fd.set("sessionDate", date);
    fd.set("sessionTemplateId", activeSessionId);
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
    if (status !== "LATE") {
      setOptimisticArrivalTimes((current) => {
        const next = { ...current };
        delete next[studentId];
        return next;
      });
    }

    const fd = new FormData();
    fd.set("studentId", studentId);
    fd.set("sessionDate", date);
    fd.set("sessionTemplateId", activeSessionId);
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
          if (requestSequences.current.get(studentId) === sequence) router.refresh();
        },
        (error: unknown) => {
          if (requestSequences.current.get(studentId) === sequence) {
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
        const result = await markAllPresent(date, activeSessionId);
        if (!result.ok) {
          toast.error(result.error);
          return;
        }

        if (result.activeCount === 0) {
          toast.info("تم تأكيد حضورك؛ لا يوجد تلاميذ نشطون.");
        } else if (result.preparedCount === 0) {
          toast.success("تم تأكيد حضورك؛ وحُفظت الحالات المسجلة مسبقاً دون تغيير.");
        } else {
          toast.success(`تم تأكيد حضورك وتحضير ${result.preparedCount} تلميذاً؛ وحُفظت الحالات المسجلة مسبقاً.`);
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
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-1">
          <p className="text-sm text-muted-foreground">{formatFullDate(displayedDate)}</p>
          <h1 className="font-display text-2xl text-foreground">كشف الحضور</h1>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <Input
            aria-label="تاريخ الحضور"
            type="date"
            value={displayedDate}
            onChange={(event) => {
              if (event.target.value) {
                router.push(`/attendance?session=${activeSessionId}&date=${event.target.value}`);
              }
            }}
            className="sm:w-44"
          />
          {canConfirmAttendance && (
            <Button onClick={handleMarkAllPresent} disabled={pending} className="gap-2 whitespace-nowrap">
              <CheckCheck className="h-4 w-4" />
              تأكيد حضوري وتحضير الجميع
            </Button>
          )}
        </div>
      </div>

      {sessionTemplates.length > 1 && (
        <Tabs value={activeSessionId} onValueChange={(v) => router.push(`/attendance?session=${v}&date=${date}`)}>
          <TabsList>
            {sessionTemplates.map((s) => (
              <TabsTrigger key={s.id} value={s.id}>
                {s.name}
              </TabsTrigger>
            ))}
          </TabsList>
        </Tabs>
      )}
      <p className="text-sm text-muted-foreground">
        <Ltr>{activeSession.startTime} – {activeSession.endTime}</Ltr>
      </p>

      <Card>
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
          <div className="flex items-center gap-4 text-sm tabular">
            <span className="text-primary">{visibleCounts.PRESENT} حاضر</span>
            <span className="text-accent">{visibleCounts.LATE} متأخر</span>
            <span className="text-destructive">{visibleCounts.ABSENT} غائب</span>
          </div>

          <div className="relative">
            <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ابحث عن طالب..." value={query} onChange={(e) => setQuery(e.target.value)} className="pe-9" />
          </div>

          <div className="space-y-2">
            {filteredStudents.map((student) => {
              const record = recordsByStudent.get(student.id);
              const status = pendingStatuses[student.id] ?? record?.status ?? "PRESENT";
              const arrivalTime =
                optimisticArrivalTimes[student.id]?.slice(0, 5) ??
                (status === "LATE" ? record?.arrivalTime?.toString().slice(0, 5) : undefined);

              return (
                <Card key={student.id}>
                  <CardContent className="flex flex-col gap-3 py-3.5 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-center gap-3">
                      <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-secondary font-display text-sm text-secondary-foreground">
                        {student.fullName.charAt(0)}
                      </div>
                      <span className="text-sm font-medium text-foreground">{student.fullName}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <StatusToggle
                        value={status === "PRESENT" ? "present" : status === "LATE" ? "late" : "absent"}
                        onChange={(value) =>
                          setStudentStatus(student.id, value === "present" ? "PRESENT" : value === "late" ? "LATE" : "ABSENT")
                        }
                      />
                      {status === "LATE" && arrivalTime && (
                        <span className="text-xs text-accent">
                          <Ltr>{arrivalTime}</Ltr>
                        </span>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
