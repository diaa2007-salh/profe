import type { AttendanceStatus, MemorizationQuality, SessionSlot } from "./types";

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غائب",
};

export const SLOT_LABEL: Record<SessionSlot, string> = {
  morning: "الفوج الصباحي",
  evening: "الفوج المسائي",
};

export const SLOT_TIME: Record<SessionSlot, string> = {
  morning: "05:30 – 07:00",
  evening: "18:00 – 20:00",
};

export const QUALITY_LABEL: Record<MemorizationQuality, string> = {
  excellent: "ممتاز",
  very_good: "جيد جدًا",
  good: "جيد",
  weak: "يحتاج مراجعة",
};

export const QUALITY_ORDER: MemorizationQuality[] = ["excellent", "very_good", "good", "weak"];

const dateFormatter = new Intl.DateTimeFormat("ar-DZ", {
  weekday: "long",
  day: "numeric",
  month: "long",
  numberingSystem: "latn",
});

const shortDateFormatter = new Intl.DateTimeFormat("ar-DZ", {
  day: "numeric",
  month: "short",
  numberingSystem: "latn",
});

export function formatFullDate(iso: string): string {
  return dateFormatter.format(new Date(iso + "T00:00:00"));
}

export function formatShortDate(iso: string): string {
  return shortDateFormatter.format(new Date(iso + "T00:00:00"));
}

export function initials(fullName: string): string {
  const parts = fullName.trim().split(/\s+/);
  return parts[0]?.charAt(0) ?? "؟";
}

