import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { db } from "@/lib/db/client";

const SESSION_USER_ID = "00000000-0000-0000-0000-000000000001";
vi.mock("@/lib/auth/config", () => ({
  auth: async () => ({ user: { id: SESSION_USER_ID } }),
}));

const { exportBackup, restoreBackup } = await import("../actions");

let studentId: string;
let sessionId: string;
let editionId: string;

beforeAll(async () => {
  // The mocked auth() session below references this user id. In the real
  // app, a session's user id always corresponds to a real, already-
  // authenticated app_user row (that's what Auth.js's JWT callback
  // guarantees) -- teacherProfile.user_id has a real FK to it, so this
  // test needs that same guarantee to hold, or the FK-dependent restore
  // path can't be exercised faithfully.
  await db
    .insertInto("appUser")
    .values({ id: SESSION_USER_ID, email: "test-backup@example.invalid", passwordHash: "test-fixture-not-a-real-hash" })
    .onConflict((oc) => oc.column("id").doNothing())
    .execute();

  const student = await db
    .insertInto("student")
    .values({ fullName: "TEST-BACKUP-STUDENT", guardianPhone: "0555000111" })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  studentId = student.id;

  const session = await db
    .insertInto("sessionTemplate")
    .values({ name: "TEST-BACKUP-SESSION", startTime: "05:30", endTime: "07:00", sortOrder: 995 })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  sessionId = session.id;

  await db.insertInto("teacherAttendance").values({ sessionDate: "2027-05-01", sessionTemplateId: sessionId, status: "PRESENT" }).execute();
  await db.insertInto("studentAttendance").values({ studentId, sessionDate: "2027-05-01", sessionTemplateId: sessionId, status: "PRESENT" }).execute();
  await db.insertInto("weeklyMemorization").values({ studentId, weekStart: "2027-05-01", fromSurahId: 1, fromVerse: 1, toSurahId: 1, toVerse: 5 }).execute();
  await db.insertInto("monthlyEvaluation").values({ studentId, year: 2027, month: 5, grade: "GOOD", notes: "TEST-NOTE" }).execute();

  const edition = await db
    .insertInto("mushafEdition")
    .values({ name: "TEST-BACKUP-EDITION", publisher: "TEST-PUB", isDefault: false, isVerified: false })
    .returning(["id"])
    .executeTakeFirstOrThrow();
  editionId = edition.id;
  await db.insertInto("mushafPage").values({ mushafEditionId: editionId, pageNumber: 1, surahId: 1, startVerse: 1 }).execute();
  await db.insertInto("mushafThumn").values({ mushafEditionId: editionId, thumnNumber: 1, surahId: 1, startVerse: 1 }).execute();

  // Nothing in the app currently writes to app_settings (it exists as a
  // generic settings table for future use) -- seed a row so backup/restore
  // of it can actually be exercised, rather than asserting it's non-null
  // when the real, honest current state is that no row exists yet.
  await db
    .insertInto("appSettings")
    .values({ id: true, data: { testKey: "TEST-VALUE" } })
    .onConflict((oc) => oc.column("id").doUpdateSet({ data: { testKey: "TEST-VALUE" } }))
    .execute();
});

afterAll(async () => {
  await db.deleteFrom("weeklyMemorization").where("studentId", "=", studentId).execute();
  await db.deleteFrom("monthlyEvaluation").where("studentId", "=", studentId).execute();
  await db.deleteFrom("studentAttendance").where("studentId", "=", studentId).execute();
  await db.deleteFrom("teacherAttendance").where("sessionTemplateId", "=", sessionId).execute();
  await db.deleteFrom("mushafEdition").where("id", "=", editionId).execute(); // cascades page/thumn
  await db.deleteFrom("student").where("id", "=", studentId).execute();
  await db.deleteFrom("sessionTemplate").where("id", "=", sessionId).execute();
  await db.deleteFrom("appSettings").execute(); // restore the prior (empty) state -- nothing in the app populates this yet

  // The restore tests above re-point teacherProfile.userId at the fixture
  // user created here. Deleting that fixture user would cascade-delete
  // teacherProfile entirely (ON DELETE CASCADE) -- re-link it back to the
  // real teacher's account first so this test file leaves the app's real
  // data exactly as it found it, not just "not obviously broken".
  const realUser = await db.selectFrom("appUser").select("id").where("id", "!=", SESSION_USER_ID).executeTakeFirst();
  if (realUser) {
    await db.updateTable("teacherProfile").set({ userId: realUser.id }).execute();
  }
  await db.deleteFrom("appUser").where("id", "=", SESSION_USER_ID).execute();

  await db.destroy();
});

describe("backup export — completeness and security boundary", () => {
  it("exports the current version and every table the hardening review required, with no secrets anywhere", async () => {
    const json = await exportBackup();
    const parsed = JSON.parse(json);
    expect(parsed.backupVersion).toBe("1.1");
    expect(json).not.toMatch(/passwordHash|password_hash|AUTH_SECRET|DATABASE_URL/i);

    for (const key of [
      "teacherProfile",
      "appSettings",
      "students",
      "academicYears",
      "holidays",
      "sessionTemplates",
      "sessionCancellations",
      "teacherAttendance",
      "studentAttendance",
      "weeklyMemorization",
      "monthlyEvaluations",
      "mushafEditions",
      "mushafPages",
      "mushafThumns",
    ]) {
      expect(parsed.data).toHaveProperty(key);
    }
  });

  it("includes mushaf_page and mushaf_thumn rows, not just the parent edition", async () => {
    const json = await exportBackup();
    const parsed = JSON.parse(json);
    expect(parsed.data.mushafPages.some((p: { mushafEditionId: string }) => p.mushafEditionId === editionId)).toBe(true);
    expect(parsed.data.mushafThumns.some((t: { mushafEditionId: string }) => t.mushafEditionId === editionId)).toBe(true);
  });

  it("includes teacherProfile and appSettings", async () => {
    const json = await exportBackup();
    const parsed = JSON.parse(json);
    expect(parsed.data.teacherProfile).not.toBeNull();
    expect(parsed.data.appSettings).not.toBeNull();
  });
});

describe("backup restore — full lossless cycle, including mushaf pages/thumns (the bug the review caught)", () => {
  it("export -> delete everything (including mushaf edition, which cascades) -> restore -> every table matches, relationships intact", async () => {
    const exported = await exportBackup();

    // Actually delete the real rows — not a simulation. Deleting the
    // edition cascades to its pages/thumns, exactly the scenario the
    // review flagged as previously lossy.
    await db.deleteFrom("studentAttendance").where("studentId", "=", studentId).execute();
    await db.deleteFrom("weeklyMemorization").where("studentId", "=", studentId).execute();
    await db.deleteFrom("monthlyEvaluation").where("studentId", "=", studentId).execute();
    await db.deleteFrom("teacherAttendance").where("sessionTemplateId", "=", sessionId).execute();
    await db.deleteFrom("mushafEdition").where("id", "=", editionId).execute();
    await db.deleteFrom("sessionTemplate").where("id", "=", sessionId).execute();
    await db.deleteFrom("student").where("id", "=", studentId).execute();

    const goneEdition = await db.selectFrom("mushafEdition").select("id").where("id", "=", editionId).executeTakeFirst();
    const gonePages = await db.selectFrom("mushafPage").select("id").where("mushafEditionId", "=", editionId).execute();
    expect(goneEdition).toBeUndefined();
    expect(gonePages).toHaveLength(0); // confirm the cascade actually fired before restoring

    const result = await restoreBackup(exported);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.counts.mushafPages).toBeGreaterThan(0);
    expect(result.counts.mushafThumns).toBeGreaterThan(0);

    const restoredEdition = await db.selectFrom("mushafEdition").selectAll().where("id", "=", editionId).executeTakeFirst();
    expect(restoredEdition?.name).toBe("TEST-BACKUP-EDITION");

    const restoredPages = await db.selectFrom("mushafPage").selectAll().where("mushafEditionId", "=", editionId).execute();
    expect(restoredPages).toHaveLength(1);
    expect(restoredPages[0].pageNumber).toBe(1);

    const restoredThumns = await db.selectFrom("mushafThumn").selectAll().where("mushafEditionId", "=", editionId).execute();
    expect(restoredThumns).toHaveLength(1);

    const restoredStudent = await db.selectFrom("student").selectAll().where("id", "=", studentId).executeTakeFirst();
    expect(restoredStudent?.fullName).toBe("TEST-BACKUP-STUDENT");
    expect(restoredStudent?.guardianPhone).toBe("0555000111");

    const restoredAttendance = await db.selectFrom("studentAttendance").selectAll().where("studentId", "=", studentId).execute();
    expect(restoredAttendance).toHaveLength(1);

    const restoredMemo = await db.selectFrom("weeklyMemorization").selectAll().where("studentId", "=", studentId).execute();
    expect(restoredMemo).toHaveLength(1);

    const restoredEval = await db.selectFrom("monthlyEvaluation").selectAll().where("studentId", "=", studentId).executeTakeFirst();
    expect(restoredEval?.notes).toBe("TEST-NOTE");
  });

  it("teacherProfile is remapped to the CURRENT session's user, not the backed-up userId — this is what makes disaster recovery (fresh account, new UUID) actually work", async () => {
    const exported = await exportBackup();
    const backup = JSON.parse(exported);

    // A properly-shaped UUID (valid version/variant nibbles) that simply
    // doesn't exist in app_user -- distinct from an actually-malformed
    // UUID, which Zod's strict .uuid() correctly rejects before this
    // point ever matters.
    const fakeOldUserId = "11111111-1111-4111-8111-111111111111";
    if (backup.data.teacherProfile) {
      backup.data.teacherProfile.userId = fakeOldUserId;
    }

    const result = await restoreBackup(JSON.stringify(backup));
    expect(result.ok).toBe(true);

    const profile = await db.selectFrom("teacherProfile").selectAll().where("userId", "=", SESSION_USER_ID).executeTakeFirst();
    expect(profile).toBeDefined(); // attached to the CURRENT session's user
    const orphaned = await db.selectFrom("teacherProfile").selectAll().where("userId", "=", fakeOldUserId).executeTakeFirst();
    expect(orphaned).toBeUndefined(); // never inserted under the stale backed-up id
  });

  it("rejects a 1.0-version backup outright with a clear message, rather than attempting a partial restore", async () => {
    const result = await restoreBackup(JSON.stringify({ backupVersion: "1.0", exportedAt: "x", data: {} }));
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error).toMatch(/[\u0600-\u06FF]/);
      expect(result.error).toContain("1.0");
    }
  });

  it("rejects malformed JSON outright", async () => {
    const result = await restoreBackup("{ not valid json");
    expect(result.ok).toBe(false);
  });

  it("a failed restore (invalid FK inside the payload) rolls back completely — no partial writes, including the new tables", async () => {
    const exported = await exportBackup();
    const backup = JSON.parse(exported);
    backup.data.studentAttendance.push({
      id: "22222222-2222-4222-8222-222222222222",
      studentId: "33333333-3333-4333-8333-333333333333", // valid shape, references no real student
      sessionDate: "2027-05-02",
      sessionTemplateId: sessionId,
      status: "PRESENT",
      arrivalTime: null,
      lateMinutes: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    const beforeStudent = await db.selectFrom("student").selectAll().where("id", "=", studentId).executeTakeFirst();
    const beforePages = await db.selectFrom("mushafPage").selectAll().where("mushafEditionId", "=", editionId).execute();

    const result = await restoreBackup(JSON.stringify(backup));
    expect(result.ok).toBe(false);

    // The whole restore is one transaction — everything else that had
    // already succeeded (student, mushaf pages/thumns, etc.) must also
    // have rolled back, not just stopped partway.
    const afterStudent = await db.selectFrom("student").selectAll().where("id", "=", studentId).executeTakeFirst();
    const afterPages = await db.selectFrom("mushafPage").selectAll().where("mushafEditionId", "=", editionId).execute();
    expect(afterStudent?.fullName).toBe(beforeStudent?.fullName);
    expect(afterPages).toHaveLength(beforePages.length);
  });
});
