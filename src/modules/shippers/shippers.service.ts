import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, Shipper } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { nextReference } from '../../common/helpers/reference.util';
import { CreateShipperDto } from './dto/create-shipper.dto';
import { UpdateShipperDto } from './dto/update-shipper.dto';
import { CreateContactDto } from './dto/create-contact.dto';

/** Mirrors the shipment status ladder — a shipment is "past" once it lands in one of these. */
const TERMINAL_SHIPMENT_STATUSES = ['Completed', 'Cancelled', 'Failed'];

interface FindAllParams {
  search?: string;
  status?: string;
  industry?: string;
  sortBy?: string;
  page: number;
  limit: number;
  scope: Record<string, string> | null;
}

@Injectable()
export class ShippersService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  private orderBy(sortBy?: string): Prisma.ShipperOrderByWithRelationInput {
    switch (sortBy) {
      case 'name-desc':
        return { companyLegalName: 'desc' };
      case 'date-desc':
        return { registrationDate: 'desc' };
      case 'name-asc':
      default:
        return { companyLegalName: 'asc' };
    }
  }

  async findAll({ search, status, industry, sortBy, page, limit, scope }: FindAllParams) {
    const where: Prisma.ShipperWhereInput = {
      deletedAt: null,
      ...(scope ?? {}),
      ...(status && status !== 'all' ? { approvalStatus: status } : {}),
      ...(industry && industry !== 'all' ? { industry } : {}),
      ...(search
        ? {
            OR: [
              { companyLegalName: { contains: search } },
              { registrationNumber: { contains: search } },
              { country: { contains: search } },
              { address: { contains: search } },
            ],
          }
        : {}),
    };
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.shipper.findMany({ where, skip, take: limit, orderBy: this.orderBy(sortBy) }),
      this.prisma.shipper.count({ where }),
    ]);

    const items = await this.enrich(rows);
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  /** `id` may be the real UUID or the human-readable `reference` (e.g. "SHP-101") shown in the UI and used in URLs. */
  async findOne(id: string, scope: Record<string, string> | null) {
    const shipper = await this.prisma.shipper.findFirst({
      where: { OR: [{ id }, { reference: id }], deletedAt: null },
    });
    if (!shipper || (scope && scope.id && scope.id !== shipper.id)) {
      throw new NotFoundException(`Shipper with ID "${id}" not found`);
    }

    const [enriched] = await this.enrich([shipper]);
    return enriched;
  }

  async create(dto: CreateShipperDto) {
    const existing = await this.prisma.shipper.findFirst({
      where: { OR: [{ registrationNumber: dto.registrationNumber }, { companyLegalName: dto.companyLegalName }] },
    });
    if (existing) {
      throw new ConflictException('A shipper with this registration number or company name already exists');
    }

    const reference = await nextReference(this.prisma.shipper, 'SHP');

    const shipper = await this.prisma.shipper.create({
      data: {
        reference,
        companyLegalName: dto.companyLegalName,
        registrationNumber: dto.registrationNumber,
        industry: dto.industry,
        companySize: dto.companySize,
        country: dto.country,
        address: dto.address,
        approvalStatus: dto.approvalStatus ?? 'Pending',
        registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : new Date(),
      },
    });

    await this.prisma.contact.create({
      data: { ownerType: 'SHIPPER', ownerId: shipper.id, ...dto.primaryContact, isPrimary: true },
    });
    for (const contact of dto.operationalContacts ?? []) {
      await this.prisma.contact.create({
        data: { ownerType: 'SHIPPER', ownerId: shipper.id, ...contact, isPrimary: false },
      });
    }

    return this.findOne(shipper.id, null);
  }

  async update(id: string, dto: UpdateShipperDto) {
    const existing = await this.findOne(id, null);
    const shipper = await this.prisma.shipper.update({
      where: { id: existing.id },
      data: {
        companyLegalName: dto.companyLegalName,
        registrationNumber: dto.registrationNumber,
        industry: dto.industry,
        companySize: dto.companySize,
        country: dto.country,
        address: dto.address,
        approvalStatus: dto.approvalStatus,
        registrationDate: dto.registrationDate ? new Date(dto.registrationDate) : undefined,
      },
    });
    return this.findOne(shipper.id, null);
  }

  async remove(id: string) {
    const existing = await this.findOne(id, null);
    return this.prisma.shipper.update({ where: { id: existing.id }, data: { deletedAt: new Date() } });
  }

  async uploadLogo(id: string, file: Express.Multer.File) {
    const existing = await this.findOne(id, null);
    const stored = await this.storage.upload(
      { originalname: file.originalname, buffer: file.buffer, mimetype: file.mimetype, size: file.size },
      { folder: 'logos' },
    );
    return this.prisma.shipper.update({ where: { id: existing.id }, data: { logoKey: stored.key } });
  }

  async addContact(shipperId: string, dto: CreateContactDto) {
    const existing = await this.findOne(shipperId, null);
    if (dto.isPrimary) {
      await this.prisma.contact.updateMany({
        where: { ownerType: 'SHIPPER', ownerId: existing.id, isPrimary: true },
        data: { isPrimary: false },
      });
    }
    return this.prisma.contact.create({ data: { ownerType: 'SHIPPER', ownerId: existing.id, ...dto } });
  }

  async updateContact(shipperId: string, contactId: string, dto: Partial<CreateContactDto>) {
    const existing = await this.findOne(shipperId, null);
    await this.findContactOrThrow(existing.id, contactId);
    if (dto.isPrimary) {
      await this.prisma.contact.updateMany({
        where: { ownerType: 'SHIPPER', ownerId: existing.id, isPrimary: true, NOT: { id: contactId } },
        data: { isPrimary: false },
      });
    }
    return this.prisma.contact.update({ where: { id: contactId }, data: dto });
  }

  async removeContact(shipperId: string, contactId: string) {
    const existing = await this.findOne(shipperId, null);
    await this.findContactOrThrow(existing.id, contactId);
    return this.prisma.contact.delete({ where: { id: contactId } });
  }

  private async findContactOrThrow(shipperId: string, contactId: string) {
    const contact = await this.prisma.contact.findFirst({
      where: { id: contactId, ownerType: 'SHIPPER', ownerId: shipperId },
    });
    if (!contact) throw new NotFoundException(`Contact with ID "${contactId}" not found`);
    return contact;
  }


  /**
   * The full response shape for both list rows and the detail response —
   * kept identical so a shipper opened from a list-sourced object (e.g. the
   * quick-edit drawer) has exactly what the detail page would have fetched.
   * activeShipments/pastShipments/lastShipmentAt are always computed here,
   * never stored (they'd drift).
   */
  private async enrich(shippers: Shipper[]) {
    if (shippers.length === 0) return [];
    const ids = shippers.map((s) => s.id);
    const [grouped, contacts, documents] = await Promise.all([
      this.prisma.shipment.groupBy({
        by: ['shipperId', 'status'],
        where: { shipperId: { in: ids }, deletedAt: null },
        _count: true,
        /* When this client last actually moved something.
           `scheduledPickupTime`, not `createdAt`: the question is when a truck
           last collected for them, not when somebody typed the record in. The
           groupBy is per status, so this is the newest pickup *within* each
           status and the reduce below takes the newest across them. */
        _max: { scheduledPickupTime: true },
      }),
      this.prisma.contact.findMany({
        where: { ownerType: 'SHIPPER', ownerId: { in: ids } },
        orderBy: { isPrimary: 'desc' },
      }),
      this.prisma.document.findMany({
        where: { ownerType: 'SHIPPER', ownerId: { in: ids } },
        orderBy: { uploadedAt: 'desc' },
      }),
    ]);

    const counts = new Map<
      string,
      { active: number; past: number; lastShipmentAt: Date | null }
    >();
    for (const row of grouped) {
      const entry = counts.get(row.shipperId) ?? { active: 0, past: 0, lastShipmentAt: null };
      if (TERMINAL_SHIPMENT_STATUSES.includes(row.status)) entry.past += row._count;
      else entry.active += row._count;
      const latest = row._max?.scheduledPickupTime ?? null;
      if (latest && (entry.lastShipmentAt === null || latest > entry.lastShipmentAt)) {
        entry.lastShipmentAt = latest;
      }
      counts.set(row.shipperId, entry);
    }

    const primaryContactByShipperId = new Map<string, (typeof contacts)[number]>();
    const operationalContactsByShipperId = new Map<string, typeof contacts>();
    for (const contact of contacts) {
      // Contacts are ordered isPrimary desc, so the first one seen per owner wins.
      if (contact.isPrimary && !primaryContactByShipperId.has(contact.ownerId)) {
        primaryContactByShipperId.set(contact.ownerId, contact);
        continue;
      }
      const list = operationalContactsByShipperId.get(contact.ownerId) ?? [];
      list.push(contact);
      operationalContactsByShipperId.set(contact.ownerId, list);
    }

    const documentsByShipperId = new Map<string, typeof documents>();
    for (const document of documents) {
      const list = documentsByShipperId.get(document.ownerId) ?? [];
      list.push(document);
      documentsByShipperId.set(document.ownerId, list);
    }

    return Promise.all(
      shippers.map(async (shipper) => ({
        ...shipper,
        activeShipments: counts.get(shipper.id)?.active ?? 0,
        pastShipments: counts.get(shipper.id)?.past ?? 0,
        /* Null means "never shipped with us", which the directory draws as
           exactly that rather than as a stale date. */
        lastShipmentAt: counts.get(shipper.id)?.lastShipmentAt ?? null,
        primaryContact: primaryContactByShipperId.get(shipper.id) ?? null,
        operationalContacts: operationalContactsByShipperId.get(shipper.id) ?? [],
        uploadedDocuments: documentsByShipperId.get(shipper.id) ?? [],
        // The frontend renders this directly as an <img src> — resolve the
        // storage key to a real URL here rather than exposing the raw key,
        // which on S3 wouldn't be fetchable without a signature anyway.
        logoUrl: shipper.logoKey ? await this.storage.getUrl(shipper.logoKey) : null,
      })),
    );
  }
}
