import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import { aggregateMonthlyAttendance } from "../monthly-attendance";
import { createMonthlyAttendanceWorkbook } from "@/lib/monthly/excel";

describe("aggregateMonthlyAttendance", () => {
  it("uses the actual number of days in leap and common February", () => {
    expect(aggregateMonthlyAttendance([], [], 2024, 2).daysInMonth).toBe(29);
    expect(aggregateMonthlyAttendance([], [], 2025, 2).daysInMonth).toBe(28);
  });

  it("aggregates the two daily periods independently and counts each recorded period only", () => {
    const result = aggregateMonthlyAttendance(
      [{ id: "student-1", fullName: "أمين" }, { id: "student-2", fullName: "ليلى" }],
      [
        { studentId: "student-1", sessionDate: "2026-03-01", period: 1, status: "PRESENT" },
        { studentId: "student-1", sessionDate: "2026-03-01", period: 1, status: "ABSENT" },
        { studentId: "student-1", sessionDate: "2026-03-01", period: 2, status: "PRESENT" },
        { studentId: "student-1", sessionDate: "2026-03-02", period: 2, status: "LATE" },
        { studentId: "student-2", sessionDate: "2026-02-28", period: 1, status: "ABSENT" },
      ],
      2026,
      3
    );

    expect(result.daysInMonth).toBe(31);
    expect(result.rows[0]).toMatchObject({ present: 1, absent: 1, late: 1 });
    expect(result.rows[0].days[0]).toEqual({ period1: "ABSENT", period2: "PRESENT" });
    expect(result.rows[0].days[1]).toEqual({ period1: null, period2: "LATE" });
    expect(result.rows[0].days[2]).toEqual({ period1: null, period2: null });
    expect(result.rows[1]).toMatchObject({ present: 0, absent: 0, late: 0 });
  });

  it("writes a readable RTL workbook with matching status symbols and totals", async () => {
    const table = aggregateMonthlyAttendance(
      [{ id: "student-1", fullName: "أمين" }],
      [
        { studentId: "student-1", sessionDate: "2026-03-01", period: 1, status: "PRESENT" },
        { studentId: "student-1", sessionDate: "2026-03-02", period: 1, status: "ABSENT" },
        { studentId: "student-1", sessionDate: "2026-03-03", period: 2, status: "LATE" },
      ],
      2026,
      3
    );
    const buffer = await createMonthlyAttendanceWorkbook(table, 2026, 3).xlsx.writeBuffer();
    const reopened = new ExcelJS.Workbook();
    await reopened.xlsx.load(buffer);
    const worksheet = reopened.getWorksheet("الحضور الشهري");

    expect(worksheet?.views[0]?.rightToLeft).toBe(true);
    expect(worksheet?.getCell(1, 1).value).toContain("مارس 2026");
    expect(worksheet?.getCell(2, 1).value).toBe("اسم التلميذ");
    expect(worksheet?.getCell(2, 2).value).toBe("1");
    expect(worksheet?.getCell(3, 2).value).toBe("ح1");
    expect(worksheet?.getCell(3, 3).value).toBe("ح2");
    expect(worksheet?.getCell(4, 2).value).toBe("ح");
    expect(worksheet?.getCell(4, 4).value).toBe("غ");
    expect(worksheet?.getCell(4, 7).value).toBe("م");
    expect(worksheet?.getCell(4, 64).value).toBe(1);
    expect(worksheet?.getCell(4, 65).value).toBe(1);
    expect(worksheet?.getCell(4, 66).value).toBe(1);
  });
});
