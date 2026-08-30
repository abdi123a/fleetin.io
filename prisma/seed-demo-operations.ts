/**
 * Re-time and enrich the demo book so every Operations screen has something
 * true to show — Shipments, Empty Container (Control Tower / Matching /
 * Cycles), Shippers, and Partners (Overview / Vehicles / Drivers).
 *
 * This is NOT a from-scratch seed. The cast in this database — the real
 * Djibouti freight companies, their fleets, the staff accounts — is the good
 * part and is left alone. What this fixes is the book on top of it, which had
 * drifted into a state where several features were invisible:
 *
 *   1. THE MATCHING POOL WAS EMPTY. `EmptyReturnsService` draws its load side
 *      from bookings at `status: 'Pending'`, and there were none — so
 *      `emptiesFor`/`loadsFor` returned nothing for every container in the
 *      yard, and the Matching dialog looked broken rather than empty. Open
 *      loads are minted here, forward-dated, and deliberately share a line and
 *      a size with real empties so the engine has legal pairs to rank.
 *
 *   2. EVERY DEADLINE HAD PASSED. `effectivePickup` re-bases a stale pickup to
 *      now, so a pairing dies on `empty.deadline < now` — every box in the
 *      pool was permanently unmatchable. Deadlines are now set from each
 *      container's own free days, forward of today, with exactly ONE overdue
 *      box kept on purpose so detention is demonstrable.
 *
 *   3. THE LADDER WAS BARELY WALKED. Bookings sat on four of the fourteen
 *      rungs. They are spread across all of them here, and because a
 *      shipment's status is derived from the least advanced booking beneath
 *      it, the rollup is visible rather than asserted.
 *
 *   4. THE DEBRIEF WAS EMPTY. `shipperRating` was null on every booking and
 *      `driverRating` on all but eight — so the whole rating system, which is
 *      nothing but recorded human answers, had no answers to show. Both halves
 *      are recorded here with all three axes, a real note, an author and a
 *      timestamp.
 *
 *   5. THE BOOK WAS MONOTONOUS. One line, one size, one route, and container
 *      numbers that were runs of digits. Lines, sizes (so the size gate is
 *      actually exercised), ports, free zones and ISO 6346 container numbers
 *      are varied here.
 *
 * Idempotent by construction: it re-times and overwrites rather than
 * appending, except for the open loads, which are keyed by reference.
 */
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'crypto';
import { assertSeedTargetIsSafe } from './seed-target-guard';
import { deriveShipmentStatus, timelineKeyForStatus } from '../src/modules/shipments/shipment-status.util';

const prisma = new PrismaClient();

/* ---------------------------------------------------------------------------
 * Determinism
 *
 * A demo that reshuffles on every run cannot be talked about ("the one with
 * the broken chain") and cannot be diffed. Seeded PRNG, fixed anchor.
 * ------------------------------------------------------------------------- */

function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rand = mulberry32(20260831);
const pick = <T>(xs: readonly T[]): T => xs[Math.floor(rand() * xs.length)];
const int = (lo: number, hi: number) => lo + Math.floor(rand() * (hi - lo + 1));

/** Today at 08:00 local — the anchor every other timestamp is measured from. */
const NOW = new Date();
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate(), 8, 0, 0, 0);
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const at = (dayOffset: number, hour = 9, minute = 0): Date =>
  new Date(TODAY.getTime() + dayOffset * DAY + (hour - 8) * HOUR + minute * 60_000);

/* ---------------------------------------------------------------------------
 * The corridor
 *
 * Port -> free zone, which is the only shape this business actually runs.
 * ------------------------------------------------------------------------- */

const PORTS = [
  { name: 'Doraleh Container Terminal', gate: 'Gate 3 — DCT', city: 'Doraleh' },
  { name: 'Port de Djibouti (PDSA)', gate: 'Gate 1 — PDSA', city: 'Djibouti' },
  { name: 'SGTD Terminal', gate: 'Gate 2 — SGTD', city: 'Doraleh' },
  { name: 'Horizon Terminal', gate: 'Horizon Gate', city: 'Doraleh' },
] as const;

const ZONES = [
  { name: 'Djibouti Free Zone (DFZ)', gate: 'DFZ Gate B', city: 'Djibouti', km: 18 },
  { name: 'UKAB Free Zone', gate: 'UKAB Main Gate', city: 'Djibouti', km: 24 },
  { name: 'DIFTZ — PK12 Freezone', gate: 'PK12 Gate 4', city: 'PK12', km: 31 },
  { name: 'Damerjog Industrial Park', gate: 'Damerjog Gate', city: 'Damerjog', km: 42 },
] as const;

const DEPOTS = [
  'Doraleh Empty Depot',
  'SGTD Empty Yard',
  'PK12 Empty Park',
  'Damerjog Container Depot',
] as const;

/**
 * Line, its ISO 6346 owner prefixes, and the sizes it is shown carrying.
 *
 * Size matters here beyond decoration: it is one of the two hard gates in the
 * matching engine, and with every box a 40ft the gate could never refuse
 * anything, so it could never be seen working either.
 */
const LINES = [
  { line: 'Maersk Line', prefixes: ['MSKU', 'MRKU'] },
  { line: 'CMA CGM', prefixes: ['CMAU', 'ECMU'] },
  { line: 'MSC', prefixes: ['MSCU', 'MEDU'] },
  { line: 'Hapag-Lloyd', prefixes: ['HLBU', 'HLXU'] },
  { line: 'COSCO Shipping Lines', prefixes: ['CSNU', 'COSU'] },
  { line: 'Evergreen', prefixes: ['EGHU', 'EISU'] },
] as const;

/** category -> what `resolveContainerSize` will read back out of it. */
const SIZES = [
  { category: 'container_20', size: "20'", capacity: '20ft' },
  { category: 'container_40', size: "40'", capacity: '40ft' },
  { category: 'container_40hc', size: '40HC', capacity: '40ft HC' },
] as const;

const GOODS = [
  ['Spare Parts', 'Automotive spare parts, palletised'],
  ['Electronics', 'Consumer electronics, cartoned'],
  ['Textiles', 'Bulk textiles and garments'],
  ['Rice', 'Bagged rice, 25kg sacks'],
  ['Sugar', 'Refined sugar, bagged'],
  ['Foodstuff', 'Assorted dry foodstuff'],
  ['Building Material', 'Ceramic tiles, crated'],
  ['Beverages', 'Bottled beverages, palletised'],
] as const;

/** ISO 6346: four letters then seven digits. */
function containerNumber(prefix: string): string {
  return `${prefix}${String(int(1000000, 9999999))}`;
}

/* ---------------------------------------------------------------------------
 * The debrief
 *
 * Every star in this system is a person's answer. Canned text is still a
 * person's answer in a demo; runs of "test" are not, and they read as an
 * unfinished feature rather than a used one.
 * ------------------------------------------------------------------------- */

const DRIVER_NOTES_GOOD = [
  'Arrived inside the appointment slot and cleared the gate without a call.',
  'Clean run. Seal intact, paperwork complete on arrival at the zone.',
  'Took the PK12 bypass on his own initiative and saved about an hour.',
  'Careful on the unloading bay, waited for the forklift rather than rushing it.',
  'Called ahead when the queue built up at the terminal, so we could warn the consignee.',
] as const;

const DRIVER_NOTES_MIXED = [
  'Held 40 minutes at the DCT gate — line paperwork was late, not his doing.',
  'Solid on the road but did not answer the phone between the port and PK12.',
  'Late to the pickup by an hour; traffic on the RN1 after the roundabout.',
  'Delivered fine, but the empty sat two days before he flagged it was ready.',
] as const;

const SHIPPER_NOTES_GOOD = [
  'Receiving bay was free on arrival, box stripped in under an hour.',
  'Consignee had the clerk and the forklift ready — no waiting at all.',
  'Documents were with the gate before the truck got there. Smooth.',
  'Flagged the empty as ready the same afternoon, which kept the box moving.',
] as const;

const SHIPPER_NOTES_MIXED = [
  'Two hours at the free-zone gate, no receiving clerk on shift.',
  'Unloaded promptly but the empty was not released until the next morning.',
  'Bay was occupied on arrival; the driver waited rather than being turned away.',
] as const;

/* ---------------------------------------------------------------------------
 * The ladder
 * ------------------------------------------------------------------------- */

/** In order. The rungs a booking actually walks. */
const LADDER = [
  'Pending',
  'Assigned',
  'Driver Assigned',
  'Heading to Pickup',
  'At Pickup',
  'Loading',
  'Loaded',
  'En Route',
  'Arrived',
  'Unloading',
  'POD Submitted',
  'Empty Ready',
  'Empty Picked Up',
  'Completed',
] as const;
type Rung = (typeof LADDER)[number];

const DELIVERED: readonly string[] = ['Arrived', 'Unloading', 'POD Submitted', 'Empty Ready', 'Empty Picked Up', 'Completed'];

/** Human title + where it happened, for the timeline row. */
const STEP_META: Record<string, { title: string; where: 'port' | 'road' | 'zone' | 'depot' | 'office' }> = {
  Pending: { title: 'Booking Created', where: 'office' },
  Assigned: { title: 'Vehicle Assigned', where: 'office' },
  'Driver Assigned': { title: 'Driver Assigned', where: 'office' },
  'Heading to Pickup': { title: 'Heading to Pickup', where: 'road' },
  'At Pickup': { title: 'At Pickup — Gate In', where: 'port' },
  Loading: { title: 'Loading Started', where: 'port' },
  Loaded: { title: 'Container Loaded', where: 'port' },
  'En Route': { title: 'Departed for Delivery', where: 'road' },
  Arrived: { title: 'Arrived at Consignee', where: 'zone' },
  Unloading: { title: 'Unloading Started', where: 'zone' },
  'POD Submitted': { title: 'Proof of Delivery Submitted', where: 'zone' },
  'Empty Ready': { title: 'Container Empty and Ready', where: 'zone' },
  'Empty Picked Up': { title: 'Empty Collected for Return', where: 'zone' },
  Completed: { title: 'Empty Returned — Job Complete', where: 'depot' },
};

/** Realistic gap between one rung and the next. */
const STEP_GAP_HOURS: Record<string, number> = {
  Assigned: 3,
  'Driver Assigned': 2,
  'Heading to Pickup': 12,
  'At Pickup': 2,
  Loading: 1,
  Loaded: 2,
  'En Route': 1,
  Arrived: 4,
  Unloading: 1,
  'POD Submitted': 2,
  'Empty Ready': 6,
  'Empty Picked Up': 14,
  Completed: 5,
};

export {};

/* ---------------------------------------------------------------------------
 * The plan
 *
 * Three lanes. `done` is history, `live` is what the board is for, and `next`
 * is what makes Empty Container work at all — the matching engine has no load
 * side without open bookings ahead of today.
 * ------------------------------------------------------------------------- */

type Lane = 'done' | 'live' | 'next';

interface Plan {
  lane: Lane;
  /** Day offset of the pickup, relative to today. Negative is the past. */
  pickupDay: number;
  /** Where the least advanced booking of this shipment sits. */
  rung: Rung;
  containers: number;
  /** Split the containers across two transporters. */
  split: boolean;
  /** The one box allowed to be late. */
  overdue?: boolean;
  /**
   * Forces this shipment onto one of `MATCH_COMBOS` instead of a random line
   * and size. Both hard gates in the engine are line and size, so a pool drawn
   * at random from six lines and three sizes produces eighteen combinations
   * and almost no legal pair. The yard and the open loads share a short list
   * on purpose — that is what gives Matching something to rank.
   */
  comboIndex?: number;
}

/** The line/size combinations the yard and the open loads are drawn from. */
const MATCH_COMBOS = [0, 1, 2, 3] as const;

function buildPlan(): Plan[] {
  const plans: Plan[] = [];

  /* History: twenty finished jobs walking back from three days ago to seven
     weeks, so "recent" and "a while back" both have something in them. */
  const doneDays = [-3, -4, -5, -6, -8, -9, -11, -12, -14, -16, -18, -20, -23, -25, -28, -31, -34, -38, -42, -46];
  for (const day of doneDays) {
    plans.push({ lane: 'done', pickupDay: day, rung: 'Completed', containers: int(1, 3), split: rand() < 0.2 });
  }

  /* Live: one shipment resting on each rung between Assigned and Empty Picked
     Up, so the ladder is walked end to end on the board rather than described.
     The pickup sits behind the rung — a job on `Arrived` left the port
     yesterday, not this morning. */
  const liveRungs: Rung[] = [
    'Assigned',
    'Driver Assigned',
    'Heading to Pickup',
    'At Pickup',
    'Loading',
    'Loaded',
    'En Route',
    'Arrived',
    'Unloading',
    'POD Submitted',
    'Empty Ready',
    'Empty Picked Up',
  ];
  liveRungs.forEach((rung, i) => {
    const depth = LADDER.indexOf(rung);
    plans.push({
      lane: 'live',
      pickupDay: -Math.max(0, Math.round(depth / 3)) - (i % 2),
      rung,
      containers: int(1, 3),
      split: i === 6 || i === 9,
    });
  });

  /* The yard: boxes that have come free and have nowhere to go yet. THIS is
     the matching pool. One shipment resting on `Empty Ready` — which is all
     the ladder walk above produces — is not a pool, and an empty pool is
     indistinguishable from a broken engine. */
  for (let i = 0; i < 10; i += 1) {
    plans.push({
      lane: 'live',
      pickupDay: -int(1, 5),
      rung: 'Empty Ready',
      containers: int(1, 2),
      split: false,
      comboIndex: i % MATCH_COMBOS.length,
    });
  }

  /* Ahead: the open loads. These are the load side of the matching engine, so
     they carry a real appointment and real slots; without them the Matching
     dialog has nothing to rank and reads as broken. They share the yard's
     combinations so the pairs are legal on both gates. */
  const nextDays = [1, 2, 2, 3, 4, 5, 6, 7, 8, 10, 12, 13];
  nextDays.forEach((day, i) => {
    plans.push({
      lane: 'next',
      pickupDay: day,
      rung: 'Pending',
      containers: int(1, 2),
      split: false,
      comboIndex: i % MATCH_COMBOS.length,
    });
  });

  /* Exactly one late box. The user asked for detention to be demonstrable and
     not the mood of the whole board. */
  const late = plans.find((p) => p.rung === 'Empty Ready' && p.comboIndex !== undefined);
  if (late) late.overdue = true;

  return plans;
}

/* ---------------------------------------------------------------------------
 * Build
 * ------------------------------------------------------------------------- */

async function main(): Promise<void> {
  assertSeedTargetIsSafe('seed-demo-operations.ts');

  console.log('\n▸ Reading the cast');
  const shippers = await prisma.shipper.findMany({ where: { deletedAt: null }, orderBy: { reference: 'asc' } });
  const partners = await prisma.partner.findMany({ where: { deletedAt: null }, orderBy: { reference: 'asc' } });
  const drivers = await prisma.driver.findMany({ where: { deletedAt: null } });
  const vehicles = await prisma.vehicle.findMany({ where: { deletedAt: null } });
  const users = await prisma.user.findMany({ include: { role: true } });

  if (!shippers.length || !partners.length) throw new Error('No shippers/partners — this script enriches an existing cast, it does not create one.');

  /* The people who actually record things. Portal logins are not staff and
     must never appear as the author of an internal debrief. */
  const staff = users.filter((u) => !['SHIPPER', 'TRANSPORTER', 'CLIENT', 'DRIVER'].includes(u.role?.name ?? ''));
  const ops = staff.length ? staff : users;

  const fleetOf = (partnerId: string) => ({
    drivers: drivers.filter((d) => d.partnerId === partnerId),
    vehicles: vehicles.filter((v) => v.partnerId === partnerId),
  });

  /* Keep the manual references already in the book — they are numbers the user
     typed, and a demo that renumbers them overnight loses its landmarks. */
  const existingRefs = (await prisma.shipment.findMany({ select: { reference: true }, orderBy: { createdAt: 'asc' } }))
    .map((s) => s.reference)
    .filter((r) => !/^CREWTEST/i.test(r));

  console.log(`   ${shippers.length} shippers · ${partners.length} transporters · ${drivers.length} drivers · ${vehicles.length} vehicles · ${ops.length} staff`);

  console.log('▸ Clearing the old book (cast, users and reference data untouched)');
  await prisma.emptyReturnCycle.deleteMany({});
  await prisma.emptyReturnChain.deleteMany({});
  await prisma.shipmentAssignee.deleteMany({});
  await prisma.bookingTimelineStep.deleteMany({});
  await prisma.shipmentTimelineStep.deleteMany({});
  await prisma.document.deleteMany({ where: { ownerType: 'BOOKING' } });
  await prisma.booking.deleteMany({});
  await prisma.shipment.deleteMany({});

  const plans = buildPlan();
  console.log(`▸ Building ${plans.length} shipments`);

  let refCursor = 0;
  const nextManualRef = (): string => {
    if (refCursor < existingRefs.length) return existingRefs[refCursor++];
    return String(int(240000, 899999));
  };

  /** Everything the empty-return pass needs, collected as we go. */
  const built: {
    shipmentId: string;
    reference: string;
    plan: Plan;
    bookings: { id: string; reference: string; rung: Rung; line: string; size: string; deadline: Date; emptyReadyAt: Date | null; depot: string }[];
  }[] = [];

  for (const plan of plans) {
    const shipper = pick(shippers);
    const primary = pick(partners);
    const secondary = plan.split ? pick(partners.filter((p) => p.id !== primary.id)) || primary : primary;

    const port = pick(PORTS);
    const zone = pick(ZONES);
    const depot = pick(DEPOTS);
    const lineDef = plan.comboIndex === undefined ? pick(LINES) : LINES[plan.comboIndex % LINES.length];
    const sizeDef = plan.comboIndex === undefined ? pick(SIZES) : SIZES[plan.comboIndex % SIZES.length];
    const [goodsShort, goodsLong] = pick(GOODS);

    const pickupAt = at(plan.pickupDay, int(6, 15), pick([0, 15, 30, 45]));
    const freeDays = pick([5, 7, 7, 10, 14]);

    /* The deadline is the line's free time from collection — which is what
       puts most of them ahead of today once the pickup is. The one flagged
       overdue is pulled behind it on purpose. */
    const deadline = plan.overdue
      ? at(plan.pickupDay - 2, 17, 0)
      : new Date(pickupAt.getTime() + freeDays * DAY);

    const createdAt = new Date(pickupAt.getTime() - int(2, 6) * DAY);
    const ref = nextManualRef();
    const shipmentId = randomUUID();

    /* Rate: containers x the transporter's per-mission rate, in DJF minor
       units — the one price this business has. */
    const perMission = int(45000, 49000) * 100;
    const containers = plan.containers;
    const clientRate = perMission * containers;
    const transporterRate = Math.round(clientRate * 0.88);

    const contactFirst = pick(['Ahmed', 'Fatouma', 'Idriss', 'Nasra', 'Kamil', 'Souad', 'Hodan', 'Waberi']);
    const contactLast = pick(['Osman', 'Ismail', 'Farah', 'Abdillahi', 'Hassan', 'Robleh', 'Guedi']);

    await prisma.shipment.create({
      data: {
        id: shipmentId,
        reference: ref,
        /* Comma-joined booking references — the legacy single-tier column,
           filled from the real bookings once they exist below. */
        bookingId: '',
        dpcsReference: `DPCS-DJ-${int(1000, 9999)}`,
        referenceNumber: `REF-${int(80000, 89999)}`,
        status: 'Pending', // derived at the end from the bookings
        paymentStatus: plan.lane === 'done' ? 'Paid' : 'Pending',
        shipperId: shipper.id,
        customerName: `${contactFirst} ${contactLast}`,
        customerCompany: shipper.companyLegalName,
        customerPhone: `+253 77 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
        customerEmail: `ops@${shipper.companyLegalName.toLowerCase().replace(/[^a-z0-9]+/g, '').slice(0, 14)}.dj`,
        partnerId: primary.id,
        transporterName: primary.companyLegalName,
        transporterCompany: primary.companyLegalName,
        transporterPhone: `+253 21 ${int(30, 39)} ${int(10, 99)} ${int(10, 99)}`,
        transporterFleetCode: primary.reference,
        pickupLocationName: port.name,
        pickupLocationAddress: `${port.name}, ${port.city}, Djibouti`,
        pickupLocationCity: port.city,
        pickupGateOrTerminal: port.gate,
        pickupContactPerson: `${pick(['Omar', 'Said', 'Mahdi', 'Aden'])} ${pick(['Abdi', 'Elmi', 'Warsame'])}`,
        pickupContactPhone: `+253 77 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
        deliveryLocationName: zone.name,
        deliveryLocationAddress: `${zone.name}, ${zone.city}, Djibouti`,
        deliveryLocationCity: zone.city,
        deliveryGateOrTerminal: zone.gate,
        deliveryContactPerson: `${pick(['Halima', 'Yusuf', 'Amina', 'Bashir'])} ${pick(['Hassan', 'Ali', 'Nour'])}`,
        deliveryContactPhone: `+253 77 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
        estimatedDistanceKm: zone.km,
        estimatedDurationHours: `${(zone.km / 28).toFixed(1)}`,
        cargoType: `Containerized (${sizeDef.capacity} ${goodsShort})`,
        shipmentCategory: sizeDef.category,
        containerNumber: containerNumber(pick(lineDef.prefixes)),
        shippingLine: lineDef.line,
        containerReturnDepot: depot,
        containerReturnDeadline: deadline,
        containerReturnFreeDays: freeDays,
        goodsDescription: goodsLong,
        totalWeightKg: int(8, 26) * 1000,
        dimensions: sizeDef.size === "20'" ? '6.06 x 2.44 x 2.59 m' : '12.19 x 2.44 x 2.59 m',
        requiredDocuments: ['Bill of Lading', 'Delivery Order', 'Proof of Delivery'],
        scheduledPickupTime: pickupAt,
        rateMinorUnits: transporterRate,
        rateCurrency: 'DJF',
        rateFxRate: 1,
        rateBaseAmountMinorUnits: transporterRate,
        clientRateMinorUnits: clientRate,
        clientRateCurrency: 'DJF',
        clientRateFxRate: 1,
        clientRateBaseAmountMinorUnits: clientRate,
        source: 'custom',
        createdAt,
        updatedAt: createdAt,
      } as any,
    });

    /* ---- bookings ---------------------------------------------------- */
    const bookingsOut: (typeof built)[number]['bookings'] = [];
    for (let c = 0; c < containers; c += 1) {
      const carrier = plan.split && c % 2 === 1 ? secondary : primary;
      const fleet = fleetOf(carrier.id);
      const driver = fleet.drivers.length ? pick(fleet.drivers) : pick(drivers);
      const vehicle = fleet.vehicles.length ? pick(fleet.vehicles) : pick(vehicles);

      /* The least advanced booking is what the shipment shows, so the FIRST
         container sits on the planned rung and the others may be ahead of it.
         That is the rollup made visible: a three-box job is not "En Route"
         because one truck left. */
      const base = LADDER.indexOf(plan.rung);
      const depth = c === 0 ? base : Math.min(LADDER.length - 1, base + int(0, 2));
      const rung = LADDER[depth] as Rung;

      const bookingId = randomUUID();
      const bookingRef = String(int(200000, 899999));
      const cn = containerNumber(pick(lineDef.prefixes));

      /* When the box came free. Only meaningful once it is actually off the
         truck — this is the rung the whole return side hangs off. */
      const emptyReadyAt = depth >= LADDER.indexOf('Empty Ready') ? new Date(pickupAt.getTime() + int(30, 54) * HOUR) : null;

      await prisma.booking.create({
        data: {
          id: bookingId,
          reference: bookingRef,
          shipmentId,
          status: rung,
          cargoType: `Containerized (${sizeDef.capacity} ${goodsShort})`,
          shipmentCategory: sizeDef.category,
          containerNumber: cn,
          shippingLine: lineDef.line,
          partnerId: carrier.id,
          vehicleId: vehicle?.id ?? null,
          driverId: driver?.id ?? null,
          containerReturnDepot: depot,
          containerReturnDeadline: deadline,
          containerReturnFreeDays: freeDays,
          scheduledPickupTime: pickupAt,
          completedAt: rung === 'Completed' ? new Date(pickupAt.getTime() + int(60, 96) * HOUR) : null,
          transporterCostMinorUnits: perMission,
          transporterCostCurrency: 'DJF',
          transporterCostFxRate: 1,
          transporterCostBaseAmountMinorUnits: perMission,
          emptyReadyAt,
          /* v19: how many boxes this load can absorb on the way back. Open
             loads carry real slots — that is what lets one outbound booking
             take two empties. */
          emptySlots: plan.lane === 'next' ? int(2, 3) : 1,
          emptyReturnDistanceKm: zone.km,
          createdAt,
          updatedAt: createdAt,
        },
      });

      bookingsOut.push({ id: bookingId, reference: bookingRef, rung, line: lineDef.line, size: sizeDef.size, deadline, emptyReadyAt, depot });
    }

    await prisma.shipment.update({
      where: { id: shipmentId },
      data: { bookingId: bookingsOut.map((b) => b.reference).join(', ') },
    });

    built.push({ shipmentId, reference: ref, plan, bookings: bookingsOut });
  }

  console.log(`   ${built.length} shipments · ${built.reduce((n, b) => n + b.bookings.length, 0)} bookings`);
  await buildTimelines(built, ops);
  await buildDebriefs(built, ops);
  await buildEmptyReturns(built, ops);
  await buildCrew(built, ops);
  await deriveStatuses();
  await refreshFleetDocuments();
  await summarise();
}

type Built = {
  shipmentId: string;
  reference: string;
  plan: Plan;
  bookings: { id: string; reference: string; rung: Rung; line: string; size: string; deadline: Date; emptyReadyAt: Date | null; depot: string }[];
};
type Staff = { id: string; firstName: string; lastName: string };

const nameOf = (u: Staff) => `${u.firstName} ${u.lastName}`;

/* ---------------------------------------------------------------------------
 * Timelines
 *
 * The old book stamped every rung of a booking with the same second, because
 * somebody had clicked down the ladder in one sitting. A timeline whose
 * fourteen steps all read 11:37:00 tells you nothing about the job, so each
 * rung is spaced by how long that step actually takes.
 * ------------------------------------------------------------------------- */

async function buildTimelines(built: Built[], ops: Staff[]): Promise<void> {
  console.log('▸ Timelines');
  let steps = 0;

  for (const item of built) {
    const shipment = await prisma.shipment.findUnique({ where: { id: item.shipmentId } });
    if (!shipment) continue;

    const port = shipment.pickupLocationName ?? 'Port';
    const zone = shipment.deliveryLocationName ?? 'Free Zone';
    const placeOf = (where: string): string =>
      where === 'port' ? port : where === 'zone' ? zone : where === 'depot' ? shipment.containerReturnDepot ?? 'Depot' : where === 'road' ? 'RN1 corridor' : 'Fleetin Operations';

    for (const booking of item.bookings) {
      const reached = LADDER.slice(0, LADDER.indexOf(booking.rung) + 1);
      let cursor = new Date(shipment.createdAt.getTime());
      const rows: any[] = [];

      for (const rung of reached) {
        const meta = STEP_META[rung];
        cursor = rung === 'Pending' ? cursor : new Date(cursor.getTime() + (STEP_GAP_HOURS[rung] ?? 2) * HOUR);
        const actor = ops.length ? nameOf(pick(ops)) : null;
        rows.push({
          id: randomUUID(),
          bookingId: booking.id,
          key: rung === 'Pending' ? 'creation' : timelineKeyForStatus(rung),
          title: meta.title,
          description:
            rung === 'Pending'
              ? `Booking ${booking.reference} raised for container ${shipment.containerNumber ?? ''}.`
              : `${meta.title} — recorded against booking ${booking.reference}.`,
          timestamp: cursor,
          status: 'completed',
          actor,
          location: placeOf(meta.where),
          createdAt: cursor,
        });
      }

      /* The next rung, shown as what the board is waiting for. A finished job
         has nothing pending, which is the point of the distinction. */
      const nextIndex = LADDER.indexOf(booking.rung) + 1;
      if (nextIndex < LADDER.length) {
        const rung = LADDER[nextIndex] as Rung;
        rows.push({
          id: randomUUID(),
          bookingId: booking.id,
          key: timelineKeyForStatus(rung),
          title: STEP_META[rung].title,
          description: 'Awaiting this step.',
          timestamp: null,
          status: 'current',
          actor: null,
          location: placeOf(STEP_META[rung].where),
          createdAt: cursor,
        });
      }

      await prisma.bookingTimelineStep.createMany({ data: rows });
      steps += rows.length;
    }

    /* The shipment's own timeline mirrors the job, not any one container. */
    const shallowest = item.bookings.reduce((lo, b) => (LADDER.indexOf(b.rung) < LADDER.indexOf(lo.rung) ? b : lo), item.bookings[0]);
    if (shallowest) {
      const reached = LADDER.slice(0, LADDER.indexOf(shallowest.rung) + 1);
      let cursor = new Date(shipment.createdAt.getTime());
      const rows: any[] = [];
      for (const rung of reached) {
        const meta = STEP_META[rung];
        cursor = rung === 'Pending' ? cursor : new Date(cursor.getTime() + (STEP_GAP_HOURS[rung] ?? 2) * HOUR);
        rows.push({
          id: randomUUID(),
          shipmentId: item.shipmentId,
          key: rung === 'Pending' ? 'creation' : timelineKeyForStatus(rung),
          title: meta.title,
          description: `${meta.title} — ${item.bookings.length} container${item.bookings.length > 1 ? 's' : ''} on shipment ${item.reference}.`,
          timestamp: cursor,
          status: 'completed',
          actor: ops.length ? nameOf(pick(ops)) : null,
          location: placeOf(meta.where),
          createdAt: cursor,
        });
      }
      await prisma.shipmentTimelineStep.createMany({ data: rows });
      steps += rows.length;
    }
  }
  console.log(`   ${steps} timeline steps`);
}

/* ---------------------------------------------------------------------------
 * The debrief
 *
 * Two halves, two different people, two different moments: the driver is rated
 * when the truck arrives, the shipper when the job closes. Neither is computed
 * — every value here stands for something a human typed, which is the whole
 * premise of the rating system.
 * ------------------------------------------------------------------------- */

async function buildDebriefs(built: Built[], ops: Staff[]): Promise<void> {
  console.log('▸ Debriefs (driver notation + shipper half)');
  let driverCount = 0;
  let shipperCount = 0;

  const axes = (centre: number): [number, number, number] => [
    Math.max(1, Math.min(5, centre + int(-1, 1))),
    Math.max(1, Math.min(5, centre + int(-1, 1))),
    Math.max(1, Math.min(5, centre + int(-1, 1))),
  ];

  for (const item of built) {
    for (const booking of item.bookings) {
      const depth = LADDER.indexOf(booking.rung);
      if (depth < LADDER.indexOf('Arrived')) continue;

      const row = await prisma.booking.findUnique({ where: { id: booking.id }, select: { scheduledPickupTime: true, completedAt: true } });
      const arrivedAt = new Date((row?.scheduledPickupTime ?? TODAY).getTime() + int(6, 14) * HOUR);

      /* Skew good — most runs on this corridor are unremarkable, and a board
         where every driver is a three makes the score meaningless. */
      const good = rand() < 0.72;
      const centre = good ? int(4, 5) : int(2, 3);
      const [rel, pun, pro] = axes(centre);
      const author = ops.length ? pick(ops) : null;

      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          driverRating: centre,
          driverRatingReliability: rel,
          driverRatingPunctuality: pun,
          driverRatingProfessionalism: pro,
          driverNote: pick(good ? DRIVER_NOTES_GOOD : DRIVER_NOTES_MIXED),
          driverRatedById: author?.id ?? null,
          driverRatedByName: author ? nameOf(author) : null,
          driverRatedAt: arrivedAt,
        },
      });
      driverCount += 1;

      /* The shipper half only exists once the job is closed — it is asked at
         Completed, not at the door. */
      if (booking.rung !== 'Completed') continue;
      const sGood = rand() < 0.68;
      const sCentre = sGood ? int(4, 5) : int(2, 3);
      const [srel, spun, spro] = axes(sCentre);
      const sAuthor = ops.length ? pick(ops) : null;
      await prisma.booking.update({
        where: { id: booking.id },
        data: {
          shipperRating: sCentre,
          shipperRatingReliability: srel,
          shipperRatingPunctuality: spun,
          shipperRatingProfessionalism: spro,
          shipperNote: pick(sGood ? SHIPPER_NOTES_GOOD : SHIPPER_NOTES_MIXED),
          shipperRatedById: sAuthor?.id ?? null,
          shipperRatedByName: sAuthor ? nameOf(sAuthor) : null,
          shipperRatedAt: row?.completedAt ?? arrivedAt,
        },
      });
      shipperCount += 1;
    }
  }
  console.log(`   ${driverCount} driver notations · ${shipperCount} shipper debriefs`);
}

/* ---------------------------------------------------------------------------
 * Empty Container
 *
 * The part that was actually broken. Three things have to be true at once for
 * this module to show anything:
 *
 *   - there are boxes free (bookings at `Empty Ready` and beyond, with
 *     `emptyReadyAt` stamped);
 *   - there are OPEN LOADS to pair them with (bookings at `Pending`, which the
 *     service reads as its load side, and which this database had none of);
 *   - the boxes' deadlines are still ahead of now, or the engine's window rule
 *     refuses every pair regardless of line and size.
 *
 * A cycle is deliberately left unpaired for most free boxes: an empty with a
 * cycle already pointing at a load is out of the pool, and a pool of nothing
 * is exactly the symptom being fixed.
 * ------------------------------------------------------------------------- */

async function buildEmptyReturns(built: Built[], ops: Staff[]): Promise<void> {
  console.log('▸ Empty Container — cycles, chains, and a live matching pool');

  const openLoads = built
    .filter((b) => b.plan.lane === 'next')
    .flatMap((b) => b.bookings.map((bk) => ({ ...bk, shipmentRef: b.reference })));

  const freeBoxes = built
    .flatMap((b) => b.bookings.map((bk) => ({ ...bk, plan: b.plan, shipmentRef: b.reference })))
    .filter((bk) => LADDER.indexOf(bk.rung) >= LADDER.indexOf('Empty Ready'));

  let cycleSeq = 1;
  let chainSeq = 1;
  const cycleRef = () => `CYC-${String(cycleSeq++).padStart(5, '0')}`;
  const chainRef = () => `CHN-${String(chainSeq++).padStart(5, '0')}`;

  let pooled = 0;
  let paired = 0;
  let planned = 0;
  let closed = 0;

  /* Two live pairings, so `paired` is not a stage the demo only describes.
     These consume a slot on their load, which the engine subtracts. */
  const pairable = freeBoxes.filter((b) => b.rung === 'Empty Ready');
  /* Pair a couple so `paired` is a stage the demo shows rather than describes,
     but never enough to drain the pool — a paired box is out of Matching. */
  const toPair = pairable.slice(0, Math.min(2, Math.max(0, pairable.length - 8)));

  for (const box of freeBoxes) {
    const depth = LADDER.indexOf(box.rung);
    const readyAt = box.emptyReadyAt ?? new Date(TODAY.getTime() - DAY);
    const isPaired = toPair.some((p) => p.id === box.id);

    /* A load of the same line AND the same size — both are hard gates, and a
       pairing that violates either would be a row the UI then refuses to
       explain. */
    const load = isPaired ? openLoads.find((l) => l.line === box.line && l.size === box.size) ?? openLoads[0] : null;

    let stage: string;
    let status: string;
    let outcome: string | null = null;
    let returnedAt: Date | null = null;
    let dispatchedAt: Date | null = null;
    let detentionFee: number | null = null;

    if (box.rung === 'Completed') {
      stage = 'closed';
      status = 'completed';
      returnedAt = new Date(readyAt.getTime() + int(8, 30) * HOUR);
      const late = returnedAt > box.deadline;
      outcome = late ? 'returned_late' : 'returned';
      if (late) detentionFee = int(1, 4) * 12000;
      dispatchedAt = new Date(readyAt.getTime() + int(3, 10) * HOUR);
      closed += 1;
    } else if (box.rung === 'Empty Picked Up') {
      stage = 'return_planned';
      status = 'in_progress';
      dispatchedAt = new Date(readyAt.getTime() + int(2, 8) * HOUR);
      planned += 1;
    } else if (isPaired && load) {
      stage = 'paired';
      status = 'preparing';
      paired += 1;
    } else {
      /* IN THE POOL — and therefore deliberately given NO cycle row.
       *
       * `findAvailableEmpties` filters on `asEmpty: null`: a booking that
       * already has a cycle has been dealt with, so it is not offered for
       * matching. Writing a `stage: 'empty'` cycle here to represent "this box
       * is waiting" would do the exact opposite of what it reads like — it
       * would take the box out of the pool. The waiting state is the absence
       * of a cycle, not a cycle that says waiting. */
      pooled += 1;
      continue;
    }

    const author = ops.length ? pick(ops) : null;
    await prisma.emptyReturnCycle.create({
      data: {
        id: randomUUID(),
        reference: cycleRef(),
        bookingId: box.id,
        nextBookingId: load?.id ?? null,
        status,
        stage,
        outcome,
        matchedAt: load ? new Date(readyAt.getTime() + 2 * HOUR) : null,
        matchedBy: load && author ? nameOf(author) : null,
        matchSource: load ? pick(['Suggestion — Recommended', 'Manual — Matching', 'Contextual']) : null,
        dispatchedAt,
        emptyReadyAt: readyAt,
        returnedAt,
        detentionFee,
        createdAt: readyAt,
      },
    });

    if (stage === 'return_planned') {
      await prisma.booking.update({
        where: { id: box.id },
        data: { emptyReturnPlannedAt: new Date(readyAt.getTime() + int(12, 36) * HOUR) },
      });
    }
  }

  /* Chains.
   *
   * A chain is a box that kept working: it came back, went straight out under
   * the next load, and so on. It is never "completed" — it is running, or it
   * is broken, and it breaks the moment an empty comes home with no next load
   * to ride out under. One of each is built here so the Chains pyramid has
   * both states to draw. */
  /* Ordered by when the box came free, and carrying each booking's own pickup
     time, because a chain has to run FORWARDS: the load a box rides out under
     cannot have been collected before the box was empty. Linking on reference
     order alone produced exactly that — link 2 collected two days before link
     1 came free, which is visible nonsense on the pyramid. */
  const closedCycles = await prisma.emptyReturnCycle.findMany({
    where: { stage: 'closed' },
    orderBy: { emptyReadyAt: 'asc' },
    include: { booking: { select: { scheduledPickupTime: true } } },
  });

  /* Greedy forward walk: each link's load must have been collected after the
     previous box came free. Anything that cannot extend a chain honestly is
     simply left out of one. */
  const usable = closedCycles.filter((c) => c.emptyReadyAt && c.booking?.scheduledPickupTime);
  const chainRuns: (typeof usable)[] = [];
  const spent = new Set<string>();
  for (const seed of usable) {
    if (spent.has(seed.id) || chainRuns.length >= 3) continue;
    const run = [seed];
    spent.add(seed.id);
    while (run.length < 3) {
      const tail = run[run.length - 1];
      const next = usable.find(
        (c) => !spent.has(c.id) && c.booking!.scheduledPickupTime! > tail.emptyReadyAt!,
      );
      if (!next) break;
      run.push(next);
      spent.add(next.id);
    }
    if (run.length >= 2) chainRuns.push(run);
  }

  const groups = [
    { cycles: chainRuns[0] ?? [], running: true },
    { cycles: chainRuns[1] ?? [], running: true },
    /* The broken one. */
    { cycles: chainRuns[2] ?? [], running: false },
  ];
  /* Loads for the tail of a running chain to ride out under. Taken from
     history rather than the open loads: pointing a closed cycle at a Pending
     booking would silently consume one of its slots and shrink the pool. */
  const spare = usable.filter((c) => !spent.has(c.id));

  for (const { cycles: group, running } of groups) {
    if (group.length < 2) continue;
    const chain = await prisma.emptyReturnChain.create({ data: { id: randomUUID(), reference: chainRef(), createdAt: group[0].emptyReadyAt ?? TODAY } });

    for (let i = 0; i < group.length; i += 1) {
      /* Link i to i+1. The box came back and went straight out again under the
         next full load, and THAT link is what a chain is. Without it the rows
         are just a list of returns that happen to share a reference, and every
         figure the chain exists to report — pairings, returns avoided, empty
         hours, detention avoided — is honestly zero.
         The last cycle of a running chain rides out under one more load; the
         last cycle of a broken one does not, which is the break. */
      const next = group[i + 1];
      const tailLoad = running
        ? spare.find((c) => c.booking!.scheduledPickupTime! > group[i].emptyReadyAt!)
        : undefined;
      const ridesOutUnder = next ? next.bookingId : tailLoad?.bookingId ?? null;
      const author = ops.length ? pick(ops) : null;
      await prisma.emptyReturnCycle.update({
        where: { id: group[i].id },
        data: {
          chainId: chain.id,
          seq: i + 1,
          nextBookingId: ridesOutUnder,
          matchedAt: ridesOutUnder ? new Date((group[i].emptyReadyAt ?? TODAY).getTime() + 2 * HOUR) : null,
          matchedBy: ridesOutUnder && author ? nameOf(author) : null,
          matchSource: ridesOutUnder ? pick(['Suggestion — Recommended', 'Manual — Matching', 'Contextual']) : null,
          outcome: 'returned',
        },
      });
    }
  }

  console.log(`   ${pooled} in the matching pool · ${paired} paired · ${planned} return planned · ${closed} closed · ${chainSeq - 1} chains`);
}

/* ---------------------------------------------------------------------------
 * Crew, derivation, fleet paperwork
 * ------------------------------------------------------------------------- */

async function buildCrew(built: Built[], ops: Staff[]): Promise<void> {
  console.log('▸ Shipment crew');
  if (!ops.length) return;
  let rows = 0;
  for (const item of built) {
    const size = int(1, Math.min(3, ops.length));
    const shuffled = [...ops].sort(() => rand() - 0.5).slice(0, size);
    for (let i = 0; i < shuffled.length; i += 1) {
      await prisma.shipmentAssignee.create({
        data: {
          id: randomUUID(),
          shipmentId: item.shipmentId,
          userId: shuffled[i].id,
          isLead: i === 0,
          assignedAt: TODAY,
          assignedById: shuffled[0].id,
        },
      });
      rows += 1;
    }
  }
  console.log(`   ${rows} crew assignments`);
}

/**
 * A shipment is a job and its bookings are the real container runs, so the job
 * shows the least advanced one. Nothing here writes a status by hand.
 */
async function deriveStatuses(): Promise<void> {
  console.log('▸ Deriving shipment status from bookings');
  const shipments = await prisma.shipment.findMany({ select: { id: true }, where: { deletedAt: null } });
  let moved = 0;
  for (const s of shipments) {
    const bookings = await prisma.booking.findMany({ where: { shipmentId: s.id, deletedAt: null }, select: { status: true, completedAt: true } });
    const derived = deriveShipmentStatus(bookings.map((b) => b.status));
    if (!derived) continue;
    const completedAt = derived === 'Completed'
      ? bookings.map((b) => b.completedAt).filter(Boolean).sort((a, b) => b!.getTime() - a!.getTime())[0] ?? null
      : null;
    await prisma.shipment.update({ where: { id: s.id }, data: { status: derived, completedAt } });
    moved += 1;
  }
  console.log(`   ${moved} shipments derived`);
}

/**
 * Paperwork that is about to lapse, because a fleet page whose every document
 * is green never shows the warning it exists to show. One already expired, a
 * handful inside thirty days, the rest left alone.
 */
async function refreshFleetDocuments(): Promise<void> {
  console.log('▸ Fleet paperwork (expiring + one expired)');
  const vehicles = await prisma.vehicle.findMany({ where: { deletedAt: null }, take: 8, orderBy: { reference: 'asc' } });
  const drivers = await prisma.driver.findMany({ where: { deletedAt: null }, take: 8, orderBy: { reference: 'asc' } });

  for (let i = 0; i < vehicles.length; i += 1) {
    const days = i === 0 ? -12 : i < 4 ? int(6, 28) : int(120, 400);
    await prisma.vehicle.update({
      where: { id: vehicles[i].id },
      data: { insuranceExpiry: at(days), registrationExpiry: at(days + int(30, 90)) },
    });
  }
  for (let i = 0; i < drivers.length; i += 1) {
    const days = i === 0 ? -5 : i < 4 ? int(8, 27) : int(150, 500);
    await prisma.driver.update({
      where: { id: drivers[i].id },
      data: { licenseExpiry: at(days), nationalIdExpiry: at(days + int(60, 200)) },
    });
  }
  console.log(`   ${vehicles.length} vehicles · ${drivers.length} drivers re-dated`);
}

async function summarise(): Promise<void> {
  const [shipments, bookings, cycles, chains, pool, notated, debriefed] = await Promise.all([
    prisma.shipment.count({ where: { deletedAt: null } }),
    prisma.booking.count({ where: { deletedAt: null } }),
    prisma.emptyReturnCycle.count(),
    prisma.emptyReturnChain.count(),
    /* The pool is the ABSENCE of a cycle — see the note in buildEmptyReturns.
       Counting `stage: 'empty'` rows here reported zero while the pool was
       healthy, which is exactly the wrong way round. */
    prisma.booking.count({
      where: { deletedAt: null, containerNumber: { not: null }, emptyReadyAt: { not: null }, status: { in: [...DELIVERED] }, asEmpty: null },
    }),
    prisma.booking.count({ where: { driverRating: { not: null } } }),
    prisma.booking.count({ where: { shipperRating: { not: null } } }),
  ]);
  const openLoads = await prisma.booking.count({ where: { status: 'Pending', deletedAt: null } });
  const overdue = await prisma.booking.count({
    where: { containerReturnDeadline: { lt: new Date() }, status: { notIn: ['Completed', 'Cancelled', 'Failed'] }, deletedAt: null },
  });

  console.log('\n──────────────── demo book ────────────────');
  console.log(`  shipments            ${shipments}`);
  console.log(`  bookings             ${bookings}`);
  console.log(`  open loads (Pending) ${openLoads}   <- the matching engine's load side`);
  console.log(`  cycles               ${cycles}  (${pool} in the pool)`);
  console.log(`  chains               ${chains}`);
  console.log(`  driver notations     ${notated}`);
  console.log(`  shipper debriefs     ${debriefed}`);
  console.log(`  overdue containers   ${overdue}`);
  console.log('───────────────────────────────────────────\n');
}

main()
  .catch((e) => {
    console.error('\n✖ seed-demo-operations failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
