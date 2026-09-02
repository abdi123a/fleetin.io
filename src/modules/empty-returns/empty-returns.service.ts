import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { nextReference } from '../../common/helpers/reference.util';
import { isValidShipmentStatusTransition, timelineKeyForStatus } from '../shipments/shipment-status.util';
import { syncShipmentFromBookings } from '../shipments/shipment-sync';
import { DELIVERED_STATUSES, cycleStatusForBookingStatus, hasProofOfReturn } from './empty-return-status.util';
import { CreateCycleDto } from './dto/create-cycle.dto';
import { emptiesFor, emptyFromBooking, loadFromBooking, loadsFor } from './empty-return-matching.util';

/**
 * Detention day-rate, in the ledger's currency. v19 prices a late return at a
 * flat $90/day and the whole Dashboard is built on it. It lives here as the
 * one place the number is written down; when Settings grows a real
 * finance-owned rate this constant is what that lookup replaces.
 */
const DETENTION_RATE_PER_DAY = 90;

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
  async findAvailableEmpties(scope: Record<string, unknown> | null = null) {
    /* No proof-of-delivery filter any more — POD was removed from the product
     * on 2026-08-26. A box enters the pool on the "Empty Ready" rung alone,
     * which is Operations saying the container was actually stripped. */
    return this.prisma.booking.findMany({
      where: {
        deletedAt: null,
        containerNumber: { not: null },
        /* The box is in the pool from the moment Operations says it was
         * emptied — the "Empty Ready" rung — not from the moment the truck
         * pulled up at the consignee. A container still being stripped is not
         * something another job can be planned around. */
        emptyReadyAt: { not: null },
        status: { in: DELIVERED_STATUSES },
        asEmpty: null,
        ...(scope ?? {}),
      },
      include: this.bookingDisplayInclude,
      // Longest-waiting box first — that is the one accruing detention.
      orderBy: { emptyReadyAt: 'asc' },
    });
  }

  /**
   * Containerized, still open (`Pending`), and with at least one container
   * slot left.
   *
   * The filter used to be `asNextFull: null` — "nobody has claimed this load".
   * That was the 1:1 world. Since a load carries `emptySlots` (v19's `qty`) the
   * question became *how many* have claimed it, which a relation filter cannot
   * express against a per-row column, so capacity is applied after the fetch.
   * `_count` rides along in the same query rather than a second pass.
   */
  async findOpenFullLoads(scope: Record<string, unknown> | null = null) {
    const rows = await this.prisma.booking.findMany({
      where: {
        deletedAt: null,
        containerNumber: { not: null },
        status: 'Pending',
        ...(scope ?? {}),
      },
      include: { ...this.bookingDisplayInclude, _count: { select: { asNextFull: true } } },
      orderBy: { scheduledPickupTime: 'asc' },
    });
    return rows.filter((b) => b._count.asNextFull < (b.emptySlots ?? 1));
  }

  /**
   * The engine, served.
   *
   * Both directions run the *same* `empty-return-matching.util` the frontend
   * mirrors, so a suggestion the board shows is one the API will accept. Slot
   * usage is counted per load in one grouped query rather than per candidate —
   * a pool of 20 loads against 40 empties would otherwise be 800 round trips.
   */
  private async loadPoolWithUsage(scope: Record<string, unknown> | null = null) {
    const loads = await this.findOpenFullLoads(scope);
    const usage = await this.prisma.emptyReturnCycle.groupBy({
      by: ['nextBookingId'],
      _count: { _all: true },
      where: { nextBookingId: { in: loads.map((l) => l.id) } },
    });
    const taken = new Map(usage.map((u) => [u.nextBookingId as string, u._count._all]));
    return { loads, taken };
  }

  /** Direction A — which open full loads can take this empty container? */
  async suggestionsForEmpty(bookingId: string, scope: Record<string, unknown> | null = null) {
    const booking = await this.prisma.booking.findFirst({
      where: { OR: [{ id: bookingId }, { reference: bookingId }], deletedAt: null },
    });
    if (!booking) throw new NotFoundException(`Booking with ID "${bookingId}" not found`);

    const now = Date.now();
    const { loads, taken } = await this.loadPoolWithUsage(scope);
    const byId = new Map(loads.map((l) => [l.id, l]));

    return loadsFor(
      emptyFromBooking(booking),
      loads.map((l) => loadFromBooking(l, taken.get(l.id) ?? 0)),
      now,
    ).map((s) => ({
      ...s,
      /* The engine works on the reduced shape; callers want the whole booking
         back so the card can draw a shipper, a hub and an appointment. */
      load: byId.get(s.load.id) ?? s.load,
    }));
  }

  /** Direction B — which waiting empties could ride out under this load? */
  async suggestionsForLoad(bookingId: string, scope: Record<string, unknown> | null = null) {
    const load = await this.prisma.booking.findFirst({
      where: { OR: [{ id: bookingId }, { reference: bookingId }], deletedAt: null },
    });
    if (!load) throw new NotFoundException(`Booking with ID "${bookingId}" not found`);

    const now = Date.now();
    const empties = await this.findAvailableEmpties(scope);
    const byId = new Map(empties.map((e) => [e.id, e]));
    const taken = await this.prisma.emptyReturnCycle.count({ where: { nextBookingId: load.id } });

    return emptiesFor(
      loadFromBooking(load, taken),
      empties.map((e) => emptyFromBooking(e)),
      now,
    ).map((s) => ({ ...s, empty: byId.get(s.empty.id) ?? s.empty }));
  }

  async findAllCycles(params: { status?: string; chainId?: string; scope?: Record<string, unknown> | null }) {
    return this.prisma.emptyReturnCycle.findMany({
      where: {
        ...(params.status ? { status: params.status } : {}),
        ...(params.chainId ? { chainId: params.chainId } : {}),
        ...(params.scope ?? {}),
      },
      include: {
        booking: { include: this.bookingDisplayInclude },
        nextBooking: { include: this.bookingDisplayInclude },
        chain: true,
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async findCycle(id: string, scope: Record<string, unknown> | null = null) {
    const cycle = await this.prisma.emptyReturnCycle.findFirst({
      where: { OR: [{ id }, { reference: id }], ...(scope ?? {}) },
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
  async findAllChains(scope: Record<string, unknown> | null = null) {
    const chains = await this.prisma.emptyReturnChain.findMany({
      // A portal caller sees a chain only where one of its cycles is its own,
      // and then only those cycles — a chain is shared by construction, so the
      // filter has to sit on both the outer row and the included list.
      ...(scope ? { where: { cycles: { some: scope } } } : {}),
      include: {
        cycles: {
          ...(scope ? { where: scope } : {}),
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
      /* Capacity, not exclusivity. Since 2026-08-29 a full load carries
         `emptySlots` container slots (v19's `qty`) and can absorb that many
         empties; the old check refused the second one outright because the
         column was unique. Null means one, which is every ordinary
         single-container booking. */
      const slots = nextBooking.emptySlots ?? 1;
      const taken = await this.prisma.emptyReturnCycle.count({
        where: { nextBookingId: nextBooking.id },
      });
      if (taken >= slots) {
        throw new ConflictException(
          `Booking "${nextBooking.reference}" has no container slot left (${taken}/${slots} used)`,
        );
      }
    }

    // Chain continuation: this booking is the "next full load" of an earlier
    // cycle iff that cycle exists — found by the FK the other direction.
    /* `findFirst`, not `findUnique`: `nextBookingId` stopped being unique when
       a load gained multiple slots. When several empties ride out under one
       load they all descend from it, and the chain this new cycle joins is the
       oldest such lineage — deterministic, so re-running never re-parents. */
    const parentCycle = await this.prisma.emptyReturnCycle.findFirst({
      where: { nextBookingId: booking.id },
      orderBy: { createdAt: 'asc' },
    });

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
        /* v19 stores the decision instead of letting each screen re-derive it
           from (returnedAt, nextBooking). A cycle created without a load is an
           empty still awaiting one; with a load it is paired, now. */
        stage: nextBooking ? 'paired' : 'empty',
        matchedAt: nextBooking ? new Date() : null,
        matchedBy: dto.matchedBy ?? 'Operations',
        matchSource: dto.matchSource ?? 'Manual — Matching',
        emptyReadyAt: booking.emptyReadyAt ?? new Date(),
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
      // This bypasses `BookingsService.updateStatus`, so the shipment rollup
      // that normally rides along with a status write has to be done here too.
      await syncShipmentFromBookings(this.prisma, nextBooking.shipmentId);
    }

    return cycle;
  }

  /**
   * Plan the empty return — matching has stopped for this container and it
   * goes back on its own. The one manual override this module keeps.
   *
   * `plannedReturnAt` is the second half of that decision: the flag says
   * matching stopped, the date says when the box is actually going back.
   * Optional, because an operator can decide to stop matching before they
   * know the slot; passing it later just overwrites, and the deadline it is
   * racing is on the booking either way.
   */
  async markStandalone(bookingId: string, plannedReturnAt?: string) {
    const booking = await this.prisma.booking.findFirst({
      where: { OR: [{ id: bookingId }, { reference: bookingId }], deletedAt: null },
      include: this.bookingDisplayInclude,
    });
    if (!booking) throw new NotFoundException(`Booking with ID "${bookingId}" not found`);

    const alreadyCycled = await this.prisma.emptyReturnCycle.findUnique({ where: { bookingId: booking.id } });
    if (alreadyCycled) {
      throw new ConflictException(
        `Booking "${booking.reference}" is already in cycle ${alreadyCycled.reference} — cancel the pairing first`,
      );
    }

    return this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        emptyReturnException: 'Standalone empty return required',
        // `undefined` leaves an already-planned date alone; a caller that
        // wants to clear it sends an empty string, which lands as null.
        ...(plannedReturnAt === undefined
          ? {}
          : { emptyReturnPlannedAt: plannedReturnAt ? new Date(plannedReturnAt) : null }),
      },
      include: this.bookingDisplayInclude,
    });
  }

  /**
   * Undo a pairing.
   *
   * A confirmed match is a decision, not an execution, so it has to be
   * reversible — the operator who paired the wrong box has no other way back.
   * Deleting the cycle is only half of it: `createCycle` force-transitions the
   * outbound booking to `Assigned` as its commitment, so cancelling has to
   * hand that commitment back, which means walking the booking to `Pending`
   * and re-running the shipment rollup that rode along with the write.
   *
   * Refused once the cycle has actually moved. A cycle past `preparing` means
   * a driver is on the job and the box is travelling; that is execution, and
   * this module does not undo execution. A returned cycle is history.
   */
  async cancelCycle(id: string, scope: Record<string, unknown> | null = null) {
    const cycle = await this.prisma.emptyReturnCycle.findFirst({
      where: { OR: [{ id }, { reference: id }], ...(scope ?? {}) },
      include: { nextBooking: true },
    });
    if (!cycle) throw new NotFoundException(`Cycle with ID "${id}" not found`);
    if (cycle.returnedAt) {
      throw new ConflictException(`Cycle "${cycle.reference}" is closed — the container is already back`);
    }
    if (cycle.status !== 'preparing') {
      throw new ConflictException(
        `Cycle "${cycle.reference}" is already under way (${cycle.status}) — the pairing can no longer be cancelled`,
      );
    }

    const chainId = cycle.chainId;
    const nextBooking = cycle.nextBooking;

    await this.prisma.emptyReturnCycle.delete({ where: { id: cycle.id } });

    // Hand the vehicle back. `Assigned -> Pending` is the exact inverse of the
    // one forced edge `createCycle` writes, and is written the same way: by
    // hand, then re-rolled onto the shipment.
    if (nextBooking && nextBooking.status === 'Assigned') {
      await this.prisma.booking.update({
        where: { id: nextBooking.id },
        data: {
          status: 'Pending',
          timeline: {
            create: {
              key: timelineKeyForStatus('Pending'),
              title: 'Status changed to Pending',
              description: `Released from empty-return cycle ${cycle.reference}`,
              timestamp: new Date(),
              status: 'completed',
            },
          },
        },
      });
      await syncShipmentFromBookings(this.prisma, nextBooking.shipmentId);
    }

    // A chain that has just lost its only link is not a chain any more. Left
    // behind it would show up on the Cycles board as an empty pyramid.
    if (chainId) {
      const remaining = await this.prisma.emptyReturnCycle.count({ where: { chainId } });
      if (remaining === 0) await this.prisma.emptyReturnChain.delete({ where: { id: chainId } });
    }

    return { id: cycle.id, reference: cycle.reference, nextBookingId: nextBooking?.id ?? null, shipmentId: nextBooking?.shipmentId ?? null };
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
    /* The depot's receipt, or it did not come back.
     *
     * This is the moment the box is declared home: detention stops here, the
     * cycle closes here, and the booking that owed the container is completed
     * here. All three are settled on one person's word unless the paper the
     * depot handed them is behind it. Same rule, and the same reason, as the
     * proof of delivery at the other end of the job.
     *
     * The frontend asks for it in the dialog that confirms the return, so the
     * file and the confirmation are one action rather than two screens. */
    if (!(await hasProofOfReturn(this.prisma, booking.id))) {
      throw new ConflictException(
        `Booking "${booking.reference}" cannot be closed without its proof of return. ` +
          'Attach the depot receipt for the empty container and confirm again.',
      );
    }
    const existing = await this.prisma.emptyReturnCycle.findUnique({ where: { bookingId: booking.id } });
    if (existing) throw new ConflictException(`Booking "${booking.reference}" already has a cycle`);

    const reference = await nextReference(this.prisma.emptyReturnCycle, 'CYC');
    const returnedAt = new Date();
    /* v19 judges a standalone return against its own deadline and prices the
       overrun once, here, at close time. Stored rather than recomputed on read
       so a historic cycle keeps the rate that was in force when it closed. */
    const deadline = booking.containerReturnDeadline;
    const late = deadline !== null && returnedAt > deadline;
    const detentionFee = late
      ? Math.ceil((returnedAt.getTime() - deadline.getTime()) / 86_400_000) * DETENTION_RATE_PER_DAY
      : 0;

    const cycle = await this.prisma.emptyReturnCycle.create({
      data: {
        reference,
        bookingId: booking.id,
        status: 'completed',
        stage: 'closed',
        outcome: late ? 'returned_late' : 'returned',
        detentionFee,
        emptyReadyAt: booking.emptyReadyAt ?? booking.completedAt ?? returnedAt,
        returnedAt,
      },
      include: {
        booking: { include: this.bookingDisplayInclude },
        nextBooking: { include: this.bookingDisplayInclude },
        chain: true,
      },
    });

    /* Same rule as a matched return: the box is back, so the job is over. */
    await this.closeBookingOnReturn(booking.id, returnedAt);
    return cycle;
  }

  /**
   * Called by `BookingsService.updateStatus` after every real status write.
   * A no-op unless this booking is somebody's matched outbound load — the
   * entire replacement for the old manual milestone clicker.
   */
  async syncCycleStatusForBooking(bookingId: string, newStatus: string) {
    /* Every cycle riding out under this load, not just one — a load with
       several slots moves all of its empties at once, and updating only the
       first would strand the rest mid-ladder. */
    const cycles = await this.prisma.emptyReturnCycle.findMany({ where: { nextBookingId: bookingId } });
    if (cycles.length === 0) return;

    const mapped = cycleStatusForBookingStatus(newStatus);
    if (!mapped) return;

    for (const cycle of cycles) {
      const justReturned = mapped === 'completed' && cycle.status !== 'completed';
      const returnedAt = justReturned ? new Date() : cycle.returnedAt;
      await this.prisma.emptyReturnCycle.update({
        where: { id: cycle.id },
        data: {
          status: mapped,
          returnedAt,
          /* The box is physically home: close the cycle and settle its
             outcome. It travelled out under a load, so it is a `paired`
             close — the win state, and never a late return. */
          ...(justReturned ? { stage: 'closed', outcome: 'paired' } : {}),
          ...(mapped === 'in_progress' && !cycle.dispatchedAt ? { dispatchedAt: new Date() } : {}),
        },
      });

      /* The truck carrying the empty has landed, so the box is home — and the
       * job that owed it is finally over. `BookingsService` refuses to complete
       * a containerized booking itself for exactly this reason, so closing it is
       * this module's responsibility and happens here, automatically, rather
       * than waiting for somebody to notice and click.
       *
       * Inside the loop since 2026-08-29: one load can carry several empties
       * home, and each of them owns a different booking to close. */
      if (justReturned && returnedAt) {
        await this.closeBookingOnReturn(cycle.bookingId, returnedAt);
      }
    }
  }

  /**
   * Marks the booking whose container just came back as Completed.
   *
   * Written directly rather than through `BookingsService.updateStatus`,
   * which is the guard this is the release valve for — same reason
   * `createCycle` writes its forced "Assigned" edge by hand. The shipment
   * rollup that normally rides along with a status write is done here too.
   */
  /**
   * Record that a container physically made it back, at the moment reported.
   *
   * This is the operator's own door into the return, opened 2026-08-26: the
   * booking's "Empty Returned" rung calls it. Before, `returnedAt` could only
   * be written by a matched cycle running or by `confirmStandaloneReturn`,
   * which meant the one person who actually watches the box come back — the
   * dispatcher on the booking — had no way to say so, and the booking's last
   * rung sat permanently disabled waiting for somebody else.
   *
   * Idempotent: a cycle already carrying a `returnedAt` keeps its first one.
   * The box came back once, and the earliest report of it is the honest one.
   */
  async recordReturnedAt(bookingId: string, returnedAt: Date) {
    const existing = await this.prisma.emptyReturnCycle.findUnique({ where: { bookingId } });
    if (existing) {
      if (existing.returnedAt) return existing;
      return this.prisma.emptyReturnCycle.update({
        where: { bookingId },
        data: { returnedAt, status: 'completed' },
      });
    }

    /* No cycle at all — the box never got matched to an outbound load and was
       never flagged standalone; it simply went back. That is still a return,
       so it gets a cycle of its own rather than being lost. */
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { emptyReadyAt: true },
    });
    return this.prisma.emptyReturnCycle.create({
      data: {
        reference: await nextReference(this.prisma.emptyReturnCycle, 'CYC'),
        bookingId,
        status: 'completed',
        emptyReadyAt: booking?.emptyReadyAt ?? returnedAt,
        returnedAt,
      },
    });
  }

  private async closeBookingOnReturn(bookingId: string, returnedAt: Date) {
    const booking = await this.prisma.booking.findUnique({
      where: { id: bookingId },
      select: { id: true, status: true, shipmentId: true, vehicleId: true, reference: true },
    });
    // Nothing to close if the job was cancelled, failed, or is somehow already
    // shut; and a booking with no truck never legitimately reaches Completed.
    if (!booking || booking.status === 'Completed' || !booking.vehicleId) return;
    if (booking.status === 'Cancelled' || booking.status === 'Failed') return;

    await this.prisma.booking.update({
      where: { id: booking.id },
      data: {
        status: 'Completed',
        completedAt: returnedAt,
        timeline: {
          create: {
            key: timelineKeyForStatus('Completed'),
            title: 'Status changed to Completed',
            description: 'Mission closed — empty container returned to the depot',
            timestamp: returnedAt,
            status: 'completed',
          },
        },
      },
    });
    await syncShipmentFromBookings(this.prisma, booking.shipmentId);
  }
}
