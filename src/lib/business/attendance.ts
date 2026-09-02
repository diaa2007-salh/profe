export interface LateCalcResult {
  ok: boolean;
  lateMinutes?: number;
  error?: string;
}

/**
 * lateMinutes = differenceInMinutes(arrival, sessionStart) — spec's own
 * formula. Arrival must be strictly after the session start (arriving
 * "late" before the session even started is a contradiction) and no later
 * than session end (anything past that is a data-entry mistake, not a
 * lateness worth recording — mark ABSENT instead).
 */
export function calculateLateMinutes(
  sessionStart: string, // "HH:MM"
  sessionEnd: string,
  arrivalTime: string
): LateCalcResult {
  const toMinutes = (t: string) => {
    const m = /^(\d{1,2}):(\d{2})$/.exec(t.trim());
    if (!m) return null;
    const h = Number(m[1]);
    const min = Number(m[2]);
    if (h < 0 || h > 23 || min < 0 || min > 59) return null;
    return h * 60 + min;
  };

  const start = toMinutes(sessionStart);
  const end = toMinutes(sessionEnd);
  const arrival = toMinutes(arrivalTime);

  if (start === null || end === null || arrival === null) {
    return { ok: false, error: "وقت غير صالح" };
  }
  if (arrival <= start) {
    return { ok: false, error: "لا يمكن أن يكون وقت الوصول قبل بداية الحصة أو مساويًا لها" };
  }
  if (arrival > end) {
    return { ok: false, error: "وقت الوصول خارج حدود الحصة" };
  }

  return { ok: true, lateMinutes: arrival - start };
}
