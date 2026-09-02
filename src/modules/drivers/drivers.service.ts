import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { nextReference } from '../../common/helpers/reference.util';
import { CreateDriverDto } from './dto/create-driver.dto';
import { UpdateDriverDto } from './dto/update-driver.dto';

interface FindAllParams {
  search?: string;
  status?: string;
  partnerId?: string;
  page: number;
  limit: number;
  scope: Record<string, string> | null;
}

/**
 * What a driver row carries beyond its own columns.
 *
 * The mirror of `VEHICLE_INCLUDE`: this used to include `assignedVehicle`, the
 * other half of a standing pair that no longer exists. Who drove what is a
 * fact about each booking, so the directory reports the count of them.
 *
 * Cancelled and failed runs excluded — a trip that never happened is not a
 * trip driven.
 */
const LIVE_BOOKINGS = { deletedAt: null, status: { notIn: ['Cancelled', 'Failed'] } };

const DRIVER_INCLUDE = {
  partner: true,
  _count: { select: { bookings: { where: LIVE_BOOKINGS } } },
} satisfies Prisma.DriverInclude;

@Injectable()
export class DriversService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  async findAll({ search, status, partnerId, page, limit, scope }: FindAllParams) {
    const where: Prisma.DriverWhereInput = {
      deletedAt: null,
      ...(scope ?? {}),
      ...(partnerId ? { partnerId } : {}),
      ...(status && status !== 'all' ? { status } : {}),
      ...(search
        ? {
            OR: [
              { fullName: { contains: search } },
              { drivingLicenseNumber: { contains: search } },
              { nationalId: { contains: search } },
              { partner: { companyLegalName: { contains: search } } },
            ],
          }
        : {}),
    };
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.driver.findMany({
        where,
        skip,
        take: limit,
        orderBy: { fullName: 'asc' },
        include: DRIVER_INCLUDE,
      }),
      this.prisma.driver.count({ where }),
    ]);

    const items = await Promise.all(rows.map((row) => this.enrich(row)));
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, scope: Record<string, string> | null) {
    const driver = await this.prisma.driver.findFirst({
      where: { id, deletedAt: null, ...(scope ?? {}) },
      include: DRIVER_INCLUDE,
    });
    if (!driver) throw new NotFoundException(`Driver with ID "${id}" not found`);
    return this.enrich(driver);
  }

  /** The only creation path — DD-02: a driver always belongs to a partner from the moment it exists. */
  async create(partnerId: string, dto: CreateDriverDto) {
    const existingLicense = await this.prisma.driver.findFirst({
      where: { drivingLicenseNumber: dto.drivingLicenseNumber },
    });
    if (existingLicense) {
      throw new ConflictException(`A driver with license number "${dto.drivingLicenseNumber}" already exists`);
    }
    const existingNationalId = await this.prisma.driver.findFirst({ where: { nationalId: dto.nationalId } });
    if (existingNationalId) {
      throw new ConflictException(`A driver with national ID "${dto.nationalId}" already exists`);
    }

    const reference = await nextReference(this.prisma.driver, 'DRV');

    const driver = await this.prisma.driver.create({
      data: {
        reference,
        partnerId,
        fullName: dto.fullName,
        phone: dto.phone,
        nationalId: dto.nationalId,
        drivingLicenseNumber: dto.drivingLicenseNumber,
        nationalIdExpiry: dto.nationalIdExpiry ? new Date(dto.nationalIdExpiry) : undefined,
        accessCards: dto.accessCards,
        status: dto.status ?? 'Available',
        joinDate: dto.joinDate ? new Date(dto.joinDate) : new Date(),
      },
      include: DRIVER_INCLUDE,
    });

    return this.enrich(driver);
  }

  async update(id: string, dto: UpdateDriverDto) {
    await this.findOne(id, null);
    const driver = await this.prisma.driver.update({
      where: { id },
      data: {
        fullName: dto.fullName,
        phone: dto.phone,
        nationalId: dto.nationalId,
        drivingLicenseNumber: dto.drivingLicenseNumber,
        nationalIdExpiry: dto.nationalIdExpiry ? new Date(dto.nationalIdExpiry) : undefined,
        accessCards: dto.accessCards,
        status: dto.status,
        joinDate: dto.joinDate ? new Date(dto.joinDate) : undefined,
      },
      include: DRIVER_INCLUDE,
    });
    return this.enrich(driver);
  }

  async remove(id: string) {
    await this.findOne(id, null);
    return this.prisma.driver.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  private async enrich(driver: Prisma.DriverGetPayload<{ include: typeof DRIVER_INCLUDE }>) {
    const { partner, _count, ...rest } = driver;
    return {
      ...rest,
      partnerId: partner.id,
      partnerReference: partner.reference,
      partnerName: partner.companyLegalName,
      partnerLogo: partner.logoKey ? await this.storage.getUrl(partner.logoKey) : null,
      partnerCountry: partner.country,
      /** Container runs actually driven — see `DRIVER_INCLUDE`. */
      trips: _count.bookings,
    };
  }
}
