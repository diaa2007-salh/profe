import { z } from "zod";

export const setupSchema = z.object({
  teacherName: z.string().trim().min(2, "الاسم قصير جدًا"),
  teacherPhone: z.string().trim().optional().or(z.literal("")),
  halaqaName: z.string().trim().optional().or(z.literal("")),
  email: z.string().trim().email("بريد إلكتروني غير صالح"),
  password: z.string().min(8, "كلمة المرور يجب ألا تقل عن 8 أحرف"),
  academicYearLabel: z.string().trim().min(4, "مطلوب"),
  academicYearStart: z.string().date(),
  academicYearEnd: z.string().date(),
  session1Start: z.string().regex(/^\d{2}:\d{2}$/),
  session1End: z.string().regex(/^\d{2}:\d{2}$/),
  session2Start: z.string().regex(/^\d{2}:\d{2}$/),
  session2End: z.string().regex(/^\d{2}:\d{2}$/),
});

export const loginSchema = z.object({
  email: z.string().trim().email(),
  password: z.string().min(1),
});

export const studentSchema = z.object({
  id: z.string().uuid().optional(),
  fullName: z.string().trim().min(2, "الاسم قصير جدًا"),
  birthDate: z.string().date().optional().or(z.literal("")),
  birthPlace: z.string().trim().optional().or(z.literal("")),
  address: z.string().trim().optional().or(z.literal("")),
  guardianName: z.string().trim().optional().or(z.literal("")),
  guardianPhone: z.string().trim().optional().or(z.literal("")),
});

export const holidaySchema = z.object({
  id: z.string().uuid().optional(),
  academicYearId: z.string().uuid(),
  name: z.string().trim().min(1),
  startDate: z.string().date(),
  endDate: z.string().date(),
  description: z.string().trim().optional().or(z.literal("")),
});

export const cancellationSchema = z.object({
  id: z.string().uuid().optional(),
  sessionTemplateId: z.string().uuid().nullable(),
  startDate: z.string().date(),
  endDate: z.string().date(),
  reason: z.string().trim().optional().or(z.literal("")),
});

export const teacherAttendanceSchema = z.object({
  sessionDate: z.string().date(),
  sessionTemplateId: z.string().uuid(),
  status: z.enum(["PRESENT", "ABSENT"]),
});

export const bulkAttendanceSchema = z.object({
  sessionDate: z.string().date(),
  sessionTemplateId: z.string().uuid(),
});

export const studentAttendanceSchema = z
  .object({
    studentId: z.string().uuid(),
    sessionDate: z.string().date(),
    sessionTemplateId: z.string().uuid(),
    status: z.enum(["PRESENT", "ABSENT", "LATE"]),
  });

export const monthlyEvaluationSchema = z.object({
  studentId: z.string().uuid(),
  year: z.coerce.number().int().min(2020).max(2100),
  month: z.coerce.number().int().min(1).max(12),
  grade: z.enum(["EXCELLENT", "VERY_GOOD", "GOOD", "NEEDS_FOLLOW_UP"]).nullable(),
  notes: z.string().trim().optional().or(z.literal("")),
});

export const weeklyMemorizationSchema = z.object({
  id: z.string().uuid().optional(),
  studentId: z.string().uuid(),
  weekStart: z.string().date(),
  fromSurahId: z.coerce.number().int().min(1).max(114),
  fromVerse: z.coerce.number().int().min(1),
  toSurahId: z.coerce.number().int().min(1).max(114),
  toVerse: z.coerce.number().int().min(1),
  notes: z.string().trim().optional().or(z.literal("")),
});
