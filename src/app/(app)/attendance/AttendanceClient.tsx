"use client";

import { useMemo, useState, useTransition } from "react";
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
  sessionTemplates,
  activeSessionId,
  state,
  teacherStatus,
  students,
  existingRecords,
}: {
  date: string;
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
  const [arrivalDrafts, setArrivalDrafts] = useState<Record<string, string>>({});
  const [pendingLateIds, setPendingLateIds] = useState<Set<string>>(new Set());

  const activeSession = sessionTemplates.find((s) => s.id === activeSessionId)!;
  const recordsByStudent = useMemo(() => new Map(existingRecords.map((r) => [r.studentId, r])), [existingRecords]);
  const attendanceLocked = state !== "TEACHER_PRESENT";

  const filteredStudents = useMemo(() => students.filter((s) => s.fullName.includes(query.trim())), [students, query]);

  function setTeacher(status: "PRESENT" | "ABSENT") {
    const fd = new FormData();
    fd.set("sessionDate", date);
    fd.set("sessionTemplateId", activeSessionId);
    fd.set("status", status);
    startTransition(async () => {
      const result = await recordTeacherAttendance(fd);
      if (result.ok) {
        toast.success(status === "PRESENT" ? "تم تسجيل حضور المعلم" : "تم تسجيل غياب المعلم");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function setStudentStatus(studentId: string, status: AttendanceStatus, arrivalTime?: string) {
    const fd = new FormData();
    fd.set("studentId", studentId);
    fd.set("sessionDate", date);
    fd.set("sessionTemplateId", activeSessionId);
    fd.set("status", status);
    if (arrivalTime) fd.set("arrivalTime", arrivalTime);
    startTransition(async () => {
      const result = await recordStudentAttendance(fd);
      if (result.ok) {
        toast.success(status === "LATE" && result.lateMinutes != null ? `تم التسجيل — متأخر ${result.lateMinutes} دقيقة` : "تم الحفظ");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  function handleMarkAllPresent() {
    startTransition(async () => {
      const result = await markAllPresent(date, activeSessionId, students.map((s) => s.id));
      if (result.ok) {
        toast.success("تم تحديد الجميع كحاضرين");
        router.refresh();
      } else {
        toast.error(result.error);
      }
    });
  }

  const presentCount = existingRecords.filter((r) => r.status === "PRESENT").length;
  const lateCount = existingRecords.filter((r) => r.status === "LATE").length;
  const absentCount = existingRecords.filter((r) => r.status === "ABSENT").length;

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-1">
        <p className="text-sm text-muted-foreground">{formatFullDate(date)}</p>
        <h1 className="font-display text-2xl text-foreground">كشف الحضور</h1>
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
                value={teacherStatus === "ABSENT" ? "absent" : teacherStatus === "PRESENT" ? "present" : "present"}
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
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4 text-sm tabular">
              <span className="text-primary">{presentCount} حاضر</span>
              <span className="text-accent">{lateCount} متأخر</span>
              <span className="text-destructive">{absentCount} غائب</span>
            </div>
            <Button variant="outline" size="sm" onClick={handleMarkAllPresent} disabled={pending} className="gap-1.5">
              <CheckCheck className="h-3.5 w-3.5" />
              تحديد الجميع كحاضر
            </Button>
          </div>

          <div className="relative">
            <Search className="absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <Input placeholder="ابحث عن طالب..." value={query} onChange={(e) => setQuery(e.target.value)} className="pe-9" />
          </div>

          <div className="space-y-2">
            {filteredStudents.map((student) => {
              const record = recordsByStudent.get(student.id);
              const savedStatus: AttendanceStatus = (record?.status as AttendanceStatus) ?? "PRESENT";
              const status: AttendanceStatus = pendingLateIds.has(student.id) ? "LATE" : savedStatus;
              const draftArrival = arrivalDrafts[student.id] ?? record?.arrivalTime?.toString().slice(0, 5) ?? "";

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
                        disabled={pending}
                        onChange={(v) => {
                          if (v === "late") {
                            setPendingLateIds((s) => new Set(s).add(student.id));
                            return;
                          }
                          setPendingLateIds((s) => {
                            const next = new Set(s);
                            next.delete(student.id);
                            return next;
                          });
                          setStudentStatus(student.id, v === "present" ? "PRESENT" : "ABSENT");
                        }}
                      />
                      {status === "LATE" && (
                        <div className="flex items-center gap-1.5">
                          <Input
                            type="time"
                            autoFocus={pendingLateIds.has(student.id)}
                            value={draftArrival}
                            onChange={(e) => setArrivalDrafts((d) => ({ ...d, [student.id]: e.target.value }))}
                            onBlur={(e) => {
                              if (e.target.value) {
                                setStudentStatus(student.id, "LATE", e.target.value);
                                setPendingLateIds((s) => {
                                  const next = new Set(s);
                                  next.delete(student.id);
                                  return next;
                                });
                              }
                            }}
                            className="h-10 w-28 tabular"
                          />
                          {record?.lateMinutes != null && !pendingLateIds.has(student.id) && (
                            <span className="whitespace-nowrap text-xs text-accent">{record.lateMinutes} د</span>
                          )}
                        </div>
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
