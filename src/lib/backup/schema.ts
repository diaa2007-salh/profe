import { z } from "zod";

export const BACKUP_VERSION = "1.1";
// 1.0 shipped without teacherProfile/appSettings/mushafPages/mushafThumns
// -- restoring a 1.0 file would have silently lost data that a real
// disaster-recovery restore needs. 1.0 files are rejected outright (see
// restoreBackup) rather than partially supported, since no real backup
// has ever been taken in production yet -- there's nothing to preserve
// compatibility with, so there's no reason to carry the incomplete shape
// forward.

const timestampString = z.string(); // ISO string over the wire; DB layer parses it back

export const studentBackupSchema = z.object({
  id: z.string().uuid(),
  fullName: z.string(),
  birthDate: z.string().nullable(),
  birthPlace: z.string().nullable(),
  address: z.string().nullable(),
  guardianName: z.string().nullable(),
  guardianPhone: z.string().nullable(),
  photoUrl: z.string().nullable(),
  isActive: z.boolean(),
  archivedAt: timestampString.nullable(),
  createdAt: timestampString,
  updatedAt: timestampString,
});

export const teacherProfileBackupSchema = z.object({
  id: z.string().uuid(),
  // userId is deliberately NOT restored as-is -- see restoreBackup, which
  // remaps this to the currently logged-in session's user id. Kept in the
  // schema only so the exported file is a faithful, inspectable record.
  userId: z.string().uuid(),
  fullName: z.string(),
  phone: z.string().nullable(),
  halaqaName: z.string().nullable(),
  photoUrl: z.string().nullable(),
  createdAt: timestampString,
  updatedAt: timestampString,
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
  status: z.enum(["PRESENT", "ABSENT"]),
  createdAt: timestampString,
  updatedAt: timestampString,
});

export const studentAttendanceBackupSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  sessionDate: z.string(),
  sessionTemplateId: z.string().uuid(),
  status: z.enum(["PRESENT", "ABSENT", "LATE"]),
  arrivalTime: z.string().nullable(),
  lateMinutes: z.number().int().nullable(),
  createdAt: timestampString,
  updatedAt: timestampString,
});

export const weeklyMemorizationBackupSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  weekStart: z.string(),
  fromSurahId: z.number().int(),
  fromVerse: z.number().int(),
  toSurahId: z.number().int(),
  toVerse: z.number().int(),
  notes: z.string().nullable(),
  createdAt: timestampString,
  updatedAt: timestampString,
});

export const monthlyEvaluationBackupSchema = z.object({
  id: z.string().uuid(),
  studentId: z.string().uuid(),
  year: z.number().int(),
  month: z.number().int().min(1).max(12),
  grade: z.enum(["EXCELLENT", "VERY_GOOD", "GOOD", "NEEDS_FOLLOW_UP"]).nullable(),
  notes: z.string().nullable(),
  createdAt: timestampString,
  updatedAt: timestampString,
});

export const mushafEditionBackupSchema = z.object({
  id: z.string().uuid(),
  name: z.string(),
  riwayah: z.string(),
  publisher: z.string().nullable(),
  edition: z.string().nullable(),
  description: z.string().nullable(),
  isDefault: z.boolean(),
  isVerified: z.boolean(),
});

export const mushafPageBackupSchema = z.object({
  id: z.string().uuid(),
  mushafEditionId: z.string().uuid(),
  pageNumber: z.number().int(),
  surahId: z.number().int(),
  startVerse: z.number().int(),
});

export const mushafThumnBackupSchema = z.object({
  id: z.string().uuid(),
  mushafEditionId: z.string().uuid(),
  thumnNumber: z.number().int(),
  surahId: z.number().int(),
  startVerse: z.number().int(),
});

// Excludes app_user entirely (no email, no passwordHash) -- see the
// module comment above and docs/BUSINESS_RULES.md. Restoring this file
// never creates or changes who can log in.
export const backupSchema = z.object({
  backupVersion: z.string(),
  exportedAt: z.string(),
  data: z.object({
    teacherProfile: teacherProfileBackupSchema.nullable(),
    appSettings: appSettingsBackupSchema.nullable(),
    students: z.array(studentBackupSchema),
    academicYears: z.array(academicYearBackupSchema),
    holidays: z.array(holidayBackupSchema),
    sessionTemplates: z.array(sessionTemplateBackupSchema),
    sessionCancellations: z.array(sessionCancellationBackupSchema),
    teacherAttendance: z.array(teacherAttendanceBackupSchema),
    studentAttendance: z.array(studentAttendanceBackupSchema),
    weeklyMemorization: z.array(weeklyMemorizationBackupSchema),
    monthlyEvaluations: z.array(monthlyEvaluationBackupSchema),
    mushafEditions: z.array(mushafEditionBackupSchema),
    mushafPages: z.array(mushafPageBackupSchema),
    mushafThumns: z.array(mushafThumnBackupSchema),
  }),
});

export type BackupFile = z.infer<typeof backupSchema>;
