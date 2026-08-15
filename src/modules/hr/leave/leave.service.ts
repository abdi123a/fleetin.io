import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EmployeeStatus, LeaveStatus, LeaveType, Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { HrAuditService } from '../hr-audit.service';
import { PayrollConfigService } from '../payroll/payroll-config.service';
import { calculateLeaveBalance, daysBetween } from '../payroll/payroll.engine';
import { employeeScopeFor, resolveViewer } from '../hr-access';
import type { AuthenticatedUser } from '../../auth/jwt.strategy';

/** Calendar days, both ends inclusive — a one-day leave is one day. */
export function inclusiveDays(start: Date, end: Date): number {
  return daysBetween(start, end) + 1;
}

@Injectable()
export class LeaveService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: HrAuditService,
    private readonly config: PayrollConfigService,
  ) {}

  async request(
    user: AuthenticatedUser,
    dto: {
      employeeId: string;
      type?: LeaveType;
      startDate: string;
      endDate: string;
      reason?: string;
    },
  ) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: dto.employeeId, deletedAt: null },
      select: { id: true, fullName: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${dto.employeeId} not found`);

    const startDate = new Date(dto.startDate);
    const endDate = new Date(dto.endDate);
    if (endDate < startDate) {
      throw new BadRequestException('The leave end date falls before its start date');
    }

    const overlap = await this.prisma.leaveRecord.findFirst({
      where: {
        employeeId: dto.employeeId,
        status: { in: [LeaveStatus.REQUESTED, LeaveStatus.APPROVED] },
        startDate: { lte: endDate },
        endDate: { gte: startDate },
      },
    });
    if (overlap) {
      throw new ConflictException(
        `This overlaps leave already booked from ${overlap.startDate
          .toISOString()
          .slice(0, 10)} to ${overlap.endDate.toISOString().slice(0, 10)}`,
      );
    }

    const record = await this.prisma.leaveRecord.create({
      data: {
        employeeId: dto.employeeId,
        type: dto.type ?? LeaveType.ANNUAL,
        status: LeaveStatus.REQUESTED,
        startDate,
        endDate,
        days: new Prisma.Decimal(inclusiveDays(startDate, endDate)),
        reason: dto.reason ?? null,
        requestedById: user.id,
      },
    });

    await this.audit.record(user, {
      entity: 'LeaveRecord',
      entityId: record.id,
      action: 'create',
      detail: { employeeId: dto.employeeId, startDate: dto.startDate, endDate: dto.endDate },
    });

    return this.serialise(record);
  }

  async decide(
    user: AuthenticatedUser,
    leaveId: string,
    decision: 'APPROVED' | 'REJECTED',
    note?: string,
  ) {
    const record = await this.prisma.leaveRecord.findUnique({ where: { id: leaveId } });
    if (!record) throw new NotFoundException(`Leave record ${leaveId} not found`);
    if (record.status !== LeaveStatus.REQUESTED) {
      throw new ConflictException(`This request is already ${record.status}`);
    }

    const decided = await this.prisma.leaveRecord.update({
      where: { id: leaveId },
      data: {
        status: decision === 'APPROVED' ? LeaveStatus.APPROVED : LeaveStatus.REJECTED,
        decidedById: user.id,
        decidedAt: new Date(),
        decisionNote: note ?? null,
      },
    });

    await this.audit.record(user, {
      entity: 'LeaveRecord',
      entityId: leaveId,
      action: 'update',
      detail: { decision, employeeId: record.employeeId },
    });

    return this.serialise(decided);
  }

  async cancel(user: AuthenticatedUser, leaveId: string) {
    const record = await this.prisma.leaveRecord.findUnique({ where: { id: leaveId } });
    if (!record) throw new NotFoundException(`Leave record ${leaveId} not found`);

    const cancelled = await this.prisma.leaveRecord.update({
      where: { id: leaveId },
      data: { status: LeaveStatus.CANCELLED, decidedById: user.id, decidedAt: new Date() },
    });

    await this.audit.record(user, {
      entity: 'LeaveRecord',
      entityId: leaveId,
      action: 'update',
      detail: { decision: 'CANCELLED', employeeId: record.employeeId },
    });

    return this.serialise(cancelled);
  }

  async list(
    user: AuthenticatedUser,
    filters: { employeeId?: string; status?: LeaveStatus; from?: string; to?: string },
  ) {
    const viewer = resolveViewer(
      user,
      (
        await this.prisma.employee.findUnique({
          where: { userId: user.id },
          select: { id: true },
        })
      )?.id ?? null,
    );
    const scope = employeeScopeFor(user, viewer);

    const records = await this.prisma.leaveRecord.findMany({
      where: {
        ...(filters.employeeId ? { employeeId: filters.employeeId } : {}),
        ...(filters.status ? { status: filters.status } : {}),
        ...(filters.from ? { endDate: { gte: new Date(filters.from) } } : {}),
        ...(filters.to ? { startDate: { lte: new Date(filters.to) } } : {}),
        employee: { deletedAt: null, ...(scope ?? {}) },
      },
      include: {
        employee: { select: { id: true, fullName: true, matricule: true, profession: true } },
      },
      orderBy: { startDate: 'desc' },
    });

    return records.map((record) => this.serialise(record));
  }

  /** One employee's accrual, taken and balance, measured at `asOf`. */
  async balance(employeeId: string, asOf = new Date()) {
    const employee = await this.prisma.employee.findFirst({
      where: { id: employeeId, deletedAt: null },
      select: { id: true, fullName: true, joiningDate: true },
    });
    if (!employee) throw new NotFoundException(`Employee ${employeeId} not found`);

    const taken = await this.prisma.leaveRecord.aggregate({
      where: { employeeId, status: LeaveStatus.APPROVED },
      _sum: { days: true },
    });

    const { rates } = await this.config.resolveForDate(asOf);
    return {
      employeeId,
      fullName: employee.fullName,
      ...calculateLeaveBalance(
        employee.joiningDate,
        asOf,
        Number(taken._sum.days ?? 0),
        rates,
      ),
    };
  }

  /**
   * The planning grid — one row per employee, one column per month over a
   * rolling 13-month window, days taken per cell.
   *
   * This replicates the "Leav plan" sheet, which is what the user already
   * works from. A leave period that straddles a month boundary is split
   * across both cells rather than being credited whole to its start month.
   */
  async planningGrid(
    user: AuthenticatedUser,
    anchor: Date = new Date(),
    monthsBack = 12,
  ) {
    const viewer = resolveViewer(
      user,
      (
        await this.prisma.employee.findUnique({
          where: { userId: user.id },
          select: { id: true },
        })
      )?.id ?? null,
    );
    const scope = employeeScopeFor(user, viewer);

    const start = new Date(
      Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() - monthsBack, 1),
    );
    const end = new Date(Date.UTC(anchor.getUTCFullYear(), anchor.getUTCMonth() + 1, 0));

    const months: { key: string; month: number; year: number }[] = [];
    for (let i = 0; i <= monthsBack; i += 1) {
      const cursor = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + i, 1));
      months.push({
        key: `${cursor.getUTCFullYear()}-${String(cursor.getUTCMonth() + 1).padStart(2, '0')}`,
        month: cursor.getUTCMonth() + 1,
        year: cursor.getUTCFullYear(),
      });
    }

    const [employees, records] = await Promise.all([
      this.prisma.employee.findMany({
        where: {
          deletedAt: null,
          status: { not: EmployeeStatus.TERMINATED },
          ...(scope ?? {}),
        },
        select: {
          id: true,
          fullName: true,
          matricule: true,
          profession: true,
          joiningDate: true,
        },
        orderBy: { matricule: 'asc' },
      }),
      this.prisma.leaveRecord.findMany({
        where: {
          status: { in: [LeaveStatus.APPROVED, LeaveStatus.REQUESTED] },
          startDate: { lte: end },
          endDate: { gte: start },
          employee: { deletedAt: null, ...(scope ?? {}) },
        },
      }),
    ]);

    const { rates } = await this.config.resolveForDate(anchor);

    const takenByEmployee = await this.prisma.leaveRecord.groupBy({
      by: ['employeeId'],
      where: { status: LeaveStatus.APPROVED },
      _sum: { days: true },
    });
    const takenMap = new Map(
      takenByEmployee.map((row) => [row.employeeId, Number(row._sum.days ?? 0)]),
    );

    const cells = new Map<string, { days: number; status: LeaveStatus }>();
    for (const record of records) {
      // Walk the record day by day so a period spanning two months lands in
      // both columns, which is what the planning sheet shows.
      for (
        let day = new Date(record.startDate);
        day <= record.endDate;
        day = new Date(day.getTime() + 86_400_000)
      ) {
        if (day < start || day > end) continue;
        const key = `${record.employeeId}|${day.getUTCFullYear()}-${String(
          day.getUTCMonth() + 1,
        ).padStart(2, '0')}`;
        const existing = cells.get(key);
        cells.set(key, {
          days: (existing?.days ?? 0) + 1,
          // A pending day anywhere in the cell marks the whole cell pending.
          status:
            existing?.status === LeaveStatus.REQUESTED || record.status === LeaveStatus.REQUESTED
              ? LeaveStatus.REQUESTED
              : LeaveStatus.APPROVED,
        });
      }
    }

    return {
      months,
      rows: employees.map((employee) => ({
        employeeId: employee.id,
        fullName: employee.fullName,
        matricule: employee.matricule,
        profession: employee.profession,
        balance: calculateLeaveBalance(
          employee.joiningDate,
          anchor,
          takenMap.get(employee.id) ?? 0,
          rates,
        ),
        cells: months.map((month) => {
          const cell = cells.get(`${employee.id}|${month.key}`);
          return {
            key: month.key,
            days: cell?.days ?? 0,
            status: cell?.status ?? null,
          };
        }),
      })),
    };
  }

  private serialise<T extends { days?: Prisma.Decimal }>(record: T) {
    return { ...record, ...(record.days !== undefined ? { days: Number(record.days) } : {}) };
  }
}
