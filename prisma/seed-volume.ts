/**
 * Volume seed — three months of real operations, written through the real services.
 *
 * `prisma/seed.ts` seeds the baseline: roles, the admin, and the handful of
 * fixed records the frontend mocks were built around. It is a fixture, not a
 * dataset — seventeen shipments is not enough to tell whether the dashboards,
 * the BI tabs, the finance queues or the empty-return chains actually work.
 *
 * This file is the dataset — roughly 180 shipments across the last three
 * months, each carrying between one and twenty containers, every one of them a
 * real `Booking` with its own number and its own timeline. Two rules shape it:
 *
 *  1. **Nothing is written straight into a table that a service owns.** Every
 *     shipment goes through `ShipmentsService.create` (so it is priced off the
 *     partner's real grid, with the real commission split), every status hop
 *     through `updateStatus` (so it obeys the real ladder and leaves a real
 *     timeline), every payout through `PaymentOrdersService.payTransporter`
 *     (so real money leaves a real bank account and lands in the ledger).
 *     Seeding this way is itself a test: if a service refuses, the seed fails
 *     here rather than producing rows the application could never have made.
 *
 *  2. **Time is applied afterwards.** The services stamp `new Date()`, which
 *     would pile three months of history onto today. Once a shipment is fully
 *     played out, `backdate()` rewrites its timestamps — and its timeline's,
 *     its bookings', its payout's, its ledger entries' — to the month it
 *     belongs in, with raw SQL, because `@default(now())`/`@updatedAt` columns
 *     are not writable through the client.
 *
 * Additive and guarded: it refuses to run twice (see SENTINEL), and it never
 * touches the baseline seed's own records.
 *
 *     pnpm prisma:seed:volume
 */
import { NestFactory } from '@nestjs/core';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/modules/prisma/prisma.service';
import { ShipmentsService } from '../src/modules/shipments/shipments.service';
import { BookingsService } from '../src/modules/bookings/bookings.service';
import { EmptyReturnsService } from '../src/modules/empty-returns/empty-returns.service';
import { InvoicesService } from '../src/modules/invoices/invoices.service';
import { PaymentOrdersService } from '../src/modules/payment-orders/payment-orders.service';
import { HoldsService } from '../src/modules/holds/holds.service';
import { ProjectsService } from '../src/modules/projects/projects.service';
import { BankAccountsService } from '../src/modules/funding/bank-accounts.service';
import { CreditFacilitiesService } from '../src/modules/funding/credit-facilities.service';
import { DrawdownsService } from '../src/modules/funding/drawdowns.service';
import { LedgerService } from '../src/modules/ledger/ledger.service';
import { StorageService } from '../src/modules/storage/storage.service';
import { nextReferenceField } from '../src/common/helpers/reference.util';
import { syncShipmentFromBookings } from '../src/modules/shipments/shipment-sync';
import { cycleStatusForBookingStatus } from '../src/modules/empty-returns/empty-return-status.util';
import { assertSeedTargetIsSafe } from './seed-target-guard';
import { CarbonImpactService } from '../src/modules/emissions/carbon-impact.service';
import { seedGarages } from './seed-garages';

/** The first shipper this file creates. Its presence means the volume seed already ran. */
const SENTINEL_SHIPPER_REFERENCE = 'SHP-101';

/** Fleetin's house commission, percent of the shipper-facing total. */
const COMMISSION_PCT = 8;

/**
 * What one mission costs, in DJF — the whole price list, top and bottom.
 *
 * Every transporter's grid is drawn from this band and every booking resolves
 * its price off that grid, so these two numbers are the only place the money
 * in this dataset is decided. A booking outside 45–49k means something else
 * priced it, which is a bug rather than a variation.
 */
const PRICE_BAND_MIN = 45_000;
const PRICE_BAND_MAX = 49_000;

/**
 * How long a whole mission is allowed to take — created to container back
 * at the quay.
 *
 * This corridor is a short one: a box comes off a Djibouti quay, runs to a
 * free zone, is stripped, and goes back. Three to seven days is what that
 * really takes, and ten is the outside edge for a job that dragged. Missions
 * are budgeted against these numbers rather than falling out of a chain of
 * independent random legs, because unbounded legs compound — a slow gate,
 * a slow consignee and a slow return leg stacked up produced twenty-day
 * missions, and a book full of those describes an operation nobody runs.
 */
const MISSION_DAYS_MIN = 3;
const MISSION_DAYS_MAX = 7;
const MISSION_DAYS_CEILING = 10;

/**
 * The furthest past its free time a container may still be sitting in the
 * pool. Beyond this it is closed out — see the fate rule in the month loop.
 */
const MAX_OVERDUE_DAYS = 5;

/**
 * Shipments created per month, oldest month first — a book that grows, with
 * the current month partial because it is still running.
 *
 * Three months, ~180 shipments. The current month yields fewer than its
 * number: anything scheduled past today is skipped, because a board full of
 * work booked for next week is fiction, not a live picture.
 */
const SHIPMENTS_PER_MONTH = [62, 66, 58];

/**
 * How many containers one shipment carries — and therefore how many bookings.
 *
 * Weighted, not uniform. A yard's book is mostly small jobs with a long tail of
 * big ones, and a flat `int(1, 20)` would make the average job ten containers,
 * which no corridor actually runs. The tail matters though: a twenty-container
 * shipment is the case that proves the booking list, the per-transporter
 * payment split and the empty-return chain all hold up at scale.
 */
function containerLoad(): number {
  const roll = rnd();
  if (roll < 0.42) return int(1, 3);
  if (roll < 0.74) return int(4, 7);
  if (roll < 0.92) return int(8, 13);
  return int(14, 20);
}

/* ── Determinism ─────────────────────────────────────────────────────────── */

/**
 * A fixed-seed LCG rather than `Math.random()`: two runs against two fresh
 * databases produce the same dataset, so a bug reproduced on one machine is
 * reproducible on another.
 */
let rngState = 20260815;
function rnd(): number {
  rngState = (rngState * 1664525 + 1013904223) >>> 0;
  return rngState / 2 ** 32;
}
function int(min: number, max: number): number {
  return min + Math.floor(rnd() * (max - min + 1));
}
function pick<T>(items: readonly T[]): T {
  return items[int(0, items.length - 1)]!;
}
/** True with probability `p`. */
function chance(p: number): boolean {
  return rnd() < p;
}

/* ── Time ────────────────────────────────────────────────────────────────── */

const NOW = new Date();
const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

/** The calendar months the dataset covers, oldest first — one per `SHIPMENTS_PER_MONTH` entry. */
const MONTHS = Array.from({ length: SHIPMENTS_PER_MONTH.length }, (_, i) => {
  const offset = SHIPMENTS_PER_MONTH.length - 1 - i;
  const start = new Date(Date.UTC(NOW.getUTCFullYear(), NOW.getUTCMonth() - offset, 1));
  const end = new Date(Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1));
  return { start, end, year: start.getUTCFullYear(), month: start.getUTCMonth() + 1, isCurrent: offset === 0 };
});

const WINDOW_START = MONTHS[0]!.start;

function addHours(date: Date, hours: number): Date {
  return new Date(date.getTime() + hours * HOUR);
}
function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * DAY);
}
/** MySQL DATETIME literal in UTC — the timezone Prisma stores every column in. */
function sqlDate(date: Date): string {
  return date.toISOString().slice(0, 19).replace('T', ' ');
}

/* ── Catalog ─────────────────────────────────────────────────────────────── */

/**
 * The eight shippers Fleetin actually works for. Every one of them is a
 * Djibouti account: the corridor this system runs is the quay-to-free-zone
 * leg inside Djibouti city, so there is no foreign consignee to model and no
 * import/export paperwork behind any of these jobs.
 */
const SHIPPER_SEEDS = [
  { reference: 'SHP-101', name: 'CMA CGM', industry: 'Shipping & Logistics', size: 'Enterprise (1000+)', address: 'Djibouti Free Zone (DFZ), Port Corridor, Djibouti City', contact: { name: 'Nasra Ahmed Guelleh', title: 'Head of Logistics', email: 'nasra.guelleh@cma-cgm.dj', phone: '+253 77 41 22 08' } },
  { reference: 'SHP-102', name: 'Promising LTD', industry: 'Import & Distribution', size: 'Medium (51-250)', address: 'UKAB Free Zone, Warehouse 12, Djibouti City', contact: { name: 'Ismail Hassan Wais', title: 'Managing Director', email: 'ismail@promising.dj', phone: '+253 77 28 55 71' } },
  { reference: 'SHP-103', name: 'Greentech SARL', industry: 'Agro Commodities', size: 'Small (11-50)', address: "Jaban'as Free Zone, Block B, Djibouti City", contact: { name: 'Fatouma Omar Ali', title: 'Operations Coordinator', email: 'fatouma@greentech.dj', phone: '+253 77 19 06 42' } },
  { reference: 'SHP-104', name: 'LS FZCO', industry: 'General Trading', size: 'Medium (51-250)', address: 'Djibouti International Free Trade Zone (DIFTZ), Damerjog, Djibouti', contact: { name: 'Abdirahman Farah', title: 'Supply Chain Lead', email: 'a.farah@lsfzco.dj', phone: '+253 77 63 90 14' } },
  { reference: 'SHP-105', name: 'GL FZCO', industry: 'Food & Beverage', size: 'Medium (51-250)', address: 'Djibouti International Free Trade Zone (DIFTZ), Damerjog, Djibouti', contact: { name: 'Hodan Warsame Egueh', title: 'Import Manager', email: 'hodan@glfzco.dj', phone: '+253 77 62 08 44' } },
  { reference: 'SHP-106', name: 'Amina FZCO', industry: 'Consumer Goods', size: 'Small (11-50)', address: 'UKAB Free Zone, Unit 27, Djibouti City', contact: { name: 'Amina Mohamed Robleh', title: 'Owner', email: 'amina@aminafzco.dj', phone: '+253 77 84 33 90' } },
  { reference: 'SHP-107', name: 'Diamond Shipping Services', industry: 'Freight Forwarding', size: 'Medium (51-250)', address: 'Djibouti Free Zone (DFZ), Port Corridor, Djibouti City', contact: { name: 'Moustapha Ibrahim Waberi', title: 'Country Manager', email: 'm.ibrahim@diamondshipping.dj', phone: '+253 77 55 71 30' } },
  { reference: 'SHP-108', name: 'Saba Shipping', industry: 'Freight Forwarding', size: 'Small (11-50)', address: "Jaban'as Free Zone, Block D, Djibouti City", contact: { name: 'Saida Abdillahi Kamil', title: 'Operations Manager', email: 'saida@sabashipping.dj', phone: '+253 77 44 91 03' } },
] as const;

/**
 * The ten transporters on the book. All Djibouti hauliers — the work is the
 * short quay-to-free-zone run, so a fleet based anywhere else could not do it.
 *
 * `plate` is the two-letter stem their plates are minted from, kept distinct
 * per company so a plate read off a booking card identifies its owner.
 */
const PARTNER_SEEDS = [
  { reference: 'PTR-101', name: 'GEMINI', address: "Route de l'Aéroport, PK12, Djibouti City", fleet: 34, plate: 'GM', contact: { name: 'Omar Djama Robleh', title: 'Fleet Dispatcher', email: 'dispatch@gemini.dj', phone: '+253 77 55 11 20' } },
  { reference: 'PTR-102', name: 'Massida Logistics', address: 'Zone Industrielle de Boulaos, Djibouti City', fleet: 26, plate: 'MS', contact: { name: 'Houssein Mohamed Said', title: 'Operations Manager', email: 'ops@massida.dj', phone: '+253 77 30 77 65' } },
  { reference: 'PTR-103', name: 'Transit Marill', address: 'Boulevard de la République, Djibouti City', fleet: 22, plate: 'TM', contact: { name: 'Ali Mohamed Kamil', title: 'Transit Manager', email: 'ali@transitmarill.dj', phone: '+253 77 71 26 87' } },
  { reference: 'PTR-104', name: 'MTI Logistics', address: 'Doraleh Corridor, Djibouti City', fleet: 28, plate: 'MT', contact: { name: 'Mariam Elmi Jama', title: 'Fleet Supervisor', email: 'mariam@mti-logistics.dj', phone: '+253 77 90 15 38' } },
  { reference: 'PTR-105', name: 'Freight Secure Logistics & Services', address: 'Balbala, Quartier 6, Djibouti City', fleet: 19, plate: 'FS', contact: { name: 'Youssouf Abdi Farah', title: 'Dispatch Lead', email: 'youssouf@freightsecure.dj', phone: '+253 77 07 62 19' } },
  { reference: 'PTR-106', name: 'J.J. Kothari Logistics', address: 'Rue de Marseille, Plateau du Serpent, Djibouti City', fleet: 24, plate: 'JK', contact: { name: 'Ahmed Warsame Nour', title: 'Operations', email: 'ahmed@jjkothari.dj', phone: '+253 77 22 84 16' } },
  { reference: 'PTR-107', name: 'East West Transport', address: 'Nagad, Route de Loyada, Djibouti City', fleet: 17, plate: 'EW', contact: { name: 'Djibril Ahmed Egueh', title: 'Fleet Manager', email: 'djibril@eastwest.dj', phone: '+253 77 36 40 92' } },
  { reference: 'PTR-108', name: 'Trans Nomadia', address: 'Quartier 7, Avenue Nasser, Djibouti City', fleet: 15, plate: 'TN', contact: { name: 'Hassan Moussa Idriss', title: 'Dispatcher', email: 'hassan@transnomadia.dj', phone: '+253 77 48 03 77' } },
  { reference: 'PTR-109', name: 'Move One Djibouti', address: 'Héron, Plateau du Serpent, Djibouti City', fleet: 21, plate: 'MO', contact: { name: 'Ali Robleh Waberi', title: 'Country Operations', email: 'ali.robleh@moveone.dj', phone: '+253 77 61 29 05' } },
  { reference: 'PTR-110', name: 'Dita Transit', address: 'Ambouli, Djibouti City', fleet: 13, plate: 'DT', contact: { name: 'Mahamoud Ahmed Aden', title: 'Owner', email: 'mahamoud@ditatransit.dj', phone: '+253 77 15 88 43' } },
] as const;

const DRIVER_NAMES = [
  'Abdourahman Guedi Hassan', 'Mohamed Ali Djama', 'Ibrahim Osman Farah', 'Said Houmed Barkat',
  'Ahmed Warsame Nour', 'Omar Ismail Adan', 'Abdi Nour Hersi', 'Mahamoud Ahmed Aden',
  'Ali Robleh Waberi', 'Hassan Moussa Idriss', 'Djibril Ahmed Egueh', 'Kamil Abdallah Guedi',
  'Youssouf Hared Ismail', 'Moussa Aden Bouh', 'Idriss Farah Wais', 'Bourhan Ali Dini',
  'Nour Houssein Abdi', 'Waiss Mohamed Kamil', 'Guelleh Osman Aden', 'Hamoud Ibrahim Robleh',
] as const;

const TRUCK_TYPES = ['40ft Container', '20ft Container', 'Flatbed', 'Tanker'] as const;

/* ── The corridor: a port, a free zone, and the road between them ────────── */

/**
 * Every job Fleetin runs is one leg — a box or a load off a quay, delivered
 * into a Djibouti free zone. There is no import, no export and no upcountry
 * corridor in this dataset, so a lane is never anything but a
 * `PORTS × FREE_ZONES` pair, drawn below rather than listed by hand.
 *
 * `handles` is what actually comes off each quay, and it is what keeps the
 * dataset honest: an oil terminal does not discharge containers, so it never
 * gets a containerized job and therefore never gets an empty return. Pairing
 * cargo to the berth that could really have landed it is the difference
 * between a demo and a fiction.
 */
type CargoKind = 'container' | 'bulk' | 'liquid';

interface PortSeed {
  key: string;
  name: string;
  address: string;
  gates: string[];
  handles: CargoKind[];
  /** How much of the book comes off this quay — SGTD moves most of the boxes. */
  weight: number;
}

interface ZoneSeed {
  key: string;
  name: string;
  address: string;
  gates: string[];
}

const PORTS: PortSeed[] = [
  { key: 'PORT_DJIBOUTI', name: 'Port of Djibouti', address: 'Boulevard de la République', gates: ['Gate 1', 'Gate 2', 'Gate 5'], handles: ['container', 'bulk'], weight: 5 },
  { key: 'SGTD', name: 'Doraleh Container Terminal (SGTD)', address: 'Doraleh', gates: ['Gate 2', 'Gate 3', 'Gate 4'], handles: ['container'], weight: 8 },
  { key: 'DMP', name: 'Doraleh Multipurpose Port (DMP)', address: 'Doraleh', gates: ['Gate 1', 'Berth 7'], handles: ['container', 'bulk'], weight: 5 },
  { key: 'SJTP', name: 'Doraleh Oil Terminal / SJTP', address: 'Doraleh', gates: ['Terminal Gate', 'Loading Bay 3'], handles: ['liquid'], weight: 2 },
  { key: 'TADJOURAH', name: 'Port of Tadjourah', address: 'Tadjourah', gates: ['Main Gate'], handles: ['bulk'], weight: 2 },
  { key: 'DAMERJOG', name: 'Damerjog / DDID port infrastructure', address: 'Damerjog', gates: ['DDID Gate A', 'DDID Gate B'], handles: ['bulk', 'container'], weight: 2 },
  { key: 'DLBP', name: 'Damerjog Liquid Bulk Port (DLBP)', address: 'Damerjog', gates: ['Liquid Berth 1'], handles: ['liquid'], weight: 1 },
];

const FREE_ZONES: ZoneSeed[] = [
  { key: 'UKAB', name: 'UKAB Free Zone', address: 'PK12, Route de Balbala', gates: ['Gate 1', 'Gate 2'] },
  { key: 'JABANAS', name: "Jaban'as Free Zone", address: "Jaban'as", gates: ['Gate A', 'Gate B'] },
  { key: 'DIFTZ', name: 'Djibouti International Free Trade Zone (DIFTZ)', address: 'Damerjog', gates: ['Gate C', 'Gate D'] },
  { key: 'DFZ', name: 'Djibouti Free Zone (DFZ)', address: 'Port Corridor', gates: ['Gate 1', 'Bay 4'] },
];

/**
 * Road kilometres from each quay to each zone. Written out rather than
 * derived, because the corridor is not a straight line: DIFTZ sits at
 * Damerjog, so it is twenty minutes from the Damerjog berths and an hour from
 * Doraleh, and a distance model that averaged the two would price both wrong.
 */
const LANE_KM: Record<string, Record<string, number>> = {
  PORT_DJIBOUTI: { UKAB: 12, JABANAS: 18, DIFTZ: 22, DFZ: 4 },
  SGTD: { UKAB: 18, JABANAS: 22, DIFTZ: 30, DFZ: 12 },
  DMP: { UKAB: 19, JABANAS: 23, DIFTZ: 31, DFZ: 13 },
  SJTP: { UKAB: 20, JABANAS: 24, DIFTZ: 32, DFZ: 14 },
  TADJOURAH: { UKAB: 165, JABANAS: 170, DIFTZ: 175, DFZ: 158 },
  DAMERJOG: { UKAB: 26, JABANAS: 30, DIFTZ: 5, DFZ: 21 },
  DLBP: { UKAB: 28, JABANAS: 32, DIFTZ: 7, DFZ: 23 },
};

/**
 * The door-to-door promise, not the road time — this is what
 * `plannedDeliveryAt` is built from and therefore what every punctuality
 * figure in the system is measured against. The drive itself is under an
 * hour on most of these lanes; the day goes on the terminal queue, the
 * loading and the unload, and promising the drive would mark a perfectly
 * punctual job late.
 */
function laneDuration(km: number): string {
  if (km > 100) return '26h 00m';
  if (km > 25) return '14h 00m';
  if (km > 15) return '13h 00m';
  return '12h 00m';
}

const SHIPPING_LINES = [
  'MSC',
  'CMA CGM',
  'Maersk Line',
  'COSCO Shipping Lines',
  'Pacific International Lines (PIL)',
  'Hapag-Lloyd',
] as const;

/** Each line's own BIC container prefix, index-aligned with `SHIPPING_LINES`. */
const CONTAINER_PREFIXES = ['MSCU', 'CMAU', 'MAEU', 'CSNU', 'PCIU', 'HLXU'] as const;

/**
 * Two kinds of job, kept strictly apart.
 *
 * A **containerized** load owes the line its box back: it carries a container
 * number, a return depot on the quay it came off, a free-time deadline, and
 * its mission is not over at delivery — it ends when the empty is back at the
 * terminal. A **bulk** or **liquid** load has no box, so it has no depot, no
 * deadline and no empty-return cycle, and it closes on the drop.
 *
 * Nothing here may blur the two: an empty return against a tanker load is not
 * a late return, it is a fiction. `kind` is also what pairs a load to a berth
 * that could really have discharged it — see `pickLane`.
 */
const CARGOES = [
  { cargoType: 'Container 40ft — Rice', kind: 'container' as CargoKind, category: 'container_40', goods: 'Bagged rice, 50kg sacks', weight: 26000, vehicleType: '40ft Container', containerized: true, weightShare: 5 },
  { cargoType: 'Container 20ft — Sugar', kind: 'container' as CargoKind, category: 'container_20', goods: 'Refined sugar, 25kg bags', weight: 21000, vehicleType: '20ft Container', containerized: true, weightShare: 4 },
  { cargoType: 'Container 40ft — Textiles', kind: 'container' as CargoKind, category: 'container_40', goods: 'Cotton rolls, palletized', weight: 18500, vehicleType: '40ft Container', containerized: true, weightShare: 3 },
  { cargoType: 'Container 40ft — Electronics', kind: 'container' as CargoKind, category: 'container_40', goods: 'Electronics, cartoned', weight: 14200, vehicleType: '40ft Container', containerized: true, weightShare: 3 },
  { cargoType: 'Container 20ft — Spare Parts', kind: 'container' as CargoKind, category: 'container_20', goods: 'Spare parts, crated', weight: 16800, vehicleType: '20ft Container', containerized: true, weightShare: 3 },
  { cargoType: 'Container 40ft — Foodstuff', kind: 'container' as CargoKind, category: 'container_40', goods: 'Canned foodstuff, palletized', weight: 22400, vehicleType: '40ft Container', containerized: true, weightShare: 4 },
  { cargoType: 'Container 40ft — Building Materials', kind: 'container' as CargoKind, category: 'container_40', goods: 'Tiles and sanitaryware, crated', weight: 24000, vehicleType: '40ft Container', containerized: true, weightShare: 3 },
  { cargoType: 'Container 20ft — Household Goods', kind: 'container' as CargoKind, category: 'container_20', goods: 'Household goods, cartoned', weight: 12500, vehicleType: '20ft Container', containerized: true, weightShare: 2 },
  { cargoType: 'Bulk — Cement Clinker', kind: 'bulk' as CargoKind, category: 'bulk', goods: 'Cement clinker, loose bulk', weight: 32000, vehicleType: 'Flatbed', containerized: false, weightShare: 2 },
  { cargoType: 'Bulk — Fertilizer', kind: 'bulk' as CargoKind, category: 'bulk', goods: 'Urea fertilizer, tipper load', weight: 30000, vehicleType: 'Flatbed', containerized: false, weightShare: 1 },
  { cargoType: 'Bulk — Steel', kind: 'bulk' as CargoKind, category: 'bulk', goods: 'Steel rebar bundles', weight: 28000, vehicleType: 'Flatbed', containerized: false, weightShare: 1 },
  { cargoType: 'Bulk — Wheat', kind: 'bulk' as CargoKind, category: 'bulk', goods: 'Milling wheat, bagged', weight: 29000, vehicleType: 'Flatbed', containerized: false, weightShare: 1 },
  { cargoType: 'Liquid Bulk — Palm Oil', kind: 'liquid' as CargoKind, category: 'bulk', goods: 'Edible palm oil, food grade', weight: 27000, vehicleType: 'Tanker', containerized: false, weightShare: 1 },
  { cargoType: 'Liquid Bulk — Gas Oil', kind: 'liquid' as CargoKind, category: 'bulk', goods: 'Gas oil, road tanker load', weight: 30000, vehicleType: 'Tanker', containerized: false, weightShare: 1 },
] as const;

/** The rotation loads are drawn from — a book is mostly boxes, with a bulk tail. */
const CARGO_POOL = CARGOES.flatMap((cargo) => Array.from({ length: cargo.weightShare }, () => cargo));

interface Lane {
  from: { name: string; address: string; city: string; gate: string };
  to: { name: string; address: string; city: string; gate: string };
  km: number;
  duration: string;
}

/**
 * One leg: off a quay, into a free zone.
 *
 * The berth is drawn only from those that handle this kind of cargo, and the
 * destination is always one of the four free zones — there is no other shape
 * of job in this book. The empty return, when there is one, runs this same
 * road backwards: free zone out, container terminal in (`RETURN_DEPOTS`).
 */
function pickLane(kind: CargoKind): Lane {
  const eligible = PORTS.filter((port) => port.handles.includes(kind));
  const weighted = eligible.flatMap((port) => Array.from({ length: port.weight }, () => port));
  const port = pick(weighted);
  const zone = pick(FREE_ZONES);
  const km = LANE_KM[port.key]![zone.key]!;
  return {
    from: { name: port.name, address: port.address, city: 'Djibouti', gate: pick(port.gates) },
    to: { name: zone.name, address: zone.address, city: 'Djibouti', gate: pick(zone.gates) },
    km,
    duration: laneDuration(km),
  };
}

/**
 * Fleetin's own running costs, sized against what Fleetin actually earns:
 * its revenue is the commission line, not the freight total. Roughly 380k DJF
 * a month against a ~450k commission on this volume — a thin but real margin,
 * rather than the wildly loss-making P&L that billing-sized office costs
 * against a percentage-sized income would draw.
 */
const EXPENSE_TEMPLATES = [
  { category: 'SALARY', description: 'Monthly staff payroll — Djibouti head office', amount: 196_000, method: 'bank_transfer' },
  { category: 'RENT', description: 'Head office lease — Plateau du Serpent', amount: 82_000, method: 'bank_transfer' },
  { category: 'UTILITIES', description: 'Electricity, water and connectivity', amount: 31_000, method: 'bank_transfer' },
  { category: 'FUEL', description: 'Fuel card settlement — operations vehicles', amount: 47_000, method: 'bank_transfer' },
  { category: 'TECHNOLOGY', description: 'Software subscriptions and hosting', amount: 24_000, method: 'bank_transfer' },
] as const;

/* ── Small builders ──────────────────────────────────────────────────────── */

let containerCounter = 400000;
/**
 * A BIC-shaped container number whose owner prefix is the line that actually
 * owns the box. Drawing the prefix at random put an `MSCU` box on a
 * Hapag-Lloyd booking, which is the kind of detail an operator reads first
 * and the reason they stop trusting the rest of the record.
 */
function nextContainerNumber(shippingLine: string): string {
  containerCounter += int(37, 811);
  const prefix = CONTAINER_PREFIXES[SHIPPING_LINES.indexOf(shippingLine as (typeof SHIPPING_LINES)[number])] ?? CONTAINER_PREFIXES[0]!;
  return `${prefix}-${String(containerCounter).padStart(6, '0')}-${int(0, 9)}`;
}

/**
 * Shipment and booking numbers — digits only, no prefix.
 *
 * Fleetin does not mint these in real use: the operator types the number their
 * own paperwork already carries, and those are plain numbers. The seed's old
 * `MSN-#####` / `DPCS-DJ-####` strings were the server's fallback showing
 * through, and they sat in the same column as the hand-typed ones, so the book
 * read as two different systems.
 *
 * Six digits, and never more: that is the width the operators' own books use
 * and the width every printed document, search box and phone call assumes. The
 * ranges below are sized so a full three-month rebuild cannot push either
 * counter to seven — shipments climb about two thousand, bookings about six.
 *
 * Both counters step by a random amount rather than by one: consecutive
 * numbering across a whole book is the signature of generated data, and gaps
 * are what a real numbering series has.
 */
let shipmentRefCounter = 240_000;
function nextShipmentReference(): string {
  shipmentRefCounter += int(3, 17);
  return String(shipmentRefCounter);
}

let bookingRefCounter = 700_000;
function nextBookingReference(): string {
  bookingRefCounter += int(3, 11);
  return String(bookingRefCounter);
}

let plateCounter = 1000;
function nextPlate(prefix: string): string {
  plateCounter += int(3, 29);
  return `${prefix}-${plateCounter}-DJ`;
}

interface FleetRef {
  partnerId: string;
  reference: string;
  name: string;
  vehicles: { id: string; truckType: string }[];
  drivers: { id: string }[];
}

/* ── Main ────────────────────────────────────────────────────────────────── */

async function main() {
  // Refuse to touch anything but a local database — see seed-target-guard.ts.
  assertSeedTargetIsSafe('seed-volume.ts');

  const app = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const prisma = app.get(PrismaService);
  const shipments = app.get(ShipmentsService);
  const bookings = app.get(BookingsService);
  const emptyReturns = app.get(EmptyReturnsService);
  const invoices = app.get(InvoicesService);
  const paymentOrders = app.get(PaymentOrdersService);
  const holds = app.get(HoldsService);
  const projects = app.get(ProjectsService);
  const bankAccounts = app.get(BankAccountsService);
  const facilities = app.get(CreditFacilitiesService);
  const drawdowns = app.get(DrawdownsService);
  const ledger = app.get(LedgerService);
  const storage = app.get(StorageService);

  /** Rewrites the `@default(now())`/`@updatedAt` columns the client cannot set. */
  async function backdate(table: string, id: string, columns: Record<string, Date | null>): Promise<void> {
    const keys = Object.keys(columns);
    if (keys.length === 0) return;
    const assignments = keys.map((key) => `\`${key}\` = ?`).join(', ');
    const values = keys.map((key) => {
      const value = columns[key];
      return value ? sqlDate(value) : null;
    });
    await prisma.$executeRawUnsafe(`UPDATE \`${table}\` SET ${assignments} WHERE id = ?`, ...values, id);
  }

  /** Every ledger entry a service wrote for one source record, moved to when it really happened. */
  async function backdateLedgerFor(sourceId: string, when: Date): Promise<void> {
    await prisma.$executeRawUnsafe(
      'UPDATE `ledger_entries` SET `entryDate` = ?, `postedAt` = ? WHERE `sourceId` = ?',
      sqlDate(when),
      sqlDate(when),
      sourceId,
    );
  }

  /**
   * Removes the operational book so it can be rebuilt, and leaves the
   * organisation standing.
   *
   * **Cleared:** every shipment, booking, timeline, empty-return cycle,
   * invoice, payout and ledger entry, whoever created them — plus this file's
   * own catalog (`SHP-2##` shippers, `PTR-2##` transporters and their fleets).
   * The baseline seed's seventeen fixture shipments go too: they predate the
   * pickup-leg ladder, so their timelines stop at `creation` and every report
   * drawn over them shows a mission that never moved. Keeping them would mean
   * two incompatible generations of history in one book.
   *
   * **Kept:** roles, users, HR, settings and document types. Those are the
   * organisation; everything else is the work, and the work is rebuilt.
   *
   * The counterparties go too, baseline ones included. The book is now a
   * closed list — the eight shippers and ten transporters Fleetin actually
   * works with — so a leftover `Test Cargo Co` or `Verify Transport Two` is
   * not history, it is a fixture showing through on a real board. The portal
   * logins that pointed at them are re-pointed at this dataset's own
   * companies rather than left dangling.
   */
  async function reset(): Promise<void> {
    const [volumeShippers, volumePartners] = await Promise.all([
      prisma.shipper.findMany({ select: { id: true } }),
      prisma.partner.findMany({ select: { id: true } }),
    ]);
    const shipperIds = volumeShippers.map((row) => row.id);
    const partnerIds = volumePartners.map((row) => row.id);

    /* Every shipment in the database, not only this file's — see above. */
    const volumeShipments = await prisma.shipment.findMany({ select: { id: true } });
    const shipmentIds = volumeShipments.map((row) => row.id);
    const volumeBookings = await prisma.booking.findMany({ select: { id: true } });
    const bookingIds = volumeBookings.map((row) => row.id);
    const volumeInvoices = await prisma.invoice.findMany({ select: { id: true } });
    const invoiceIds = volumeInvoices.map((row) => row.id);
    const volumeOrders = await prisma.paymentOrder.findMany({ select: { id: true } });
    const orderIds = volumeOrders.map((row) => row.id);

    await prisma.emptyReturnCycle.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.emptyReturnChain.deleteMany({ where: { cycles: { none: {} } } });

    await prisma.paymentAllocation.deleteMany({
      where: { OR: [{ invoiceId: { in: invoiceIds } }, { paymentOrderId: { in: orderIds } }, { drawdownId: { not: null } }] },
    });
    await prisma.paymentOrder.deleteMany({ where: { id: { in: orderIds } } });
    await prisma.creditNote.deleteMany({ where: { originalInvoiceId: { in: invoiceIds } } });
    await prisma.invoice.deleteMany({ where: { id: { in: invoiceIds } } });
    await prisma.payment.deleteMany({ where: { allocations: { none: {} } } });
    await prisma.payoutHold.deleteMany({ where: { shipmentId: { in: shipmentIds } } });

    /* Finance tables the baseline seed never writes — safe to clear whole. */
    await prisma.drawdown.deleteMany({});
    await prisma.creditFacility.deleteMany({});
    await prisma.expenseEntry.deleteMany({});
    await prisma.bankMovement.deleteMany({});
    await prisma.bankAccount.updateMany({ data: { currentBalance: 0n } });
    await prisma.ledgerEntry.deleteMany({});

    await prisma.bookingTimelineStep.deleteMany({ where: { bookingId: { in: bookingIds } } });
    await prisma.booking.deleteMany({ where: { id: { in: bookingIds } } });
    await prisma.shipmentTimelineStep.deleteMany({ where: { shipmentId: { in: shipmentIds } } });
    await prisma.shipment.deleteMany({ where: { id: { in: shipmentIds } } });
    await prisma.project.deleteMany({ where: { shipperId: { in: shipperIds } } });

    const doomedFleet = await Promise.all([
      prisma.vehicle.findMany({ where: { partnerId: { in: partnerIds } }, select: { id: true } }),
      prisma.driver.findMany({ where: { partnerId: { in: partnerIds } }, select: { id: true } }),
    ]);
    await prisma.document.deleteMany({
      where: { ownerId: { in: doomedFleet.flat().map((row) => row.id) } },
    });
    await prisma.vehicle.deleteMany({ where: { partnerId: { in: partnerIds } } });
    await prisma.driver.deleteMany({ where: { partnerId: { in: partnerIds } } });
    await prisma.partnerBankAccount.deleteMany({ where: { partnerId: { in: partnerIds } } });
    await prisma.contact.deleteMany({ where: { ownerId: { in: [...shipperIds, ...partnerIds] } } });
    /* A user row points at its company, so the FK has to be released before the
     * company can go. The portal accounts are re-pointed at this dataset's own
     * shipper and transporter at the end of the run — see "Portal logins". */
    await prisma.user.updateMany({ where: { shipperId: { in: shipperIds } }, data: { shipperId: null } });
    await prisma.user.updateMany({ where: { partnerId: { in: partnerIds } }, data: { partnerId: null } });
    await prisma.document.deleteMany({ where: { ownerId: { in: [...shipperIds, ...partnerIds] } } });
    await prisma.partner.deleteMany({ where: { id: { in: partnerIds } } });
    await prisma.shipper.deleteMany({ where: { id: { in: shipperIds } } });

    console.log(`🧹 Reset: removed ${shipmentIds.length} shipments, ${bookingIds.length} bookings, ${invoiceIds.length} invoices and their catalog`);
  }

  try {
    if (process.argv.includes('--reset')) {
      await reset();
    }

    const sentinel = await prisma.shipper.findUnique({ where: { reference: SENTINEL_SHIPPER_REFERENCE } });
    if (sentinel) {
      console.log(
        `⏭  Volume seed already applied (${SENTINEL_SHIPPER_REFERENCE} exists). ` +
          'Re-run with `--reset` to rebuild the dataset from scratch.',
      );
      return;
    }

    const admin = await prisma.user.findFirst({ where: { role: { name: 'ADMIN' } } });
    if (!admin) throw new Error('No ADMIN user found — run `pnpm prisma:seed` first.');
    const actorId = admin.id;
    const actorName = `${admin.firstName} ${admin.lastName}`;

    console.log(`🌱 Volume seed — ${MONTHS[0]!.start.toISOString().slice(0, 7)} → ${MONTHS[MONTHS.length - 1]!.start.toISOString().slice(0, 7)}`);

    /* ── Commission ──────────────────────────────────────────────────────── */

    await prisma.appSettings.upsert({
      where: { id: 'SINGLETON' },
      update: { fleetinCommissionPct: COMMISSION_PCT, updatedById: actorId, updatedByName: actorName },
      create: { id: 'SINGLETON', fleetinCommissionPct: COMMISSION_PCT, updatedById: actorId, updatedByName: actorName },
    });
    console.log(`⚙️  Fleetin commission set to ${COMMISSION_PCT}%`);

    /* The upload UI is driven by this catalog, so the dataset carries it —
     * a database seeded only with this file must still be able to attach a
     * grey card to a truck. Upserted, so it is a no-op where the baseline
     * seed already wrote it. */
    /** The insurers writing motor cover in Djibouti — the picker's own list. */
    const DJIBOUTI_INSURERS = ['GXA Assurances', 'AMERGA Insurance', 'Nyala Insurance', 'Africa Insurance'];

    const DOCUMENT_TYPES = [
      { ownerType: 'SHIPPER', label: 'Business License', required: true },
      { ownerType: 'PARTNER', label: 'Business License', required: true },
      { ownerType: 'VEHICLE', label: 'Grey Card', required: true },
      { ownerType: 'VEHICLE', label: 'Insurance', required: true },
      { ownerType: 'DRIVER', label: 'Driver License', required: true },
    ];
    for (const type of DOCUMENT_TYPES) {
      await prisma.documentType.upsert({
        where: { ownerType_label: { ownerType: type.ownerType, label: type.label } },
        update: { required: type.required },
        create: type,
      });
    }

    /* ── Shippers ────────────────────────────────────────────────────────── */

    const shipperIds: { id: string; reference: string; name: string }[] = [];
    for (const [index, seed] of SHIPPER_SEEDS.entries()) {
      const registrationDate = addDays(WINDOW_START, -int(120, 900));
      const shipper = await prisma.shipper.create({
        data: {
          reference: seed.reference,
          companyLegalName: seed.name,
          registrationNumber: `RC-${int(10000, 99999)}-DJ`,
          industry: seed.industry,
          companySize: seed.size,
          country: 'Djibouti',
          address: seed.address,
          projectsCount: 0,
          // A live book has one account still working through onboarding —
          // the Verified/Pending badge has to be showing something somewhere.
          approvalStatus: index === SHIPPER_SEEDS.length - 1 ? 'Pending' : 'Verified',
          registrationDate,
        },
      });
      await prisma.contact.create({
        data: { ownerType: 'SHIPPER', ownerId: shipper.id, ...seed.contact, isPrimary: true },
      });
      await backdate('shippers', shipper.id, { createdAt: registrationDate, updatedAt: registrationDate });
      shipperIds.push({ id: shipper.id, reference: seed.reference, name: seed.name });
    }

    console.log(`🏢 ${shipperIds.length} shippers`);

    /**
     * The rotation shipments are drawn from — weighted, not uniform.
     *
     * A real book is not evenly spread: a handful of key accounts carry most of
     * the volume and the rest ship occasionally. Weighting also gives the demo
     * portal account enough history to be worth opening — a month report needs
     * a dozen missions to draw a trend, not two.
     */
    const KEY_ACCOUNTS = new Set(['SHP-101', 'SHP-104', 'SHP-107']);
    const shipperPool = shipperIds.flatMap((row) =>
      KEY_ACCOUNTS.has(row.reference) ? [row, row, row] : [row],
    );

    /* ── Transporters, their grids and their fleets ──────────────────────── */

    const fleets: FleetRef[] = [];
    for (const seed of PARTNER_SEEDS) {
      const registrationDate = addDays(WINDOW_START, -int(150, 1000));
      const partner = await prisma.partner.create({
        data: {
          reference: seed.reference,
          companyLegalName: seed.name,
          registrationNumber: `RC-${int(10000, 99999)}-DJ`,
          businessLicenseNumber: `BL-${int(100000, 999999)}`,
          /* One region, because there is one corridor: the quay-to-free-zone
           * run inside Djibouti city. None of these hauliers runs upcountry. */
          operatingRegions: ['Djibouti'],
          serviceCategories: ['Container Haulage', 'Empty Container Return', 'Bulk Transport'],
          fleetSize: seed.fleet,
          vehicleTypes: [...TRUCK_TYPES],
          country: 'Djibouti',
          address: seed.address,
          insuranceProvider: pick(DJIBOUTI_INSURERS),
          insurancePolicyNumber: `POL-${int(100000, 999999)}`,
          insuranceExpiry: addDays(NOW, int(40, 420)),
          partnerStatus: 'Active',
          registrationDate,
        },
      });
      await prisma.contact.create({
        data: { ownerType: 'PARTNER', ownerId: partner.id, ...seed.contact, isPrimary: true },
      });
      await prisma.partnerBankAccount.create({
        data: {
          partnerId: partner.id,
          bankName: pick(['CAC International Bank', 'Bank of Africa Djibouti', 'Salaam African Bank', 'East Africa Bank']),
          accountHolder: seed.name,
          accountNumber: `${int(1000, 9999)} ${int(1000, 9999)} ${int(1000, 9999)}`,
          currency: 'DJF',
        },
      });

      /* No price list. Partner pricing tiers were removed on 2026-08-31 —
         a shipment's price is entered by the operator, so there is nothing
         per-carrier left to seed. */


      const fleetCount = int(6, 10);
      const vehicles: { id: string; truckType: string }[] = [];
      const drivers: { id: string }[] = [];
      for (let i = 0; i < fleetCount; i += 1) {
        const joinDate = addDays(registrationDate, int(5, 200));
        const driver = await prisma.driver.create({
          data: {
            reference: await nextReferenceField(prisma.driver, 'reference', 'DRV'),
            partnerId: partner.id,
            fullName: pick(DRIVER_NAMES),
            phone: `+253 77 ${int(10, 99)} ${int(10, 99)} ${int(10, 99)}`,
            nationalId: `${int(100000, 999999)}-${int(10, 99)}`,
            drivingLicenseNumber: `DL-${int(100000, 999999)}`,
            nationalIdExpiry: addDays(NOW, int(200, 1400)),
            accessCards: ['Port Access Card', 'Free Zone Pass'],
            status: 'Available',
            joinDate,
          },
        });
        const truckType = TRUCK_TYPES[i % TRUCK_TYPES.length]!;
        const vehicle = await prisma.vehicle.create({
          data: {
            reference: await nextReferenceField(prisma.vehicle, 'reference', 'VEH'),
            partnerId: partner.id,
            plateNumber: nextPlate(seed.plate),
            truckType,
            containerCapacity: truckType === '40ft Container' ? '1 × 40ft' : truckType === '20ft Container' ? '2 × 20ft' : truckType === 'Tanker' ? '30,000 L' : '32t payload',
            ownershipType: pick(['Owned', 'Leased']),
            /* The insurer, on the truck, because a claim is made against the
               company — kept in step with the vehicle's Insurance document,
               which is where an operator sets it. */
            insuranceProvider: pick(DJIBOUTI_INSURERS),
            insuranceStartDate: addDays(NOW, -int(60, 320)),
            insuranceExpiry: addDays(NOW, int(30, 400)),
            registrationExpiry: addDays(NOW, int(60, 700)),
            hasGPS: chance(0.75),
            gpsDeviceId: `GPS-${int(10000, 99999)}`,
            operationalStatus: 'Available',
            year: int(2015, 2024),
            make: pick(['Sinotruk', 'FAW', 'Scania', 'Volvo', 'MAN', 'Isuzu']),
            model: pick(['HOWO 371', 'J6P', 'R450', 'FH16', 'TGS 33.440', 'FVZ']),
            /* Djibouti plates, and the corridor's own operating pattern. */
          },
        });
        vehicles.push({ id: vehicle.id, truckType });
        drivers.push({ id: driver.id });
      }

      await backdate('partners', partner.id, { createdAt: registrationDate, updatedAt: registrationDate });
      fleets.push({ partnerId: partner.id, reference: seed.reference, name: seed.name, vehicles, drivers });
    }
    console.log(`🚛 ${fleets.length} transporters, ${fleets.reduce((n, f) => n + f.vehicles.length, 0)} vehicles, ${fleets.reduce((n, f) => n + f.drivers.length, 0)} drivers`);

    /* ── Compliance documents ────────────────────────────────────────────
     *
     * A transporter with no grey card, a truck with no insurance and a driver
     * with no licence is not a record anybody would accept — the whole
     * document module exists to hold exactly these, the upload UI is driven by
     * the `DOCUMENT_TYPES` catalog above, and with the shelf empty every
     * company, vehicle and driver page opens on "No documents".
     *
     * One stored object per document type rather than one per document: these
     * are placeholders, the bytes are identical, and writing three hundred and
     * fifty copies of the same file to prove that would be waste. The rows are
     * real, their expiry dates are the vehicle's and driver's own, and a
     * handful are deliberately left unverified or expired — a compliance board
     * where everything is green cannot show what it is for.
     */
    const placeholderPdf = Buffer.from(
      '%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n' +
        '2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n' +
        '3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 595 842]>>endobj\n' +
        'trailer<</Root 1 0 R>>\n%%EOF\n',
      'utf8',
    );
    const documentKeys = new Map<string, string>();
    async function keyFor(label: string): Promise<string> {
      const existing = documentKeys.get(label);
      if (existing) return existing;
      const stored = await storage.upload(
        {
          originalname: `${label.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')}.pdf`,
          buffer: placeholderPdf,
          mimetype: 'application/pdf',
          size: placeholderPdf.byteLength,
        },
        { folder: 'documents', preserveFilename: true },
      );
      documentKeys.set(label, stored.key);
      return stored.key;
    }

    let documentCount = 0;
    async function attachDocument(
      ownerType: string,
      ownerId: string,
      label: string,
      issuedAt: Date,
      expiryDate: Date | null,
      issuer?: string,
    ): Promise<void> {
      const storageKey = await keyFor(label);
      /* Most are checked and filed. A few are still on the desk, and one in
       * twenty was rejected and has to be chased — both are states the review
       * queue exists to surface. */
      const roll = rnd();
      const expired = expiryDate !== null && expiryDate < NOW;
      const status = expired ? 'Expired' : roll < 0.86 ? 'Verified' : roll < 0.96 ? 'Pending Review' : 'Rejected';
      const document = await prisma.document.create({
        data: {
          ownerType,
          ownerId,
          category: label,
          name: `${label}.pdf`,
          storageKey,
          mimeType: 'application/pdf',
          fileSizeBytes: placeholderPdf.byteLength,
          status,
          uploadedById: actorId,
          issueDate: issuedAt,
          expiryDate,
          issuer: issuer ?? null,
          verifiedById: status === 'Verified' ? actorId : null,
          verifiedAt: status === 'Verified' ? addDays(issuedAt, int(1, 6)) : null,
          rejectionReason: status === 'Rejected' ? 'Scan is unreadable — please re-upload a clear copy.' : null,
        },
        select: { id: true },
      });
      await backdate('documents', document.id, { uploadedAt: issuedAt });
      documentCount += 1;
    }

    for (const shipper of shipperIds) {
      await attachDocument('SHIPPER', shipper.id, 'Business License', addDays(WINDOW_START, -int(60, 400)), addDays(NOW, int(-20, 500)));
    }
    for (const fleet of fleets) {
      const filedAt = addDays(WINDOW_START, -int(60, 400));
      await attachDocument('PARTNER', fleet.partnerId, 'Business License', filedAt, addDays(NOW, int(-15, 500)));
      for (const vehicle of fleet.vehicles) {
        const row = await prisma.vehicle.findUniqueOrThrow({
          where: { id: vehicle.id },
          select: { registrationExpiry: true, insuranceExpiry: true, insuranceProvider: true },
        });
        await attachDocument('VEHICLE', vehicle.id, 'Grey Card', addDays(row.registrationExpiry, -365), row.registrationExpiry);
        await attachDocument('VEHICLE', vehicle.id, 'Insurance', addDays(row.insuranceExpiry, -365), row.insuranceExpiry, row.insuranceProvider ?? undefined);
      }
      for (const driver of fleet.drivers) {
        const row = await prisma.driver.findUniqueOrThrow({
          where: { id: driver.id },
          select: { joinDate: true },
        });
        /* No expiry — a Djibouti driving licence does not have one. The issue
           date is dated back from the day they joined, since a driver is hired
           already holding the licence. */
        await attachDocument(
          'DRIVER',
          driver.id,
          'Driver License',
          addDays(row.joinDate, -int(180, 2500)),
          null,
        );
      }
    }
    console.log(`\uD83D\uDCC4 ${documentCount} compliance documents filed`);

    /* ── Fleetin's own money: account, facility, opening float ───────────── */

    let operatingAccount = await prisma.bankAccount.findFirst({ where: { isPrimary: true, isActive: true } });
    if (!operatingAccount) {
      operatingAccount = await prisma.bankAccount.create({
        data: {
          bankName: 'CAC International Bank',
          accountHolder: 'FLEETIN SARL',
          accountNumber: '0021 4477 9010',
          iban: 'DJ21 0010 0021 4477 9010 33',
          swiftCode: 'CACIDJJD',
          currency: 'DJF',
          openingBalance: 0n,
          currentBalance: 0n,
          isActive: true,
          isPrimary: true,
        },
      });
    }

    /* Fleetin funds the whole month out of its own money and is repaid at
     * month end — so the account has to actually hold enough to pay every
     * transporter before a single statement is settled. `payTransporter`
     * refuses to overdraw, which is exactly the behaviour worth exercising. */
    const openingFloat = 40_000_000;
    const openingDeposit = await bankAccounts.deposit(
      operatingAccount.id,
      { amountMinorUnits: openingFloat, method: 'BANK_TRANSFER', description: 'Opening working-capital float', occurredAt: WINDOW_START.toISOString() },
      actorId,
      actorName,
    );
    if (openingDeposit && typeof openingDeposit === 'object' && 'id' in openingDeposit) {
      await backdate('bank_movements', String(openingDeposit.id), { createdAt: WINDOW_START });
    }

    const facility = await facilities.create({
      bankName: 'CAC International Bank',
      bankAccountId: operatingAccount.id,
      limitMinorUnits: 30_000_000,
      currency: 'DJF',
      startDate: addDays(WINDOW_START, -30).toISOString(),
      endDate: addDays(NOW, 300).toISOString(),
      isRevolving: true,
      feeDescription: '1.5% arrangement fee, 9% p.a. on drawn balance',
    });
    await backdate('credit_facilities', facility.id, { createdAt: addDays(WINDOW_START, -30) });
    console.log(`🏦 Operating account funded (${(openingFloat / 1000).toLocaleString()}k DJF) · facility ${facility.facilityNumber}`);

    /* ── Projects ────────────────────────────────────────────────────────── */

    const projectByShipper = new Map<string, string>();
    const PROJECT_NAMES = [
      'DIFTZ Distribution Retainer',
      'UKAB Free Zone Inbound Programme',
      "Jaban'as Consolidation Contract",
      'DFZ Quay-to-Zone Retainer',
      'Doraleh Container Haulage Agreement',
    ];
    for (const [index, name] of PROJECT_NAMES.entries()) {
      const shipper = shipperIds[index]!;
      const startedAt = addDays(WINDOW_START, -int(0, 45));
      const project = await projects.create({
        name,
        shipperId: shipper.id,
        startedAt: startedAt.toISOString(),
        contractEndAt: addDays(NOW, int(60, 300)).toISOString(),
        monthlyEstimate: int(1, 4) * 1_000_000,
      });
      await backdate('projects', project.id, { createdAt: startedAt, updatedAt: startedAt });
      projectByShipper.set(shipper.id, project.id);
    }
    console.log(`📁 ${PROJECT_NAMES.length} projects`);

    /* ── Six months of operations ────────────────────────────────────────── */

    /** How far along the return leg a box has actually got. */
    type ReturnRung = 'Empty Ready' | 'Empty Picked Up' | 'Completed';

    /** Which way a stripped container went home. */
    type ReturnFate = 'matched' | 'standalone' | 'outstanding';

    interface SeededBooking {
      id: string;
      reference: string;
      containerized: boolean;
      partnerId: string;
      pickupTime: Date;
      completedAt: Date | null;
      /** The three moments of the return leg, once the box has been dropped. */
      emptyReadyAt: Date | null;
      pickedUpAt: Date | null;
      closeAt: Date | null;
      /** The line's free-time deadline for this box, if it carries one. */
      deadline: Date | null;
      fate: ReturnFate | null;
    }
    interface SeededShipment {
      id: string;
      reference: string;
      shipperId: string;
      partnerIds: string[];
      pickupTime: Date;
      completedAt: Date | null;
      status: string;
      bookings: SeededBooking[];
      monthIndex: number;
      /** The lane's road distance — what the transit leg is drawn from. */
      km: number;
      /** Kept so the job can be re-dated after its containers finally close. */
      schedule: Schedule | null;
      /** Only a boxed job can sit in the matching pool as an open full load. */
      containerized: boolean;
    }

    const allShipments: SeededShipment[] = [];
    /** Containerized bookings delivered last month, waiting to be matched as empties. */
    let empties: SeededBooking[] = [];
    let cycleCount = 0;
    let standaloneReturns = 0;
    /**
     * How many jobs are allowed to sit at Pending, awaiting dispatch.
     *
     * These are the open full loads the matching board pairs waiting empties
     * against, so there has to be a real queue of them — and it has to be a
     * queue somebody could work through, which is a handful, not a page.
     */
    let undispatchedBudget = 6;
    /**
     * How many jobs may be booked for the days just ahead of today.
     *
     * These are the open full loads the matching board works against. Booked,
     * priced, not yet dispatched — a real queue rather than a drawer of
     * abandoned drafts.
     */
    let lookaheadBudget = 12;
    let holdCount = 0;

    for (const [monthIndex, month] of MONTHS.entries()) {
      const count = SHIPMENTS_PER_MONTH[monthIndex]!;
      const monthShipments: SeededShipment[] = [];

      /* 1. Create the month's shipments and their bookings, all Pending. */
      for (let i = 0; i < count; i += 1) {
        const shipper = pick(shipperPool);
        const cargo = pick(CARGO_POOL);
        /* Off a quay that handles this cargo, into a free zone — the only
         * shape of job Fleetin runs. */
        const lane = pickLane(cargo.kind);
        const containerCount = cargo.containerized ? containerLoad() : int(1, 2);

        /* Most shipments run on one transporter; the big ones are split, which
         * is the case that makes "one payment order per transporter per
         * shipment" mean something. The split is proportional rather than
         * "all but one": handing nineteen boxes to one carrier and a single box
         * to another is not a split, it is a rounding error with a second
         * invoice attached. */
        const primary = pick(fleets);
        const secondary = containerCount >= 3 && chance(0.35) ? pick(fleets.filter((f) => f.partnerId !== primary.partnerId)) : null;
        const secondaryShare = secondary ? Math.max(1, Math.round(containerCount * (0.3 + rnd() * 0.2))) : 0;
        const primaryShare = containerCount - secondaryShare;

        /* The current month is only as long as today — a board full of work
         * scheduled for next week would be fiction, not a live picture. */
        /* The current month runs to today — plus the few days a consignee books
         * ahead. Without that tail nothing is ever scheduled for tomorrow, so
         * there are no open loads for a waiting empty to be matched against and
         * the matching board has only one side to it. The look-ahead budget
         * below is what keeps that tail a queue rather than a backlog. */
        const daysInMonth = Math.round((month.end.getTime() - month.start.getTime()) / DAY);
        const lastDay = month.isCurrent
          ? Math.min(daysInMonth, NOW.getUTCDate() + 3)
          : Math.min(28, daysInMonth);
        const dayOfMonth = int(1, lastDay);
        const pickupTime = new Date(Date.UTC(month.year, month.month - 1, dayOfMonth, int(5, 16), pick([0, 15, 30, 45])));
        /* The current month is still running, so most of what is scheduled
         * past today is fiction. A short look-ahead is not: a free-zone
         * consignee books a slot a day or two out, and those bookings are
         * real, open, and unclaimed — which is exactly what the matching board
         * pairs a waiting empty against (`findOpenFullLoads`).
         *
         * Bounded, and containers only. A job booked for tomorrow legitimately
         * carries nothing but its creation row; a *page* of them carries
         * nothing at all, and reads as a system that files paperwork and never
         * moves a truck. */
        if (month.isCurrent && pickupTime > NOW) {
          const daysAhead = (pickupTime.getTime() - NOW.getTime()) / DAY;
          if (daysAhead > 3 || !cargo.containerized || lookaheadBudget <= 0) continue;
          lookaheadBudget -= 1;
        }

        const assignments = secondary
          ? [
              { partnerId: primary.partnerId, vehicles: primaryShare },
              { partnerId: secondary.partnerId, vehicles: secondaryShare },
            ]
          : [{ partnerId: primary.partnerId, vehicles: containerCount }];

        /* One box, one commitment: the line, the depot and the return deadline
         * are the shipment's, and every container under it inherits them
         * rather than rolling its own. The window is the shipping line's free
         * time counted off the vessel, not off this truck's pickup — which is
         * why a box collected today is legitimately still returnable next
         * month, and why the on-time rate means something. */
        const shippingLine = cargo.containerized ? pick(SHIPPING_LINES) : undefined;
        /* The empty goes back to the quay it was discharged at, not to some
         * other yard. That is the operational truth — the box belongs to the
         * line and the line's depot is at the terminal — and it is also what
         * makes a pairing possible at all: matching requires the empty's depot
         * and the next load's quay to be the same zone, so a depot drawn at
         * random from three ports left most containers unpairable by
         * construction. */
        const returnDepot = cargo.containerized ? lane.from.name : undefined;
        const freeDays = cargo.containerized ? pick([5, 7, 7, 10, 14]) : undefined;
        /* Free time runs from the box leaving the terminal, so the deadline is
         * the pickup plus exactly the days the line allows — not an arbitrary
         * window. That is what makes a late return *mean* something: it is the
         * consignee's depotage, or the return leg, that ate the allowance.
         *
         * Seven to fourteen days, set against missions budgeted at three to
         * seven and ten at the outside. A clean job beats its allowance
         * comfortably — which is the point, because most of them do — and only
         * a job that drags on the consignee's yard breaches it. Those few are
         * what detention is billed on, and a handful is a report; hundreds is
         * a broken dataset. */
        const returnDeadline = cargo.containerized ? addDays(pickupTime, freeDays!) : undefined;

        const isDpcs = chance(0.55);
        /* One number per shipment, digits only. A DPCS job carries the same
         * number in both columns, exactly as the wizard writes it: DPCS
         * assigned it, and Fleetin must not invent a second id for the same
         * job. */
        const shipmentReference = nextShipmentReference();
        const created = await shipments.create(
          {
            shipmentSource: isDpcs ? 'dpcs' : 'custom',
            reference: shipmentReference,
            dpcsReference: isDpcs ? shipmentReference : undefined,
            shipperId: shipper.id,
            transporterAssignments: assignments,
            preferredVehicleType: cargo.vehicleType,
            pickupLocationName: lane.from.name,
            pickupLocationAddress: lane.from.address,
            pickupLocationCity: lane.from.city,
            pickupGateOrTerminal: lane.from.gate,
            deliveryLocationName: lane.to.name,
            deliveryLocationAddress: lane.to.address,
            deliveryLocationCity: lane.to.city,
            deliveryGateOrTerminal: lane.to.gate,
            estimatedDistanceKm: lane.km,
            estimatedDurationHours: lane.duration,
            cargoType: cargo.cargoType,
            shipmentCategory: cargo.category,
            shippingLine,
            containerReturnDepot: returnDepot,
            containerReturnDeadline: returnDeadline?.toISOString(),
            containerReturnFreeDays: freeDays,
            goodsDescription: cargo.goods,
            totalWeightKg: cargo.weight * containerCount,
            requiredDocuments: ['Bill of Lading', 'Delivery Order', 'Proof of Delivery'],
            scheduledPickupTime: pickupTime.toISOString(),
            projectId: projectByShipper.get(shipper.id),
          },
          actorName,
        );

        /* One booking per container/trip, each on a real truck with a real
         * driver — the ladder refuses to move a booking that claims a driver
         * it does not have. */
        const items = [];
        for (let c = 0; c < containerCount; c += 1) {
          const fleet = secondary && c >= primaryShare ? secondary : primary;
          /* The truck has to be able to carry the box. Picking a slot at
           * random put 20ft trailers under 40ft containers, so the booking
           * card read "Container 40ft — Foodstuff" over "20ft Container" —
           * and the price, which resolves off the *cargo's* vehicle type,
           * disagreed with the truck the report showed. */
          const fitting = fleet.vehicles
            .map((vehicle, index) => ({ vehicle, index }))
            .filter((entry) => entry.vehicle.truckType === cargo.vehicleType);
          const slot = fitting.length > 0
            ? fitting[int(0, fitting.length - 1)]!.index
            : int(0, fleet.vehicles.length - 1);
          items.push({
            reference: nextBookingReference(),
            cargoType: cargo.cargoType,
            shipmentCategory: cargo.category,
            containerNumber: cargo.containerized ? nextContainerNumber(shippingLine!) : undefined,
            shippingLine,
            partnerId: fleet.partnerId,
            vehicleType: cargo.vehicleType,
            vehicleId: fleet.vehicles[slot]!.id,
            driverId: fleet.drivers[slot]!.id,
            containerReturnDepot: returnDepot,
            containerReturnDeadline: returnDeadline?.toISOString(),
            containerReturnFreeDays: freeDays,
            scheduledPickupTime: pickupTime.toISOString(),
          });
        }
        const createdBookings = await bookings.createMany(created.id, { bookings: items }, actorName);

        /* The shipment-level driver/vehicle snapshot the detail page reads. */
        const firstSlot = int(0, primary.vehicles.length - 1);
        await shipments.update(created.id, {
          vehicleId: primary.vehicles[firstSlot]!.id,
          driverId: primary.drivers[firstSlot]!.id,
        });

        monthShipments.push({
          id: created.id,
          reference: created.reference,
          shipperId: shipper.id,
          partnerIds: [...new Set(items.map((item) => item.partnerId))],
          pickupTime,
          completedAt: null,
          status: 'Pending',
          monthIndex,
          km: lane.km,
          schedule: null,
          containerized: cargo.containerized,
          bookings: createdBookings.map((booking, index) => ({
            id: booking.id,
            reference: booking.reference,
            containerized: Boolean(items[index]!.containerNumber),
            partnerId: items[index]!.partnerId,
            pickupTime,
            completedAt: null,
            emptyReadyAt: null,
            pickedUpAt: null,
            closeAt: null,
            deadline: returnDeadline ?? null,
            fate: null,
          })),
        });
      }

      /* The month runs in date order from here on. Creation order is random
       * within the month, and an empty handed to a truck that left before the
       * box was even discharged is not a schedule anyone could work. */
      monthShipments.sort((a, b) => a.pickupTime.getTime() - b.pickupTime.getTime());

      /* 2. Play each shipment forward through the real status ladder, matching
       *    each newly-freed empty to the next open load as we go.
       *
       *    Matching has to happen inside this loop, not before it: an empty is
       *    only claimable once its own container is stripped, and the box has
       *    to go back inside the line's free time. Matching a whole month's
       *    empties against the NEXT month's loads — the obvious way to write
       *    this — dates every return weeks after the box came off the vessel,
       *    which is past every deadline and makes the module's on-time rate
       *    read as a permanent failure. Days, not months, is what this
       *    operation actually does. */
      /**
       * The road leg: ten rungs between a job being handed out and the cargo
       * standing in the free zone.
       *
       * Every one of them is walked, and every one is walked with the moment it
       * really happened (`occurredAt`) rather than the moment the seed ran. The
       * services stamp the timeline from that field, so a mission report drawn
       * over this data measures real gaps — the terminal queue, the loading,
       * the depotage — instead of eleven rows all sharing one timestamp.
       */
      const ROAD_LADDER = [
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
      ] as const;

      for (const shipment of monthShipments) {
        /**
         * How far this job has got.
         *
         * Every job in this book runs start to finish. Nothing is cancelled
         * and nothing fails — a job that was abandoned before the truck rolled
         * leaves a container behind that was never collected, and that box
         * then sits in the returns queue for weeks accruing detention on a
         * mission that never happened. Some jobs run late; none are dropped.
         *
         * So a past month is settled history, complete to the last rung, and
         * the current month is a live board with work at every stage. Decided
         * *before* matching, because an undispatched job has not been handed
         * an empty yet — see the pool note below.
         */
        let roadSteps: number;
        if (!month.isCurrent) {
          roadSteps = ROAD_LADDER.length;
        } else {
          const age = (NOW.getTime() - shipment.pickupTime.getTime()) / DAY;
          if (shipment.pickupTime > NOW) {
            /* Booked for a day still to come — nothing has happened yet, and
             * nothing should claim to have. */
            roadSteps = 0;
          } else {
            /* Spread across the ladder rather than piled at the ends: a board
             * where every job is either untouched or finished shows none of
             * the states in between, and those are the ones an operations
             * console exists to display.
             *
             * But only for the last few days. A job left half-finished three
             * weeks ago is not work in progress — it is a container that never
             * went back, sitting at the top of the returns queue two weeks past
             * its free time. Past six days, every job is closed. */
            roadSteps =
              age > 6
                ? ROAD_LADDER.length
                : Math.max(0, Math.min(ROAD_LADDER.length, Math.round(age * 2.5) + int(0, 3)));
            /* A few of this week's jobs are booked but not yet dispatched, and
             * they stay at Pending on purpose: an unclaimed containerized
             * booking IS the matching pool's "full" side (`findOpenFullLoads`
             * selects exactly that), so without them there is nothing for a
             * waiting empty to be paired with and the matching board cannot be
             * demonstrated at all.
             *
             * Counted rather than rolled. A flat one-in-three left dozens of
             * jobs carrying nothing but a creation row — a shipment with no
             * timeline, no truck and no times is not a live booking, it is an
             * empty shell, and a board full of them reads as broken. A handful
             * is a queue; thirty is a mess. */
            if (age < 5 && undispatchedBudget > 0 && shipment.containerized && chance(0.7)) {
              roadSteps = 0;
              undispatchedBudget -= 1;
            }
          }
        }

        /* Whether this one runs clean or drags. A dragging job is still a job
         * — it just spends longer on the consignee's yard, which is what puts
         * its container past the line's free time and detention on the bill. */
        const schedule = scheduleFor(shipment, chance(0.91) ? 'clean' : 'slow');
        shipment.schedule = schedule;

        /* ── Hand this job any empty that is stripped and waiting ─────────
         *
         * This is the match: a box sitting in a free zone with its free time
         * running, and a load about to be collected from a quay. One truck
         * does both — it runs the empty back to the terminal and comes out
         * with this container. Confirming it is Empty Return's one write
         * action, and it is what starts a chain.
         *
         * Only empties already stripped before this job rolls are offered: a
         * truck cannot carry back a box that is still being unloaded. And the
         * rate is deliberately short of total, because a real yard always has
         * boxes still looking for a load — those are the ones the Control
         * Tower exists to surface.
         *
         */
        if (roadSteps > 0) {
          for (const booking of shipment.bookings) {
            if (!booking.containerized) continue;
            if (empties.length === 0) break;
            if (!chance(0.92)) continue;
            const index = empties.findIndex((empty) => (empty.emptyReadyAt ?? NOW) < shipment.pickupTime);
            if (index === -1) break;
            const [empty] = empties.splice(index, 1);
            /* How far the round trip has got is how far the truck doing it has
             * got. Until it has collected this load, the empty it went out
             * with is either still waiting or still on the road — which is
             * exactly what a cycle at "preparing", "ready" or "in progress"
             * means. Running every empty straight to the terminal regardless
             * left every cycle in the book closed and the Control Tower with
             * nothing in flight on it. */
            /* "Delivered" starts at `Arrived`, not at `Completed` — that is
             * where `cycleStatusForBookingStatus` flips a cycle to completed
             * and the module closes the empty for us, stamping the moment it
             * runs. So a box may only be left mid-leg while its outbound load
             * is still short of that rung; past it, the leg is walked in full
             * here, on the hour it really happened. Getting this boundary
             * wrong is what produced thirty-four-day missions: the hook closed
             * a June container with today's date. */
            const arrivedIndex = ROAD_LADDER.indexOf('Arrived');
            const cap =
              roadSteps > arrivedIndex ? 'Completed' : roadSteps >= 3 ? 'Empty Picked Up' : 'Empty Ready';
            if (
              await runEmptyBackToPort(
                empty!,
                booking.id,
                schedule.road['Assigned']!,
                cap,
                schedule.road['At Pickup'] ?? null,
              )
            ) {
              cycleCount += 1;
            }
          }
        }

        /* A booking matched as somebody's outbound load was already forced to
         * "Assigned" by the matching service — the ladder must resume from
         * where that cross-module edge left it, not replay a step it is past. */
        const bookingStatus = new Map(
          (
            await prisma.booking.findMany({
              where: { id: { in: shipment.bookings.map((booking) => booking.id) } },
              select: { id: true, status: true },
            })
          ).map((row) => [row.id, row.status]),
        );

        /**
         * Only the bookings are moved. A shipment's status is *derived* from
         * the containers underneath it — the service refuses to be told one
         * directly — so the job's own position on the ladder is whatever
         * `syncShipmentFromBookings` computes from this, and the seed reads it
         * back rather than asserting it.
         */
        const advance = async (booking: SeededBooking, status: string, when: Date): Promise<void> => {
          if (bookingStatus.get(booking.id) === status) return;
          await bookings.updateStatus(booking.id, { status: status as never, occurredAt: when.toISOString() });
          bookingStatus.set(booking.id, status);
        };

        for (let s = 0; s < roadSteps; s += 1) {
          const rung = ROAD_LADDER[s]!;
          for (const booking of shipment.bookings) {
            await advance(booking, rung, schedule.road[rung]!);
          }
        }

        /* ── The second half of a container mission ──────────────────────
         *
         * A containerized job is not over when the goods are on the ground.
         * The box belongs to the line, it goes back to the terminal it came
         * off, and the line bills detention for every day it does not. Three
         * more rungs carry that, each stamped with the hour it really
         * happened:
         *
         *   delivered ──depotage──▶ Empty Ready ──dispatch──▶ Empty Picked Up
         *                                       ──return leg──▶ Completed
         *
         * "Empty Ready" is the hinge: it is what puts the container into the
         * matching pool and what every detention day is counted from. A bulk
         * or liquid load has no box, so it skips all three and closes on the
         * drop. */
        if (roadSteps === ROAD_LADDER.length) {
          for (const booking of shipment.bookings) {
            if (!booking.containerized) {
              if (schedule.plainClose > NOW) continue;
              await advance(booking, 'Completed', schedule.plainClose);
              booking.completedAt = schedule.plainClose;
              continue;
            }

            /* Each box is stripped on its own hour — one yard does not empty
             * twenty containers at the same minute — inside the span this
             * mission was budgeted. */
            const leg = returnLegFor(schedule, shipment.bookings.indexOf(booking));
            if (leg.emptyReadyAt > NOW) {
              /* Still on the consignee's yard. A real state, and the one the
               * booking card prints "Not emptied yet" for. */
              continue;
            }
            await advance(booking, 'Empty Ready', leg.emptyReadyAt);
            booking.emptyReadyAt = leg.emptyReadyAt;
            booking.pickedUpAt = leg.pickedUpAt;
            booking.closeAt = leg.closeAt;

            /* Which way home this box takes. Most wait for a load to pair
             * with; some run out of patience and go back alone; the rest are
             * still in the pool right now, which is what the matching board
             * is for. A past month keeps very few of those — a container
             * outstanding since two months ago is not a backlog, it is a dead
             * record, and the line would have escalated long before. */
            /**
             * Which way this box goes home — and the one rule that governs it:
             * **a container is never left in the pool past its free time.**
             *
             * An overdue box is not a backlog, it is a failure nobody let
             * happen: the line escalates, detention is already running, and
             * Operations has long since either paired it or sent it back alone.
             * Leaving them to accumulate is what fills the returns queue with
             * hundreds of rows that no dispatcher could ever clear, and buries
             * the handful that genuinely need a decision today.
             *
             * So a box whose deadline has passed is closed out, one way or the
             * other. Only a box still inside its allowance may be waiting —
             * and those are exactly the ones worth showing, because they are
             * the ones a matching decision is still open on.
             */
            /* A few days past the allowance is real — detention is running and
             * somebody is chasing it, and that is worth showing. Weeks past it
             * is not: the line would have escalated long before, and a queue
             * of those buries the boxes that actually need a decision today. */
            const stillWorkable = booking.deadline
              ? booking.deadline > addDays(NOW, -MAX_OVERDUE_DAYS)
              : true;
            const roll = rnd();
            booking.fate = stillWorkable
              ? roll < 0.42
                ? 'matched'
                : roll < 0.58
                  ? 'standalone'
                  : 'outstanding'
              : roll < 0.88
                ? 'matched'
                : 'standalone';

            if (booking.fate === 'matched') {
              empties.push(booking);
            } else if (booking.fate === 'standalone') {
              await returnStandalone(booking);
              standaloneReturns += 1;
            }
            /* 'outstanding' stops here: stripped, in the pool, waiting. */
          }
        }

        const derived = await prisma.shipment.findUniqueOrThrow({
          where: { id: shipment.id },
          select: { status: true },
        });
        shipment.status = derived.status;

        /* Everything the services could not stamp themselves — the creation
         * dates, and the shipment-level rollup timeline — moved onto the same
         * clock as the bookings underneath it. */
        await placeShipmentInTime(shipment, schedule);
      }

      /**
       * Boxes that ran out of time waiting for a load go back on their own.
       *
       * The third way home, and a decision rather than a failure: when an
       * empty's free time is nearly gone and no load has turned up to pair it
       * with, sending it back alone costs a wasted leg and beats paying
       * detention. Without this sweep the pool is a ratchet — every unmatched
       * box from three months ago is still sitting in it, months past its
       * deadline, and the board fills with overdue containers nobody could
       * ever have cleared. The current month keeps its stragglers: those are
       * the ones a dispatcher is genuinely still deciding about.
       */
      if (!month.isCurrent) {
        const carried: SeededBooking[] = [];
        for (const empty of empties) {
          /* A box stripped in the last days of the month has not run out of
           * road — the load it pairs with is very likely next week's, and the
           * calendar turning over is not an operational event. Only the ones
           * that have genuinely been sitting go back alone. */
          const waitedDays = (month.end.getTime() - (empty.emptyReadyAt ?? month.end).getTime()) / DAY;
          if (waitedDays < 6) {
            carried.push(empty);
            continue;
          }
          await returnStandalone(empty);
          standaloneReturns += 1;
        }
        empties = carried;
      }

      allShipments.push(...monthShipments);
      console.log(`📦 ${month.start.toISOString().slice(0, 7)} — ${monthShipments.length} shipments, ${monthShipments.reduce((n, s) => n + s.bookings.length, 0)} bookings`);
    }

    /* ── A matching board somebody can actually work ─────────────────────
     *
     * A pairing is one truck doing two legs: it drops the empty at the depot
     * and collects the next load from the same quay. So the module will only
     * offer a match where the **transporter is the same** and the empty's
     * depot is in the **same zone** as the load's pickup — anything else is
     * two separate trips wearing one label.
     *
     * With ten hauliers on the book and open loads handed out at random, those
     * two conditions almost never coincide, and every empty on the board
     * reported "no shipment opportunity" against two dozen perfectly open
     * loads. That is not a demonstration of matching; it is a demonstration of
     * a filter.
     *
     * So a share of the open loads are handed to the transporter that already
     * has a box waiting at that quay — which is exactly the call a dispatcher
     * makes: give the run to the truck that is going there anyway. The load is
     * re-priced against its new transporter's own grid on the way through.
     */
    const ZONE_KEYWORDS: readonly (readonly [string, string])[] = [
      ['doraleh', 'doraleh'],
      ['sgtd', 'sgtd'],
      ['pk12', 'pk12'],
      ['damerjog', 'damerjog'],
      ['diftz', 'diftz'],
      ['tadjourah', 'tadjourah'],
      ['djibouti', 'djibouti-port'],
    ];
    /** Mirrors `zoneOf` in `features/empty-returns/matching.ts`. */
    function zoneOf(place: string | null | undefined): string {
      const text = (place ?? '').trim().toLowerCase();
      if (!text) return '';
      for (const [keyword, zone] of ZONE_KEYWORDS) if (text.includes(keyword)) return zone;
      return text;
    }

    /* Longest-remaining first, not longest-waiting.
     *
     * `findAvailableEmpties` orders by `emptyReadyAt` ascending — the box that
     * has been sitting longest, which is the right order for a returns queue
     * because that one is closest to detention. It is the wrong order to build
     * a pairing from: the box nearest its deadline yields a match with two
     * hours of margin, flagged "tight", and every option on the board reads as
     * a decision somebody has already half-lost. Pairing the boxes with time
     * left over gives the same demonstration with room in it. */
    const poolForAlignment = [...(await emptyReturns.findAvailableEmpties())].sort(
      (a, b) =>
        (b.containerReturnDeadline?.getTime() ?? 0) - (a.containerReturnDeadline?.getTime() ?? 0),
    );
    const loadsForAlignment = await emptyReturns.findOpenFullLoads();
    let alignedLoads = 0;
    for (const load of loadsForAlignment) {
      if (alignedLoads >= 14) break;
      const quay = zoneOf(load.shipment?.pickupLocationName);
      const empty = poolForAlignment.find(
        (row) =>
          row.partnerId &&
          row.partnerId !== load.partnerId &&
          zoneOf(row.containerReturnDepot) === quay,
      );
      if (!empty?.partnerId) continue;
      const fleet = fleets.find((row) => row.partnerId === empty.partnerId);
      if (!fleet || fleet.vehicles.length === 0) continue;
      const fitting = fleet.vehicles
        .map((vehicle, index) => ({ vehicle, index }))
        .filter((entry) => entry.vehicle.truckType === load.vehicle?.truckType);
      const slot = fitting.length > 0 ? fitting[int(0, fitting.length - 1)]!.index : int(0, fleet.vehicles.length - 1);
      try {
        await bookings.update(load.id, {
          partnerId: fleet.partnerId,
          vehicleId: fleet.vehicles[slot]!.id,
          driverId: fleet.drivers[slot]!.id,
          /* Without this the re-price cannot resolve a tier and the load lands
           * uncosted — see `BookingsService.update`. */
          vehicleType: fleet.vehicles[slot]!.truckType,
        });
        alignedLoads += 1;
      } catch {
        /* The service is the authority on whether the move is legal. */
      }
    }
    console.log(`\uD83E\uDD1D ${alignedLoads} open loads handed to the transporter already at that quay`);

    /* ── Pairings still running ───────────────────────────────────────────
     *
     * A handful of matches confirmed in the last day or two, with the truck
     * still working through them. Written deliberately rather than left to
     * fall out of the month loop, because the window a cycle stays open in is
     * genuinely narrow — a return leg is hours, not days — and a board that
     * shows six hundred closed cycles and nothing in flight cannot demonstrate
     * what the states mean or that they move.
     *
     * Each is a real `createCycle` against a real waiting empty and a real
     * open load, then the outbound truck is walked a rung or two so the cycle
     * mirrors it: still to start (preparing), driver on it (ready), rolling
     * (in progress). Nothing here is set directly — the cycle's status is read
     * off its load exactly as it is in production.
     */
    const LIVE_CYCLE_TARGET = 9;
    const waiting = (await emptyReturns.findAvailableEmpties()).filter((row) => row.status !== 'Completed');
    const openLoads = await emptyReturns.findOpenFullLoads();
    let runningPairings = 0;
    for (const load of openLoads) {
      if (runningPairings >= LIVE_CYCLE_TARGET) break;
      const empty = waiting[runningPairings];
      if (!empty) break;
      let cycleId: string;
      try {
        const cycle = await emptyReturns.createCycle({ bookingId: empty.id, nextBookingId: load.id });
        cycleId = cycle.id;
      } catch {
        continue;
      }
      const matchedAt = addHours(NOW, -(3 + int(1, 40)));
      await backdate('empty_return_cycles', cycleId, {
        createdAt: matchedAt,
        updatedAt: matchedAt,
        emptyReadyAt: empty.emptyReadyAt,
      });
      const forced = await prisma.bookingTimelineStep.findFirst({
        where: { bookingId: load.id, key: 'vehicle_assignment' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (forced) await backdate('booking_timeline_steps', forced.id, { timestamp: matchedAt, createdAt: matchedAt });

      /* How far the truck has got — one of each, so every cycle state is on
       * the board. */
      const rungs = ['Driver Assigned', 'Heading to Pickup'].slice(0, runningPairings % 3);
      let when = matchedAt;
      for (const rung of rungs) {
        when = addHours(when, 0.5 + rnd() * 2);
        if (when > NOW) break;
        await bookings.updateStatus(load.id, { status: rung as never, occurredAt: when.toISOString() });
      }
      runningPairings += 1;
    }
    console.log(`🔗 ${runningPairings} pairings left running for the board`);

    /**
     * Last sweep, and the one that keeps the returns queue honest.
     *
     * A box that was waiting for a load when its free time ran out does not go
     * on waiting — Operations stops matching and sends it back alone, because
     * every further day is detention on the bill. Without this the pool keeps
     * whatever the last month left in it, deadline or no deadline, and the
     * overdue list grows without limit.
     *
     * What survives is exactly what should: boxes still inside their allowance,
     * genuinely awaiting a matching decision.
     */
    for (const empty of empties) {
      if (!empty.deadline || empty.deadline > NOW) continue;
      await returnStandalone(empty);
      standaloneReturns += 1;
    }
    empties = empties.filter((empty) => !empty.deadline || empty.deadline > NOW);

    console.log(`🔁 ${cycleCount} empty-return cycles matched`);


    interface Schedule {
      /** When the job was booked — always ahead of the truck rolling. */
      createdAt: Date;
      /** Hours-of-the-day for each rung of the road leg, keyed by status. */
      road: Record<string, Date>;
      /** The drop: cargo on the ground in the free zone. */
      podAt: Date;
      /** A bulk or liquid job has no box, so it closes on the drop. */
      plainClose: Date;
      /** The budgeted close — this mission's container back at the terminal. */
      closeAt: Date;
    }

    /**
     * One mission's clock, drawn per shipment.
     *
     * Every leg is a fresh draw rather than a constant, because the whole point
     * of the mission report is to show where a *particular* day went: a
     * terminal queue that ran to three hours, a depotage that dragged. A fixed
     * offsets table makes every report in the system identical and every
     * "longest stage" the same stage.
     *
     * The gate wait is the one deliberately fat distribution — queueing for a
     * slot at Doraleh is the corridor's real bottleneck, and one job in six
     * waits hours for it.
     */
    function scheduleFor(shipment: SeededShipment, pace: 'clean' | 'slow'): Schedule {
      const pickup = shipment.pickupTime;
      const transitHours = Math.max(0.5, shipment.km / 30) * (0.85 + rnd() * 0.5);
      const toTerminal = 0.4 + rnd() * 0.8; // dispatch → rolling
      const drive = 0.5 + rnd() * 0.7; // yard → terminal gate
      const gateWait = chance(0.17) ? 2.5 + rnd() * 3 : 0.4 + rnd() * 1.4; // queue for a slot
      const loading = 0.8 + rnd() * 1.6;
      const sealAndGo = 0.2 + rnd() * 0.5;
      const dropWait = chance(0.22) ? 1.5 + rnd() * 2.5 : 0.3 + rnd() * 0.9;
      const unloading = 1 + rnd() * 2.5;
      const podLag = 0.3 + rnd() * 1.2;

      let h = -int(2, 20) / 60; // dispatch decided just before roll-out
      const road: Record<string, Date> = {};
      road['Assigned'] = addHours(pickup, h);
      road['Driver Assigned'] = addHours(pickup, (h += 0.1 + rnd() * 0.4));
      road['Heading to Pickup'] = addHours(pickup, (h += toTerminal));
      road['At Pickup'] = addHours(pickup, (h += drive));
      road['Loading'] = addHours(pickup, (h += gateWait));
      road['Loaded'] = addHours(pickup, (h += loading));
      road['En Route'] = addHours(pickup, (h += sealAndGo));
      road['Arrived'] = addHours(pickup, (h += transitHours));
      road['Unloading'] = addHours(pickup, (h += dropWait));
      road['POD Submitted'] = addHours(pickup, (h += unloading + podLag));

      const podAt = road['POD Submitted']!;
      /* Booked ahead of the truck rolling — half a day to a day and a half,
       * which is how far ahead a free-zone consignee actually books a slot.
       *
       * Capped at `NOW`, because a row cannot have been created in the future.
       * The book deliberately runs a week or so past today — upcoming work is
       * most of what an operator looks at — and without this cap those pickups
       * dragged their creation timestamps along with them. Six shipments ended
       * up stamped as created up to nine days from now, and since the Shipments
       * directory sorts newest-created-first, nothing anybody actually created
       * today could ever reach the top of the list. Reported 2026-09-01 as
       * "I create a shipment and it disappears"; it was sitting at row seven,
       * under a wall of work booked next week. */
      const createdAt = new Date(Math.min(addHours(pickup, -int(12, 36)).getTime(), NOW.getTime()));
      const span =
        pace === 'clean'
          ? MISSION_DAYS_MIN + rnd() * (MISSION_DAYS_MAX - MISSION_DAYS_MIN)
          : MISSION_DAYS_MAX + rnd() * (MISSION_DAYS_CEILING - MISSION_DAYS_MAX);
      let closeAt = addDays(createdAt, span);
      /* A box cannot go back before it has been dropped and stripped. */
      const earliest = addHours(podAt, 8);
      if (closeAt < earliest) closeAt = earliest;

      return { createdAt, road, podAt, plainClose: addHours(podAt, 0.2 + rnd() * 0.8), closeAt };
    }

    interface ReturnLeg {
      emptyReadyAt: Date;
      pickedUpAt: Date;
      closeAt: Date;
    }

    /**
     * One container's own way home, inside the mission's budget.
     *
     * The depotage is what the budget *leaves* rather than a draw of its own —
     * which is also the operational truth: the drive back is an hour and the
     * dispatch is a phone call, so the time a box spends out is almost entirely
     * the time the consignee took to strip it. Deriving it this way is what
     * keeps a mission inside its span instead of letting three independent
     * legs stack up past it.
     *
     * `index` staggers the boxes on a multi-container job — one yard does not
     * empty twenty containers on the same minute.
     */
    function returnLegFor(schedule: Schedule, index: number): ReturnLeg {
      const dispatchHours = 1.5 + rnd() * 10; // stripped → a truck is on it
      const returnLegHours = 1.5 + rnd() * 6; // free zone → the terminal gate
      const ceiling = addDays(schedule.createdAt, MISSION_DAYS_CEILING);
      let target = addHours(schedule.closeAt, index === 0 ? 0 : rnd() * 6);
      if (target > ceiling) target = ceiling;
      let depotageHours =
        (target.getTime() - schedule.podAt.getTime()) / HOUR - dispatchHours - returnLegHours;
      if (depotageHours < 3) depotageHours = 3 + rnd() * 5;
      const emptyReadyAt = addHours(schedule.podAt, depotageHours);
      const pickedUpAt = addHours(emptyReadyAt, dispatchHours);
      return { emptyReadyAt, pickedUpAt, closeAt: addHours(pickedUpAt, returnLegHours) };
    }

    /**
     * Weld a stripped empty to the load a truck is going out to collect, then
     * run the box home.
     *
     * The return leg is the delivery leg backwards: out of the free zone, back
     * into the container terminal the box came off (`containerReturnDepot`).
     * Both rungs are walked on the booking itself with the hour each really
     * happened, so `Booking.completedAt`, the cycle's `returnedAt` and the
     * timeline all agree — `updateStatus('Completed')` on a containerized
     * booking calls `recordReturnedAt` with that same moment.
     */
    async function runEmptyBackToPort(
      empty: SeededBooking,
      nextBookingId: string,
      outboundAssignedAt: Date,
      cap: ReturnRung,
      nextAtPickup: Date | null = null,
    ): Promise<boolean> {
      if (!empty.emptyReadyAt || !empty.pickedUpAt || !empty.closeAt) return false;
      /* The weld is physical. The truck that collects this empty at the free
       * zone is the truck that gates in at the port with the next load an
       * hour or two later — so the box's own pickup is timed off the load's
       * road, not drawn on its own. Left independent, the book recorded boxes
       * collected on a Monday under loads gated in on the Thursday: a truck
       * that went home in between, which is exactly the case the Fleetin
       * Impact record refuses, and the demo showed no impact at all.
       * Never earlier than the box was stripped, and never after the gate. */
      if (nextAtPickup) {
        const collectedAt = new Date(
          Math.max(
            addHours(nextAtPickup, -(1 + rnd() * 2)).getTime(),
            addHours(empty.emptyReadyAt, 0.5).getTime(),
          ),
        );
        if (collectedAt < nextAtPickup) {
          empty.pickedUpAt = collectedAt;
          empty.closeAt = addHours(collectedAt, 1.5 + rnd() * 4);
        }
      }
      /* A load already past `Arrived` will close this cycle the moment it is
       * advanced. If the box could not physically be home by then, pairing the
       * two would have the module stamp a return that has not happened — so it
       * is left in the pool for a later load instead. */
      if (cap === 'Completed' && empty.closeAt > NOW) return false;
      let cycleId: string;
      try {
        const cycle = await emptyReturns.createCycle({ bookingId: empty.id, nextBookingId });
        cycleId = cycle.id;
      } catch {
        /* Already claimed, or no longer eligible — the service is the
         * authority on that, not this loop. */
        return false;
      }
      /* The pairing was decided between the box being stripped and a truck
       * arriving for it. The module reads `createdAt` as the moment of the
       * match, so it has to sit inside that window. */
      const matchedAt = addHours(empty.emptyReadyAt, 0.5 + rnd() * 4);
      await backdate('empty_return_cycles', cycleId, {
        createdAt: matchedAt,
        updatedAt: matchedAt,
        emptyReadyAt: empty.emptyReadyAt,
      });
      /* `createCycle` commits the outbound load with a hand-written "Assigned"
       * row stamped `new Date()` — the one timeline row in the whole dataset
       * the services cannot be told the time of. */
      const forced = await prisma.bookingTimelineStep.findFirst({
        where: { bookingId: nextBookingId, key: 'vehicle_assignment' },
        orderBy: { createdAt: 'desc' },
        select: { id: true },
      });
      if (forced) await backdate('booking_timeline_steps', forced.id, { timestamp: outboundAssignedAt, createdAt: outboundAssignedAt });

      await walkReturnLeg(empty, cap);
      return true;
    }

    /**
     * Walk the box home as far as the clock actually allows.
     *
     * A match is not an instant event — the truck collects the empty hours
     * after the pairing is agreed and reaches the terminal hours after that. So
     * a box matched two days ago is home, and one matched this morning is on
     * the road, and the board has to be able to show both. Stopping at the rung
     * `NOW` has reached is what puts live cycles on it: a cycle mirrors its
     * outbound load's status, so an unfinished return leg is exactly what
     * "preparing", "ready" and "in progress" mean.
     *
     * Refusing to match anything whose leg had not finished — the obvious
     * shortcut — left every cycle in the book closed and the Control Tower
     * with nothing in flight to look at.
     */
    async function walkReturnLeg(empty: SeededBooking, cap: ReturnRung = 'Completed'): Promise<void> {
      if (!empty.pickedUpAt || !empty.closeAt) return;
      if (cap === 'Empty Ready') return; // committed to a truck, not collected
      if (empty.pickedUpAt > NOW) return; // matched, truck not there yet
      await bookings.updateStatus(empty.id, { status: 'Empty Picked Up' as never, occurredAt: empty.pickedUpAt.toISOString() });
      if (cap === 'Empty Picked Up') return; // on the road back
      if (empty.closeAt > NOW) return;
      await bookings.updateStatus(empty.id, { status: 'Completed' as never, occurredAt: empty.closeAt.toISOString() });
      empty.completedAt = empty.closeAt;
    }

    /**
     * The box goes back on its own.
     *
     * No load turned up to pair it with, so Operations stops matching, plans
     * the slot and sends it back empty — a wasted leg, and cheaper than the
     * detention. `emptyReturnException` is the flag that records that decision;
     * completing the booking then mints the closed cycle through
     * `recordReturnedAt`, exactly as a matched return does.
     */
    async function returnStandalone(empty: SeededBooking): Promise<void> {
      if (!empty.pickedUpAt || !empty.closeAt) return;
      try {
        await emptyReturns.markStandalone(empty.id, empty.pickedUpAt.toISOString());
        await walkReturnLeg(empty);
      } catch {
        /* Already matched or ineligible — the service decides, not this loop. */
      }
    }

    /**
     * Move the shipment onto the same clock its bookings are already on.
     *
     * The bookings carry real times because every rung was walked with
     * `occurredAt`. Two things above them cannot be: `@default(now())` columns,
     * and the rollup timeline `syncShipmentFromBookings` writes — it stamps
     * `new Date()` because it is a derivation, not a report.
     *
     * So the shipment's own rungs are read back **out of its bookings**: a job
     * reaches a rung the moment its last container does, which is the same rule
     * `deriveShipmentStatus` already applies to the status itself. Nothing here
     * invents a time; it copies one.
     */
    async function placeShipmentInTime(shipment: SeededShipment, schedule: Schedule): Promise<void> {
      const rungs = await prisma.$queryRawUnsafe<{ key: string; last: Date | null }[]>(
        `SELECT s.\`key\` AS \`key\`, MAX(s.timestamp) AS last
           FROM booking_timeline_steps s
           JOIN bookings b ON b.id = s.bookingId
          WHERE b.shipmentId = ? AND b.deletedAt IS NULL AND s.timestamp IS NOT NULL
          GROUP BY s.\`key\``,
        shipment.id,
      );
      const at = new Map(rungs.filter((row) => row.last).map((row) => [row.key, new Date(row.last!)]));

      /* One container still out keeps the whole job open — the same rule the
       * status ladder applies, carried through to the dates. */
      const closure = await prisma.$queryRawUnsafe<{ last: Date | null; open: number }[]>(
        `SELECT MAX(completedAt) AS last,
                SUM(completedAt IS NULL AND status NOT IN ('Cancelled','Failed')) AS open
           FROM bookings WHERE shipmentId = ? AND deletedAt IS NULL`,
        shipment.id,
      );
      const open = Number(closure[0]?.open ?? 0);
      const completedAt = open > 0 || !closure[0]?.last ? null : new Date(closure[0].last);
      shipment.completedAt = completedAt;

      const lastTouch = completedAt ?? [...at.values()].reduce((max, d) => (d > max ? d : max), schedule.createdAt);
      await backdate('shipments', shipment.id, {
        createdAt: schedule.createdAt,
        updatedAt: lastTouch,
        scheduledPickupTime: shipment.pickupTime,
        completedAt,
      });

      const steps = await prisma.shipmentTimelineStep.findMany({
        where: { shipmentId: shipment.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true, key: true },
      });
      for (const step of steps) {
        const when = step.key === 'creation' ? schedule.createdAt : (at.get(step.key) ?? completedAt ?? lastTouch);
        await backdate('shipment_timeline_steps', step.id, { timestamp: when, createdAt: when });
      }

      /* The bookings' own rungs are already honest — every one was walked with
       * `occurredAt`. Their *creation* is not: `@default(now())` fires when the
       * seed runs, so a booking closed in June claimed to have been created in
       * August and every mission-duration figure came out negative. The
       * booking was raised with its shipment, so it is dated with it. */
      for (const booking of shipment.bookings) {
        const own = await prisma.$queryRawUnsafe<{ last: Date | null }[]>(
          'SELECT MAX(timestamp) AS last FROM `booking_timeline_steps` WHERE bookingId = ? AND timestamp IS NOT NULL',
          booking.id,
        );
        const touched = own[0]?.last ? new Date(own[0].last) : schedule.createdAt;
        await backdate('bookings', booking.id, {
          createdAt: schedule.createdAt,
          updatedAt: booking.completedAt ?? touched,
          scheduledPickupTime: shipment.pickupTime,
        });
        const creation = await prisma.bookingTimelineStep.findFirst({
          where: { bookingId: booking.id, key: 'creation' },
          select: { id: true },
        });
        if (creation) {
          await backdate('booking_timeline_steps', creation.id, {
            timestamp: schedule.createdAt,
            createdAt: schedule.createdAt,
          });
        }
      }
    }

    /* ── The container cycle, reconciled ─────────────────────────────────── */

    /**
     * One correction pass, over one column.
     *
     * Every other timestamp in this dataset is written where it happens: each
     * rung is walked with `occurredAt`, so the services themselves stamp the
     * timeline, `emptyReadyAt` and `completedAt` with the hour the yard
     * reported. `EmptyReturnCycle.returnedAt` is the exception, and not by
     * accident — `syncCycleStatusForBooking` re-stamps it with `new Date()`
     * every time the *outbound* load moves, and that load is by definition a
     * later job than the empty it was matched to. So a cycle closed honestly
     * in June is re-dated to today the moment its carrying load reaches
     * Arrived in July.
     *
     * The honest value needs no guessing. The module closes the empty's own
     * booking at the instant the box lands (`closeBookingOnReturn`), so the
     * cycle's `returnedAt` and that booking's `completedAt` are the same
     * moment by construction. This copies the one onto the other.
     */
    /* First, make each booking agree with itself.
     *
     * A closing date and a status are two records of the same fact, and the
     * ladder can separate them: stepping a booking back down the rungs is a
     * legal correction (`isLadderCorrection`), and it rewrites the status
     * without clearing the `completedAt` that a previous close had already
     * stamped. The row is then simultaneously finished and not, and every
     * figure drawn from it depends on which column happens to be read.
     *
     * The date is the honest half — it was written the moment the container
     * physically landed — so the status is brought back to it. */
    await prisma.$executeRawUnsafe(
      `UPDATE \`bookings\` b JOIN \`empty_return_cycles\` c ON c.bookingId = b.id
          SET b.status = 'Completed'
        WHERE b.completedAt IS NOT NULL AND b.status NOT IN ('Completed', 'Cancelled', 'Failed')`,
    );

    await prisma.$executeRawUnsafe(
      `UPDATE \`empty_return_cycles\` c JOIN \`bookings\` b ON b.id = c.bookingId
          SET c.returnedAt = b.completedAt, c.status = 'completed', c.updatedAt = b.completedAt
        WHERE b.status = 'Completed' AND b.completedAt IS NOT NULL`,
    );
    /* The mirror of it: a box that is not back has no return date, whatever
     * the outbound load's hook wrote. Such a cycle sits wherever that load has
     * got to — which is exactly what the cycle board exists to show. */
    await prisma.$executeRawUnsafe(
      `UPDATE \`empty_return_cycles\` c JOIN \`bookings\` b ON b.id = c.bookingId
          SET c.returnedAt = NULL
        WHERE b.status <> 'Completed' OR b.completedAt IS NULL`,
    );
    const liveCycles = await prisma.emptyReturnCycle.findMany({
      where: { returnedAt: null },
      select: { id: true, nextBooking: { select: { status: true } } },
    });
    for (const cycle of liveCycles) {
      const mapped = cycle.nextBooking ? cycleStatusForBookingStatus(cycle.nextBooking.status) : null;
      await prisma.emptyReturnCycle.update({
        where: { id: cycle.id },
        data: { status: mapped && mapped !== 'completed' ? mapped : 'preparing' },
      });
    }

    /**
     * The invariant this whole module turns on, asserted rather than assumed:
     * **no container mission is closed while its container is out.**
     *
     * It should already hold — `BookingsService.updateStatus` refuses to
     * complete a containerized booking whose cycle has no `returnedAt`, and
     * this seed only ever completes one by walking that rung with the hour the
     * box landed. The check stays because it is cheap and because the failure
     * it catches is the one that reads worst on a printed report: "Mission
     * closed" on the line above "Empty returned: pending".
     */
    const contradictions = await prisma.$queryRawUnsafe<{ n: bigint }[]>(
      `SELECT COUNT(*) AS n FROM \`bookings\` b
         JOIN \`empty_return_cycles\` c ON c.bookingId = b.id
        WHERE b.completedAt IS NOT NULL AND c.returnedAt IS NULL`,
    );
    if (Number(contradictions[0]?.n ?? 0) > 0) {
      throw new Error(`${contradictions[0]!.n} closed booking(s) still have a container out — the ladder let one through`);
    }

    /* The bookings moved after their own shipment was placed in time — an
     * empty from March is only closed once a load in April goes out to fetch
     * it. So the jobs above them are re-derived through the real sync, and
     * then re-dated off the containers they now cover. */
    for (const shipment of allShipments) {
      await syncShipmentFromBookings(prisma, shipment.id);
    }
    for (const shipment of allShipments) {
      if (shipment.schedule) await placeShipmentInTime(shipment, shipment.schedule);
      const derived = await prisma.shipment.findUniqueOrThrow({
        where: { id: shipment.id },
        select: { status: true },
      });
      shipment.status = derived.status;
    }

    /* A timeline row carries two dates: `timestamp` is when the thing happened,
     * `createdAt` is when the row was written. Every rung here was reported
     * with `occurredAt`, so the first is right and the second is the seed's own
     * clock — and several lists order by it. One sweep puts the record of the
     * event on the same day as the event. */
    for (const table of ['booking_timeline_steps', 'shipment_timeline_steps']) {
      await prisma.$executeRawUnsafe(
        `UPDATE \`${table}\` SET \`createdAt\` = \`timestamp\` WHERE \`timestamp\` IS NOT NULL`,
      );
    }

    const [returnedTotal, outstandingTotal, pooledTotal] = await Promise.all([
      prisma.emptyReturnCycle.count({ where: { returnedAt: { not: null } } }),
      prisma.emptyReturnCycle.count({ where: { returnedAt: null } }),
      prisma.booking.count({
        where: { deletedAt: null, containerNumber: { not: null }, emptyReadyAt: { not: null }, asEmpty: null },
      }),
    ]);
    console.log(
      `↩️  empty returns — ${returnedTotal} boxes back at the terminal, ${outstandingTotal} still running, ${pooledTotal} stripped and waiting in the pool`,
    );
    console.log(`🚛 ${standaloneReturns} empties sent back standalone`);

    /* ── Payout holds ────────────────────────────────────────────────────── */

    const completed = allShipments.filter((shipment) => shipment.status === 'Completed');
    const heldShipmentIds = new Set<string>();
    const holdCandidates = completed.filter((_, index) => index % 23 === 7).slice(0, 6);
    for (const [index, shipment] of holdCandidates.entries()) {
      const hold = await holds.raise(
        shipment.id,
        {
          category: pick(['weight_mismatch', 'damage', 'documentation'] as const),
          reason: pick([
            'Weighbridge ticket is 1.8t under the manifest — awaiting the transporter\'s explanation.',
            'Container arrived with a damaged door seal; survey report pending.',
            'PoD is unsigned by the consignee — chasing a countersigned copy.',
          ]),
        },
        actorId,
        actorName,
      );
      const raisedAt = addDays(shipment.completedAt ?? shipment.pickupTime, 1);
      await backdate('payout_holds', hold.id, { raisedAt });
      holdCount += 1;
      /* Half are resolved and let the money through; the rest stay open, which
       * is what a real payout queue looks like. */
      if (index % 2 === 0) {
        await holds.clear(hold.id, actorId, actorName, 'Resolved with the transporter — released for payout.');
        await backdate('payout_holds', hold.id, { clearedAt: addDays(raisedAt, int(2, 6)) });
      } else {
        heldShipmentIds.add(shipment.id);
      }
    }
    console.log(`🛑 ${holdCount} payout holds (${heldShipmentIds.size} still open)`);

    /* ── Release and pay ─────────────────────────────────────────────────── */

    let releasedCount = 0;
    let paidOrders = 0;
    for (const shipment of completed) {
      if (heldShipmentIds.has(shipment.id)) continue;
      /* A slice of the most recent deliveries is deliberately left unreleased —
       * that backlog is the finance desk's actual daily work. */
      if (shipment.monthIndex === MONTHS.length - 1 && chance(0.4)) continue;

      const releasedAt = addDays(shipment.completedAt ?? shipment.pickupTime, int(1, 3));
      await shipments.release(shipment.id, actorId, actorName);
      await backdate('shipments', shipment.id, { payoutReleasedAt: releasedAt });
      releasedCount += 1;

      /* Not everything released is paid yet — the tail of the queue is what
       * the payout screen exists to show. */
      if (chance(0.12)) continue;

      for (const partnerId of shipment.partnerIds) {
        const paidAt = addDays(releasedAt, int(1, 5));
        try {
          const order = await paymentOrders.payTransporter(
            { shipmentId: shipment.id, transporterId: partnerId, bankAccountId: operatingAccount.id, paymentMethod: 'bank_transfer' },
            actorId,
            actorName,
          );
          await backdate('payment_orders', order.id, { createdAt: paidAt, updatedAt: paidAt, approvedAt: paidAt, paidAt });
          await prisma.$executeRawUnsafe(
            'UPDATE `payments` p JOIN `payment_allocations` a ON a.`paymentId` = p.`id` SET p.`paidAt` = ?, p.`createdAt` = ? WHERE a.`paymentOrderId` = ?',
            sqlDate(paidAt),
            sqlDate(paidAt),
            order.id,
          );
          await backdateLedgerFor(order.id, paidAt);
          paidOrders += 1;
        } catch (error) {
          console.warn(`   ⚠️  payout skipped for ${shipment.reference}: ${(error as Error).message}`);
        }
      }
    }
    console.log(`💸 ${releasedCount} shipments released, ${paidOrders} transporter payment orders paid`);

    /* ── Monthly statements ──────────────────────────────────────────────── */

    let statementCount = 0;
    let settledCount = 0;
    for (const [monthIndex, month] of MONTHS.entries()) {
      for (const shipper of shipperIds) {
        const statement = await invoices.issueMonthlyStatement(
          { shipperId: shipper.id, year: month.year, month: month.month },
          actorId,
          actorName,
        );
        if (!statement) continue;
        statementCount += 1;

        const issuedAt = month.isCurrent ? NOW : addDays(month.end, 1);
        await backdate('invoices', statement.id, { createdAt: issuedAt, updatedAt: issuedAt, issueDate: issuedAt, sentAt: issuedAt });
        await prisma.invoice.update({ where: { id: statement.id }, data: { status: 'Sent' } });

        /* Everything older than last month is settled; last month is still
         * out, and the current month has not been billed for real yet. */
        const isSettled = monthIndex < MONTHS.length - 2 ? chance(0.94) : monthIndex === MONTHS.length - 2 ? chance(0.45) : false;
        if (!isSettled) continue;

        const paidAt = addDays(issuedAt, int(5, 22));
        await invoices.markPaid(statement.id, operatingAccount.id, actorId, actorName);
        await backdate('invoices', statement.id, { updatedAt: paidAt });
        await prisma.$executeRawUnsafe(
          'UPDATE `payments` p JOIN `payment_allocations` a ON a.`paymentId` = p.`id` SET p.`paidAt` = ?, p.`createdAt` = ? WHERE a.`invoiceId` = ?',
          sqlDate(paidAt),
          sqlDate(paidAt),
          statement.id,
        );
        await backdateLedgerFor(statement.id, paidAt);

        /* The shipments on a settled statement are paid, and say so. */
        const missionIds = Array.isArray(statement.missionIds) ? (statement.missionIds as string[]) : [];
        if (missionIds.length > 0) {
          await prisma.shipment.updateMany({ where: { id: { in: missionIds } }, data: { paymentStatus: 'Paid' } });
        }
        settledCount += 1;
      }
    }
    console.log(`🧾 ${statementCount} monthly statements (${settledCount} settled)`);

    /* ── Drawdowns against the facility ──────────────────────────────────── */

    for (const [monthIndex, month] of MONTHS.entries()) {
      if (monthIndex % 2 !== 0) continue;
      const amount = int(3, 7) * 1_000_000;
      const disbursedAt = addDays(month.start, int(2, 8));
      const drawdown = await drawdowns.create({ facilityId: facility.id, amountMinorUnits: amount, daysUntilDue: 45 }, actorId, actorName);
      await backdate('drawdowns', drawdown.id, { createdAt: disbursedAt, disbursedAt, dueAt: addDays(disbursedAt, 45) });
      await backdateLedgerFor(drawdown.id, disbursedAt);

      /* The older ones have been repaid; the most recent is still outstanding. */
      if (monthIndex < MONTHS.length - 2) {
        const repaidAt = addDays(disbursedAt, int(30, 44));
        await drawdowns.repay(drawdown.id, { amountMinorUnits: amount }, actorId, actorName);
        await prisma.$executeRawUnsafe(
          'UPDATE `ledger_entries` SET `entryDate` = ?, `postedAt` = ? WHERE `sourceId` = ? AND `type` = ?',
          sqlDate(repaidAt),
          sqlDate(repaidAt),
          drawdown.id,
          'drawdown_repayment',
        );
      }
    }
    console.log('🏦 Facility drawdowns recorded');

    /* ── Internal expenses ───────────────────────────────────────────────── */

    let expenseCount = 0;
    for (const month of MONTHS) {
      for (const template of EXPENSE_TEMPLATES) {
        const incurredAt = new Date(Date.UTC(month.year, month.month - 1, template.category === 'SALARY' ? 28 : int(3, 20), 10));
        if (incurredAt > NOW) continue;
        const amount = Math.round(template.amount * (0.94 + rnd() * 0.12));
        const paid = !month.isCurrent || chance(0.5);
        const expense = await prisma.expenseEntry.create({
          data: {
            number: await nextReferenceField(prisma.expenseEntry, 'number', 'EXP'),
            category: template.category,
            description: template.description,
            amountMinorUnits: BigInt(amount),
            currency: 'DJF',
            fxRate: 1.0,
            baseAmountMinorUnits: BigInt(amount),
            incurredAt,
            paidById: actorId,
            paidByName: actorName,
            method: template.method,
            status: paid ? 'Paid' : 'Pending',
            isRecurring: true,
            createdById: actorId,
            createdByName: actorName,
            approvedById: paid ? actorId : null,
            approvedByName: paid ? actorName : null,
            approvedAt: paid ? incurredAt : null,
            paidAt: paid ? incurredAt : null,
          },
        });
        await backdate('expense_entries', expense.id, { createdAt: incurredAt, updatedAt: incurredAt });

        if (paid) {
          const entry = await ledger.append({
            entryDate: incurredAt,
            type: 'expense',
            direction: 'OUT',
            amountMinorUnits: BigInt(amount),
            currency: 'DJF',
            fxRate: 1.0,
            baseAmountMinorUnits: BigInt(amount),
            counterpartyType: 'VENDOR',
            counterpartyId: expense.id,
            counterpartyName: template.description,
            sourceType: 'expense',
            sourceId: expense.id,
            description: `${template.category} — ${template.description}`,
            createdById: actorId,
            createdByName: actorName,
          });
          if (entry && typeof entry === 'object' && 'id' in entry) {
            await backdate('ledger_entries', String(entry.id), { postedAt: incurredAt });
          }
        }
        expenseCount += 1;
      }
    }
    console.log(`🧮 ${expenseCount} internal expense entries`);

    /* ── Portal logins point at real counterparties ──────────────────────── */

    /**
     * The book is a closed list now, so a portal account can only point inside
     * it. `reset()` released every `shipperId`/`partnerId` before deleting the
     * companies they referenced; this is where they are given a real one back.
     *
     * The display name goes with it. A login labelled "Red Sea Express (Demo)"
     * sitting on GEMINI's data is worse than no label — the header, the
     * sidebar and every "acting as" line would name a company that no longer
     * exists anywhere in the system.
     */
    const portalShipper = shipperIds[0]!;
    const portalPartner = fleets[0]!;
    await prisma.user.updateMany({
      where: { role: { name: 'SHIPPER' } },
      data: { shipperId: portalShipper.id, firstName: portalShipper.name, lastName: '(Demo)' },
    });
    await prisma.user.updateMany({
      where: { role: { name: 'TRANSPORTER' } },
      data: { partnerId: portalPartner.partnerId, firstName: portalPartner.name, lastName: '(Demo)' },
    });
    console.log(`🔗 Portal logins bound to ${portalShipper.name} / ${portalPartner.name}`);

    /* ── Garages, and the repositioning the pairings above did not drive ── */

    /* Every transporter gets a yard, then every pairing is judged: the
       continuations that physically happened get their `Free Zone → Garage →
       Port` measured. Without this the Fleetin Impact block reads realized
       matches and no kilometres — see seed-garages.ts. */
    await seedGarages(prisma, app.get(CarbonImpactService));

    /* ── What landed ─────────────────────────────────────────────────────── */

    const [shipmentTotal, bookingTotal, cycleTotal, chainTotal, invoiceTotal, orderTotal, ledgerTotal, account] = await Promise.all([
      prisma.shipment.count(),
      prisma.booking.count(),
      prisma.emptyReturnCycle.count(),
      prisma.emptyReturnChain.count(),
      prisma.invoice.count(),
      prisma.paymentOrder.count(),
      prisma.ledgerEntry.count(),
      prisma.bankAccount.findUnique({ where: { id: operatingAccount.id } }),
    ]);

    console.log('\n🎉 Volume seed complete');
    console.log(`   shipments ${shipmentTotal} · bookings ${bookingTotal} · cycles ${cycleTotal} in ${chainTotal} chains`);
    console.log(`   invoices ${invoiceTotal} · payment orders ${orderTotal} · ledger entries ${ledgerTotal}`);
    console.log(`   operating account balance: ${Number(account?.currentBalance ?? 0n).toLocaleString()} DJF`);
  } finally {
    await app.close();
  }
}

main().catch((error) => {
  console.error('❌ Volume seed failed:', error);
  process.exit(1);
});
