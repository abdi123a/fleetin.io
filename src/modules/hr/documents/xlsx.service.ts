import { Injectable } from '@nestjs/common';
import { Workbook } from 'exceljs';

/**
 * The bordereau CNSS as a spreadsheet.
 *
 * §4.5 asks for both PDF and XLSX. This reads the same payload the PDF
 * renderer does, so the two cannot disagree — including the employee count in
 * "Total {n} salariés", which is computed from the rows in both.
 */
@Injectable()
export class XlsxService {
  async bordereau(payload: Record<string, any>): Promise<Buffer> {
    const workbook = new Workbook();
    workbook.creator = payload.company.legalName;
    workbook.created = new Date(payload.issueDate);

    const sheet = workbook.addWorksheet(`CNSS ${payload.period.month}-${payload.period.year}`, {
      pageSetup: { paperSize: 9, orientation: 'landscape', fitToPage: true, fitToWidth: 1 },
    });

    sheet.mergeCells('A1:R1');
    sheet.getCell('A1').value = `${payload.company.legalName} — Liste du personnel`;
    sheet.getCell('A1').font = { size: 14, bold: true };

    sheet.mergeCells('A2:R2');
    sheet.getCell('A2').value =
      `CNSS N° ${payload.company.cnssId}  ·  NIF ${payload.company.nif}  ·  ` +
      `Mois : ${payload.period.labelFr}  ·  Réf : ${payload.referenceNo}`;
    sheet.getCell('A2').font = { size: 10, color: { argb: 'FF555555' } };
    sheet.addRow([]);

    const columns = [
      { header: 'N°', key: 'index', width: 5 },
      { header: 'Nom et prénom', key: 'employeeName', width: 26 },
      { header: 'Nationalité', key: 'nationality', width: 14 },
      { header: 'N° CNSS', key: 'cnssNumber', width: 15 },
      { header: 'Profession', key: 'profession', width: 20 },
      { header: 'Embauche', key: 'joiningDate', width: 12 },
      { header: 'Absence', key: 'absenceDeduction', width: 12 },
      { header: 'H. supp.', key: 'overtimeAmount', width: 12 },
      { header: 'Brut', key: 'currentGross', width: 13 },
      { header: 'Ancienneté', key: 'seniorityRate', width: 11 },
      { header: 'Plafonné', key: 'cappedSalary', width: 13 },
      { header: 'Retraite 4 %', key: 'retirementEmployee', width: 13 },
      { header: 'AMU 2 %', key: 'amuEmployee', width: 12 },
      { header: 'Patronale 15,7 %', key: 'employerContribution', width: 16 },
      { header: 'CNSS 21,7 %', key: 'totalCnss', width: 14 },
      { header: 'Imposable', key: 'taxableWages', width: 14 },
      { header: 'ITS', key: 'its', width: 12 },
      { header: 'Net', key: 'netSalary', width: 14 },
    ];

    const headerRow = sheet.addRow(columns.map((column) => column.header));
    headerRow.font = { bold: true, size: 9 };
    headerRow.alignment = { vertical: 'middle', wrapText: true };
    headerRow.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEEF0F3' } };
      cell.border = {
        top: { style: 'thin' },
        left: { style: 'thin' },
        bottom: { style: 'thin' },
        right: { style: 'thin' },
      };
    });
    columns.forEach((column, index) => {
      sheet.getColumn(index + 1).width = column.width;
    });

    const moneyFormat = '#,##0';
    for (const row of payload.rows) {
      const added = sheet.addRow([
        row.index,
        row.employeeName,
        row.nationality,
        row.cnssNumber,
        row.profession,
        new Date(row.joiningDate),
        row.absenceDeduction,
        row.overtimeAmount,
        row.currentGross,
        row.seniorityRate,
        row.cappedSalary,
        row.retirementEmployee,
        row.amuEmployee,
        row.employerContribution,
        row.totalCnss,
        row.taxableWages,
        row.its,
        row.netSalary,
      ]);
      added.getCell(6).numFmt = 'dd/mm/yyyy';
      added.getCell(10).numFmt = '0%';
      for (const index of [7, 8, 9, 11, 12, 13, 14, 15, 16, 17, 18]) {
        added.getCell(index).numFmt = moneyFormat;
      }
    }

    const totals = payload.totals;
    const totalRow = sheet.addRow([
      '',
      `Total — ${totals.headcount} salarié${totals.headcount > 1 ? 's' : ''}`,
      '',
      '',
      '',
      '',
      totals.absenceDeduction,
      totals.overtimeAmount,
      totals.currentGross,
      null,
      totals.cappedSalary,
      totals.retirementEmployee,
      totals.amuEmployee,
      totals.employerContribution,
      totals.totalCnss,
      totals.taxableWages,
      totals.its,
      totals.netSalary,
    ]);
    totalRow.font = { bold: true };
    totalRow.eachCell((cell, index) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF6F7F9' } };
      if (index >= 7) cell.numFmt = moneyFormat;
    });

    sheet.addRow([]);
    const frame = sheet.addRow(["CADRE À REMPLIR PAR L'EMPLOYEUR"]);
    frame.font = { bold: true, size: 10 };

    const summary: [string, number | string][] = [
      ['Salaires bruts déclarés', totals.currentGross],
      ['Cotisations à verser', totals.totalCnss],
      ['Majoration 10 %', '—'],
      ['Majoration 3 %', '—'],
      ['Astreinte', '—'],
      [`Total ${totals.headcount} salarié${totals.headcount > 1 ? 's' : ''}`, totals.currentGross],
      ['ITS', totals.its],
      ['Total à verser', totals.totalCnss + totals.its],
    ];
    for (const [label, value] of summary) {
      const row = sheet.addRow([label, value]);
      if (typeof value === 'number') row.getCell(2).numFmt = moneyFormat;
      if (label === 'Total à verser') row.font = { bold: true };
    }

    return Buffer.from(await workbook.xlsx.writeBuffer());
  }
}
