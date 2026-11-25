import type { AttendanceStatus } from "./types";

export const STATUS_LABEL: Record<AttendanceStatus, string> = {
  present: "حاضر",
  late: "متأخر",
  absent: "غائب",
};

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

