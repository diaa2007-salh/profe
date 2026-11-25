import ExcelJS from "exceljs";
import type { MonthlyAttendanceRow } from "@/lib/business/monthly-attendance";
import type { AttendanceStatus } from "@/lib/db/types";

const MONTH_NAMES = [
  "يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو",
  "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر",
];

const SYMBOL: Record<AttendanceStatus, string> = {
  PRESENT: "ح",
  ABSENT: "غ",
  LATE: "م",
};

export function createMonthlyAttendanceWorkbook(
  table: { daysInMonth: number; rows: MonthlyAttendanceRow[] },
  year: number,
  month: number
) {
  const workbook = new ExcelJS.Workbook();
  const worksheet = workbook.addWorksheet("الحضور الشهري", {
    views: [{ rightToLeft: true, state: "frozen", xSplit: 1, ySplit: 3 }],
  });
  const lastColumn = table.daysInMonth * 2 + 4;
  const lastColumnName = worksheet.getColumn(lastColumn).letter;

  worksheet.mergeCells(`A1:${lastColumnName}1`);
  worksheet.getCell("A1").value = `الجدول الشهري للحضور - ${MONTH_NAMES[month - 1]} ${year}`;
  worksheet.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155E75" } };
  worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 30;

  const firstHeaderRow = worksheet.getRow(2);
  worksheet.mergeCells("A2:A3");
  firstHeaderRow.getCell(1).value = "اسم التلميذ";
  for (let day = 1; day <= table.daysInMonth; day++) {
    const firstColumn = 2 + (day - 1) * 2;
    worksheet.mergeCells(2, firstColumn, 2, firstColumn + 1);
    firstHeaderRow.getCell(firstColumn).value = String(day);
    worksheet.getRow(3).getCell(firstColumn).value = "ح1";
    worksheet.getRow(3).getCell(firstColumn + 1).value = "ح2";
  }
  const firstTotalColumn = table.daysInMonth * 2 + 2;
  ["الحضور", "الغياب", "التأخر"].forEach((value, index) => {
    const column = firstTotalColumn + index;
    worksheet.mergeCells(2, column, 3, column);
    firstHeaderRow.getCell(column).value = value;
  });

  [firstHeaderRow, worksheet.getRow(3)].forEach((headerRow) => {
    headerRow.eachCell((cell) => {
      cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF164E63" } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
  });
  firstHeaderRow.getCell(1).alignment = { horizontal: "right", vertical: "middle" };
  firstHeaderRow.height = 24;
  worksheet.getRow(3).height = 20;

  for (const student of table.rows) {
    const row = worksheet.addRow([
      student.fullName,
      ...student.days.flatMap(({ period1, period2 }) => [
        period1 ? SYMBOL[period1] : "-",
        period2 ? SYMBOL[period2] : "-",
      ]),
      student.present,
      student.absent,
      student.late,
    ]);
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: "Arial", size: 11 };
      cell.alignment = { horizontal: columnNumber === 1 ? "right" : "center", vertical: "middle" };
    });
    student.days.forEach(({ period1, period2 }, index) => {
      [period1, period2].forEach((status, periodIndex) => {
        if (!status) return;
        row.getCell(index * 2 + periodIndex + 2).fill = {
          type: "pattern",
          pattern: "solid",
          fgColor: { argb: status === "PRESENT" ? "FFD1FAE5" : status === "ABSENT" ? "FFFEE2E2" : "FFFFEDD5" },
        };
      });
    });
  }

  worksheet.getColumn(1).width = 28;
  for (let column = 2; column <= table.daysInMonth * 2 + 1; column++) worksheet.getColumn(column).width = 5;
  for (let column = firstTotalColumn; column <= lastColumn; column++) worksheet.getColumn(column).width = 11;
  return workbook;
}
