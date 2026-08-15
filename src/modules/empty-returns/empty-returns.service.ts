import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextReference } from '../../common/helpers/reference.util';
import { isValidShipmentStatusTransition, timelineKeyForStatus } from '../shipments/shipment-status.util';
import { cycleStatusForBookingStatus, DELIVERED_STATUSES } from './empty-return-status.util';
import { CreateCycleDto } from './dto/create-cycle.dto';

/**
 * Empty Return, cut down to its one real job: confirm that an empty matches
 * a full load. Everything else about a cycle's progress is a reflection of
 * the real `Booking` it points at — this service never advances a cycle by
 * itself; `BookingsService.updateStatus` calls `syncCycleStatusForBooking`
 * after every real status change, and that is the only thing that moves a
 * cycle forward once it exists.
 *
 * There is deliberately no row, and no synthetic id, for an empty that
 * hasn't been matched yet — `findAvailableEmpties` is a live query over
 * `Booking`, not a spawned record. A chain is a strict lineage: cycle 2
 * exists because its `bookingId` is cycle 1's `nextBookingId`, found and
 * inherited here, never grouped by "same transporter, same yard" the way
 * the old frontend heuristic did.
 */
@Injectable()
export class EmptyReturnsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Every booking-facing query below joins `shipment` (for the client's
   * denormalized name), `partner`, and `vehicle` — a bare `Booking` row only
   * carries their ids, and every consumer of this module (the matching pool,
   * the cycle table, chains) needs to display who and what, not just which
   * FK. Kept as one shared shape so the frontend gets a consistent record.
   */
  private readonly bookingDisplayInclude = { shipment: true, partner: true, vehicle: true } as const;

  /**
   * Containerized, delivered, not already claimed by a cycle — including
   * ones flagged standalone. A flag stops *matching*, not visibility: the
   * frontend's own matching pool filters `!exception` itself (mirroring how
   * a booking can be flagged before it's ever offered for matching at all),
   * so a flagged empty still needs to come back here to be seen and to drop
   * out of the pool at the same time, instead of just vanishing.
   */
  async findAvailableEmpties() {
    return this.prisma.booking.findMany({
      where: {
        deletedAt: null,
        containerNumber: { not: null },
        status: { in: DELIVERED_STATUSES },
        asEmpty: null,
      },
      include: this.bookingDisplayInclude,
      orderBy: { completedAt: 'asc' },
    });
  }

  /** Containerized, still open (`Pending`), not already claimed as someone's next full load. */
  async findOpenFullLoads() {
    return this.prisma.booking.findMany({
      where: {
        deletedAt: null,
        containerNumber: { not: null },
        status: 'Pending',
        asNextFull: null,
      },
      include: this.bookingDisplayInclude,
      orderBy: { scheduledPickupTime: 'asc' },
    });
  }

  async findAllCycles(params: { status?: string; chainId?: string }) {
    return this.prisma.emptyReturnCycle.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.chainId ? { chainId: params.chainId } : {}),
      },
      include: {
        booking: { include: this.bookingDisplayInclude },
        nextBooking: { include: this.bookingDisplayInclude },
        chain: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCycle(id: string) {
    const cycle = await this.prisma.emptyReturnCycle.findFirst({
      where: { OR: [{ id }, { reference: id }] },
      include: {
        booking: { include: this.bookingDisplayInclude },
        nextBooking: { include: this.bookingDisplayInclude },
        chain: true,
      },
    });
    if (!cycle) throw new NotFoundException(`Cycle with ID "${id}" not found`);
    return cycle;
  }

  /**
   * Every chain, each with its header figures resolved from its cycles —
   * `completed`/`onTime`/`maxSequence` computed here rather than stored, so
   * they can never drift from the cycles they describe.
   */
  async findAllChains() {
    const chains = await this.prisma.emptyReturnChain.findMany({
      include: {
        cycles: {
          include: {
            booking: { include: this.bookingDisplayInclude },
            nextBooking: { include: this.bookingDisplayInclude },
          },
          orderBy: { seq: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
    });

    return chains.map((chain) => {
      const completed = chain.cycles.filter((c) => c.status === 'completed').length;
      const onTime = chain.cycles.filter(
        (c) => c.returnedAt && c.booking.containerReturnDeadline && c.returnedAt <= c.booking.containerReturnDeadline,
      ).length;
      const maxSequence = chain.cycles.reduce((max, c) => Math.max(max, c.seq ?? 0), 0);
      return { ...chain, completed, onTime, maxSequence };
    });
  }

  /**
   * The one write action. Welds an empty booking to an open full-load
   * booking. If this empty is itself the full load a previous cycle went out
   * to collect, the chain continues (same `chainId`, next `seq`); otherwise
   * a new chain starts here.
   */
  async createCycle(dto: CreateCycleDto) {
    const booking = await this.prisma.booking.findFirst({
      where: { OR: [{ id: dto.bookingId }, { reference: dto.bookingId }], deletedAt: null },
    });
    if (!booking) throw new NotFoundException(`Booking with ID "${dto.bookingId}" not found`);

    const alreadyCycled = await this.prisma.emptyReturnCycle.findUnique({ where: { bookingId: booking.id } });
    if (alreadyCycled) throw new ConflictException(`Booking "${booking.reference}" already has a cycle`);

    let nextBooking = null;
    if (dto.nextBookingId) {
      nextBooking = await this.prisma.booking.findFirst({
        where: { OR: [{ id: dto.nextBookingId }, { reference: dto.nextBookingId }], deletedAt: null },
      });
      if (!nextBooking) throw new NotFoundException(`Booking with ID "${dto.nextBookingId}" not found`);
      const alreadyClaimed = await this.prisma.emptyReturnCycle.findUnique({ where: { nextBookingId: nextBooking.id } });
      if (alreadyClaimed) throw new ConflictException(`Booking "${nextBooking.reference}" is already claimed by another cycle`);
    }

    // Chain continuation: this booking is the "next full load" of an earlier
    // cycle iff that cycle exists — found by the FK the other direction.
    const parentCycle = await this.prisma.emptyReturnCycle.findUnique({ where: { nextBookingId: booking.id } });

    let chainId = parentCycle?.chainId ?? null;
    let seq = 1;
    if (chainId) {
      seq = (await this.prisma.emptyReturnCycle.count({ where: { chainId } })) + 1;
    } else {
      const chain = await this.prisma.emptyReturnChain.create({
        data: { reference: await nextReference(this.prisma.emptyReturnChain, 'CHN') },
      });
      chainId = chain.id;
    }

    const reference = await nextReference(this.prisma.emptyReturnCycle, 'CYC');
    const cycle = await this.prisma.emptyReturnCycle.create({
      data: {
        reference,
        bookingId: booking.id,
        nextBookingId: nextBooking?.id,
        chainId,
        seq,
        status: 'preparing',
        emptyReadyAt: new Date(),
      },
      include: {
        booking: { include: this.bookingDisplayInclude },
        nextBooking: { include: this.bookingDisplayInclude },
        chain: true,
      },
    });

    // The one forced transition: confirming a match is an immediate
    // commitment of that vehicle to the job, same as `shipment-status.util`
    // already carves out for this exact cross-module edge.
    if (nextBooking && isValidShipmentStatusTransition(nextBooking.status, 'Assigned')) {
      await this.prisma.booking.update({
        where: { id: nextBooking.id },
        data: {
          status: 'Assigned',
          timeline: {
            create: {
              key: timelineKeyForStatus('Assigned'),
              title: 'Status changed to Assigned',
              description: `Committed to empty-return cycle ${reference}`,
              timestamp: new Date(),
              status: 'completed',
            },
          },
        },
      });
    }

    return cycle;
  }

  /** Matching has stopped for this container — it goes back on its own. The one manual override this module keeps. */
  async markStandalone(bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { OR: [{ id: bookingId }, { reference: bookingId }], deletedAt: null },
    });
    if (!booking) throw new NotFoundException(`Booking with ID "${bookingId}" not found`);

    return this.prisma.booking.update({
      where: { id: booking.id },
      data: { emptyReturnException: 'Standalone empty return required' },
    });
  }

  /**
   * Closes out a standalone container — one with no match, so nothing was
   * ever going to flip `syncCycleStatusForBooking` for it. Writes the same
   * "completed" cycle row a real match ends at, just with no `nextBooking`
   * to have driven it there: this is the one case where a cycle's status is
   * set directly instead of mirrored.
   */
  async confirmStandaloneReturn(bookingId: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { OR: [{ id: bookingId }, { reference: bookingId }], deletedAt: null },
    });
    if (!booking) throw new NotFoundException(`Booking with ID "${bookingId}" not found`);
    if (!DELIVERED_STATUSES.includes(booking.status)) {
      throw new ConflictException(`Booking "${booking.reference}" hasn't been delivered yet`);
    }
    if (!booking.emptyReturnException) {
      throw new ConflictException(`Booking "${booking.reference}" isn't flagged for a standalone return`);
    }

    const existing = await this.prisma.emptyReturnCycle.findUnique({ where: { bookingId: booking.id } });
    if (existing) throw new ConflictException(`Booking "${booking.reference}" already has a cycle`);

    const reference = await nextReference(this.prisma.emptyReturnCycle, 'CYC');
    return this.prisma.emptyReturnCycle.create({
      data: {
        reference,
        bookingId: booking.id,
        status: 'completed',
        emptyReadyAt: booking.completedAt ?? new Date(),
        returnedAt: new Date(),
      },
      include: {
        booking: { include: this.bookingDisplayInclude },
        nextBooking: { include: this.bookingDisplayInclude },
        chain: true,
      },
    });
  }

  /**
   * Called by `BookingsService.updateStatus` after every real status write.
   * A no-op unless this booking is somebody's matched outbound load — the
   * entire replacement for the old manual milestone clicker.
   */
  async syncCycleStatusForBooking(bookingId: string, newStatus: string) {
    const cycle = await this.prisma.emptyReturnCycle.findUnique({ where: { nextBookingId: bookingId } });
    if (!cycle) return;

    const mapped = cycleStatusForBookingStatus(newStatus);
    if (!mapped) return;

    const justReturned = mapped === 'completed' && cycle.status !== 'completed';
    await this.prisma.emptyReturnCycle.update({
      where: { id: cycle.id },
      data: {
        status: mapped,
        returnedAt: justReturned ? new Date() : cycle.returnedAt,
      },
    });
  }
}
