import { describe, it, expect } from "vitest";
import { calculateLateMinutes } from "../attendance";

describe("calculateLateMinutes — spec acceptance tests 5-6", () => {
  it("TEST 5 — session starts 05:30, arrival 05:47 -> 17 minutes late (spec's exact example)", () => {
    const result = calculateLateMinutes("05:30", "07:00", "05:47");
    expect(result.ok).toBe(true);
    expect(result.lateMinutes).toBe(17);
  });

  it("TEST 6 — arrival before session start -> validation error, not a negative number", () => {
    const result = calculateLateMinutes("05:30", "07:00", "05:15");
    expect(result.ok).toBe(false);
    expect(result.lateMinutes).toBeUndefined();
  });

  it("arrival exactly at session start -> rejected (that's on-time, not late)", () => {
    const result = calculateLateMinutes("05:30", "07:00", "05:30");
    expect(result.ok).toBe(false);
  });

  it("arrival after session end -> rejected as out of bounds", () => {
    const result = calculateLateMinutes("05:30", "07:00", "08:00");
    expect(result.ok).toBe(false);
  });

  it("malformed time strings are rejected, not silently coerced", () => {
    expect(calculateLateMinutes("5:3", "07:00", "05:47").ok).toBe(false);
    expect(calculateLateMinutes("05:30", "07:00", "25:99").ok).toBe(false);
  });

  it("evening session: 18:00 start, 18:23 arrival -> 23 minutes", () => {
    const result = calculateLateMinutes("18:00", "20:00", "18:23");
    expect(result.ok).toBe(true);
    expect(result.lateMinutes).toBe(23);
  });
});
