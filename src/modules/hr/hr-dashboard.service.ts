import { Injectable } from '@nestjs/common';
import { EmployeeStatus, LeaveStatus, PeriodStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { EmployeesService } from './employees/employees.service';
import { PayrollService } from './payroll/payroll.service';
import { round } from './payroll/payroll.engine';
import type { AuthenticatedUser } from '../auth/jwt.strategy';

/**
 * The dashboard the workbook's Dashboard sheet became, plus the one thing it
 * never had: what is about to expire.
 */
@Injectable()
export class HrDashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly employees: EmployeesService,
    private readonly payroll: PayrollService,
  ) {}

  async summary(user: AuthenticatedUser, periodId?: string) {
    const period = periodId
      ? await this.prisma.payrollPeriod.findUnique({ where: { id: periodId } })
      : await this.prisma.payrollPeriod.findFirst({
          orderBy: [{ year: 'desc' }, { month: 'desc' }],
        });

    const [headcount, byStatus, byDepartment, lines, pendingLeave, plannedLeave] =
      await Promise.all([
        this.prisma.employee.count({
          where: { deletedAt: null, status: { not: EmployeeStatus.TERMINATED } },
        }),
        this.prisma.employee.groupBy({
          by: ['status'],
          where: { deletedAt: null },
          _count: { _all: true },
        }),
        this.prisma.employee.groupBy({
          by: ['department'],
          where: { deletedAt: null, status: { not: EmployeeStatus.TERMINATED } },
          _count: { _all: true },
        }),
        period
          ? this.prisma.payrollLine.findMany({ where: { periodId: period.id } })
          : Promise.resolve([]),
        this.prisma.leaveRecord.count({ where: { status: LeaveStatus.REQUESTED } }),
        this.prisma.leaveRecord.aggregate({
          where: {
            status: { in: [LeaveStatus.APPROVED, LeaveStatus.REQUESTED] },
            endDate: { gte: new Date() },
          },
          _sum: { days: true },
        }),
      ]);

    const sum = (field: string) =>
      round(lines.reduce((total, line) => total + Number((line as never)[field] ?? 0), 0));

    /* Three horizons in one call: the dashboard shows all of them, and three
     * round trips for the same table is wasteful. */
    const [in30, in60, in90] = await Promise.all([
      this.employees.expiring(user, 30),
      this.employees.expiring(user, 60),
      this.employees.expiring(user, 90),
    ]);

    return {
      period: period
        ? {
            id: period.id,
            month: period.month,
            year: period.year,
            status: period.status,
            calculated: period.status !== PeriodStatus.DRAFT,
            endDate: PayrollService.periodEndDate(period.month, period.year),
          }
        : null,
      headcount,
      byStatus: byStatus.map((row) => ({ status: row.status, count: row._count._all })),
      byDepartment: byDepartment.map((row) => ({
        department: row.department ?? 'Non affecté',
        count: row._count._all,
      })),
      payroll: {
        lines: lines.length,
        totalGross: sum('currentGross'),
        totalCnss: sum('totalCnss'),
        employerContribution: sum('employerContribution'),
        totalIts: sum('its'),
        totalNet: sum('netSalary'),
        totalOvertime: sum('overtimeAmount'),
        totalAbsence: sum('absenceDeduction'),
      },
      leave: {
        pendingRequests: pendingLeave,
        plannedDays: Number(plannedLeave._sum.days ?? 0),
      },
      expiring: {
        in30: in30.items.length,
        in60: in60.items.length,
        in90: in90.items.length,
        items: in90.items.slice(0, 20),
      },
    };
  }
}
