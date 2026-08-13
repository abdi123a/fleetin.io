/**
 * The seam between the Shipments module and the Empty Return module.
 *
 * Shipments (`Mission`) are the operational source of truth; the Empty Return
 * module speaks a narrower dialect (`FullLoadMission`, `EmptyReturnRecord`).
 * Everything here is a pure translation between the two, so both stores can
 * call across without either module leaking its vocabulary into the other:
 *
 * - A containerized shipment still waiting for a truck **is** an open full-load
 *   mission → it belongs in the Matching pool.
 * - A containerized shipment that has been delivered **is** an empty container
 *   waiting to go back → it belongs in the returns board, starting at
 *   `unloading`.
 *
 * No store imports here — the two stores import this file, never the reverse.
 */

import {
  CHECKLIST_COUNT,
  EMPTY_RETURN_EXCEPTIONS,
  EMPTY_RETURN_HUB,
  HOUR_MS,
} from '@/data/emptyReturnData';
import { derivedId, formatId, hashedId } from '@/lib/ids';
import type { ContainerFormat, EmptyReturnRecord, FullLoadMission } from '@/types/emptyReturn';
import type { LocationInfo, Mission, MissionStatus } from '@/types/mission';
import type { PartnerRecord } from '@/types/partner';

/* ---------------------------------------------------------------------------
 * Status vocabulary
 * ------------------------------------------------------------------------- */

/**
 * The box is at (or past) its delivery point — from here on the shipment's
 * container is an empty-return concern. `Arrived` counts: the clock on the
 * return deadline does not wait for the POD paperwork.
 */
export const DELIVERED_SHIPMENT_STATUSES: readonly MissionStatus[] = [
  'Arrived',
  'Unloading',
  'POD Submitted',
  'Completed',
];

/** Statuses in which a shipment is an open full load the Matching view may pair. */
export const OPEN_SHIPMENT_STATUSES: readonly MissionStatus[] = ['Pending'];

export function isContainerizedShipment(mission: Mission): boolean {
  if (mission.shipmentCategory) {
    return (
      mission.shipmentCategory === 'containerized' ||
      mission.shipmentCategory === 'container_20' ||
      mission.shipmentCategory === 'container_40'
    );
  }
  return Boolean(mission.containerNumber);
}

/** Containerized and still waiting for a vehicle — a Matching pool candidate. */
export function isOpenFullLoadShipment(mission: Mission): boolean {
  return isContainerizedShipment(mission) && OPEN_SHIPMENT_STATUSES.includes(mission.status);
}

/** Containerized and delivered — its box is now an empty waiting to return. */
export function isDeliveredContainerShipment(mission: Mission): boolean {
  return isContainerizedShipment(mission) && DELIVERED_SHIPMENT_STATUSES.includes(mission.status);
}

/* ---------------------------------------------------------------------------
 * Field translations
 * ------------------------------------------------------------------------- */

/**
 * The Empty Return module's matching gate is Location ID equality, so every
 * shipment destination has to resolve to one. The five yards the module ships
 * with are matched by name fragment; anywhere else gets a stable slug id, which
 * simply never same-location-matches a seeded yard — correct, since a truck at
 * an unknown yard cannot absorb a full load bound for a known one.
 */
const KNOWN_RETURN_LOCATIONS: readonly {
  id: string;
  name: string;
  fragments: readonly string[];
}[] = [
  { id: formatId('location', 1), name: 'Boulaos Industrial Yard', fragments: ['boulaos'] },
  {
    id: formatId('location', 2),
    name: 'Djibouti Free Zone — Warehouse Block B-12',
    fragments: ['free zone', 'free trade zone', 'diftz', 'b-12'],
  },
  { id: formatId('location', 3), name: 'PK12 Dry Port Yard', fragments: ['pk12'] },
  { id: formatId('location', 4), name: 'Ali Sabieh Logistics Hub', fragments: ['ali sabieh'] },
  { id: formatId('location', 5), name: 'Nagad Inland Container Depot', fragments: ['nagad'] },
];

export function resolveReturnLocation(location: LocationInfo): {
  locationId: string;
  locationName: string;
} {
  const haystack = `${location.name} ${location.address} ${location.city}`.toLowerCase();
  const known = KNOWN_RETURN_LOCATIONS.find((entry) =>
    entry.fragments.some((fragment) => haystack.includes(fragment)),
  );
  if (known) return { locationId: known.id, locationName: known.name };

  /*
   * An unknown yard still needs a stable key, and it must never equal a seeded
   * one — `hashedId` puts it in the reserved band above the hand-numbered
   * yards, in the same LOC-##### shape. So an unlisted destination reads like
   * every other location reference instead of announcing itself as a fallback
   * with a different format, and still never same-location-matches a seeded
   * yard, which is the behaviour the matching gate depends on.
   */
  return { locationId: hashedId('location', location.name), locationName: location.name };
}

/** `20` anywhere in the cargo description or category reads 20GP; the corridor's default is 40HC. */
export function containerFormatOf(mission: Mission): ContainerFormat {
  if (mission.shipmentCategory === 'container_20') return '20GP';
  if (mission.shipmentCategory === 'container_40') return '40HC';
  const text = `${mission.cargoType} ${mission.assignedTruck?.vehicleType ?? ''} ${mission.shipmentCategory ?? ''}`;
  return /20\s?(ft|'|p)|20GP/i.test(text) ? '20GP' : '40HC';
}

/** ISO 6346 owner prefixes for the lines this corridor actually moves. */
const LINE_BY_CONTAINER_PREFIX: Record<string, string> = {
  MSK: 'Maersk',
  MSC: 'MSC',
  CMA: 'CMA CGM',
  HLX: 'Hapag-Lloyd',
  ONE: 'ONE',
  TCL: 'Triton',
};

export function shippingLineOf(mission: Mission): string {
  if (mission.shippingLine) return mission.shippingLine;
  const prefix = mission.containerNumber?.replace(/[^A-Z]/gi, '').slice(0, 3).toUpperCase();
  return (prefix && LINE_BY_CONTAINER_PREFIX[prefix]) || 'Unknown Line';
}

/** `YYYY-MM-DD HH:mm` → epoch ms, or null when absent/unparseable. */
export function parseMissionTimestamp(value: string | undefined): number | null {
  if (!value) return null;
  const parsed = new Date(value.replace(' ', 'T')).getTime();
  return Number.isNaN(parsed) ? null : parsed;
}

/* ---------------------------------------------------------------------------
 * Mission → Empty Return shapes
 * ------------------------------------------------------------------------- */

/**
 * A pending containerized shipment, spoken as an open full-load mission.
 *
 * Document readiness is derived, not stored: booking follows the confirmed
 * booking step on the timeline, release and the Delivery Order follow payment —
 * a prepaid load has its release in hand, an unpaid one shows amber chips in
 * Matching and lets Operations decide anyway, which is the module's stance.
 */
export function shipmentToFullLoadMission(mission: Mission): FullLoadMission | null {
  if (!isContainerizedShipment(mission) || !mission.containerNumber) return null;

  const { locationId, locationName } = resolveReturnLocation(mission.deliveryLocation);
  const pickupAt =
    parseMissionTimestamp(mission.scheduledPickupTime) ?? Date.now() + 6 * HOUR_MS;
  const pickupHour = new Date(pickupAt).getHours();
  const bookingConfirmed = mission.timeline.some(
    (step) => step.key === 'booking_confirmation' && step.status === 'completed',
  );
  const paid = mission.paymentStatus === 'Paid';

  return {
    /*
     * Derived from the shipment's own reference rather than minted, so the same
     * shipment always yields the same full-load id no matter how many times the
     * pool is rebuilt — this record is a VIEW of a shipment, not a new thing.
     */
    id: derivedId('fullLoad', mission.id),
    container: mission.containerNumber,
    type: containerFormatOf(mission),
    line: shippingLineOf(mission),
    client: mission.customer.company,
    locationId,
    locationName,
    pickupHub: EMPTY_RETURN_HUB,
    pickupAt,
    window: `${String(pickupHour).padStart(2, '0')}:00 – ${String((pickupHour + 4) % 24).padStart(2, '0')}:00`,
    doStatus: bookingConfirmed && paid ? 'verified' : 'pending',
    booking: bookingConfirmed ? 'confirmed' : 'pending',
    release: paid ? 'confirmed' : 'pending',
    shipmentId: mission.id,
  };
}

/**
 * A delivered containerized shipment, spoken as an empty waiting to return.
 *
 * Starts at `unloading` / milestone 2 — the same resting state the module's own
 * loop-closing spawn uses — and takes its deadline from the return commitment
 * the booking captured. No commitment recorded means the record arrives wearing
 * the `Deadline missing` exception, which is the board telling Operations to go
 * get one, not a default being papered over.
 */
export function shipmentToEmptyReturnRecord(
  mission: Mission,
  id: string,
  now: number,
): EmptyReturnRecord | null {
  if (!isContainerizedShipment(mission) || !mission.containerNumber) return null;

  const { locationId, locationName } = resolveReturnLocation(mission.deliveryLocation);
  const deadline = parseMissionTimestamp(mission.containerReturn?.deadline);

  return {
    id,
    container: mission.containerNumber,
    type: containerFormatOf(mission),
    line: shippingLineOf(mission),
    client: mission.customer.company,
    locationId,
    locationName,
    transporter: mission.transporter.company,
    truck: mission.assignedTruck?.registrationNumber ?? null,
    emptyReadyAt: null,
    deadline,
    deadlineStatus: deadline ? 'unverified' : 'missing',
    predictedGateIn: now + 18 * HOUR_MS,
    returnedAt: null,
    status: 'unloading',
    chainId: null,
    cycleId: null,
    seq: null,
    nextFull: null,
    milestone: 2,
    checklist: Array<boolean>(CHECKLIST_COUNT).fill(false),
    exception: deadline ? null : EMPTY_RETURN_EXCEPTIONS.deadlineMissing,
    shipmentId: mission.id,
  };
}

/* ---------------------------------------------------------------------------
 * Partner lookup
 * ------------------------------------------------------------------------- */

/**
 * Company legal name → partner record, for stamping real ids back onto a
 * shipment. Takes the live partner list as a parameter rather than importing
 * mock data directly — Partners now has a real backend, and this lookup must
 * resolve against current data, not a frozen fixture (its one caller,
 * `assignShipmentToCycle` in shipment.store.ts, passes the partner list it
 * already has hydrated).
 */
export function findPartnerByName(name: string, partners: PartnerRecord[]): PartnerRecord | undefined {
  return partners.find((partner) => partner.companyLegalName === name);
}
