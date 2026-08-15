import { Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ItsTable, type PayrollRates } from './payroll.engine';

/** A rate set plus its tax table, ready to hand to the engine. */
export interface ResolvedPayrollConfig {
  configId: string;
  label: string;
  rates: PayrollRates;
  itsTable: ItsTable;
}

const dec = (value: Prisma.Decimal | number) => Number(value);

/**
 * Resolves `PayrollConfig` rows into the plain-number shape the engine takes.
 *
 * This is the only place in the codebase that reads rates out of the database,
 * and the engine is the only place that consumes them. Between the two there
 * is no path by which a rate can be typed as a literal into business logic.
 *
 * Resolution is by date, so a period calculated for March 2026 gets March
 * 2026's rates whatever today happens to be. Once a period has been
 * calculated it stores its `configId`, and everything downstream loads *that*
 * config by id rather than re-resolving by date — which is what makes a 2025
 * payslip reopened in 2027 show 2025 numbers.
 */
@Injectable()
export class PayrollConfigService {
  constructor(private readonly prisma: PrismaService) {}

  /** The config in force on `date`. */
  async resolveForDate(date: Date): Promise<ResolvedPayrollConfig> {
    const config = await this.prisma.payrollConfig.findFirst({
      where: {
        effectiveFrom: { lte: date },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: date } }],
      },
      orderBy: { effectiveFrom: 'desc' },
      include: { seniorityBands: true },
    });

    if (!config) {
      throw new NotFoundException(
        `No payroll configuration is in force on ${date.toISOString().slice(0, 10)}. ` +
          'Seed one before running payroll — the engine will not guess a rate.',
      );
    }

    return this.hydrate(config);
  }

  /** The exact config a historical period was calculated with. */
  async resolveById(configId: string): Promise<ResolvedPayrollConfig> {
    const config = await this.prisma.payrollConfig.findUnique({
      where: { id: configId },
      include: { seniorityBands: true },
    });

    if (!config) {
      throw new NotFoundException(`Payroll configuration ${configId} not found`);
    }

    return this.hydrate(config);
  }

  async list() {
    return this.prisma.payrollConfig.findMany({
      orderBy: { effectiveFrom: 'desc' },
      include: {
        seniorityBands: { orderBy: { minDays: 'asc' } },
        _count: { select: { itsBrackets: true, periods: true } },
      },
    });
  }

  async update(configId: string, data: Prisma.PayrollConfigUpdateInput) {
    return this.prisma.payrollConfig.update({ where: { id: configId }, data });
  }

  /**
   * The indexed range query §2.5 asks for — one band, straight out of the
   * index on `(configId, lowerBound, upperBound)`.
   *
   * A payroll *run* does not use this: it loads the table once and does 40
   * binary searches in memory, which is one query instead of forty. This
   * exists for the single ad-hoc lookup — the "what would X be taxed?"
   * question the UI asks — and as the direct expression of the rule.
   */
  async lookupIts(configId: string, taxableWages: number): Promise<number> {
    const rows = await this.prisma.$queryRaw<{ taxAmount: Prisma.Decimal }[]>`
      SELECT taxAmount
      FROM hr_its_brackets
      WHERE configId = ${configId}
        AND lowerBound <= ${taxableWages}
      ORDER BY lowerBound DESC
      LIMIT 1
    `;

    if (rows.length === 0) {
      throw new NotFoundException(
        `Taxable wages ${taxableWages} fall outside the ITS table for config ${configId}`,
      );
    }
    return Number(rows[0].taxAmount);
  }

  private async hydrate(
    config: Prisma.PayrollConfigGetPayload<{ include: { seniorityBands: true } }>,
  ): Promise<ResolvedPayrollConfig> {
    const brackets = await this.prisma.itsBracket.findMany({
      where: { configId: config.id },
      orderBy: { lowerBound: 'asc' },
      select: { lowerBound: true, upperBound: true, taxAmount: true },
    });

    const rates: PayrollRates = {
      contributionCeiling: dec(config.contributionCeiling),
      retirementEmployeeRate: dec(config.retirementEmployeeRate),
      amuEmployeeRate: dec(config.amuEmployeeRate),
      amuCeilingAmount: dec(config.amuCeilingAmount),
      employerRate: dec(config.employerRate),
      employerCappedPortion: dec(config.employerCappedPortion),
      monthlyHours: dec(config.monthlyHours),
      overtimeTier1Rate: dec(config.overtimeTier1Rate),
      overtimeTier1MaxHours: dec(config.overtimeTier1MaxHours),
      overtimeTier2Rate: dec(config.overtimeTier2Rate),
      severanceRatePerYear: dec(config.severanceRatePerYear),
      severanceCnssRate: dec(config.severanceCnssRate),
      annualLeaveDays: dec(config.annualLeaveDays),
      seniorityIncludedInGross: config.seniorityIncludedInGross,
      capRetirementEmployee: config.capRetirementEmployee,
      leaveCarryOverCapDays:
        config.leaveCarryOverCapDays === null ? null : dec(config.leaveCarryOverCapDays),
      seniorityBands: config.seniorityBands.map((band) => ({
        minDays: band.minDays,
        rate: dec(band.rate),
      })),
    };

    return {
      configId: config.id,
      label: config.label,
      rates,
      itsTable: new ItsTable(
        brackets.map((bracket) => ({
          lowerBound: dec(bracket.lowerBound),
          upperBound: dec(bracket.upperBound),
          taxAmount: dec(bracket.taxAmount),
        })),
      ),
    };
  }
}
