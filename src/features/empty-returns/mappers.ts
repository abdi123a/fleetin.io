import {
  EMPTY_RETURN_EXCEPTIONS,
  EMPTY_RETURN_HUB,
  resolveContainerSize,
} from '@/data/emptyReturnData';
import type {
  ContainerOutcome,
  ContainerStage,
  CycleChain,
  EmptyReturnRecord,
  EmptyReturnStatus,
  FullLoadMission,
  LinkedFullLoad,
} from '@/types/emptyReturn';

import type {
  EmptyReturnBookingRecord,
  EmptyReturnChainRecord,
  EmptyReturnCycleRecord,
} from './api/emptyReturnsService';

/**
 * Real shipments → the containers this module manages.
 *
 * This file is the whole join between Empty Container Management and the rest
 * of Fleetin, and it is deliberately the *only* one. Nothing in this module
 * invents a container, a deadline, a shipping line or a full load: every field
 * below is read off a real `Booking` (created by the Shipment wizard, moved
 * along by dispatch) or off the `EmptyReturnCycle` that welds two of them
 * together. There is no seed data and no second table to drift from.
 *
 * ## Where each side comes from
 *
 * | Screen concept        | Real source                                            |
 * |-----------------------|--------------------------------------------------------|
 * | An empty needing a decision | `GET /empty-returns/available-empties` — a delivered containerized booking whose `emptyReadyAt` is set and which no cycle has claimed |
 * | A paired / closed container | `GET /empty-returns/cycles` — the cycle plus both of its bookings |
 * | An upcoming full load       | `GET /empty-returns/open-full-loads` — an open containerized booking nothing has claimed |
 *
 * ## The two containers rule
 *
 * A pairing links **two different physical containers**. `record.container` is
 * the empty; `record.nextFull.container` is the full one it goes out under.
 * They come from two different bookings and are never merged, because the one
 * thing that makes this product misread is somebody believing the empty box
 * becomes the next full box.
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

/** Where the box physically is: the address the full load was delivered to. */
function currentLocationOf(booking: EmptyReturnBookingRecord): string {
  return booking.shipment?.deliveryLocationName || 'Location not recorded';
}

/** Where it has to go back to. Falls back to the port depot when the booking names none. */
function returnDepotOf(booking: EmptyReturnBookingRecord): string {
  return booking.containerReturnDepot || EMPTY_RETURN_HUB;
}

/** Where a truck must be to collect this load. */
function pickupHubOf(booking: EmptyReturnBookingRecord): string {
  return booking.shipment?.pickupLocationName || EMPTY_RETURN_HUB;
}

function lineOf(booking: EmptyReturnBookingRecord): string {
  return booking.shippingLine ?? 'Line not recorded';
}

/**
 * The upcoming full load side of a pairing.
 *
 * Everything here belongs to the *other* booking — its own container number,
 * its own shipment, its own truck. `pickupAt` is the field the whole pairing
 * hangs on: it is what the empty's deadline margin is measured against.
 */
function linkedFullLoadOf(booking: EmptyReturnBookingRecord | null): LinkedFullLoad | null {
  if (!booking) return null;
  return {
    container: booking.containerNumber ?? '',
    type: booking.cargoType,
    size: resolveContainerSize(booking.shipmentCategory, booking.cargoType),
    line: lineOf(booking),
    missionId: booking.reference,
    client: clientOf(booking),
    status: booking.status,
    shipmentId: booking.shipmentId,
    shipmentReference: booking.shipment?.reference,
    bookingId: booking.id,
    pickupAt: toMs(booking.scheduledPickupTime),
    pickupHub: pickupHubOf(booking),
    destination: booking.shipment?.deliveryLocationName || '—',
    transporter: booking.partner?.companyLegalName ?? null,
  };
}

/**
 * The cycle's lifecycle word, kept for the admin console.
 *
 * A mirror of the outbound booking's real ladder, never advanced by a click
 * here. The Empty Container screens themselves switch on `stage`, which is the
 * *decision*; this is the execution, and execution belongs to Shipments.
 */
function statusOfCycle(cycle: EmptyReturnCycleRecord): EmptyReturnStatus {
  const status = cycle.status;
  if (status === 'preparing' || status === 'ready' || status === 'in_progress' || status === 'completed') {
    return status;
  }
  return 'preparing';
}

/**
 * A delivered, unmatched booking — a container still waiting on a decision.
 *
 * There is no "unloading, not yet empty" state to reproduce: the backend only
 * offers a booking here once its `emptyReadyAt` is set, which is Operations
 * saying the box was actually stripped. So every row from this side is either
 * `empty` (still asking) or `return_planned` (the operator already decided it
 * goes back on its own) — the flag is what separates them, and a flagged
 * container deliberately stays visible rather than vanishing from the board.
 */
export function emptyBookingToRow(
  booking: EmptyReturnBookingRecord,
  now: number,
): EmptyReturnRecord {
  const deadline = toMs(booking.containerReturnDeadline);
  const planned = toMs(booking.emptyReturnPlannedAt);
  const standalone = booking.emptyReturnException === EMPTY_RETURN_EXCEPTIONS.standaloneRequired;
  const stage: ContainerStage = standalone ? 'return_planned' : 'empty';
  const location = currentLocationOf(booking);

  return {
    id: booking.reference,
    bookingReference: booking.reference,
    bookingId: booking.id,

    container: booking.containerNumber ?? '',
    type: booking.cargoType,
    size: resolveContainerSize(booking.shipmentCategory, booking.cargoType),
    line: lineOf(booking),
    client: clientOf(booking),
    transporter: transporterOf(booking),
    truck: booking.vehicle?.plateNumber ?? null,

    locationId: location,
    locationName: location,
    returnDepot: returnDepotOf(booking),

    prevLoad: booking.reference,
    shipmentId: booking.shipmentId,
    shipmentReference: booking.shipment?.reference,

    fullPickupAt: toMs(booking.scheduledPickupTime),
    emptyReadyAt: toMs(booking.emptyReadyAt) ?? toMs(booking.completedAt) ?? now,
    matchedAt: null,
    plannedReturnAt: planned,
    returnedAt: null,
    deadline,
    deadlineStatus: deadline ? 'verified' : 'missing',

    stage,
    outcome: null,

    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    exception: booking.emptyReturnException,

    status: 'empty_ready',
    predictedGateIn: null,
  };
}

/**
 * How a closed container finished.
 *
 * A pairing only counts as a pairing if the deadline actually held — an empty
 * that went out under a full load collected *after* its deadline accrued
 * detention exactly like one that went back late on its own, and calling that
 * a win would flatter every figure on the Dashboard.
 */
function outcomeOf(
  hasNextFull: boolean,
  returnedAt: number | null,
  deadline: number | null,
): ContainerOutcome | null {
  if (!returnedAt) return null;
  const late = deadline !== null && returnedAt > deadline;
  if (late) return 'returned_late';
  return hasNextFull ? 'paired' : 'returned';
}

/** A matched cycle — the same row shape, welded to a real outbound booking. */
export function cycleToRow(cycle: EmptyReturnCycleRecord, now: number): EmptyReturnRecord {
  const booking = cycle.booking;
  const deadline = toMs(booking.containerReturnDeadline);
  const returnedAt = toMs(cycle.returnedAt);
  const nextFull = linkedFullLoadOf(cycle.nextBooking);
  const location = currentLocationOf(booking);

  const stage: ContainerStage = returnedAt ? 'closed' : nextFull ? 'paired' : 'return_planned';

  return {
    id: cycle.reference,
    bookingReference: booking.reference,
    bookingId: booking.id,

    container: booking.containerNumber ?? '',
    type: booking.cargoType,
    size: resolveContainerSize(booking.shipmentCategory, booking.cargoType),
    line: lineOf(booking),
    client: clientOf(booking),
    transporter: transporterOf(booking),
    truck: booking.vehicle?.plateNumber ?? null,

    locationId: location,
    locationName: location,
    returnDepot: returnDepotOf(booking),

    prevLoad: booking.reference,
    shipmentId: booking.shipmentId,
    shipmentReference: booking.shipment?.reference,

    fullPickupAt: toMs(booking.scheduledPickupTime),
    emptyReadyAt: toMs(booking.emptyReadyAt) ?? toMs(cycle.emptyReadyAt) ?? now,
    // The cycle row is created the instant Operations confirms the pairing, so
    // its own `createdAt` is the confirmation stamp — there is no separate
    // "matched at" column to read, and inventing one would only let the two drift.
    matchedAt: toMs(cycle.createdAt),
    plannedReturnAt: toMs(booking.emptyReturnPlannedAt),
    returnedAt,
    deadline,
    deadlineStatus: deadline ? 'verified' : 'missing',

    stage,
    outcome: outcomeOf(Boolean(nextFull), returnedAt, deadline),

    chainId: cycle.chain?.reference ?? cycle.chainId,
    cycleId: cycle.reference,
    seq: cycle.seq,
    nextFull,
    exception: booking.emptyReturnException,

    status: statusOfCycle(cycle),
    predictedGateIn: null,

    impactStatus: cycle.impactStatus ?? null,
    impactCounted: Boolean(cycle.impactCountedAt),
    avoidedKm: cycle.impactCountedAt ? decimalOrNull(cycle.avoidedDistanceKm) : null,
    avoidedCo2Kg: cycle.impactCountedAt ? decimalOrNull(cycle.avoidedCo2Kg) : null,
  };
}

/** A Prisma Decimal crosses the wire as a string; null stays null. */
function decimalOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

/**
 * An open, unclaimed booking — the demand side of matching.
 *
 * `locationId` here is the *pickup* location, because that is where a truck has
 * to be. A container's own `locationId` is where the box currently sits, so the
 * two being equal is exactly the "no repositioning leg" case the engine rewards.
 */
export function bookingToFullLoadMission(booking: EmptyReturnBookingRecord): FullLoadMission {
  const pickupAt = toMs(booking.scheduledPickupTime) ?? Date.now();
  const hub = pickupHubOf(booking);

  return {
    id: booking.reference,
    bookingId: booking.id,
    container: booking.containerNumber ?? '',
    type: booking.cargoType,
    size: resolveContainerSize(booking.shipmentCategory, booking.cargoType),
    line: lineOf(booking),
    client: clientOf(booking),
    locationId: hub,
    locationName: hub,
    pickupHub: hub,
    destination: booking.shipment?.deliveryLocationName || '—',
    pickupAt,
    window: new Date(pickupAt).toLocaleString('en-GB', {
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }),
    transporter: booking.partner?.companyLegalName ?? null,
    truck: booking.vehicle?.plateNumber ?? null,
    status: booking.status,
    shipmentId: booking.shipmentId,
    shipmentReference: booking.shipment?.reference,
  };
}

/**
 * A real chain, with its links mapped to the same row shape everything else uses.
 *
 * `completed` and `onTime` come back resolved from the server rather than being
 * re-derived here, so the figure a chain header prints cannot disagree with the
 * one the API computed off the same rows.
 */
export function chainToCycleChain(chain: EmptyReturnChainRecord, now: number): CycleChain {
  const cycles = chain.cycles.map((cycle) => cycleToRow(cycle, now));
  const first = cycles[0];
  const last = cycles[cycles.length - 1];
  const active = cycles.find((c) => c.stage !== 'closed') ?? null;
  const pairings = cycles.filter((c) => Boolean(c.nextFull)).length;

  /* The impact figures come off the rows as the server judged them — only
     the links stamped as counted carry a figure, so several empties under one
     load do not add the same trip twice. Nothing is derived here. */
  let avoidedKm = 0;
  let avoidedCo2Kg = 0;
  let realizedLinks = 0;
  for (const row of cycles) {
    if (row.impactStatus === 'realized') realizedLinks += 1;
    avoidedKm += row.avoidedKm ?? 0;
    avoidedCo2Kg += row.avoidedCo2Kg ?? 0;
  }

  const averageEmptyMs = cycles.length
    ? cycles.reduce((total, c) => {
        if (!c.emptyReadyAt) return total;
        const end = c.matchedAt ?? c.plannedReturnAt ?? c.returnedAt ?? now;
        return total + Math.max(0, end - c.emptyReadyAt);
      }, 0) / cycles.length
    : 0;

  return {
    id: chain.reference,
    cycles,
    // A chain always has at least one cycle — it is only ever created inside
    // `createCycle` — so neither end is actually undefined here.
    first: first as EmptyReturnRecord,
    last: last as EmptyReturnRecord,
    pairings,
    completed: chain.completed,
    active,
    onTime: chain.onTime,
    closedChain: Boolean(last && last.stage === 'closed' && !last.nextFull),
    maxSequence: chain.maxSequence,
    averageEmptyMs,
    avoidedKm: Math.round(avoidedKm * 10) / 10,
    avoidedCo2Kg: Math.round(avoidedCo2Kg * 10) / 10,
    realizedLinks,
  };
}
