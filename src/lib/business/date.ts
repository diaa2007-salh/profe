const APP_TIMEZONE = "Africa/Algiers";

const isoFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: APP_TIMEZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/**
 * "Today" as an ISO date (YYYY-MM-DD) in the app's timezone, not the
 * server's. The server runs in UTC; Algiers is UTC+1 year-round (no DST).
 * Using new Date().toISOString() directly would occasionally shift the
 * calculated date by one day near midnight.
 */
export function getTodayISO(): string {
  return isoFormatter.format(new Date()); // en-CA locale formats as YYYY-MM-DD
}

const timeFormatter = new Intl.DateTimeFormat("en-GB", {
  timeZone: APP_TIMEZONE,
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});

/** Current wall-clock time in the app's timezone, as "HH:MM". */
export function getNowTimeHHMM(): string {
  return timeFormatter.format(new Date());
}
