import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextReferenceField } from '../../common/helpers/reference.util';
import { CreateCreditFacilityDto } from './dto/create-credit-facility.dto';

/**
 * A real bank facility only — deliberately not mapped onto the frontend
 * mock's 3-way pool/revolving/undecided `FundingSource` typing, since that
 * question is still open. No `Shipment` link exists yet either.
 */
@Injectable()
export class CreditFacilitiesService {
  constructor(private readonly prisma: PrismaService) {}

  async findAll() {
    return this.prisma.creditFacility.findMany({ orderBy: { createdAt: 'desc' } });
  }

  async findOne(id: string) {
    const facility = await this.prisma.creditFacility.findFirst({
      where: { OR: [{ id }, { facilityNumber: id }] },
      include: { drawdowns: { orderBy: { createdAt: 'desc' } } },
    });
    if (!facility) throw new NotFoundException(`Credit facility with ID "${id}" not found`);
    return facility;
  }

  async create(dto: CreateCreditFacilityDto) {
    const bankAccount = await this.prisma.bankAccount.findUnique({ where: { id: dto.bankAccountId } });
    if (!bankAccount) throw new NotFoundException(`Bank account with ID "${dto.bankAccountId}" not found`);

    const facilityNumber = await nextReferenceField(this.prisma.creditFacility, 'facilityNumber', 'CF');

    return this.prisma.creditFacility.create({
      data: {
        bankName: dto.bankName,
        facilityNumber,
        bankAccountId: bankAccount.id,
        limitMinorUnits: BigInt(dto.limitMinorUnits),
        currency: dto.currency,
        startDate: new Date(dto.startDate),
        endDate: dto.endDate ? new Date(dto.endDate) : undefined,
        isRevolving: dto.isRevolving ?? true,
        feeDescription: dto.feeDescription,
      },
    });
  }

  /** How much headroom is left — `limitMinorUnits` minus every un-repaid drawdown balance. */
  async availableMinorUnits(facilityId: string): Promise<bigint> {
    const drawdowns = await this.prisma.drawdown.findMany({
      where: { facilityId, status: { not: 'Closed' } },
    });
    const facility = await this.prisma.creditFacility.findUniqueOrThrow({ where: { id: facilityId } });
    const outstanding = drawdowns.reduce((sum, d) => sum + (d.amountMinorUnits - d.repaidMinorUnits), 0n);
    return facility.limitMinorUnits - outstanding;
  }
}
