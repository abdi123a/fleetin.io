import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { nextReference } from '../../common/helpers/reference.util';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';
import { AssignDriverDto } from './dto/assign-driver.dto';

interface FindAllParams {
  search?: string;
  status?: string;
  truckType?: string;
  partnerId?: string;
  page: number;
  limit: number;
  scope: Record<string, string> | null;
}

@Injectable()
export class VehiclesService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /** The flat, all-partners view — direct backend equivalent of the frontend's getAllVehicles(). */
  async findAll({ search, status, truckType, partnerId, page, limit, scope }: FindAllParams) {
    const where: Prisma.VehicleWhereInput = {
      deletedAt: null,
      ...(scope ?? {}),
      ...(partnerId ? { partnerId } : {}),
      ...(status && status !== 'all' ? { operationalStatus: status } : {}),
      ...(truckType && truckType !== 'all' ? { truckType } : {}),
      ...(search
        ? {
            OR: [
              { plateNumber: { contains: search } },
              { make: { contains: search } },
              { model: { contains: search } },
              { partner: { companyLegalName: { contains: search } } },
            ],
          }
        : {}),
    };
    const skip = (page - 1) * limit;

    const [rows, total] = await Promise.all([
      this.prisma.vehicle.findMany({
        where,
        skip,
        take: limit,
        orderBy: { plateNumber: 'asc' },
        include: { partner: true, assignedDriver: true },
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    const items = await Promise.all(rows.map((row) => this.enrich(row)));
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, scope: Record<string, string> | null) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null, ...(scope ?? {}) },
      include: { partner: true, assignedDriver: true },
    });
    if (!vehicle) throw new NotFoundException(`Vehicle with ID "${id}" not found`);
    return this.enrich(vehicle);
  }

  /** The only creation path — DD-02: a vehicle always belongs to a partner from the moment it exists. */
  async create(partnerId: string, dto: CreateVehicleDto) {
    const existing = await this.prisma.vehicle.findUnique({ where: { plateNumber: dto.plateNumber } });
    if (existing) throw new ConflictException(`A vehicle with plate number "${dto.plateNumber}" already exists`);

    const reference = await nextReference(this.prisma.vehicle, 'VEH');

    const vehicle = await this.prisma.vehicle.create({
      data: {
        reference,
        partnerId,
        plateNumber: dto.plateNumber,
        truckType: dto.truckType,
        containerCapacity: dto.containerCapacity,
        trailerInfo: dto.trailerInfo,
        ownershipType: dto.ownershipType,
        insuranceStartDate: dto.insuranceStartDate ? new Date(dto.insuranceStartDate) : undefined,
        insuranceExpiry: new Date(dto.insuranceExpiry),
        registrationExpiry: new Date(dto.registrationExpiry),
        hasGPS: dto.hasGPS ?? false,
        gpsDeviceId: dto.gpsDeviceId,
        operationalStatus: dto.operationalStatus ?? 'Available',
        year: dto.year,
        make: dto.make,
        model: dto.model,
      },
      include: { partner: true, assignedDriver: true },
    });

    return this.enrich(vehicle);
  }

  async update(id: string, dto: UpdateVehicleDto) {
    await this.findOne(id, null);
    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: {
        plateNumber: dto.plateNumber,
        truckType: dto.truckType,
        containerCapacity: dto.containerCapacity,
        trailerInfo: dto.trailerInfo,
        ownershipType: dto.ownershipType,
        insuranceStartDate: dto.insuranceStartDate ? new Date(dto.insuranceStartDate) : undefined,
        insuranceExpiry: dto.insuranceExpiry ? new Date(dto.insuranceExpiry) : undefined,
        registrationExpiry: dto.registrationExpiry ? new Date(dto.registrationExpiry) : undefined,
        hasGPS: dto.hasGPS,
        gpsDeviceId: dto.gpsDeviceId,
        operationalStatus: dto.operationalStatus,
        year: dto.year,
        make: dto.make,
        model: dto.model,
      },
      include: { partner: true, assignedDriver: true },
    });
    return this.enrich(vehicle);
  }

  async remove(id: string) {
    await this.findOne(id, null);
    return this.prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  /** DD-06: a single stored FK (Vehicle.assignedDriverId), unique — a driver can be assigned to at most one vehicle at a time. */
  async assignDriver(id: string, dto: AssignDriverDto) {
    await this.findOne(id, null);

    if (dto.driverId) {
      const alreadyAssigned = await this.prisma.vehicle.findFirst({
        where: { assignedDriverId: dto.driverId, id: { not: id } },
      });
      if (alreadyAssigned) {
        throw new ConflictException(
          `Driver is already assigned to vehicle "${alreadyAssigned.plateNumber}" — unassign it there first`,
        );
      }
    }

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: { assignedDriverId: dto.driverId ?? null },
      include: { partner: true, assignedDriver: true },
    });
    return this.enrich(vehicle);
  }

  async expiring(withinDays: number) {
    const threshold = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.vehicle.findMany({
      where: {
        deletedAt: null,
        OR: [{ insuranceExpiry: { lte: threshold } }, { registrationExpiry: { lte: threshold } }],
      },
      include: { partner: true, assignedDriver: true },
      orderBy: { insuranceExpiry: 'asc' },
    });
    return Promise.all(rows.map((row) => this.enrich(row)));
  }

  private async enrich(
    vehicle: Prisma.VehicleGetPayload<{ include: { partner: true; assignedDriver: true } }>,
  ) {
    const { partner, assignedDriver, ...rest } = vehicle;
    return {
      ...rest,
      partnerId: partner.id,
      partnerReference: partner.reference,
      partnerName: partner.companyLegalName,
      partnerLogo: partner.logoKey ? await this.storage.getUrl(partner.logoKey) : null,
      partnerCountry: partner.country,
      assignedDriverName: assignedDriver?.fullName ?? null,
    };
  }
}
