import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextReferenceField } from '../../common/helpers/reference.util';
import { LedgerService } from '../ledger/ledger.service';
import { CreditFacilitiesService } from './credit-facilities.service';
import { BankAccountsService } from './bank-accounts.service';
import { CreateDrawdownDto } from './dto/create-drawdown.dto';
import { RepayDrawdownDto } from './dto/repay-drawdown.dto';

/**
 * Real drawdowns against a real `CreditFacility`. Created already-disbursed
 * (`disbursedAt` is set at creation) — unlike the frontend mock's separate
 * "confirm" step, there is no unconfirmed-drawdown state in this shape;
 * creation is confirmation.
 */
@Injectable()
export class DrawdownsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly ledger: LedgerService,
    private readonly creditFacilities: CreditFacilitiesService,
    private readonly bankAccounts: BankAccountsService,
  ) {}

  async findAll(params: { facilityId?: string; status?: string }) {
    return this.prisma.drawdown.findMany({
      where: { ...(params.facilityId ? { facilityId: params.facilityId } : {}), ...(params.status ? { status: params.status } : {}) },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findOne(id: string) {
    const drawdown = await this.prisma.drawdown.findFirst({ where: { OR: [{ id }, { number: id }] } });
    if (!drawdown) throw new NotFoundException(`Drawdown with ID "${id}" not found`);
    return drawdown;
  }

  async create(dto: CreateDrawdownDto, actorId: string, actorName: string) {
    const facility = await this.prisma.creditFacility.findUnique({ where: { id: dto.facilityId } });
    if (!facility) throw new NotFoundException(`Credit facility with ID "${dto.facilityId}" not found`);
    if (facility.status !== 'ACTIVE') throw new BadRequestException(`Facility "${facility.facilityNumber}" is not active`);

    const available = await this.creditFacilities.availableMinorUnits(facility.id);
    const amount = BigInt(dto.amountMinorUnits);
    if (amount > available) {
      throw new BadRequestException(
        `Drawdown of ${amount} exceeds available headroom (${available}) on facility "${facility.facilityNumber}"`,
      );
    }

    const number = await nextReferenceField(this.prisma.drawdown, 'number', 'DD');
    const disbursedAt = new Date();
    const dueAt = new Date(disbursedAt.getTime() + dto.daysUntilDue * 24 * 60 * 60 * 1000);

    // Money in — the bank disburses this drawdown straight into the
    // facility's own account.
    await this.bankAccounts.adjustBalance(facility.bankAccountId, amount);

    const drawdown = await this.prisma.drawdown.create({
      data: {
        number,
        facilityId: facility.id,
        amountMinorUnits: amount,
        currency: facility.currency,
        disbursedAt,
        dueAt,
        status: 'Active',
        exposureStatus: 'COVERED',
        bankAccountId: facility.bankAccountId,
        createdById: actorId,
        createdByName: actorName,
      },
    });

    await this.ledger.append({
      entryDate: disbursedAt,
      type: 'drawdown',
      direction: 'IN',
      amountMinorUnits: amount,
      currency: facility.currency,
      fxRate: 1.0,
      baseAmountMinorUnits: amount,
      counterpartyType: 'BANK',
      counterpartyId: facility.id,
      counterpartyName: facility.bankName,
      sourceType: 'drawdown',
      sourceId: drawdown.id,
      description: `Drawdown ${number} against facility ${facility.facilityNumber}`,
      createdById: actorId,
      createdByName: actorName,
    });

    return drawdown;
  }

  async repay(id: string, dto: RepayDrawdownDto, actorId: string, actorName: string) {
    const drawdown = await this.findOne(id);
    const outstanding = drawdown.amountMinorUnits - drawdown.repaidMinorUnits;
    const amount = BigInt(dto.amountMinorUnits);
    if (amount > outstanding) {
      throw new BadRequestException(`Repayment of ${amount} exceeds the outstanding balance (${outstanding}) on drawdown "${drawdown.number}"`);
    }

    // Money out — back through the same account the drawdown disbursed into.
    const facility = await this.prisma.creditFacility.findUniqueOrThrow({ where: { id: drawdown.facilityId } });
    await this.bankAccounts.adjustBalance(drawdown.bankAccountId ?? facility.bankAccountId, -amount);

    const repaidMinorUnits = drawdown.repaidMinorUnits + amount;
    const updated = await this.prisma.drawdown.update({
      where: { id: drawdown.id },
      data: {
        repaidMinorUnits,
        status: repaidMinorUnits >= drawdown.amountMinorUnits ? 'Closed' : drawdown.status,
      },
    });

    await this.ledger.append({
      entryDate: new Date(),
      type: 'drawdown_repayment',
      direction: 'OUT',
      amountMinorUnits: amount,
      currency: drawdown.currency,
      fxRate: 1.0,
      baseAmountMinorUnits: amount,
      counterpartyType: 'BANK',
      counterpartyId: drawdown.facilityId,
      counterpartyName: drawdown.number,
      sourceType: 'drawdown',
      sourceId: drawdown.id,
      description: `Repayment against drawdown ${drawdown.number}`,
      createdById: actorId,
      createdByName: actorName,
    });

    return updated;
  }
}
