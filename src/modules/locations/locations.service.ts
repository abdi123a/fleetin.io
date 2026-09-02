import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { Prisma, type Location } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { nextReference } from '../../common/helpers/reference.util';
import {
  GoogleMapsService,
  type PlaceCandidate,
} from './google-maps.service';
import {
  LOCATION_KINDS,
  type CreateLocationDto,
  type LocationKind,
} from './dto/create-location.dto';
import type { UpdateLocationDto } from './dto/update-location.dto';

/**
 * The corridor's geography, and how far apart it is.
 *
 * Two responsibilities that belong together: a distance is a fact about a pair
 * of locations, and the cache that stores it is invalidated by the same edits
 * that move a location. Splitting them would mean a service that can move a pin
 * without the distances that depend on it noticing.
 */

/** Places whose distance book is rebuilt in one `POST /locations/distances/build`. */
const MAX_MATRIX_LOCATIONS = 40;

export interface DistanceResult {
  originId: string;
  destinationId: string;
  distanceMeters: number;
  distanceKm: number;
  durationSeconds: number;
  /** `"1h 20m"`, or `null` when the provider could not supply a duration. */
  durationLabel: string | null;
  provider: string;
  computedAt: Date;
  /** True when this call measured it rather than reading it back. */
  fresh: boolean;
}

@Injectable()
export class LocationsService {
  private readonly logger = new Logger(LocationsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly google: GoogleMapsService,
  ) {}

  /* ── The catalogue ───────────────────────────────────────────────────── */

  async findAll(filters: {
    search?: string;
    kind?: string;
    active?: boolean;
  }): Promise<Location[]> {
    const where: Prisma.LocationWhereInput = { deletedAt: null };

    if (filters.kind && filters.kind !== 'all') where.kind = filters.kind;
    if (filters.active !== undefined) where.active = filters.active;
    if (filters.search) {
      where.OR = [
        { name: { contains: filters.search } },
        { formattedAddress: { contains: filters.search } },
        { reference: { contains: filters.search } },
        { city: { contains: filters.search } },
      ];
    }

    return this.prisma.location.findMany({
      where,
      orderBy: [{ kind: 'asc' }, { name: 'asc' }],
    });
  }

  async findOne(id: string): Promise<Location> {
    const location = await this.prisma.location.findFirst({
      where: { id, deletedAt: null },
    });
    if (!location) throw new NotFoundException(`Location ${id} not found`);
    return location;
  }

  /** Search Google. Returns candidates for a human to pick from; saves nothing. */
  async searchPlaces(query: string, limit?: number): Promise<{
    configured: boolean;
    candidates: (PlaceCandidate & { kind: LocationKind; alreadySaved: boolean })[];
  }> {
    const trimmed = query?.trim() ?? '';
    if (trimmed.length < 2) {
      throw new BadRequestException('Give the search at least two characters.');
    }

    const candidates = await this.google.searchPlaces(trimmed, limit);

    /* Flag the ones already in the catalogue rather than hiding them: a person
     * searching for a terminal that is already saved should be told it exists,
     * not shown a list that mysteriously omits the thing they wanted. */
    const existing = await this.prisma.location.findMany({
      where: {
        googlePlaceId: { in: candidates.map((c) => c.googlePlaceId) },
        deletedAt: null,
      },
      select: { googlePlaceId: true },
    });
    const saved = new Set(existing.map((row) => row.googlePlaceId));

    return {
      configured: true,
      candidates: candidates.map((candidate) => ({
        ...candidate,
        kind: guessKind(candidate),
        alreadySaved: saved.has(candidate.googlePlaceId),
      })),
    };
  }

  async create(dto: CreateLocationDto): Promise<Location> {
    let name = dto.name;
    let latitude = dto.latitude;
    let longitude = dto.longitude;
    let formattedAddress = dto.formattedAddress ?? null;
    let city = dto.city ?? null;
    let country = dto.country ?? null;
    let countryCode: string | null = null;
    let source: 'google' | 'manual' = 'manual';

    if (dto.googlePlaceId) {
      const existing = await this.prisma.location.findFirst({
        where: { googlePlaceId: dto.googlePlaceId, deletedAt: null },
      });
      if (existing) {
        throw new ConflictException(
          `${existing.name} (${existing.reference}) is already saved for that place.`,
        );
      }

      /* Google is asked again rather than trusted from the search payload — see
       * `placeDetails`. The operator's own name still wins if they renamed it in
       * the form, because "Doraleh Container Terminal (SGTD)" is how this office
       * refers to it and Google's display name is not always that. */
      const place = await this.google.placeDetails(dto.googlePlaceId);
      name = dto.name?.trim() || place.name;
      latitude = place.latitude;
      longitude = place.longitude;
      formattedAddress = dto.formattedAddress ?? place.formattedAddress;
      city = dto.city ?? place.city;
      country = dto.country ?? place.country;
      countryCode = place.countryCode;
      source = 'google';
    }

    if (latitude == null || longitude == null) {
      throw new BadRequestException(
        'A location needs coordinates: pick a place from the search, or enter latitude and longitude.',
      );
    }

    const reference = await nextReference(
      this.prisma.location as never,
      'LOC',
    );

    return this.prisma.location.create({
      data: {
        reference,
        name,
        kind: dto.kind ?? 'other',
        googlePlaceId: dto.googlePlaceId ?? null,
        formattedAddress,
        city: city ?? 'Djibouti',
        country: country ?? 'Djibouti',
        countryCode,
        latitude: new Prisma.Decimal(latitude),
        longitude: new Prisma.Decimal(longitude),
        source,
        gateOrTerminal: dto.gateOrTerminal ?? null,
        contactPerson: dto.contactPerson ?? null,
        contactPhone: dto.contactPhone ?? null,
        notes: dto.notes ?? null,
        active: dto.active ?? true,
      },
    });
  }

  async update(id: string, dto: UpdateLocationDto): Promise<Location> {
    const current = await this.findOne(id);

    const data: Prisma.LocationUpdateInput = {};
    if (dto.name !== undefined) data.name = dto.name;
    if (dto.kind !== undefined) data.kind = dto.kind;
    if (dto.formattedAddress !== undefined) data.formattedAddress = dto.formattedAddress;
    if (dto.city !== undefined) data.city = dto.city;
    if (dto.country !== undefined) data.country = dto.country;
    if (dto.gateOrTerminal !== undefined) data.gateOrTerminal = dto.gateOrTerminal;
    if (dto.contactPerson !== undefined) data.contactPerson = dto.contactPerson;
    if (dto.contactPhone !== undefined) data.contactPhone = dto.contactPhone;
    if (dto.notes !== undefined) data.notes = dto.notes;
    if (dto.active !== undefined) data.active = dto.active;

    /* Moving the pin makes every cached distance to and from this place wrong.
     * They are dropped rather than recomputed here: recomputing eagerly would
     * bill Google for pairs nobody may ask about again, and the next request for
     * one measures it. */
    const moved =
      (dto.latitude !== undefined && !current.latitude.equals(dto.latitude)) ||
      (dto.longitude !== undefined && !current.longitude.equals(dto.longitude));

    if (dto.latitude !== undefined) data.latitude = new Prisma.Decimal(dto.latitude);
    if (dto.longitude !== undefined) data.longitude = new Prisma.Decimal(dto.longitude);
    /* A pin dragged by hand is no longer Google's answer, and should not claim
     * to be — `source` is what tells a later reader which numbers to re-check. */
    if (moved) data.source = 'manual';

    const updated = await this.prisma.location.update({ where: { id }, data });

    if (moved) {
      const { count } = await this.prisma.locationDistance.deleteMany({
        where: { OR: [{ originId: id }, { destinationId: id }] },
      });
      if (count > 0) {
        this.logger.log(
          `${updated.reference} moved — dropped ${count} cached distance(s); they will be re-measured on next use.`,
        );
      }
    }

    return updated;
  }

  /**
   * Retire a location.
   *
   * Soft, always. A shipment from 2026 points at this row, and the pin on its
   * tracking map should not vanish because the depot closed in 2027. The picker
   * stops offering it; everything that already happened still reads.
   */
  async remove(id: string): Promise<{ id: string; reference: string }> {
    const location = await this.findOne(id);
    await this.prisma.location.update({
      where: { id },
      data: { deletedAt: new Date(), active: false },
    });
    return { id: location.id, reference: location.reference };
  }

  /* ── Distance ────────────────────────────────────────────────────────── */

  /**
   * How far it is between two saved locations, by road.
   *
   * Reads the cache first. On a miss it measures once, stores, and returns —
   * so the second shipment down the same lane costs nothing and answers
   * instantly. `refresh` forces a re-measure, for when a road actually changed.
   */
  async distanceBetween(
    originId: string,
    destinationId: string,
    options: { refresh?: boolean } = {},
  ): Promise<DistanceResult> {
    if (originId === destinationId) {
      throw new BadRequestException('Origin and destination are the same place.');
    }

    const [origin, destination] = await Promise.all([
      this.findOne(originId),
      this.findOne(destinationId),
    ]);

    if (!options.refresh) {
      const cached = await this.prisma.locationDistance.findUnique({
        where: { originId_destinationId: { originId, destinationId } },
      });
      /* A straight-line row is a placeholder, not an answer. Treating it as a
         cache HIT is a trap that closes behind you: every lane measured before
         the API key was configured would keep returning its crow-flight number
         forever, the shipment form would never show a road, and
         `backfill-shipment-distances.ts` — which refuses to write anything but
         a Google result — would refuse every lane permanently and report
         success. So once Google is reachable, a `haversine` row is a miss and
         gets re-measured. A `manual` row is somebody's deliberate figure and
         always stands. */
      const isPlaceholder = cached?.provider === 'haversine' && this.google.configured;
      if (cached && !isPlaceholder) return toResult(cached, false);
    }

    const leg = await this.google.routeDistance(
      { latitude: origin.latitude.toNumber(), longitude: origin.longitude.toNumber() },
      {
        latitude: destination.latitude.toNumber(),
        longitude: destination.longitude.toNumber(),
      },
    );

    const row = await this.prisma.locationDistance.upsert({
      where: { originId_destinationId: { originId, destinationId } },
      create: {
        originId,
        destinationId,
        distanceMeters: leg.distanceMeters,
        durationSeconds: leg.durationSeconds,
        provider: leg.provider,
        computedAt: new Date(),
      },
      update: {
        distanceMeters: leg.distanceMeters,
        durationSeconds: leg.durationSeconds,
        provider: leg.provider,
        computedAt: new Date(),
      },
    });

    return toResult(row, true);
  }

  /** Every distance already measured — the corridor's book, for a matrix view. */
  async distanceBook(): Promise<DistanceResult[]> {
    const rows = await this.prisma.locationDistance.findMany({
      orderBy: { computedAt: 'desc' },
    });
    return rows.map((row) => toResult(row, false));
  }

  /**
   * Measure every pair that has not been measured yet, in one go.
   *
   * Optional, and worth running once after the catalogue is first filled: it
   * turns every later distance lookup in the shipment wizard into a cache hit,
   * so nobody waits on Google while filling in a form. Skips pairs already
   * known unless `refresh`.
   */
  async buildDistanceBook(options: { refresh?: boolean } = {}): Promise<{
    measured: number;
    skipped: number;
    failed: number;
    provider: string;
  }> {
    const locations = await this.prisma.location.findMany({
      where: { deletedAt: null, active: true },
      select: { id: true },
    });

    if (locations.length > MAX_MATRIX_LOCATIONS) {
      throw new BadRequestException(
        `Building the whole book for ${locations.length} locations would be ${
          locations.length * (locations.length - 1)
        } measurements. The cap is ${MAX_MATRIX_LOCATIONS} locations; measure the pairs you need on demand instead.`,
      );
    }

    /* Same placeholder rule as `distanceBetween`: a pair whose only row is a
       straight line is NOT known once Google is reachable, or "Measure
       Distances" would report a full book that never contains a road. */
    const known = options.refresh
      ? new Set<string>()
      : new Set(
          (
            await this.prisma.locationDistance.findMany({
              select: { originId: true, destinationId: true, provider: true },
              where: this.google.configured ? { provider: { not: 'haversine' } } : undefined,
            })
          ).map((row) => `${row.originId}:${row.destinationId}`),
        );

    let measured = 0;
    let skipped = 0;
    let failed = 0;

    for (const origin of locations) {
      for (const destination of locations) {
        if (origin.id === destination.id) continue;
        if (known.has(`${origin.id}:${destination.id}`)) {
          skipped += 1;
          continue;
        }
        try {
          await this.distanceBetween(origin.id, destination.id, {
            refresh: options.refresh,
          });
          measured += 1;
        } catch (error) {
          /* One unreachable pair must not abandon the other 199. */
          failed += 1;
          this.logger.warn(
            `Could not measure ${origin.id} -> ${destination.id}: ${(error as Error).message}`,
          );
        }
      }
    }

    return {
      measured,
      skipped,
      failed,
      provider: this.google.configured ? 'google' : 'haversine',
    };
  }

  /** Whether Google is wired up, for the UI to tell the operator plainly. */
  status(): { googleConfigured: boolean } {
    return { googleConfigured: this.google.configured };
  }
}

/* ── Helpers ───────────────────────────────────────────────────────────── */

interface DistanceRow {
  originId: string;
  destinationId: string;
  distanceMeters: number;
  durationSeconds: number;
  provider: string;
  computedAt: Date;
}

function toResult(row: DistanceRow, fresh: boolean): DistanceResult {
  return {
    originId: row.originId,
    destinationId: row.destinationId,
    distanceMeters: row.distanceMeters,
    /* One decimal. A tenth of a kilometre is the finest thing worth quoting on
     * a road, and rounding to whole km here would lose the 0.5 that matters on
     * a 3km port-to-depot shuttle. */
    distanceKm: Math.round(row.distanceMeters / 100) / 10,
    durationSeconds: row.durationSeconds,
    durationLabel: formatDuration(row.durationSeconds),
    provider: row.provider,
    computedAt: row.computedAt,
    fresh,
  };
}

/** `4500` -> `"1h 15m"`. Null at zero, which means "the provider didn't say". */
export function formatDuration(seconds: number): string | null {
  if (!seconds || seconds <= 0) return null;
  const totalMinutes = Math.round(seconds / 60);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) return `${minutes}m`;
  if (minutes === 0) return `${hours}h`;
  return `${hours}h ${minutes}m`;
}

/**
 * Google's categories, translated into ours.
 *
 * A guess offered as the form's default, never a decision: the operator sees it
 * pre-selected and changes it when Google has filed a free zone under
 * "point_of_interest", which it often does.
 */
function guessKind(place: PlaceCandidate): LocationKind {
  const haystack = `${place.types.join(' ')} ${place.name}`.toLowerCase();

  if (/\bport\b|harbou?r|terminal|quay|wharf/.test(haystack)) return 'port';
  if (/free[\s-]?(zone|trade)|\bfz\b|diftz/.test(haystack)) return 'free_zone';
  if (/depot|container yard|\bicd\b/.test(haystack)) return 'depot';
  if (/warehouse|storage|logistics|yard/.test(haystack)) return 'yard';
  return 'other';
}

export { LOCATION_KINDS };
