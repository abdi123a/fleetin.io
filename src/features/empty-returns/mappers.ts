import { EMPTY_RETURN_HUB } from '@/data/emptyReturnData';
import type {
  EmptyReturnBookingRecord,
  EmptyReturnChainRecord,
  EmptyReturnCycleRecord,
} from './api/emptyReturnsService';
import type { CycleChain, EmptyReturnRecord, EmptyReturnStatus, FullLoadMission, LinkedFullLoad } from '@/types/emptyReturn';
import { EMPTY_RETURN_STATUS_META } from '@/data/emptyReturnData';

/**
 * Real data → the display shapes the Empty Return pages already render.
 *
 * `EmptyReturnRecord`/`FullLoadMission`/`CycleChain` used to be the mock
 * store's own state; they are now just a view model, rebuilt fresh from
 * `Booking`/`EmptyReturnCycle`/`EmptyReturnChain` on every fetch. Every other
 * pure function in `emptyReturn.store.ts` (`riskOf`, `slackOf`, `selectKpis`,
 * `selectFilteredRecords`, `selectUrgentRecords`, `selectTransporterStats`,
 * the formatters) already operates on these exact types and needed no
 * changes at all — only the source of the records did.
 */

function toMs(value: string | null | undefined): number | null {
  if (!value) return null;
  const ms = Date.parse(value);
  return Number.isNaN(ms) ? null : ms;
}

function clientOf(booking: EmptyReturnBookingRecord): string {
  return booking.shipment?.customerCompany || booking.shipment?.customerName || 'Unknown shipper';
}

function transporterOf(booking: EmptyReturnBookingRecord): string {
  return booking.partner?.companyLegalName ?? 'Unassigned';
}

function depotOf(booking: EmptyReturnBookingRecord): string {
  return booking.containerReturnDepot || 'Depot not set';
}

function linkedFullLoadOf(booking: EmptyReturnBookingRecord | null): LinkedFullLoad | null {
  if (!booking) return null;
  return {
    container: booking.containerNumber ?? '',
    type: booking.cargoType,
    missionId: booking.reference,
    client: clientOf(booking),
    shipmentId: booking.shipmentId,
    shipmentReference: booking.shipment?.reference,
    bookingId: booking.id,
  };
}

/**
 * A delivered, unmatched booking — the matching pool's "empty" side.
 *
 * There is no "unloading, not yet confirmed empty" state to reproduce: a
 * real booking is offered here the moment its own status lands in
 * `DELIVERED_STATUSES` (see the backend's `empty-return-status.util.ts`), so
 * every row is `empty_ready` — the old manual "confirm empty ready" click
 * had no backing field and is simply gone, not replicated.
 */
export function emptyBookingToRow(booking: EmptyReturnBookingRecord, now: number): EmptyReturnRecord {
  const deadline = toMs(booking.containerReturnDeadline);
  return {
    id: booking.reference,
    container: booking.containerNumber ?? '',
    type: booking.cargoType,
    line: booking.shippingLine ?? 'Unknown line',
    client: clientOf(booking),
    locationId: depotOf(booking),
    locationName: depotOf(booking),
    transporter: transporterOf(booking),
    truck: booking.vehicle?.plateNumber ?? null,
    emptyReadyAt: toMs(booking.completedAt) ?? now,
    deadline,
    deadlineStatus: deadline ? 'verified' : 'missing',
    predictedGateIn: null,
    returnedAt: null,
    status: 'empty_ready',
    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    exception: booking.emptyReturnException,
    shipmentId: booking.shipmentId,
    shipmentReference: booking.shipment?.reference,
    bookingId: booking.id,
  };
}

/** A matched cycle — the Cycles table's other row shape, welded to a real `nextBooking`. */
export function cycleToRow(cycle: EmptyReturnCycleRecord, now: number): EmptyReturnRecord {
  const booking = cycle.booking;
  const deadline = toMs(booking.containerReturnDeadline);
  return {
    id: cycle.reference,
    container: booking.containerNumber ?? '',
    type: booking.cargoType,
    line: booking.shippingLine ?? 'Unknown line',
    client: clientOf(booking),
    locationId: depotOf(booking),
    locationName: depotOf(booking),
    transporter: transporterOf(booking),
    truck: booking.vehicle?.plateNumber ?? null,
    emptyReadyAt: toMs(cycle.emptyReadyAt) ?? now,
    deadline,
    deadlineStatus: deadline ? 'verified' : 'missing',
    predictedGateIn: null,
    returnedAt: toMs(cycle.returnedAt),
    // `preparing|ready|in_progress|completed` — a strict subset of
    // EmptyReturnStatus, which is why the cast is safe: a matched cycle
    // never reads `unloading`/`empty_ready`, those only apply pre-match.
    status: cycle.status as EmptyReturnStatus,
    chainId: cycle.chain?.reference ?? cycle.chainId,
    cycleId: cycle.reference,
    seq: cycle.seq,
    nextFull: linkedFullLoadOf(cycle.nextBooking),
    exception: booking.emptyReturnException,
    shipmentId: booking.shipmentId,
    shipmentReference: booking.shipment?.reference,
    bookingId: booking.id,
  };
}

/** An open, unclaimed booking — the matching pool's "full load" side. */
export function bookingToFullLoadMission(booking: EmptyReturnBookingRecord): FullLoadMission {
  const pickupAt = toMs(booking.scheduledPickupTime) ?? Date.now();
  return {
    id: booking.reference,
    container: booking.containerNumber ?? '',
    type: booking.cargoType,
    line: booking.shippingLine ?? 'Unknown line',
    client: clientOf(booking),
    locationId: depotOf(booking),
    locationName: depotOf(booking),
    pickupHub: EMPTY_RETURN_HUB,
    pickupAt,
    window: new Date(pickupAt).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
    shipmentId: booking.shipmentId,
  };
}

/** A real chain, with its cycles mapped to the same row shape the Cycles table uses. */
export function chainToCycleChain(chain: EmptyReturnChainRecord, now: number): CycleChain {
  const cycles = chain.cycles.map((cycle) => cycleToRow(cycle, now));
  const first = cycles[0];
  const active = cycles.find((c) => c.status !== 'completed') ?? null;
  const maxSequence = cycles.reduce((max, c) => Math.max(max, c.seq ?? 0), 0);

  return {
    id: chain.reference,
    cycles,
    // A chain always has at least one cycle (it is only ever created inside
    // `createCycle`), so `first` is never actually undefined here.
    first: first as EmptyReturnRecord,
    completed: chain.completed,
    active,
    onTime: chain.onTime,
    statusLabel: active ? EMPTY_RETURN_STATUS_META[active.status].label : 'Completed',
    maxSequence,
  };
}
