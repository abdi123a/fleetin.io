import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DocumentScope, LeaveStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { PayrollConfigService } from '../payroll/payroll-config.service';
import { PayrollService } from '../payroll/payroll.service';
import {
  calculateLeaveBalance,
  calculatePayrollLine,
  calculateSeverance,
} from '../payroll/payroll.engine';
import { civility, concernedWord, employedWord, frMonthYear } from './fr.format';

/**
 * Builds the complete value set a document renders from.
 *
 * Preview and issue call this with identical arguments; the only difference
 * downstream is that issue consumes a reference number and persists the
 * result. That is what stops the preview and the filed PDF drifting apart.
 *
 * The payload is also what gets snapshotted into `IssuedDocument.payloadJson`,
 * so it has to be self-contained: every figure and every label the document
 * shows, resolved, with nothing left to look up at render time.
 */

export interface DocumentFieldValues {
  issueDate?: string;
  startDate?: string;
  endDate?: string;
  leaveRecordId?: string;
  terminationDate?: string;
  payUnusedLeave?: boolean;
  periodId?: string;
}

export interface BuildPayloadArgs {
  templateKey: string;
  employeeId?: string;
  periodId?: string;
  fields: DocumentFieldValues;
  referenceNo: string;
}

@Injectable()
export class PayloadBuilder {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: PayrollConfigService,
  ) {}

  async build(args: BuildPayloadArgs): Promise<Record<string, unknown>> {
    const template = await this.prisma.documentTemplate.findUnique({
      where: { key: args.templateKey },
    });
    if (!template) throw new NotFoundException(`Unknown document "${args.templateKey}"`);

    const settings = await this.prisma.companySettings.findFirst();
    if (!settings) {
      throw new NotFoundException(
        'Company settings have not been configured. Every document reads its letterhead ' +
          'from them, so none can be generated until they exist.',
      );
    }

    /* Frozen here, once. Never TODAY() at render time — reprinting a 2025
     * attestation in 2027 must show the date it was actually issued. */
    const issueDate = args.fields.issueDate
      ? new Date(args.fields.issueDate)
      : new Date();

    const company = {
      name: settings.name,
      legalName: settings.legalName,
      department: settings.department,
      address: settings.address,
      phone: settings.phone,
      email: settings.email,
      cnssId: settings.cnssId,
      nif: settings.nif,
      bankName: settings.bankName,
      bankAccountName: settings.bankAccountName,
      bankAccountNo: settings.bankAccountNo,
      signatories: {
        prepared: settings.signatoryPrepared,
        checked: settings.signatoryChecked,
        approved: settings.signatoryApproved,
      },
    };

    const base = {
      templateKey: template.key,
      templateLabel: template.label,
      templateVersion: template.version,
      scope: template.scope,
      referenceNo: args.referenceNo,
      issueDate: issueDate.toISOString(),
      company,
    };

    if (template.scope === DocumentScope.PERIOD) {
      return { ...base, ...(await this.periodPayload(args)) };
    }
    return { ...base, ...(await this.employeePayload(args, issueDate)) };
  }

  // ── Employee-scope documents ─────────────────────────────────────────────

  private async employeePayload(args: BuildPayloadArgs, issueDate: Date) {
    if (!args.employeeId) {
      throw new BadRequestException('This document is issued to one employee; none was chosen');
    }

    const employee = await this.prisma.employee.findFirst({
      where: { id: args.employeeId, deletedAt: null },
    });
    if (!employee) throw new NotFoundException(`Employee ${args.employeeId} not found`);

    const { rates, itsTable } = await this.config.resolveForDate(issueDate);

    const takenAggregate = await this.prisma.leaveRecord.aggregate({
      where: { employeeId: employee.id, status: LeaveStatus.APPROVED },
      _sum: { days: true },
    });
    const leaveBalance = calculateLeaveBalance(
      employee.joiningDate,
      issueDate,
      Number(takenAggregate._sum.days ?? 0),
      rates,
    );

    const employeeBlock = {
      id: employee.id,
      matricule: employee.matricule,
      fullName: employee.fullName,
      gender: employee.gender,
      civility: civility(employee.gender),
      employedWord: employedWord(employee.gender),
      concernedWord: concernedWord(employee.gender),
      nationality: employee.nationality,
      nationalityLower: employee.nationality.toLocaleLowerCase('fr-FR'),
      cnssNumber: employee.cnssNumber ?? '—',
      nifNumber: employee.nifNumber ?? '—',
      profession: employee.profession,
      department: employee.department,
      contractType: employee.contractType,
      joiningDate: employee.joiningDate.toISOString(),
      baseSalary: Number(employee.baseSalary),
      bankAccount: employee.bankAccount ?? '—',
      leaveBalance,
    };

    switch (args.templateKey) {
      case 'attestation_travail':
        return { employee: employeeBlock };

      case 'attestation_conge':
        return {
          employee: employeeBlock,
          leave: await this.leaveBlock(employee.id, args.fields),
        };

      case 'indemnite_fin': {
        if (!args.fields.terminationDate) {
          throw new BadRequestException('A termination date is required for this document');
        }
        const terminationDate = new Date(args.fields.terminationDate);

        /* Priced off the last calculated gross where one exists, so the
         * settlement matches what was actually filed; otherwise off the
         * current base salary, which is all there is to go on. */
        const lastLine = await this.prisma.payrollLine.findFirst({
          where: { employeeId: employee.id },
          orderBy: [{ period: { year: 'desc' } }, { period: { month: 'desc' } }],
          include: { period: { select: { month: true, year: true } } },
        });

        const currentGross = lastLine
          ? Number(lastLine.currentGross)
          : Number(employee.baseSalary);

        const severance = calculateSeverance(
          {
            joiningDate: employee.joiningDate,
            terminationDate,
            currentGross,
            unusedLeaveDays: leaveBalance.balance,
            payUnusedLeave: args.fields.payUnusedLeave === true,
          },
          rates,
        );

        return {
          employee: employeeBlock,
          severance: {
            ...severance,
            terminationDate: terminationDate.toISOString(),
            grossSource: lastLine
              ? `Bulletin ${lastLine.period.month}/${lastLine.period.year}`
              : 'Salaire de base',
            payUnusedLeave: args.fields.payUnusedLeave === true,
          },
        };
      }

      case 'bulletin_paie': {
        const line = await this.payslipLine(employee.id, args.fields, issueDate, rates, itsTable);
        return { employee: employeeBlock, payslip: line };
      }

      default:
        throw new BadRequestException(`"${args.templateKey}" is not an employee-scope document`);
    }
  }

  private async leaveBlock(employeeId: string, fields: DocumentFieldValues) {
    /* Prefer an approved record: the attestation should say what was actually
     * granted, not what someone re-typed into the form. */
    if (fields.leaveRecordId) {
      const record = await this.prisma.leaveRecord.findFirst({
        where: { id: fields.leaveRecordId, employeeId },
      });
      if (!record) throw new NotFoundException('That leave record was not found');
      if (record.status !== LeaveStatus.APPROVED) {
        throw new BadRequestException(
          `An attestation de congé can only be issued for approved leave; this one is ${record.status}`,
        );
      }
      return {
        recordId: record.id,
        startDate: record.startDate.toISOString(),
        endDate: record.endDate.toISOString(),
        days: Number(record.days),
        type: record.type,
        source: 'record' as const,
      };
    }

    if (!fields.startDate || !fields.endDate) {
      throw new BadRequestException('Leave dates are required for this document');
    }
    const startDate = new Date(fields.startDate);
    const endDate = new Date(fields.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('The leave end date falls before its start date');
    }

    return {
      recordId: null,
      startDate: startDate.toISOString(),
      endDate: endDate.toISOString(),
      days: Math.floor((endDate.getTime() - startDate.getTime()) / 86_400_000) + 1,
      type: 'ANNUAL',
      source: 'manual' as const,
    };
  }

  /**
   * A payslip always reads the *filed* line where one exists.
   *
   * Only when no calculated line exists (a preview against a draft period)
   * does it fall back to computing one — and it says so, so nobody mistakes a
   * projection for a filing.
   */
  private async payslipLine(
    employeeId: string,
    fields: DocumentFieldValues,
    issueDate: Date,
    rates: Parameters<typeof calculatePayrollLine>[2],
    itsTable: Parameters<typeof calculatePayrollLine>[3],
  ) {
    const period = fields.periodId
      ? await this.prisma.payrollPeriod.findUnique({ where: { id: fields.periodId } })
      : await this.prisma.payrollPeriod.findFirst({
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        });

    if (!period) {
      throw new BadRequestException('No payroll period exists to issue a payslip against');
    }

    const line = await this.prisma.payrollLine.findUnique({
      where: { periodId_employeeId: { periodId: period.id, employeeId } },
    });

    const periodBlock = {
      id: period.id,
      month: period.month,
      year: period.year,
      status: period.status,
      labelFr: frMonthYear(period.month, period.year),
    };

    if (line) {
      return {
        period: periodBlock,
        provisional: false,
        baseSalary: Number(line.baseSalary),
        absenceDeduction: Number(line.absenceDeduction),
        overtimeHours: Number(line.overtimeHours),
        overtimeAmount: Number(line.overtimeAmount),
        currentGross: Number(line.currentGross),
        seniorityRate: Number(line.seniorityRate),
        seniorityAmount: Number(line.seniorityAmount),
        cappedSalary: Number(line.cappedSalary),
        retirementEmployee: Number(line.retirementEmployee),
        amuEmployee: Number(line.amuEmployee),
        employerContribution: Number(line.employerContribution),
        totalCnss: Number(line.totalCnss),
        taxableWages: Number(line.taxableWages),
        its: Number(line.its),
        netSalary: Number(line.netSalary),
      };
    }

    const employee = await this.prisma.employee.findUniqueOrThrow({ where: { id: employeeId } });
    const overtime = await this.prisma.overtimeEntry.findUnique({
      where: { periodId_employeeId: { periodId: period.id, employeeId } },
    });

    const calculated = calculatePayrollLine(
      { joiningDate: employee.joiningDate, baseSalary: Number(employee.baseSalary) },
      {
        asOf: PayrollService.periodEndDate(period.month, period.year),
        overtimeHours: overtime ? Number(overtime.hours125) + Number(overtime.hours150) : 0,
        absenceDeduction: overtime ? Number(overtime.absenceDeduction) : 0,
      },
      rates,
      itsTable,
    );

    return {
      period: periodBlock,
      /* Surfaced on the document itself. A payslip printed from an
       * uncalculated period is a projection, and saying so is cheaper than
       * explaining later why it disagreed with the filing. */
      provisional: true,
      baseSalary: calculated.baseSalary,
      absenceDeduction: calculated.absenceDeduction,
      overtimeHours: overtime ? Number(overtime.hours125) + Number(overtime.hours150) : 0,
      overtimeAmount: calculated.overtimeAmount,
      currentGross: calculated.currentGross,
      seniorityRate: calculated.seniorityRate,
      seniorityAmount: calculated.seniorityAmount,
      cappedSalary: calculated.cappedSalary,
      retirementEmployee: calculated.retirementEmployee,
      amuEmployee: calculated.amuEmployee,
      employerContribution: calculated.employerContribution,
      totalCnss: calculated.totalCnss,
      taxableWages: calculated.taxableWages,
      its: calculated.its,
      netSalary: calculated.netSalary,
      _issueDateUsed: issueDate.toISOString(),
    };
  }

  // ── Period-scope documents ───────────────────────────────────────────────

  private async periodPayload(args: BuildPayloadArgs) {
    const period = args.periodId
      ? await this.prisma.payrollPeriod.findUnique({ where: { id: args.periodId } })
      : await this.prisma.payrollPeriod.findFirst({
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        });

    if (!period) throw new NotFoundException('No payroll period to report on');

    const lines = await this.prisma.payrollLine.findMany({
      where: { periodId: period.id },
      orderBy: { matricule: 'asc' },
    });

    if (lines.length === 0) {
      throw new BadRequestException(
        `Payroll period ${period.month}/${period.year} has not been calculated yet, ` +
          'so there is nothing to declare.',
      );
    }

    const num = (value: Prisma.Decimal) => Number(value);
    const rows = lines.map((line, index) => ({
      index: index + 1,
      employeeId: line.employeeId,
      employeeName: line.employeeName,
      matricule: line.matricule,
      nationality: line.nationality,
      cnssNumber: line.cnssNumber ?? '—',
      profession: line.profession,
      joiningDate: line.joiningDate.toISOString(),
      bankAccount: line.bankAccount ?? '—',
      absenceDeduction: num(line.absenceDeduction),
      overtimeAmount: num(line.overtimeAmount),
      currentGross: num(line.currentGross),
      seniorityRate: num(line.seniorityRate),
      seniorityAmount: num(line.seniorityAmount),
      cappedSalary: num(line.cappedSalary),
      retirementEmployee: num(line.retirementEmployee),
      amuEmployee: num(line.amuEmployee),
      employerContribution: num(line.employerContribution),
      totalCnss: num(line.totalCnss),
      taxableWages: num(line.taxableWages),
      its: num(line.its),
      netSalary: num(line.netSalary),
    }));

    const sum = (field: keyof (typeof rows)[number]) =>
      rows.reduce((total, row) => total + (row[field] as number), 0);

    return {
      period: {
        id: period.id,
        month: period.month,
        year: period.year,
        status: period.status,
        labelFr: frMonthYear(period.month, period.year),
        labelFrLower: frMonthYear(period.month, period.year).toLocaleLowerCase('fr-FR'),
      },
      rows,
      totals: {
        /* Computed, never typed. The source file declared "Total 19 SALARIES"
         * over a ten-person list. */
        headcount: rows.length,
        absenceDeduction: sum('absenceDeduction'),
        overtimeAmount: sum('overtimeAmount'),
        currentGross: sum('currentGross'),
        seniorityAmount: sum('seniorityAmount'),
        cappedSalary: sum('cappedSalary'),
        retirementEmployee: sum('retirementEmployee'),
        amuEmployee: sum('amuEmployee'),
        employerContribution: sum('employerContribution'),
        totalCnss: sum('totalCnss'),
        taxableWages: sum('taxableWages'),
        its: sum('its'),
        netSalary: sum('netSalary'),
      },
    };
  }
}
