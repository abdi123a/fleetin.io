import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeStatus, PeriodStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HrAuditService } from '../hr-audit.service';
import { PayrollConfigService } from './payroll-config.service';
import { calculateOvertime, calculatePayrollLine, round } from './payroll.engine';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';

/**
 * The payroll run.
 *
 * `DRAFT → CALCULATED → APPROVED → PAID`, one direction only. The two rules
 * that make the module auditable both live here:
 *
 *   - **Calculation snapshots everything.** A `PayrollLine` carries the
 *     employee's name, profession, CNSS number and joining date as they were
 *     at the moment of calculation, alongside every intermediate figure and
 *     the config version. Nothing about a filed period is ever recomputed from
 *     today's employee record.
 *
 *   - **Approval freezes the period.** Corrections go through a new
 *     adjustment period, never through an edit to history.
 */
@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HrAuditService,
    private readonly config: PayrollConfigService,
  ) {}

  /**
   * The date a period's seniority and leave are measured at: its last
   * calendar day. Using `new Date()` here is exactly the workbook defect that
   * made historical documents re-render with today's figures.
   */
  static periodEndDate(month: number, year: number): Date {
    return new Date(Date.UTC(year, month, 0));
  }

  async listPeriods() {
    const periods = await this.prisma.payrollPeriod.findMany({
      orderBy: [{ year: 'desc' }, { month: 'desc' }],
      include: {
        config: { select: { id: true, label: true } },
        _count: { select: { lines: true } },
      },
    });

    return periods.map((period) => ({
      ...period,
      endDate: PayrollService.periodEndDate(period.month, period.year),
    }));
  }

  async createPeriod(user: AuthenticatedUser, month: number, year: number) {
    if (month < 1 || month > 12) {
      throw new BadRequestException(`Month must be 1–12, received ${month}`);
    }

    const existing = await this.prisma.payrollPeriod.findUnique({
      where: { month_year: { month, year } },
    });
    if (existing) {
      throw new ConflictException(`Payroll period ${month}/${year} already exists`);
    }

    const { configId } = await this.config.resolveForDate(
      PayrollService.periodEndDate(month, year),
    );

    const period = await this.prisma.payrollPeriod.create({
      data: { month, year, configId, status: PeriodStatus.DRAFT },
    });

    await this.audit.record(user, {
      entity: 'PayrollPeriod',
      entityId: period.id,
      action: 'create',
      detail: { month, year, configId },
    });

    return period;
  }

  async getPeriod(user: AuthenticatedUser, periodId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({
      where: { id: periodId },
      include: {
        config: true,
        lines: { orderBy: { matricule: 'asc' } },
        overtime: { include: { employee: { select: { id: true, fullName: true, matricule: true } } } },
      },
    });
    if (!period) throw new NotFoundException(`Payroll period ${periodId} not found`);

    await this.audit.record(user, {
      entity: 'PayrollPeriod',
      entityId: periodId,
      action: 'view',
    });

    return {
      ...period,
      endDate: PayrollService.periodEndDate(period.month, period.year),
      lines: period.lines.map((line) => this.serialiseLine(line)),
      overtime: period.overtime.map((entry) => this.serialiseOvertime(entry)),
      totals: this.totalsFor(period.lines),
    };
  }

  // ── Inputs ───────────────────────────────────────────────────────────────

  /**
   * Records overtime hours and any absence deduction for one employee.
   *
   * Keyed on `(periodId, employeeId)`. The workbook keyed on row position and
   * paid employee 1's overtime to employee 2, employee 2's to employee 3, and
   * handed employee 10 the column *total* — 29,564 DJF for zero hours worked.
   * A unique constraint on the pair makes that unrepresentable.
   */
  async setOvertime(
    user: AuthenticatedUser,
    periodId: string,
    employeeId: string,
    input: { overtimeHours?: number; absenceDeduction?: number; note?: string },
  ) {
    const period = await this.requireEditable(periodId);
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { id: true, baseSalary: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    const { rates } = await this.config.resolveById(period.configId);
    const overtime = calculateOvertime(
      Number(employee.baseSalary),
      input.overtimeHours ?? 0,
      rates,
    );

    const data = {
      hours125: new Prisma.Decimal(overtime.hours125),
      hours150: new Prisma.Decimal(overtime.hours150),
      hourlyRate: new Prisma.Decimal(overtime.hourlyRate),
      amount125: new Prisma.Decimal(overtime.amount125),
      amount150: new Prisma.Decimal(overtime.amount150),
      totalAmount: new Prisma.Decimal(overtime.totalAmount),
      absenceDeduction: new Prisma.Decimal(input.absenceDeduction ?? 0),
      note: input.note ?? null,
    };

    const entry = await this.prisma.overtimeEntry.upsert({
      where: { periodId_employeeId: { periodId, employeeId } },
      update: data,
      create: { periodId, employeeId, ...data },
    });

    await this.audit.record(user, {
      entity: 'OvertimeEntry',
      entityId: entry.id,
      action: 'update',
      detail: {
        periodId,
        employeeId,
        hours: (input.overtimeHours ?? 0).toString(),
        absenceDeduction: (input.absenceDeduction ?? 0).toString(),
      },
    });

    return this.serialiseOvertime(entry);
  }

  // ── Calculation ──────────────────────────────────────────────────────────

  /**
   * Calculates every active employee's line and snapshots it.
   *
   * Re-runnable while the period is DRAFT or CALCULATED — the lines are
   * replaced wholesale, so a corrected absence figure is picked up. Once the
   * period is APPROVED this refuses, and the correction goes into a new
   * period instead.
   */
  async calculate(user: AuthenticatedUser, periodId: string) {
    const period = await this.requireEditable(periodId);
    const asOf = PayrollService.periodEndDate(period.month, period.year);
    const { rates, itsTable, configId } = await this.config.resolveById(period.configId);

    const employees = await this.prisma.employee.findMany({
      where: {
        deletedAt: null,
        status: { in: [EmployeeStatus.ACTIVE, EmployeeStatus.ON_LEAVE] },
        joiningDate: { lte: asOf },
      },
      orderBy: { matricule: 'asc' },
    });

    if (employees.length === 0) {
      throw new BadRequestException('No active employees fall inside this period');
    }

    const overtimeEntries = await this.prisma.overtimeEntry.findMany({ where: { periodId } });
    const overtimeByEmployee = new Map(
      overtimeEntries.map((entry) => [entry.employeeId, entry]),
    );

    const lines = employees.map((employee) => {
      const entry = overtimeByEmployee.get(employee.id);
      const overtimeHours = entry
        ? Number(entry.hours125) + Number(entry.hours150)
        : 0;

      const calculated = calculatePayrollLine(
        { joiningDate: employee.joiningDate, baseSalary: Number(employee.baseSalary) },
        {
          asOf,
          overtimeHours,
          absenceDeduction: entry ? Number(entry.absenceDeduction) : 0,
        },
        rates,
        itsTable,
      );

      return {
        periodId,
        employeeId: employee.id,
        // Snapshot: what the record said at calculation time, frozen here.
        employeeName: employee.fullName,
        matricule: employee.matricule,
        profession: employee.profession,
        nationality: employee.nationality,
        cnssNumber: employee.cnssNumber,
        bankAccount: employee.bankAccount,
        joiningDate: employee.joiningDate,
        baseSalary: new Prisma.Decimal(calculated.baseSalary),
        absenceDeduction: new Prisma.Decimal(calculated.absenceDeduction),
        overtimeHours: new Prisma.Decimal(overtimeHours),
        overtimeAmount: new Prisma.Decimal(calculated.overtimeAmount),
        currentGross: new Prisma.Decimal(calculated.currentGross),
        seniorityRate: new Prisma.Decimal(calculated.seniorityRate),
        seniorityAmount: new Prisma.Decimal(calculated.seniorityAmount),
        cappedSalary: new Prisma.Decimal(calculated.cappedSalary),
        retirementEmployee: new Prisma.Decimal(calculated.retirementEmployee),
        amuEmployee: new Prisma.Decimal(calculated.amuEmployee),
        employerContribution: new Prisma.Decimal(calculated.employerContribution),
        totalCnss: new Prisma.Decimal(calculated.totalCnss),
        taxableWages: new Prisma.Decimal(calculated.taxableWages),
        its: new Prisma.Decimal(calculated.its),
        netSalary: new Prisma.Decimal(calculated.netSalary),
        configId,
      };
    });

    /* One transaction: a half-calculated period is worse than an uncalculated
     * one, because it looks finished. */
    await this.prisma.$transaction([
      this.prisma.payrollLine.deleteMany({ where: { periodId } }),
      this.prisma.payrollLine.createMany({ data: lines }),
      this.prisma.payrollPeriod.update({
        where: { id: periodId },
        data: { status: PeriodStatus.CALCULATED, calculatedAt: new Date() },
      }),
    ]);

    await this.audit.record(user, {
      entity: 'PayrollPeriod',
      entityId: periodId,
      action: 'calculate',
      detail: { employees: lines.length, configId, asOf: asOf.toISOString() },
    });

    return this.getPeriod(user, periodId);
  }

  // ── Lifecycle ────────────────────────────────────────────────────────────

  async approve(user: AuthenticatedUser, periodId: string) {
    const period = await this.requirePeriod(periodId);

    if (period.status !== PeriodStatus.CALCULATED) {
      throw new ConflictException(
        `Only a CALCULATED period can be approved; ${period.month}/${period.year} is ${period.status}`,
      );
    }
    const lineCount = await this.prisma.payrollLine.count({ where: { periodId } });
    if (lineCount === 0) {
      throw new ConflictException('Refusing to approve a period with no payroll lines');
    }

    const approved = await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: {
        status: PeriodStatus.APPROVED,
        approvedById: user.id,
        approvedAt: new Date(),
      },
    });

    await this.audit.record(user, {
      entity: 'PayrollPeriod',
      entityId: periodId,
      action: 'approve',
      detail: { month: period.month, year: period.year, lines: lineCount },
    });

    return approved;
  }

  async markPaid(user: AuthenticatedUser, periodId: string) {
    const period = await this.requirePeriod(periodId);

    if (period.status !== PeriodStatus.APPROVED) {
      throw new ConflictException(
        `Only an APPROVED period can be marked paid; ${period.month}/${period.year} is ${period.status}`,
      );
    }

    const paid = await this.prisma.payrollPeriod.update({
      where: { id: periodId },
      data: { status: PeriodStatus.PAID, paidAt: new Date() },
    });

    await this.audit.record(user, {
      entity: 'PayrollPeriod',
      entityId: periodId,
      action: 'pay',
      detail: { month: period.month, year: period.year },
    });

    return paid;
  }

  // ── Reads ────────────────────────────────────────────────────────────────

  /** One employee's payslip line, read from the snapshot — never recomputed. */
  async lineFor(periodId: string, employeeId: string) {
    const line = await this.prisma.payrollLine.findUnique({
      where: { periodId_employeeId: { periodId, employeeId } },
      include: { period: { select: { month: true, year: true, status: true } } },
    });
    if (!line) {
      throw new NotFoundException(
        'No payroll line for this employee in this period. Calculate the period first.',
      );
    }
    return { ...this.serialiseLine(line), period: line.period };
  }

  async linesFor(periodId: string) {
    const lines = await this.prisma.payrollLine.findMany({
      where: { periodId },
      orderBy: { matricule: 'asc' },
    });
    return { lines: lines.map((line) => this.serialiseLine(line)), totals: this.totalsFor(lines) };
  }

  // ── Internals ────────────────────────────────────────────────────────────

  private async requirePeriod(periodId: string) {
    const period = await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } });
    if (!period) throw new NotFoundException(`Payroll period ${periodId} not found`);
    return period;
  }

  /** APPROVED and PAID periods are immutable — that is the whole point. */
  private async requireEditable(periodId: string) {
    const period = await this.requirePeriod(periodId);
    if (period.status === PeriodStatus.APPROVED || period.status === PeriodStatus.PAID) {
      throw new ConflictException(
        `Payroll period ${period.month}/${period.year} is ${period.status} and cannot be changed. ` +
          'Post the correction as a new adjustment period.',
      );
    }
    return period;
  }

  private totalsFor(lines: { [key: string]: unknown }[]) {
    const sum = (field: string) =>
      round(lines.reduce((total, line) => total + Number(line[field] ?? 0), 0));

    return {
      headcount: lines.length,
      currentGross: sum('currentGross'),
      overtimeAmount: sum('overtimeAmount'),
      absenceDeduction: sum('absenceDeduction'),
      seniorityAmount: sum('seniorityAmount'),
      cappedSalary: sum('cappedSalary'),
      retirementEmployee: sum('retirementEmployee'),
      amuEmployee: sum('amuEmployee'),
      employerContribution: sum('employerContribution'),
      totalCnss: sum('totalCnss'),
      taxableWages: sum('taxableWages'),
      its: sum('its'),
      netSalary: sum('netSalary'),
    };
  }

  private serialiseLine<T extends Record<string, unknown>>(line: T) {
    const numeric = [
      'baseSalary',
      'absenceDeduction',
      'overtimeHours',
      'overtimeAmount',
      'currentGross',
      'seniorityRate',
      'seniorityAmount',
      'cappedSalary',
      'retirementEmployee',
      'amuEmployee',
      'employerContribution',
      'totalCnss',
      'taxableWages',
      'its',
      'netSalary',
    ];
    const result: Record<string, unknown> = { ...line };
    for (const field of numeric) {
      if (result[field] !== undefined && result[field] !== null) {
        result[field] = Number(result[field] as Prisma.Decimal);
      }
    }
    return result as T & { currentGross: number; netSalary: number };
  }

  private serialiseOvertime<T extends Record<string, unknown>>(entry: T) {
    const numeric = [
      'hours125',
      'hours150',
      'hourlyRate',
      'amount125',
      'amount150',
      'totalAmount',
      'absenceDeduction',
    ];
    const result: Record<string, unknown> = { ...entry };
    for (const field of numeric) {
      if (result[field] !== undefined && result[field] !== null) {
        result[field] = Number(result[field] as Prisma.Decimal);
      }
    }
    return result;
  }
}
