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
    views: [{ rightToLeft: true, state: "frozen", xSplit: 1, ySplit: 2 }],
  });
  const lastColumn = table.daysInMonth + 4;
  const lastColumnName = worksheet.getColumn(lastColumn).letter;

  worksheet.mergeCells(`A1:${lastColumnName}1`);
  worksheet.getCell("A1").value = `الجدول الشهري للحضور - ${MONTH_NAMES[month - 1]} ${year}`;
  worksheet.getCell("A1").font = { name: "Arial", size: 16, bold: true, color: { argb: "FFFFFFFF" } };
  worksheet.getCell("A1").fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF155E75" } };
  worksheet.getCell("A1").alignment = { horizontal: "center", vertical: "middle" };
  worksheet.getRow(1).height = 30;

  const headers = [
    "اسم التلميذ",
    ...Array.from({ length: table.daysInMonth }, (_, index) => String(index + 1)),
    "الحضور",
    "الغياب",
    "التأخر",
  ];
  const headerRow = worksheet.addRow([]);
  headers.forEach((value, index) => {
    const cell = headerRow.getCell(index + 1);
    cell.value = value;
    cell.font = { name: "Arial", bold: true, color: { argb: "FFFFFFFF" } };
    cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: "FF164E63" } };
    cell.alignment = { horizontal: "center", vertical: "middle" };
  });
  headerRow.height = 24;

  for (const student of table.rows) {
    const row = worksheet.addRow([
      student.fullName,
      ...student.days.map((status) => status ? SYMBOL[status] : "-"),
      student.present,
      student.absent,
      student.late,
    ]);
    row.eachCell((cell, columnNumber) => {
      cell.font = { name: "Arial", size: 11 };
      cell.alignment = { horizontal: columnNumber === 1 ? "right" : "center", vertical: "middle" };
    });
    student.days.forEach((status, index) => {
      if (!status) return;
      row.getCell(index + 2).fill = {
        type: "pattern",
        pattern: "solid",
        fgColor: { argb: status === "PRESENT" ? "FFD1FAE5" : status === "ABSENT" ? "FFFEE2E2" : "FFFFEDD5" },
      };
    });
  }

  worksheet.getColumn(1).width = 28;
  for (let column = 2; column <= table.daysInMonth + 1; column++) worksheet.getColumn(column).width = 5;
  for (let column = table.daysInMonth + 2; column <= lastColumn; column++) worksheet.getColumn(column).width = 11;
  return workbook;
}
