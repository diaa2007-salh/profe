import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db/client";

vi.mock("@/lib/auth/config", () => ({
  auth: async () => ({ user: { id: "00000000-0000-0000-0000-000000000001" } }),
}));

const { upsertCancellation, deleteCancellation, upsertSessionTemplate, upsertHoliday, deleteHoliday } = await import("../actions");
const { getSessionStateContext } = await import("@/lib/server/session-state.server");

let sessionId: string;
let academicYearId: string;
let realActiveYearId: string | undefined;

function fd(fields: Record<string, string>) {
  const f = new FormData();
  for (const [k, v] of Object.entries(fields)) f.set(k, v);
  return f;
}

beforeAll(async () => {
  // This suite repeatedly (de)activates academic years to exercise the
  // partial-unique-index behavior. Whatever is really active right now
  // (e.g. the real teacher's year from manual/e2e testing) must survive
  // this file's run untouched.
  const currentlyActive = await db.selectFrom("academicYear").select("id").where("isActive", "=", true).executeTakeFirst();
  realActiveYearId = currentlyActive?.id;
  if (realActiveYearId) {
    await db.updateTable("academicYear").set({ isActive: false }).where("id", "=", realActiveYearId).execute();
  }

  const session = await db
    .insertInto("sessionTemplate")
    .values({ name: "TEST-SETTINGS-SESSION", startTime: "18:00", endTime: "20:00", sortOrder: 996 })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  sessionId = session.id;

  const year = await db
    .insertInto("academicYear")
    .values({ label: "TEST-SETTINGS-YEAR", startDate: "2026-09-01", endDate: "2027-06-30", isActive: false })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  academicYearId = year.id;
});

afterAll(async () => {
  await db.deleteFrom("sessionCancellation").where("sessionTemplateId", "=", sessionId).execute();
  await db.deleteFrom("holiday").where("academicYearId", "=", academicYearId).execute();
  await db.deleteFrom("sessionTemplate").where("id", "=", sessionId).execute();
  await db.deleteFrom("academicYear").where("id", "=", academicYearId).execute();
  // Restore whatever was really active before this file ran — this must
  // happen unconditionally, not depend on every test having cleaned up
  // after itself correctly.
  if (realActiveYearId) {
    await db.updateTable("academicYear").set({ isActive: true }).where("id", "=", realActiveYearId).execute();
  }
  await db.destroy();
});

describe("settings actions — real PostgreSQL", () => {
  it("creating a cancellation succeeds", async () => {
    const result = await upsertCancellation(
      fd({ sessionTemplateId: sessionId, startDate: "2026-12-01", endDate: "2027-01-31", reason: "TEST" })
    );
    expect(result.ok).toBe(true);
  });

  it("spec 14 (literal) — the action rejects an overlapping period through the real DB exclusion constraint, with a friendly Arabic message, not a raw Postgres error leaking to the user", async () => {
    const result = await upsertCancellation(
      fd({ sessionTemplateId: sessionId, startDate: "2027-01-15", endDate: "2027-02-15", reason: "TEST-OVERLAP" })
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/[\u0600-\u06FF]/); // Arabic message
      expect(result.error).not.toMatch(/exclusion|constraint|postgres/i); // not a leaked raw DB error
    }

    const rows = await db.selectFrom("sessionCancellation").selectAll().where("sessionTemplateId", "=", sessionId).execute();
    expect(rows).toHaveLength(1); // the rejected attempt did not get persisted
  });

  it("a non-overlapping period for the same session is accepted", async () => {
    const result = await upsertCancellation(
      fd({ sessionTemplateId: sessionId, startDate: "2027-03-01", endDate: "2027-03-15", reason: "TEST-2" })
    );
    expect(result.ok).toBe(true);
    await db.deleteFrom("sessionCancellation").where("startDate", "=", "2027-03-01").execute();
  });

  it("cleanup: delete the first cancellation", async () => {
    const row = await db.selectFrom("sessionCancellation").select("id").where("sessionTemplateId", "=", sessionId).executeTakeFirstOrThrow();
    const result = await deleteCancellation(row.id);
    expect(result.ok).toBe(true);
    const rows = await db.selectFrom("sessionCancellation").selectAll().where("sessionTemplateId", "=", sessionId).execute();
    expect(rows).toHaveLength(0);
  });

  it("spec — editing a session's time immediately changes what getSessionStateContext (used by dashboard + attendance) returns, since nothing caches it", async () => {
    await db.updateTable("academicYear").set({ isActive: false }).where("isActive", "=", true).execute();
    await db.updateTable("academicYear").set({ isActive: true }).where("id", "=", academicYearId).execute();

    const before = await getSessionStateContext("2026-10-01", sessionId);
    expect(before?.sessionTemplate.startTime).toBe("18:00");

    const updateResult = await upsertSessionTemplate(fd({ id: sessionId, name: "TEST-SETTINGS-SESSION", startTime: "18:30", endTime: "20:00" }));
    expect(updateResult.ok).toBe(true);

    const after = await getSessionStateContext("2026-10-01", sessionId);
    expect(after?.sessionTemplate.startTime).toBe("18:30"); // no cache anywhere — this is live

    await db.updateTable("academicYear").set({ isActive: false }).where("id", "=", academicYearId).execute();
  });

  it("adding a holiday changes session state to HOLIDAY immediately for dates inside it", async () => {
    await db.updateTable("academicYear").set({ isActive: false }).where("isActive", "=", true).execute();
    await db.updateTable("academicYear").set({ isActive: true }).where("id", "=", academicYearId).execute();

    const beforeHoliday = await getSessionStateContext("2026-11-20", sessionId);
    expect(beforeHoliday?.state).not.toBe("HOLIDAY");

    await upsertHoliday(fd({ academicYearId, name: "TEST-SETTINGS-HOLIDAY", startDate: "2026-11-20", endDate: "2026-11-22" }));
    const afterHoliday = await getSessionStateContext("2026-11-20", sessionId);
    expect(afterHoliday?.state).toBe("HOLIDAY");

    const holidayRow = await db.selectFrom("holiday").select("id").where("name", "=", "TEST-SETTINGS-HOLIDAY").executeTakeFirstOrThrow();
    await deleteHoliday(holidayRow.id);
    const afterDelete = await getSessionStateContext("2026-11-20", sessionId);
    expect(afterDelete?.state).not.toBe("HOLIDAY");

    await db.updateTable("academicYear").set({ isActive: false }).where("id", "=", academicYearId).execute();
  });
});
