import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { StorageService } from '../storage/storage.service';
import { nextReference } from '../../common/helpers/reference.util';
import { computeVehicleCo2Factor, normaliseFuelType } from '../../common/helpers/co2.util';
import { CreateVehicleDto } from './dto/create-vehicle.dto';
import { UpdateVehicleDto } from './dto/update-vehicle.dto';

interface FindAllParams {
  search?: string;
  status?: string;
  truckType?: string;
  partnerId?: string;
  page: number;
  limit: number;
  scope: Record<string, string> | null;
}

/**
 * What a vehicle row carries beyond its own columns.
 *
 * `bookings` is a *count*, not a list: one booking is one container run, so
 * counting them is the honest answer to "how much work has this truck done".
 * It replaced the standing `assignedDriver` this used to include — a second
 * answer to a question the booking already answers per trip, with nothing
 * keeping the two in agreement.
 *
 * Cancelled and failed runs are excluded: a trip that never happened is not a
 * trip made. Same `LIVE` rule the shipments service counts containers by, so a
 * truck's trip count and a shipment's container count cannot drift apart.
 */
const LIVE_BOOKINGS = { deletedAt: null, status: { notIn: ['Cancelled', 'Failed'] } };

interface VehicleCarbon {
  co2EmissionsKg: number | null;
  co2DistanceKm: number | null;
  /** How many of its runs carry a figure — the rest have not been driven yet. */
  pricedTrips: number;
}

const VEHICLE_INCLUDE = {
  partner: true,
  _count: { select: { bookings: { where: LIVE_BOOKINGS } } },
} satisfies Prisma.VehicleInclude;

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
        include: VEHICLE_INCLUDE,
      }),
      this.prisma.vehicle.count({ where }),
    ]);

    /* One grouped query for the page's carbon, not one per truck. */
    const carbon = await this.carbonByVehicle(rows.map((row) => row.id));
    const items = await Promise.all(rows.map((row) => this.enrich(row, carbon.get(row.id))));
    return { items, meta: { total, page, limit, totalPages: Math.ceil(total / limit) } };
  }

  async findOne(id: string, scope: Record<string, string> | null) {
    const vehicle = await this.prisma.vehicle.findFirst({
      where: { id, deletedAt: null, ...(scope ?? {}) },
      include: VEHICLE_INCLUDE,
    });
    if (!vehicle) throw new NotFoundException(`Vehicle with ID "${id}" not found`);
    return this.enrich(vehicle);
  }

  /**
   * What each truck has generated: the sum of its bookings' stored carbon.
   *
   * Read, never recomputed — every booking's figure was priced once from the
   * factor the truck carried at the time (see `EmissionsService`), and the
   * fleet list adds those up. A truck whose runs have not been driven yet has
   * no figure at all rather than a zero. The return leg of a booking is
   * priced on the booking as a whole, so it lands on the delivery truck.
   */
  private async carbonByVehicle(ids: string[]): Promise<Map<string, VehicleCarbon>> {
    if (ids.length === 0) return new Map();
    const rows = await this.prisma.booking.groupBy({
      by: ['vehicleId'],
      where: { vehicleId: { in: ids }, ...LIVE_BOOKINGS, co2EmissionsKg: { not: null } },
      _sum: { co2EmissionsKg: true, actualDistanceKm: true },
      _count: { _all: true },
    });
    return new Map(
      rows
        .filter((row) => row.vehicleId !== null)
        .map((row) => [
          row.vehicleId as string,
          {
            co2EmissionsKg: row._sum.co2EmissionsKg === null ? null : Number(row._sum.co2EmissionsKg),
            co2DistanceKm: row._sum.actualDistanceKm === null ? null : Number(row._sum.actualDistanceKm),
            pricedTrips: row._count._all,
          },
        ]),
    );
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
        insuranceProvider: dto.insuranceProvider,
        insuranceStartDate: dto.insuranceStartDate ? new Date(dto.insuranceStartDate) : undefined,
        insuranceExpiry: new Date(dto.insuranceExpiry),
        registrationExpiry: new Date(dto.registrationExpiry),
        hasGPS: dto.hasGPS ?? false,
        gpsDeviceId: dto.gpsDeviceId,
        operationalStatus: dto.operationalStatus ?? 'Available',
        year: dto.year,
        make: dto.make,
        model: dto.model,
        fuelType: normaliseFuelType(dto.fuelType),
        ...this.carbonFactorFor({
          truckType: dto.truckType,
          fuelType: dto.fuelType,
          year: dto.year,
        }),
      },
      include: VEHICLE_INCLUDE,
    });

    return this.enrich(vehicle);
  }

  async update(id: string, dto: UpdateVehicleDto) {
    const before = await this.findOne(id, null);

    /* The factor is re-derived from the row as it will be *after* this patch,
       not from the patch alone: changing only the fuel still has to be priced
       against the truck's existing type and year. A vehicle whose factor
       moves does not disturb a single finished booking — those carry their
       own snapshot, which is the whole point of `Booking.co2FactorUsed`. */
    const fuelType = dto.fuelType !== undefined ? normaliseFuelType(dto.fuelType) : before.fuelType;
    const truckType = dto.truckType ?? before.truckType;
    const year = dto.year !== undefined ? dto.year : before.year;

    const vehicle = await this.prisma.vehicle.update({
      where: { id },
      data: {
        fuelType,
        ...this.carbonFactorFor({ truckType, fuelType, year }),
        plateNumber: dto.plateNumber,
        truckType: dto.truckType,
        containerCapacity: dto.containerCapacity,
        trailerInfo: dto.trailerInfo,
        ownershipType: dto.ownershipType,
        insuranceProvider: dto.insuranceProvider,
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
      include: VEHICLE_INCLUDE,
    });
    return this.enrich(vehicle);
  }

  async remove(id: string) {
    await this.findOne(id, null);
    return this.prisma.vehicle.update({ where: { id }, data: { deletedAt: new Date() } });
  }

  async expiring(withinDays: number) {
    const threshold = new Date(Date.now() + withinDays * 24 * 60 * 60 * 1000);
    const rows = await this.prisma.vehicle.findMany({
      where: {
        deletedAt: null,
        OR: [{ insuranceExpiry: { lte: threshold } }, { registrationExpiry: { lte: threshold } }],
      },
      include: VEHICLE_INCLUDE,
      orderBy: { insuranceExpiry: 'asc' },
    });
    return Promise.all(rows.map((row) => this.enrich(row)));
  }

  /**
   * The carbon columns for a given set of answers, ready to spread into a
   * write. Kept in one place so create and update can never derive the factor
   * two different ways.
   */
  private carbonFactorFor(input: { truckType?: string | null; fuelType?: string | null; year?: number | null }) {
    const factor = computeVehicleCo2Factor(input);
    return {
      co2PerKm: factor.perKm,
      co2FactorBasis: factor.basis,
      co2ModelVersion: factor.modelVersion,
      co2FactorAt: new Date(),
    };
  }

  /** The truck's photograph. Same key-not-URL rule as a partner's logo. */
  async uploadPhoto(id: string, file: Express.Multer.File) {
    const existing = await this.findOne(id, null);
    const stored = await this.storage.upload(
      { originalname: file.originalname, buffer: file.buffer, mimetype: file.mimetype, size: file.size },
      { folder: 'vehicles' },
    );
    await this.prisma.vehicle.update({ where: { id: existing.id }, data: { photoKey: stored.key } });
    return this.findOne(existing.id, null);
  }

  private async enrich(
    vehicle: Prisma.VehicleGetPayload<{ include: typeof VEHICLE_INCLUDE }>,
    carbon?: VehicleCarbon,
  ) {
    const { partner, _count, photoKey, co2PerKm, ...rest } = vehicle;
    const totals = carbon ?? (await this.carbonByVehicle([vehicle.id])).get(vehicle.id);
    return {
      ...rest,
      /** What this truck has put out across its priced runs — see `carbonByVehicle`. */
      co2EmissionsKg: totals?.co2EmissionsKg ?? null,
      co2DistanceKm: totals?.co2DistanceKm ?? null,
      pricedTrips: totals?.pricedTrips ?? 0,
      /* Decimal crosses the wire as a string; the factor is a small number
         every consumer does arithmetic with, so it is sent as one. */
      co2PerKm: co2PerKm === null ? null : Number(co2PerKm),
      photoUrl: photoKey ? await this.storage.getUrl(photoKey) : null,
      partnerId: partner.id,
      partnerReference: partner.reference,
      partnerName: partner.companyLegalName,
      partnerLogo: partner.logoKey ? await this.storage.getUrl(partner.logoKey) : null,
      partnerCountry: partner.country,
      /** Container runs actually made — see `VEHICLE_INCLUDE`. */
      trips: _count.bookings,
    };
  }
}
