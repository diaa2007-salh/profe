import { z } from "zod";

export const BACKUP_VERSION = "2.0";

const timestampString = z.string();

export const studentBackupSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  birthDate: z.string().nullable(),
  birthPlace: z.string().nullable(),
  address: z.string().nullable(),
  guardianName: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  photoUrl: z.string().nullable(),
  halaqaId: z.string().uuid(),
  isActive: z.boolean(),
  archivedAt: timestampString.nullable(),
  createdAt: timestampString,
  updatedAt: timestampString,
});

export const halaqaBackupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  createdAt: timestampString,
});

export const appSettingsBackupSchema = z.object({
  id: z.literal(true),
  data: z.record(z.string(), z.unknown()),
  updatedAt: timestampString,
});

export const academicYearBackupSchema = z.object({
  id: z.string().uuid(),
  label: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  isActive: z.boolean(),
  createdAt: timestampString,
});

export const holidayBackupSchema = z.object({
  id: z.string().uuid(),
  academicYearId: z.string().uuid(),
  name: z.string(),
  startDate: z.string(),
  endDate: z.string(),
  description: z.string().nullable(),
});

export const sessionTemplateBackupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  startTime: z.string(),
  endTime: z.string(),
  isActive: z.boolean(),
  sortOrder: z.number().int(),
});

export const sessionCancellationBackupSchema = z.object({
  id: z.string().uuid(),
  sessionTemplateId: z.string().uuid().nullable(),
  startDate: z.string(),
  endDate: z.string(),
  reason: z.string().nullable(),
  createdAt: timestampString,
});

export const teacherAttendanceBackupSchema = z.object({
  id: z.string().uuid(),
  sessionDate: z.string(),
  sessionTemplateId: z.string().uuid(),
  period: z.union([z.literal(1), z.literal(2)]).default(1),
  teacherProfileId: z.string().uuid().nullable(),
  status: z.enum(["PRESENT", "ABSENT"]),
  createdAt: timestampString,
  updatedAt: timestampString,
});

export const studentAttendanceBackupSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  sessionDate: z.string(),
  sessionTemplateId: z.string().uuid(),
  period: z.union([z.literal(1), z.literal(2)]).default(1),
  status: z.enum(["PRESENT", "ABSENT", "LATE"]),
  arrivalTime: z.string().nullable(),
  lateMinutes: z.number().int().nullable(),
  createdAt: timestampString,
  updatedAt: timestampString,
});

export const backupSchema = z.object({
  backupVersion: z.literal(BACKUP_VERSION),
  exportedAt: z.string(),
  data: z.object({
    appSettings: appSettingsBackupSchema.nullable(),
    halaqas: z.array(halaqaBackupSchema),
    students: z.array(studentBackupSchema),
    academicYears: z.array(academicYearBackupSchema),
    holidays: z.array(holidayBackupSchema),
    sessionTemplates: z.array(sessionTemplateBackupSchema),
    sessionCancellations: z.array(sessionCancellationBackupSchema),
    teacherAttendance: z.array(teacherAttendanceBackupSchema),
    studentAttendance: z.array(studentAttendanceBackupSchema),
  }),
});

export type BackupFile = z.infer<typeof backupSchema>;
