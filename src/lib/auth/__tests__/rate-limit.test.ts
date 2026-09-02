import { describe, it, expect, beforeEach, vi } from "vitest";
import { isRateLimited, recordFailedAttempt, clearAttempts } from "../rate-limit";

describe("login rate limiter", () => {
  const email = "ratelimit-test@example.com";

  beforeEach(() => {
    clearAttempts(email);
    vi.useRealTimers();
  });

  it("is not rate limited with no prior attempts", () => {
    expect(isRateLimited(email)).toBe(false);
  });

  it("locks out after 5 failed attempts within the window", () => {
    for (let i = 0; i < 4; i++) {
      recordFailedAttempt(email);
      expect(isRateLimited(email)).toBe(false);
    }
    recordFailedAttempt(email); // 5th
    expect(isRateLimited(email)).toBe(true);
  });

  it("a successful login (clearAttempts) resets the counter", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(email);
    expect(isRateLimited(email)).toBe(true);
    clearAttempts(email);
    expect(isRateLimited(email)).toBe(false);
  });

  it("is case-insensitive and trims whitespace on the email key", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt("  Test@Example.com  ");
    expect(isRateLimited("test@example.com")).toBe(true);
  });

  it("resets after the window expires", () => {
    vi.useFakeTimers();
    const start = Date.now();
    vi.setSystemTime(start);
    for (let i = 0; i < 5; i++) recordFailedAttempt(email);
    expect(isRateLimited(email)).toBe(true);

    vi.setSystemTime(start + 16 * 60 * 1000); // 16 minutes later, past the 15-minute window
    expect(isRateLimited(email)).toBe(false);
    vi.useRealTimers();
  });

  it("does not rate-limit a different email after one is locked out", () => {
    for (let i = 0; i < 5; i++) recordFailedAttempt(email);
    expect(isRateLimited("someone-else@example.com")).toBe(false);
  });
});
