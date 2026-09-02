import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Partner } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { nextReference } from '../../common/helpers/reference.util';
import { CreatePartnerDto } from './dto/create-partner.dto';
import { UpdatePartnerDto } from './dto/update-partner.dto';
import { CreateDispatcherDto } from './dto/create-dispatcher.dto';
import { UpsertBankAccountDto } from './dto/upsert-bank-account.dto';
import { toMinorUnits } from '../../common/helpers/pricing.util';

interface FindAllParams {
  search?: string;
  status?: string;
  country?: string;
  serviceCategory?: string;
  sortBy?: string;
  page: number;
  limit: number;
  scope: Record<string, string> | null;
}

/**
 * A trip is one booking — one container run. Cancelled and failed runs are
 * excluded, matching the Vehicles, Drivers and Shipments services exactly, so
 * a truck's trip count reads the same wherever it is printed.
 */
const LIVE_BOOKINGS = { deletedAt: null, status: { notIn: ['Cancelled', 'Failed'] } };

/** Flattens Prisma's `_count.bookings` into the flat `trips` the wire carries. */
function withTrips<T extends { _count: { bookings: number } }>(row: T) {
  const { _count, ...rest } = row;
  return { ...rest, trips: _count.bookings };
}

@Injectable()
export class PartnersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private orderBy(sortBy?: string): Prisma.PartnerOrderByWithRelationInput {
    switch (sortBy) {
      case 'name-desc':
        return { companyLegalName: 'desc' };
      case 'fleet-desc':
        return { fleetSize: 'desc' };
      case 'name-asc':
      default:
        return { companyLegalName: 'asc' };
    }
  }

  async findAll({ search, status, country, serviceCategory, sortBy, page, limit, scope }: FindAllParams) {
    const where: Prisma.PartnerWhereInput = {
      deletedAt: null,
      ...(scope ?? {}),
      ...(status && status !== 'all' ? { partnerStatus: status } : {}),
      ...(country && country !== 'all' ? { country } : {}),
      ...(serviceCategory ? { serviceCategories: { array_contains: serviceCategory } } : {}),
      ...(search
        ? {
            OR: [
              { companyLegalName: { contains: search } },
              { registrationNumber: { contains: search } },
              { country: { contains: search } },
            ],
          }
        : {}),
    };
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.partner.findMany({ where, skip, take: limit, orderBy: this.orderBy(sortBy) }),
      this.prisma.partner.count({ where }),
    ]);

    const items = await this.enrich(rows);
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** `id` may be the real UUID or the human-readable `reference` (e.g. "PTR-001") shown in the UI and used in URLs. */
  async findOne(id: string, scope: Record<string, string> | null) {
    const partner = await this.prisma.partner.findFirst({
      where: { OR: [{ id }, { reference: id }], deletedAt: null },
    });
    if (!partner || (scope && scope.id && scope.id !== partner.id)) {
      throw new NotFoundException(`Partner with ID "${id}" not found`);
    }

    const [enriched] = await this.enrich([partner]);
    const [vehicles, drivers, bankAccount] = await Promise.all([
      /* `trips` alongside, because the transporter workspace prints it on every
         fleet card and every driver row. It used to print the standing driver
         a vehicle was paired with; that pairing is gone, and a trip count read
         from anywhere but the bookings would have shown 0 for a truck that has
         run ten times. Counted the same way the Vehicles and Drivers
         directories count it — see `VEHICLE_INCLUDE`. */
      this.prisma.vehicle.findMany({
        where: { partnerId: partner.id, deletedAt: null },
        include: { _count: { select: { bookings: { where: LIVE_BOOKINGS } } } },
      }),
      this.prisma.driver.findMany({
        where: { partnerId: partner.id, deletedAt: null },
        include: { _count: { select: { bookings: { where: LIVE_BOOKINGS } } } },
      }),
      this.prisma.partnerBankAccount.findUnique({ where: { partnerId: partner.id } }),
    ]);

    return {
      ...enriched,
      vehicles: vehicles.map(withTrips),
      drivers: drivers.map(withTrips),
      bankAccount,
    };
  }

  async create(dto: CreatePartnerDto) {
    const registrationNumber = dto.registrationNumber ?? `DJ-REG-${Date.now()}`;
    const existing = await this.prisma.partner.findFirst({
      where: { OR: [{ registrationNumber }, { companyLegalName: dto.companyLegalName }] },
    });
    if (existing) {
      throw new ConflictException('A partner with this registration number or company name already exists');
    }

    const reference = await nextReference(this.prisma.partner, 'PTR');

    const partner = await this.prisma.partner.create({
      data: {
        reference,
        companyLegalName: dto.companyLegalName,
        registrationNumber,
        businessLicenseNumber: dto.businessLicenseNumber,
        operatingRegions: dto.operatingRegions ?? [],
        serviceCategories: dto.serviceCategories ?? [],
        fleetSize: dto.fleetSize ?? 0,
        vehicleTypes: dto.vehicleTypes ?? [],
        country: dto.country,
        address: dto.address,
        insuranceProvider: dto.insuranceProvider,
        insurancePolicyNumber: dto.insurancePolicyNumber,
        insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : undefined,
        partnerStatus: dto.partnerStatus ?? 'Pending',
        registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : new Date(),
      },
    });

    await this.prisma.contact.create({
      data: { ownerType: 'PARTNER', ownerId: partner.id, ...dto.primaryDispatcher, isPrimary: true },
    });
    for (const dispatcher of dto.additionalDispatchers ?? []) {
      await this.prisma.contact.create({
        data: { ownerType: 'PARTNER', ownerId: partner.id, ...dispatcher, isPrimary: false },
      });
    }

    return this.findOne(partner.id, null);
  }

  async update(id: string, dto: UpdatePartnerDto) {
    const existing = await this.findOne(id, null);
    const partner = await this.prisma.partner.update({
      where: { id: existing.id },
      data: {
        companyLegalName: dto.companyLegalName,
        registrationNumber: dto.registrationNumber,
        businessLicenseNumber: dto.businessLicenseNumber,
        operatingRegions: dto.operatingRegions,
        serviceCategories: dto.serviceCategories,
        fleetSize: dto.fleetSize,
        vehicleTypes: dto.vehicleTypes,
        country: dto.country,
        address: dto.address,
        insuranceProvider: dto.insuranceProvider,
        insurancePolicyNumber: dto.insurancePolicyNumber,
        insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : undefined,
        partnerStatus: dto.partnerStatus,
        registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : undefined,
      },
    });
    return this.findOne(partner.id, null);
  }

  async remove(id: string) {
    const existing = await this.findOne(id, null);
    return this.prisma.partner.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }

  async uploadLogo(id: string, file: Express.Multer.File) {
    const existing = await this.findOne(id, null);
    const stored = await this.storage.upload(
      { originalname: file.originalname, buffer: file.buffer, mimetype: file.mimetype, size: file.size },
      { folder: 'logos' },
    );
    return this.prisma.partner.update({ where: { id: existing.id }, data: { logoKey: stored.key } });
  }

  async addDispatcher(partnerId: string, dto: CreateDispatcherDto) {
    const existing = await this.findOne(partnerId, null);
    if (dto.isPrimary) {
      await this.prisma.contact.updateMany({
        where: { ownerType: 'PARTNER', ownerId: existing.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return this.prisma.contact.create({ data: { ownerType: 'PARTNER', ownerId: existing.id, ...dto } });
  }

  async updateDispatcher(partnerId: string, contactId: string, dto: Partial<CreateDispatcherDto>) {
    const existing = await this.findOne(partnerId, null);
    await this.findContactOrThrow(existing.id, contactId);
    if (dto.isPrimary) {
      await this.prisma.contact.updateMany({
        where: { ownerType: 'PARTNER', ownerId: existing.id, isPrimary: true, NOT: { id: contactId } },
        data: { isPrimary: false },
      });
    }
    return this.prisma.contact.update({ where: { id: contactId }, data: dto });
  }

  async removeDispatcher(partnerId: string, contactId: string) {
    const existing = await this.findOne(partnerId, null);
    await this.findContactOrThrow(existing.id, contactId);
    return this.prisma.contact.delete({ where: { id: contactId } });
  }

  private async findContactOrThrow(partnerId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, ownerType: 'PARTNER', ownerId: partnerId },
    });
    if (!contact) throw new NotFoundException(`Dispatcher with ID "${contactId}" not found`);
    return contact;
  }





  async upsertBankAccount(partnerId: string, dto: UpsertBankAccountDto) {
    const existing = await this.findOne(partnerId, null);
    return this.prisma.partnerBankAccount.upsert({
      where: { partnerId: existing.id },
      create: { partnerId: existing.id, ...dto },
      update: dto,
    });
  }

  /**
   * Fleet counts on the list view (`PartnersPage.tsx`'s `vehicles?.length`/
   * `drivers?.length` reads) need real arrays here, not just the parent
   * fields — the frontend was built against the mock era's fully-nested
   * `PartnerRecord`, where every partner always carried its whole fleet.
   */
  private async enrich(partners: Partner[]) {
    return Promise.all(
      partners.map(async (partner) => {
        const [vehicles, drivers, contacts] = await Promise.all([
          this.prisma.vehicle.findMany({ where: { partnerId: partner.id, deletedAt: null } }),
          this.prisma.driver.findMany({ where: { partnerId: partner.id, deletedAt: null } }),
          this.prisma.contact.findMany({
            where: { ownerType: 'PARTNER', ownerId: partner.id },
            orderBy: { isPrimary: 'desc' },
          }),
        ]);
        // Contacts are ordered isPrimary desc, so the first one seen is the primary dispatcher.
        const [primaryDispatcher, ...additionalDispatchers] = contacts;
        return {
          ...partner,
          vehicles,
          drivers,
          primaryDispatcher: primaryDispatcher ?? null,
          additionalDispatchers,
          logoUrl: partner.logoKey ? await this.storage.getUrl(partner.logoKey) : null,
        };
      }),
    );
  }
}
