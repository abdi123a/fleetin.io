/**
 * Volume seed — six months of real operations, written through the real services.
 *
 * `prisma/seed.ts` seeds the baseline: roles, the admin, and the handful of
 * fixed records the frontend mocks were built around. It is a fixture, not a
 * dataset — seventeen shipments is not enough to tell whether the dashboards,
 * the BI tabs, the finance queues or the empty-return chains actually work.
 *
 * This file is the dataset. Two rules shape it:
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
 *     would pile six months of history onto today. Once a shipment is fully
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
import { nextReferenceField } from '../src/common/helpers/reference.util';

/** The first shipper this file creates. Its presence means the volume seed already ran. */
const SENTINEL_SHIPPER_REFERENCE = 'SHP-201';

/** Fleetin's house commission, percent of the shipper-facing total. */
const COMMISSION_PCT = 8;

/**
 * Shipments created per month, oldest month first — a book that grows, with
 * the current month partial because it is still running. ~330 in total, which
 * is what makes the analytics tabs worth looking at; twenty a month draws a
 * chart of nothing.
 */
const SHIPMENTS_PER_MONTH = [48, 54, 52, 60, 66, 48];

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

/** The six calendar months the dataset covers, oldest first. */
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

const SHIPPER_SEEDS = [
  { reference: 'SHP-201', name: 'Al Wahda Trading FZCO', industry: 'Import & Distribution', size: 'Medium (51-250)', country: 'Djibouti', address: 'Djibouti Free Zone, Warehouse 14, Djibouti City', contact: { name: 'Nasra Ahmed Guelleh', title: 'Head of Logistics', email: 'nasra@alwahda-fzco.dj', phone: '+253 77 41 22 08' } },
  { reference: 'SHP-202', name: 'Horn Agro Commodities PLC', industry: 'Agriculture & Commodities', size: 'Large (251-1000)', country: 'Ethiopia', address: 'Bole Sub-City, Woreda 03, Addis Ababa', contact: { name: 'Yohannes Bekele', title: 'Supply Chain Director', email: 'y.bekele@hornagro.et', phone: '+251 91 244 7761' } },
  { reference: 'SHP-203', name: 'Blue Nile Cement Import SC', industry: 'Construction Materials', size: 'Large (251-1000)', country: 'Ethiopia', address: 'Kality Industrial Zone, Addis Ababa', contact: { name: 'Meseret Alemu', title: 'Import Manager', email: 'meseret@bluenilecement.et', phone: '+251 91 887 3320' } },
  { reference: 'SHP-204', name: 'Somtel Distribution SARL', industry: 'Telecom & Electronics', size: 'Medium (51-250)', country: 'Djibouti', address: 'Rue de Marseille, Plateau du Serpent, Djibouti City', contact: { name: 'Abdirahman Farah', title: 'Operations Lead', email: 'a.farah@somtel-dist.dj', phone: '+253 77 63 90 14' } },
  { reference: 'SHP-205', name: 'Ethio Textile Group PLC', industry: 'Manufacturing', size: 'Large (251-1000)', country: 'Ethiopia', address: 'Hawassa Industrial Park, Shed 22, Hawassa', contact: { name: 'Selamawit Girma', title: 'Logistics Coordinator', email: 'selam@ethiotextile.et', phone: '+251 92 110 4487' } },
  { reference: 'SHP-206', name: 'Red Sea Foodstuff LLC', industry: 'Food & Beverage', size: 'Small (11-50)', country: 'Djibouti', address: 'Quartier 7, Avenue Nasser, Djibouti City', contact: { name: 'Ismail Hassan Wais', title: 'Managing Director', email: 'ismail@redseafoods.dj', phone: '+253 77 28 55 71' } },
  { reference: 'SHP-207', name: 'Awash Beverages SC', industry: 'Food & Beverage', size: 'Enterprise (1000+)', country: 'Ethiopia', address: 'Sebeta Plant, Oromia Region', contact: { name: 'Dawit Mengistu', title: 'Inbound Logistics Manager', email: 'dawit.m@awashbev.et', phone: '+251 91 552 8814' } },
  { reference: 'SHP-208', name: 'Dire Steel Industries PLC', industry: 'Metals & Heavy Industry', size: 'Large (251-1000)', country: 'Ethiopia', address: 'Dire Dawa Free Trade Zone, Dire Dawa', contact: { name: 'Kalid Yusuf', title: 'Procurement Head', email: 'kalid@diresteel.et', phone: '+251 91 330 2245' } },
  { reference: 'SHP-209', name: 'Tadjoura Fisheries Coop', industry: 'Fisheries', size: 'Micro (1-10)', country: 'Djibouti', address: 'Port de Tadjourah, Tadjourah', contact: { name: 'Fatouma Omar Ali', title: 'Coordinator', email: 'fatouma@tadjourafish.dj', phone: '+253 77 19 06 42' } },
  { reference: 'SHP-210', name: 'Bab el Mandeb Logistics FZE', industry: 'Freight Forwarding', size: 'Medium (51-250)', country: 'Djibouti', address: 'Doraleh Free Zone, Block C, Djibouti City', contact: { name: 'Moustapha Ibrahim', title: 'Country Manager', email: 'm.ibrahim@bab-logistics.dj', phone: '+253 77 84 33 90' } },
] as const;

const PARTNER_SEEDS = [
  { reference: 'PTR-201', name: 'Gulf Horn Transport SARL', country: 'Djibouti', address: 'Route de l\'Aéroport, PK12, Djibouti City', fleet: 34, plate: 'GH', contact: { name: 'Omar Djama Robleh', title: 'Fleet Dispatcher', email: 'dispatch@gulfhorn.dj', phone: '+253 77 55 11 20' } },
  { reference: 'PTR-202', name: 'Sahel Trucking Company', country: 'Djibouti', address: 'Zone Industrielle de Boulaos, Djibouti City', fleet: 26, plate: 'ST', contact: { name: 'Hodan Warsame', title: 'Operations Manager', email: 'ops@saheltrucking.dj', phone: '+253 77 62 08 44' } },
  { reference: 'PTR-203', name: 'Addis Line Logistics PLC', country: 'Ethiopia', address: 'Modjo Dry Port Road, Modjo', fleet: 48, plate: 'AL', contact: { name: 'Tesfaye Wolde', title: 'Transport Coordinator', email: 'tesfaye@addisline.et', phone: '+251 91 470 2213' } },
  { reference: 'PTR-204', name: 'Dikhil Heavy Haulage', country: 'Djibouti', address: 'Route Nationale 1, Dikhil', fleet: 18, plate: 'DH', contact: { name: 'Ali Mohamed Kamil', title: 'Owner', email: 'ali@dikhilhaulage.dj', phone: '+253 77 30 77 65' } },
  { reference: 'PTR-205', name: 'Bahar Freight Services', country: 'Djibouti', address: 'Doraleh Corridor, Djibouti City', fleet: 22, plate: 'BF', contact: { name: 'Saida Abdillahi', title: 'Dispatch Lead', email: 'saida@baharfreight.dj', phone: '+253 77 44 91 03' } },
  { reference: 'PTR-206', name: 'Nagad Transit SARL', country: 'Djibouti', address: 'Nagad, Route de Loyada, Djibouti City', fleet: 15, plate: 'NT', contact: { name: 'Youssouf Abdi Farah', title: 'Transit Manager', email: 'youssouf@nagadtransit.dj', phone: '+253 77 71 26 87' } },
  { reference: 'PTR-207', name: 'Awdal Carriers Ltd', country: 'Djibouti', address: 'Balbala, Quartier 6, Djibouti City', fleet: 20, plate: 'AC', contact: { name: 'Mariam Elmi Jama', title: 'Fleet Supervisor', email: 'mariam@awdalcarriers.dj', phone: '+253 77 90 15 38' } },
  { reference: 'PTR-208', name: 'Obock Container Lines', country: 'Djibouti', address: 'Port d\'Obock, Obock', fleet: 12, plate: 'OC', contact: { name: 'Houssein Mohamed Said', title: 'Operations', email: 'houssein@obockcl.dj', phone: '+253 77 07 62 19' } },
] as const;

const DRIVER_NAMES = [
  'Abdourahman Guedi Hassan', 'Mohamed Ali Djama', 'Ibrahim Osman Farah', 'Said Houmed Barkat',
  'Tesfahun Girma', 'Bekele Tadesse', 'Kassahun Negash', 'Ahmed Warsame Nour',
  'Elias Hailu', 'Omar Ismail Adan', 'Getachew Mulugeta', 'Abdi Nour Hersi',
  'Yonas Desta', 'Mahamoud Ahmed Aden', 'Solomon Tesfaye', 'Ali Robleh Waberi',
  'Daniel Assefa', 'Hassan Moussa Idriss', 'Berhanu Tilahun', 'Djibril Ahmed Egueh',
] as const;

const TRUCK_TYPES = ['40ft Container', '20ft Container', 'Flatbed'] as const;

/** The Djibouti corridor. Distances and durations are the real ones drivers quote. */
const LANES = [
  { from: { name: 'Doraleh Container Terminal', address: 'Doraleh Multipurpose Port, Djibouti', city: 'Djibouti', gate: 'Gate 3' }, to: { name: 'Kality Dry Port', address: 'Kality Industrial Zone, Addis Ababa', city: 'Addis Ababa', gate: 'Gate B' }, km: 910, transitHours: 34, duration: '34h 00m' },
  { from: { name: 'Doraleh Container Terminal', address: 'Doraleh Multipurpose Port, Djibouti', city: 'Djibouti', gate: 'Gate 3' }, to: { name: 'Modjo Dry Port', address: 'Modjo Dry Port, Oromia', city: 'Modjo', gate: 'Gate 1' }, km: 852, transitHours: 31, duration: '31h 00m' },
  { from: { name: 'Port de Djibouti (PDSA)', address: 'Boulevard de la République, Djibouti', city: 'Djibouti', gate: 'Gate 1' }, to: { name: 'Dire Dawa Free Trade Zone', address: 'Dire Dawa Industrial Park', city: 'Dire Dawa', gate: 'Gate A' }, km: 312, transitHours: 12, duration: '12h 00m' },
  { from: { name: 'SGTD Terminal', address: 'Société de Gestion du Terminal à Conteneurs, Djibouti', city: 'Djibouti', gate: 'Gate 2' }, to: { name: 'Djibouti Free Zone (DFZ)', address: 'Djibouti International Free Trade Zone, Damerjog', city: 'Djibouti', gate: 'Gate C' }, km: 24, transitHours: 2, duration: '2h 00m' },
  { from: { name: 'Doraleh Container Terminal', address: 'Doraleh Multipurpose Port, Djibouti', city: 'Djibouti', gate: 'Gate 4' }, to: { name: 'Ali Sabieh Cement Depot', address: 'Route Nationale 5, Ali Sabieh', city: 'Ali Sabieh', gate: 'Depot Gate' }, km: 96, transitHours: 4, duration: '4h 00m' },
  { from: { name: 'Port de Djibouti (PDSA)', address: 'Boulevard de la République, Djibouti', city: 'Djibouti', gate: 'Gate 1' }, to: { name: 'Galafi Border Post', address: 'Galafi Crossing, Dikhil Region', city: 'Galafi', gate: 'Customs Bay 2' }, km: 214, transitHours: 8, duration: '8h 00m' },
  { from: { name: 'Horizon Terminal', address: 'Horizon Djibouti Terminals, Doraleh', city: 'Djibouti', gate: 'Bay 7' }, to: { name: 'Hawassa Industrial Park', address: 'Hawassa Industrial Park, Sidama', city: 'Hawassa', gate: 'Gate 2' }, km: 1120, transitHours: 42, duration: '42h 00m' },
] as const;

const CARGOES = [
  { cargoType: 'Containerized (40ft Rice)', category: 'container_40', goods: 'Bagged white rice, 50kg sacks', weight: 26000, vehicleType: '40ft Container', containerized: true },
  { cargoType: 'Containerized (20ft Sugar)', category: 'container_20', goods: 'Refined sugar in 25kg bags', weight: 21000, vehicleType: '20ft Container', containerized: true },
  { cargoType: 'Containerized (40ft Textiles)', category: 'container_40', goods: 'Cotton fabric rolls, palletized', weight: 18500, vehicleType: '40ft Container', containerized: true },
  { cargoType: 'Containerized (40ft Electronics)', category: 'container_40', goods: 'Consumer electronics, cartoned', weight: 14200, vehicleType: '40ft Container', containerized: true },
  { cargoType: 'Containerized (20ft Spare Parts)', category: 'container_20', goods: 'Automotive spare parts, crated', weight: 16800, vehicleType: '20ft Container', containerized: true },
  { cargoType: 'Bulk (Cement Clinker)', category: 'bulk', goods: 'Cement clinker, loose bulk', weight: 32000, vehicleType: 'Flatbed', containerized: false },
  { cargoType: 'Bulk (Fertilizer)', category: 'bulk', goods: 'Urea fertilizer, bulk tipper load', weight: 30000, vehicleType: 'Flatbed', containerized: false },
  { cargoType: 'Machinery (Excavator)', category: 'machinery', goods: 'Tracked excavator, 21t, lashed on low loader', weight: 21000, vehicleType: 'Flatbed', containerized: false },
] as const;

const SHIPPING_LINES = ['MSC', 'CMA CGM', 'Maersk', 'Hapag-Lloyd', 'OOCL', 'Evergreen'] as const;
const CONTAINER_PREFIXES = ['MSCU', 'CMAU', 'MAEU', 'HLXU', 'OOLU', 'EGHU'] as const;
const RETURN_DEPOTS = ['Doraleh Empty Depot', 'SGTD Empty Yard', 'Damerjog Container Depot', 'PK12 Empty Park'] as const;

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
function nextContainerNumber(): string {
  containerCounter += int(37, 811);
  return `${pick(CONTAINER_PREFIXES)}-${String(containerCounter).padStart(6, '0')}-${int(0, 9)}`;
}

/** DPCS numbers become the shipment's own reference, so they must not repeat. */
let dpcsCounter = 6000;
function nextDpcsReference(): string {
  dpcsCounter += int(1, 4);
  return `DPCS-DJ-${dpcsCounter}`;
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
   * Removes everything a previous run of THIS file created, and nothing else.
   *
   * Volume records are identifiable by construction: shippers are `SHP-2##`,
   * transporters `PTR-2##`, and the finance tables (facilities, drawdowns,
   * expenses, bank movements) had no rows at all before this seed existed.
   * The baseline seed's own fixtures — `SHP-1##`, `PTR-00#`, their shipments,
   * roles, users and HR — are never touched.
   */
  async function reset(): Promise<void> {
    const [volumeShippers, volumePartners] = await Promise.all([
      prisma.shipper.findMany({ where: { reference: { startsWith: 'SHP-2' } }, select: { id: true } }),
      prisma.partner.findMany({ where: { reference: { startsWith: 'PTR-2' } }, select: { id: true } }),
    ]);
    const shipperIds = volumeShippers.map((row) => row.id);
    const partnerIds = volumePartners.map((row) => row.id);
    if (shipperIds.length === 0 && partnerIds.length === 0) return;

    const volumeShipments = await prisma.shipment.findMany({
      where: { OR: [{ shipperId: { in: shipperIds } }, { partnerId: { in: partnerIds } }] },
      select: { id: true },
    });
    const shipmentIds = volumeShipments.map((row) => row.id);
    const volumeBookings = await prisma.booking.findMany({ where: { shipmentId: { in: shipmentIds } }, select: { id: true } });
    const bookingIds = volumeBookings.map((row) => row.id);
    const volumeInvoices = await prisma.invoice.findMany({ where: { shipperId: { in: shipperIds } }, select: { id: true } });
    const invoiceIds = volumeInvoices.map((row) => row.id);
    const volumeOrders = await prisma.paymentOrder.findMany({ where: { missionId: { in: shipmentIds } }, select: { id: true } });
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

    await prisma.vehicle.updateMany({ where: { partnerId: { in: partnerIds } }, data: { assignedDriverId: null } });
    await prisma.vehicle.deleteMany({ where: { partnerId: { in: partnerIds } } });
    await prisma.driver.deleteMany({ where: { partnerId: { in: partnerIds } } });
    await prisma.pricingTier.deleteMany({ where: { partnerId: { in: partnerIds } } });
    await prisma.partnerBankAccount.deleteMany({ where: { partnerId: { in: partnerIds } } });
    await prisma.contact.deleteMany({ where: { ownerId: { in: [...shipperIds, ...partnerIds] } } });
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
    const DOCUMENT_TYPES = [
      { ownerType: 'SHIPPER', label: 'Business License', required: true },
      { ownerType: 'PARTNER', label: 'Grey Card (Carte Grise)', required: true },
      { ownerType: 'PARTNER', label: 'Vehicle Registration', required: true },
      { ownerType: 'VEHICLE', label: 'Vehicle Registration', required: true },
      { ownerType: 'VEHICLE', label: 'Fleet Insurance', required: true },
      { ownerType: 'DRIVER', label: 'Driver License', required: true },
      { ownerType: 'DRIVER', label: 'Access Card', required: true },
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
          registrationNumber: `RC-${int(10000, 99999)}-${seed.country === 'Djibouti' ? 'DJ' : 'ET'}`,
          industry: seed.industry,
          companySize: seed.size,
          country: seed.country,
          address: seed.address,
          projectsCount: 0,
          // A live book has a couple of accounts still working through onboarding.
          approvalStatus: index >= SHIPPER_SEEDS.length - 2 ? 'Pending' : 'Verified',
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

    /* ── Transporters, their grids and their fleets ──────────────────────── */

    const fleets: FleetRef[] = [];
    for (const seed of PARTNER_SEEDS) {
      const registrationDate = addDays(WINDOW_START, -int(150, 1000));
      const partner = await prisma.partner.create({
        data: {
          reference: seed.reference,
          companyLegalName: seed.name,
          registrationNumber: `RC-${int(10000, 99999)}-${seed.country === 'Djibouti' ? 'DJ' : 'ET'}`,
          businessLicenseNumber: `BL-${int(100000, 999999)}`,
          operatingRegions: seed.country === 'Ethiopia' ? ['Ethiopia', 'Djibouti'] : ['Djibouti', 'Ethiopia'],
          serviceCategories: ['Container Haulage', 'Bulk Transport', 'Project Cargo'],
          fleetSize: seed.fleet,
          vehicleTypes: [...TRUCK_TYPES],
          country: seed.country,
          address: seed.address,
          insuranceProvider: pick(['GXA Assurances', 'AMERGA Insurance', 'Nyala Insurance', 'Africa Insurance']),
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

      /* The price grid: one row per truck type, at the 40–48k DJF per mission
       * the corridor actually bills. This is the shipper-facing figure — the
       * transporter is paid it net of Fleetin's commission. */
      for (const truckType of TRUCK_TYPES) {
        const base = truckType === '40ft Container' ? int(45000, 48000) : truckType === '20ft Container' ? int(40000, 44000) : int(42000, 46000);
        await prisma.pricingTier.create({
          data: {
            partnerId: partner.id,
            route: 'Djibouti corridor — per mission',
            vehicleType: truckType,
            basePriceMinorUnits: BigInt(base),
            currency: 'DJF',
            fxRate: 1.0,
            baseAmountMinorUnits: BigInt(base),
            pricePerKmMinorUnits: BigInt(int(45, 90)),
          },
        });
      }

      const fleetCount = int(5, 8);
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
            licenseExpiry: addDays(NOW, int(60, 900)),
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
            containerCapacity: truckType === '40ft Container' ? '1 × 40ft' : truckType === '20ft Container' ? '2 × 20ft' : '32t payload',
            ownershipType: pick(['Owned', 'Leased']),
            insuranceStartDate: addDays(NOW, -int(60, 320)),
            insuranceExpiry: addDays(NOW, int(30, 400)),
            registrationExpiry: addDays(NOW, int(60, 700)),
            hasGPS: chance(0.75),
            gpsDeviceId: `GPS-${int(10000, 99999)}`,
            operationalStatus: 'Available',
            assignedDriverId: driver.id,
            year: int(2015, 2024),
            make: pick(['Sinotruk', 'FAW', 'Scania', 'Volvo', 'MAN', 'Isuzu']),
            model: pick(['HOWO 371', 'J6P', 'R450', 'FH16', 'TGS 33.440', 'FVZ']),
          },
        });
        vehicles.push({ id: vehicle.id, truckType });
        drivers.push({ id: driver.id });
      }

      await backdate('partners', partner.id, { createdAt: registrationDate, updatedAt: registrationDate });
      fleets.push({ partnerId: partner.id, reference: seed.reference, name: seed.name, vehicles, drivers });
    }
    console.log(`🚛 ${fleets.length} transporters, ${fleets.reduce((n, f) => n + f.vehicles.length, 0)} vehicles, ${fleets.reduce((n, f) => n + f.drivers.length, 0)} drivers`);

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
      'Rice Import Programme 2026',
      'Addis Corridor Retainer',
      'Cement Clinker Inbound',
      'Free Zone Distribution Contract',
      'Hawassa Textile Inbound',
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

    interface SeededBooking {
      id: string;
      reference: string;
      containerized: boolean;
      partnerId: string;
      pickupTime: Date;
      completedAt: Date | null;
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
    }

    const allShipments: SeededShipment[] = [];
    /** Containerized bookings delivered last month, waiting to be matched as empties. */
    let empties: SeededBooking[] = [];
    let cycleCount = 0;
    let holdCount = 0;

    for (const [monthIndex, month] of MONTHS.entries()) {
      const count = SHIPMENTS_PER_MONTH[monthIndex]!;
      const monthShipments: SeededShipment[] = [];

      /* 1. Create the month's shipments and their bookings, all Pending. */
      for (let i = 0; i < count; i += 1) {
        const shipper = pick(shipperIds);
        const lane = pick(LANES);
        const cargo = pick(CARGOES);
        const containerCount = cargo.containerized ? int(1, 4) : int(1, 2);

        /* Most shipments run on one transporter; the big ones are split, which
         * is the case that makes "one payment order per transporter per
         * shipment" mean something. */
        const primary = pick(fleets);
        const secondary = containerCount >= 3 && chance(0.35) ? pick(fleets.filter((f) => f.partnerId !== primary.partnerId)) : null;

        /* The current month is only as long as today — a board full of work
         * scheduled for next week would be fiction, not a live picture. */
        const lastDay = month.isCurrent ? NOW.getUTCDate() : Math.min(28, Math.round((month.end.getTime() - month.start.getTime()) / DAY));
        const dayOfMonth = int(1, lastDay);
        const pickupTime = new Date(Date.UTC(month.year, month.month - 1, dayOfMonth, int(5, 16), pick([0, 15, 30, 45])));
        /* The current month is still running: nothing scheduled past today. */
        if (month.isCurrent && pickupTime > NOW) continue;

        const assignments = secondary
          ? [
              { partnerId: primary.partnerId, vehicles: containerCount - 1 },
              { partnerId: secondary.partnerId, vehicles: 1 },
            ]
          : [{ partnerId: primary.partnerId, vehicles: containerCount }];

        /* One box, one commitment: the line, the depot and the return deadline
         * are the shipment's, and every container under it inherits them
         * rather than rolling its own. The window is the shipping line's free
         * time counted off the vessel, not off this truck's pickup — which is
         * why a box collected today is legitimately still returnable next
         * month, and why the on-time rate means something. */
        const shippingLine = cargo.containerized ? pick(SHIPPING_LINES) : undefined;
        const returnDepot = cargo.containerized ? pick(RETURN_DEPOTS) : undefined;
        const freeDays = cargo.containerized ? pick([7, 10, 14]) : undefined;
        const returnDeadline = cargo.containerized ? addDays(pickupTime, int(9, 18)) : undefined;

        const isDpcs = chance(0.55);
        const created = await shipments.create(
          {
            shipmentSource: isDpcs ? 'dpcs' : 'custom',
            dpcsReference: isDpcs ? nextDpcsReference() : undefined,
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
          const fleet = secondary && c === containerCount - 1 ? secondary : primary;
          const slot = int(0, fleet.vehicles.length - 1);
          items.push({
            cargoType: cargo.cargoType,
            shipmentCategory: cargo.category,
            containerNumber: cargo.containerized ? nextContainerNumber() : undefined,
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
          bookings: createdBookings.map((booking, index) => ({
            id: booking.id,
            reference: booking.reference,
            containerized: Boolean(items[index]!.containerNumber),
            partnerId: items[index]!.partnerId,
            pickupTime,
            completedAt: null,
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
       *    only claimable once its own container is delivered, and the box has
       *    to go back within the line's free time. Matching a whole month's
       *    empties against the NEXT month's loads — the obvious way to write
       *    this — dates every return four to six weeks after the box came off
       *    the vessel, which is past every deadline and makes the module's
       *    on-time rate read as a permanent failure. Days, not months, is what
       *    the operation actually does. */
      const LADDER = ['Assigned', 'Driver Assigned', 'En Route', 'Arrived', 'Unloading', 'POD Submitted', 'Completed'] as const;

      for (const shipment of monthShipments) {
        /* Before this shipment moves, hand it any empty that is sitting ready:
         * its containers are the outbound leg that carries the box back. */
        for (const booking of shipment.bookings) {
          if (!booking.containerized || empties.length === 0) break;
          if (!chance(0.72)) continue;
          const empty = empties.shift()!;
          try {
            const cycle = await emptyReturns.createCycle({ bookingId: empty.id, nextBookingId: booking.id });
            const matchedAt = empty.completedAt ?? month.start;
            await backdate('empty_return_cycles', cycle.id, { createdAt: matchedAt, updatedAt: matchedAt, emptyReadyAt: matchedAt });
            cycleCount += 1;
          } catch {
            /* Already claimed, or no longer eligible — the service is the
             * authority on that, not this loop. */
          }
        }

        /* Past months are settled history; the current month is a live board
         * with work at every stage of the ladder. */
        let steps: number;
        let outcome: 'completed' | 'cancelled' | 'failed' | 'inflight';
        if (!month.isCurrent) {
          outcome = chance(0.93) ? 'completed' : chance(0.6) ? 'cancelled' : 'failed';
          steps = outcome === 'completed' ? LADDER.length : int(0, 2);
        } else {
          const age = (NOW.getTime() - shipment.pickupTime.getTime()) / DAY;
          if (age > 4) {
            outcome = chance(0.85) ? 'completed' : 'inflight';
          } else {
            outcome = 'inflight';
          }
          steps = outcome === 'completed' ? LADDER.length : Math.max(0, Math.min(LADDER.length - 1, Math.round(age * 1.5) + int(0, 2)));
        }

        /* A booking matched as somebody's empty-return load was already forced
         * to "Assigned" by the matching service — the ladder must resume from
         * where the cross-module edge left it, not replay a step it is past. */
        const bookingStatus = new Map(
          (
            await prisma.booking.findMany({
              where: { id: { in: shipment.bookings.map((booking) => booking.id) } },
              select: { id: true, status: true },
            })
          ).map((row) => [row.id, row.status]),
        );

        const advance = async (status: string): Promise<void> => {
          if (shipment.status !== status) {
            await shipments.updateStatus(shipment.id, { status: status as never });
            shipment.status = status;
          }
          for (const booking of shipment.bookings) {
            if (bookingStatus.get(booking.id) === status) continue;
            await bookings.updateStatus(booking.id, { status: status as never });
            bookingStatus.set(booking.id, status);
          }
        };

        for (let s = 0; s < steps; s += 1) {
          await advance(LADDER[s]!);
        }

        if (outcome === 'cancelled' || outcome === 'failed') {
          await advance(outcome === 'cancelled' ? 'Cancelled' : 'Failed');
        }

        /* 4. Move the whole play-through into the month it belongs in. */
        await placeInTime(shipment);

        /* A cycle's `returnedAt` is stamped by the status hook at the moment
         * the outbound load lands — which, inside this seed, is always "now".
         * Left alone it dates every empty return to today and makes the
         * on-time rate read as zero against historical deadlines. It belongs
         * on the same clock as the delivery that triggered it. */
        if (shipment.completedAt) {
          const bookingIds = shipment.bookings.map((booking) => booking.id);
          const placeholders = bookingIds.map(() => '?').join(', ');
          await prisma.$executeRawUnsafe(
            `UPDATE \`empty_return_cycles\` SET \`returnedAt\` = ?, \`updatedAt\` = ? WHERE \`nextBookingId\` IN (${placeholders}) AND \`returnedAt\` IS NOT NULL`,
            sqlDate(shipment.completedAt),
            sqlDate(shipment.completedAt),
            ...bookingIds,
          );
        }

        /* Delivered containers join the pool immediately, so the very next
         * shipment out of the port can take one back. Anything left unmatched
         * carries into the following month rather than being forgotten. */
        if (shipment.status === 'Completed') {
          for (const booking of shipment.bookings) {
            if (!booking.containerized) continue;
            booking.completedAt = shipment.completedAt;
            empties.push(booking);
          }
        }
      }

      allShipments.push(...monthShipments);
      console.log(`📦 ${month.start.toISOString().slice(0, 7)} — ${monthShipments.length} shipments, ${monthShipments.reduce((n, s) => n + s.bookings.length, 0)} bookings`);
    }

    /**
     * Spreads one shipment's play-through over the hours it would really have
     * taken, then rewrites every timestamp the services stamped as "now".
     */
    async function placeInTime(shipment: SeededShipment): Promise<void> {
      const record = await prisma.shipment.findUniqueOrThrow({
        where: { id: shipment.id },
        select: { estimatedDistanceKm: true },
      });
      const transitHours = Math.max(2, Math.round(record.estimatedDistanceKm / 27));
      const offsets = [0, 2, 4, 6, 6 + transitHours, 7 + transitHours, 9 + transitHours, 10 + transitHours];

      const createdAt = addDays(shipment.pickupTime, -2);
      const stepTimes = offsets.map((hours) => addHours(shipment.pickupTime, hours));
      const last = stepTimes[stepTimes.length - 1]!;
      const completedAt = shipment.status === 'Completed' ? last : null;
      shipment.completedAt = completedAt;

      await backdate('shipments', shipment.id, {
        createdAt,
        updatedAt: completedAt ?? stepTimes[0]!,
        scheduledPickupTime: shipment.pickupTime,
        completedAt,
      });

      const timeline = await prisma.shipmentTimelineStep.findMany({
        where: { shipmentId: shipment.id },
        orderBy: { createdAt: 'asc' },
        select: { id: true },
      });
      for (const [index, step] of timeline.entries()) {
        const when = index === 0 ? createdAt : stepTimes[Math.min(index, stepTimes.length - 1)]!;
        await backdate('shipment_timeline_steps', step.id, { timestamp: when, createdAt: when });
      }

      for (const booking of shipment.bookings) {
        booking.completedAt = completedAt;
        await backdate('bookings', booking.id, {
          createdAt,
          updatedAt: completedAt ?? stepTimes[0]!,
          scheduledPickupTime: shipment.pickupTime,
          completedAt,
        });
        const bookingTimeline = await prisma.bookingTimelineStep.findMany({
          where: { bookingId: booking.id },
          orderBy: { createdAt: 'asc' },
          select: { id: true },
        });
        for (const [index, step] of bookingTimeline.entries()) {
          const when = index === 0 ? createdAt : stepTimes[Math.min(index, stepTimes.length - 1)]!;
          await backdate('booking_timeline_steps', step.id, { timestamp: when, createdAt: when });
        }
      }
    }

    console.log(`🔁 ${cycleCount} empty-return cycles matched`);

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

    /* A SHIPPER or TRANSPORTER user whose own company is gone sees an empty
     * portal and no error explaining why. Any such account is re-pointed at a
     * counterparty from this dataset — this is the seed's job precisely
     * because it is the seed that replaced the old ones. */
    const orphanShipperUsers = await prisma.user.updateMany({
      where: { role: { name: 'SHIPPER' }, shipperId: null },
      data: { shipperId: shipperIds[0]!.id },
    });
    const orphanTransporterUsers = await prisma.user.updateMany({
      where: { role: { name: 'TRANSPORTER' }, partnerId: null },
      data: { partnerId: fleets[0]!.partnerId },
    });
    if (orphanShipperUsers.count + orphanTransporterUsers.count > 0) {
      console.log(
        `🔗 Re-pointed ${orphanShipperUsers.count} shipper and ${orphanTransporterUsers.count} transporter login(s) at ${shipperIds[0]!.name} / ${fleets[0]!.name}`,
      );
    }

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
