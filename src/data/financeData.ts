/**
 * Finance module seed data.
 *
 * One coherent story, anchored to load time so the clocks are always live:
 * four clients (the real shipper records, logos and all), three transporters
 * plus the port service firms, five funding sources across all three types,
 * ten projects, and ~22 SHIPMENTS carrying ~90 bookings between them.
 *
 * The shipment tier is what this data exists to demonstrate. Several
 * consignments are deliberately split across two or three transporters with
 * unequal booking counts, because that is the case the whole restructure was
 * built for: twelve containers hauled by one firm and eight by another are two
 * payments, not twenty.
 *
 * The deliberate showcase cases, all preserved through the restructure:
 *
 * - SHI-00001 — 20 bookings, two hauliers (12 / 8). One settled with a signed
 *   voucher, one still payable. This is the feature, on one screen.
 * - SHI-00002 — 6 bookings, two of them delivered with NO proof of delivery.
 *   Release is blocked for the whole consignment and the two containers are
 *   named. The loudest thing in the module.
 * - SHI-00005 — held at hour 30 of the validation window: the counter is
 *   frozen there, not reset, and the hold names the damaged container.
 * - SHI-00015 — RELEASED WITH UNPRICED BOOKINGS: money out against an unknown
 *   price.
 * - SHI-00008 — a negative-margin shipment, computed honestly.
 * - SHI-00007 / SHI-00016 / SHI-00017 — the DPCS contradiction: origination
 *   channel `dpcs` while funded by a contract facility (SHI-00007) and by a
 *   credit line (SHI-00016), versus work funded by the DPCS pool itself
 *   (SHI-00017). Both interpretations live in the data because the business
 *   has not decided which one is true.
 * - The ~41-day settle history that makes DSO real.
 *
 * Ledger movements include lump-sum pool repayments that match NO draw on
 * purpose — pairing them would be modelling a reconciliation the facility
 * does not have.
 *
 * PRICES. A booking bills the shipper 40,000–48,000 DJF — the band the user
 * gave 2026-08-13 — with contract-tariff lanes near the bottom and spot lifts
 * with escort at the top. Costs are set per booking so each one's margin is
 * what it was designed to show: ~12% on the corridor contracts, negative on
 * SHI-00008, unknowable where the rate is null. Facility ceilings and the
 * ledger history are sized to the same scale, so headroom means something.
 *
 * Every reference is minted through `@/lib/ids`, in construction order, so no
 * two records can collide and the runtime sequencer continues where this file
 * stops.
 */

import { nextId } from '@/lib/ids';
import type {
  ClientInvoice,
  CargoType,
  CostLine,
  CostType,
  FinanceBooking,
  FinanceClient,
  FinanceSettings,
  FinanceShipment,
  FinanceTransporter,
  FinanceProject,
  FundingSource,
  InvoiceReminder,
  LedgerMovement,
  OriginationChannel,
  PayoutHold,
  PodDocument,
  RateSource,
  ShipmentPayment,
} from '@/types/finance';

const NOW = Date.now();
const HOUR = 3_600_000;
const DAY = 24 * HOUR;
const dAgo = (days: number): string => new Date(NOW - days * DAY).toISOString();
const hAgo = (hours: number): string => new Date(NOW - hours * HOUR).toISOString();

// ─── Parties ────────────────────────────────────────────────────────────────

export const FINANCE_CLIENTS: FinanceClient[] = [
  {
    id: 'SHP-101',
    name: 'AMINA FZCO',
    logoUrl:
      'https://images.unsplash.com/photo-1560179707-f14e90ef3623?w=120&auto=format&fit=crop&q=80',
    contractRef: 'CT-2026-AMN-04',
    paymentTermsDays: 30,
  },
  {
    id: 'SHP-102',
    name: 'Al-Baraka Logistics Ltd',
    logoUrl:
      'https://images.unsplash.com/photo-1497366754035-f200968a6e72?w=120&auto=format&fit=crop&q=80',
    paymentTermsDays: 30,
  },
  {
    id: 'SHP-103',
    name: 'Red Sea Cargo Group',
    logoUrl:
      'https://images.unsplash.com/photo-1572021335469-31706a17aaef?w=120&auto=format&fit=crop&q=80',
    contractRef: 'CT-2026-RSC-11',
    paymentTermsDays: 45,
  },
  {
    id: 'SHP-104',
    name: 'Horn Freight Express',
    logoUrl:
      'https://images.unsplash.com/photo-1551836022-d5d88e9218df?w=120&auto=format&fit=crop&q=80',
    paymentTermsDays: 30,
  },
];

export const FINANCE_TRANSPORTERS: FinanceTransporter[] = [
  {
    id: 'PTR-001',
    name: 'Red Sea Express Ltd',
    logoUrl:
      'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=120&auto=format&fit=crop&q=80',
  },
  {
    id: 'PTR-002',
    name: 'Horn Transit Solutions',
    logoUrl:
      'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=120&auto=format&fit=crop&q=80',
  },
  { id: 'PTR-003', name: 'Al-Baraka Transport Co.' },
  // Service firms — roles, not brands: they render as initials, not logos.
  { id: 'HDL-001', name: 'Djibouti Port Handling Co' },
  { id: 'CUS-001', name: 'Nagad Customs Brokers' },
  { id: 'ESC-001', name: 'Corridor Escort Unit' },
  { id: 'DPA-001', name: 'Djibouti Ports Authority' },
];

// ─── Funding sources ────────────────────────────────────────────────────────

/*
 * Ceilings are sized for CONSIGNMENTS, not containers. A booking bills at
 * 40–48k DJF and a twenty-container shipment therefore draws ~760k in one
 * release, so a facility priced for single lifts would read as permanently
 * exhausted and every headroom warning in the module would be noise.
 */
export const FUNDING_SOURCES: FundingSource[] = [
  {
    id: 'CF-2026-AMINA',
    type: 'contract_facility',
    name: 'AMINA FZCO contract facility',
    bankName: 'CAC Bank',
    clientId: 'SHP-101',
    contractRef: 'CT-2026-AMN-04',
    ceilingDjf: 4_500_000,
    costOfCapitalRate: 0,
    riskBearer: 'fleetin',
    openedAt: dAgo(150),
    note: 'Priced against the AMN-04 corridor contract. Fleetin is the borrower.',
  },
  {
    id: 'CF-2026-REDSEA',
    type: 'contract_facility',
    name: 'Red Sea Cargo contract facility',
    bankName: 'CAC Bank',
    clientId: 'SHP-103',
    contractRef: 'CT-2026-RSC-11',
    ceilingDjf: 2_400_000,
    costOfCapitalRate: 0,
    riskBearer: 'fleetin',
    openedAt: dAgo(120),
    note: '45-day client terms priced into the ceiling. Fleetin is the borrower.',
  },
  {
    id: 'CL-2026-BARAKA',
    type: 'client_credit_line',
    name: 'Al-Baraka revolving credit line',
    bankName: 'CAC Bank',
    clientId: 'SHP-102',
    ceilingDjf: 2_600_000,
    costOfCapitalRate: 0,
    riskBearer: 'bank',
    openedAt: dAgo(200),
    note: 'Client is the borrower; repayment restores availability. Collections sit with CAC.',
  },
  {
    id: 'CL-2026-HORN',
    type: 'client_credit_line',
    name: 'Horn Freight revolving credit line',
    bankName: 'CAC Bank',
    clientId: 'SHP-104',
    ceilingDjf: 1_600_000,
    costOfCapitalRate: 0,
    riskBearer: 'bank',
    openedAt: dAgo(90),
  },
  {
    id: 'DPCS-2026-POOL',
    type: 'dpcs',
    name: 'DPCS allocation',
    bankName: 'CAC Bank',
    ceilingDjf: 900_000,
    costOfCapitalRate: 0,
    riskBearer: 'undecided',
    openedAt: dAgo(75),
    note:
      'Contradictory records: shipments tagged DPCS + credit line at once, and credit-line draws labelled DPCS. Funding source vs origination channel is an OPEN DECISION — do not resolve in data.',
  },
];

// ─── Projects ───────────────────────────────────────────────────────────────

/**
 * Work is organised client → project → shipment → booking.
 *
 * The channel lives on the PROJECT, not the consignment: a client can arrive
 * through Fleetin's own desk on one contract and through DPCS on another, and
 * AMINA does exactly that below. Each project's shipments inherit its channel,
 * which is what makes the Fleetin/DPCS split a clean partition of the book.
 *
 * `key` is a seed-local handle so a shipment can name its project without
 * repeating a reference; it never reaches the model.
 */
interface ProjectSeed {
  key: string;
  reference: string;
  name: string;
  scope: string;
  clientId: string;
  channel: OriginationChannel;
  fundingSourceId: string;
  contractRef?: string;
  startedDaysAgo: number;
  /** Days from now the contract expires. Negative for past, undefined for open-ended/spot work. */
  endsInDays?: number;
  status: 'active' | 'completed';
}

const PROJECT_SEEDS: ProjectSeed[] = [
  // ── AMINA FZCO — three Fleetin projects and one that came via DPCS ──
  {
    key: 'AMN_ELEC', reference: 'AMN/Q3/ELEC', name: 'Q3 electronics corridor',
    scope: 'Containerised electronics, Djibouti Port → Addis Ababa',
    clientId: 'SHP-101', channel: 'fleetin_direct', fundingSourceId: 'CF-2026-AMINA',
    contractRef: 'CT-2026-AMN-04', startedDaysAgo: 120, endsInDays: 12, status: 'active',
  },
  {
    key: 'AMN_GRAIN', reference: 'AMN/GRAIN', name: 'Bulk grain programme',
    scope: 'Wheat, maize and sorghum lifts to Dire Dawa and inland',
    clientId: 'SHP-101', channel: 'fleetin_direct', fundingSourceId: 'CF-2026-AMINA',
    contractRef: 'CT-2026-AMN-04', startedDaysAgo: 95, status: 'active',
  },
  {
    key: 'AMN_PROJ', reference: 'AMN/PROJ', name: 'Relief & project cargo',
    scope: 'Chartered and oversize movements, escorted where required',
    clientId: 'SHP-101', channel: 'fleetin_direct', fundingSourceId: 'CF-2026-AMINA',
    contractRef: 'CT-2026-AMN-04', startedDaysAgo: 70, status: 'active',
  },
  {
    // Channel DPCS, funded by the AMINA contract facility — the contradiction
    // the business has not resolved, kept visible rather than tidied away.
    key: 'AMN_DPCS', reference: 'AMN/DPCS', name: 'DPCS spot lifts',
    scope: 'Ad-hoc volume routed through DPCS against the AMINA facility',
    clientId: 'SHP-101', channel: 'dpcs', fundingSourceId: 'CF-2026-AMINA',
    contractRef: 'CT-2026-AMN-04', startedDaysAgo: 110, status: 'active',
  },

  // ── Al-Baraka Logistics ──
  {
    key: 'BRK_RETAIL', reference: 'BRK/RETAIL', name: 'Retail replenishment',
    scope: 'Weekly FMCG and perishables to Addis, Hawassa and Dire Dawa',
    clientId: 'SHP-102', channel: 'fleetin_direct', fundingSourceId: 'CL-2026-BARAKA',
    startedDaysAgo: 130, status: 'active',
  },
  {
    key: 'BRK_INFRA', reference: 'BRK/INFRA', name: 'Infrastructure materials',
    scope: 'Pipes and project materials for the Dikhil works',
    clientId: 'SHP-102', channel: 'fleetin_direct', fundingSourceId: 'CL-2026-BARAKA',
    startedDaysAgo: 88, status: 'active',
  },

  // ── Red Sea Cargo Group ──
  {
    key: 'RSC_STEEL', reference: 'RSC/STEEL', name: 'Steel & rebar programme',
    scope: 'Coils and rebar under escort on the Galafi corridor',
    clientId: 'SHP-103', channel: 'fleetin_direct', fundingSourceId: 'CF-2026-REDSEA',
    contractRef: 'CT-2026-RSC-11', startedDaysAgo: 100, endsInDays: 140, status: 'active',
  },
  {
    key: 'RSC_FERT', reference: 'RSC/FERT', name: 'Fertiliser season',
    scope: 'Bagged fertiliser to Mekelle and Dire Dawa before planting',
    clientId: 'SHP-103', channel: 'fleetin_direct', fundingSourceId: 'CF-2026-REDSEA',
    contractRef: 'CT-2026-RSC-11', startedDaysAgo: 60, status: 'active',
  },

  // ── Horn Freight Express — DPCS-originated throughout ──
  {
    key: 'HRN_BEV', reference: 'HRN/BEV', name: 'Beverage distribution',
    scope: 'Palletised beverages and dry goods, DPCS-originated',
    clientId: 'SHP-104', channel: 'dpcs', fundingSourceId: 'CL-2026-HORN',
    startedDaysAgo: 85, status: 'active',
  },
  {
    key: 'HRN_BULK', reference: 'HRN/BULK', name: 'Bulk & bottled water',
    scope: 'Bulk sorghum and bottled water against the DPCS allocation',
    clientId: 'SHP-104', channel: 'dpcs', fundingSourceId: 'DPCS-2026-POOL',
    startedDaysAgo: 65, status: 'active',
  },
];

export const FINANCE_PROJECTS: FinanceProject[] = PROJECT_SEEDS.map((seed) => ({
  id: nextId('project'),
  reference: seed.reference,
  name: seed.name,
  scope: seed.scope,
  clientId: seed.clientId,
  channel: seed.channel,
  fundingSourceId: seed.fundingSourceId,
  contractRef: seed.contractRef,
  startedAt: dAgo(seed.startedDaysAgo),
  contractEndAt: seed.endsInDays !== undefined ? dAgo(-seed.endsInDays) : null,
  status: seed.status,
}));

/** Seed handle -> the built project. Nothing can name a project that isn't there. */
const PROJECT_BY_KEY = new Map<string, FinanceProject>(
  PROJECT_SEEDS.map((seed, index) => [seed.key, FINANCE_PROJECTS[index] as FinanceProject]),
);

// ─── Seed shapes ────────────────────────────────────────────────────────────

type CostSeed = [type: CostType, amountDjf: number, counterpartyId?: string];

interface BookingSeed {
  transporterId: string;
  destination: string;
  via?: string[];
  cargo: string;
  cargoType: CargoType;
  rate: number | null;
  rateSource?: RateSource;
  costs: CostSeed[];
  /** Days ago this container was delivered. Absent = still on the road. */
  completedDaysAgo?: number;
  /** Hours ago its proof landed. Absent = delivered but unproven. */
  podHoursAgo?: number;
}

interface HoldSeed {
  category: PayoutHold['category'];
  reason: string;
  raisedBy: string;
  /** Index into the shipment's bookings — the container in dispute. */
  bookingIndex?: number;
  /** Hours after the shipment was fully proven that the hold was raised. */
  raisedAfterProofH: number;
  /** Hours after being raised it was cleared; absent = still active. */
  clearedAfterH?: number;
  clearedBy?: string;
}

interface ShipmentSeed {
  reference: string;
  clientId: string;
  /** The project this consignment belongs to; absent = a one-off lift. */
  projectKey?: string;
  /** Required when there is no project — a one-off carries its own channel. */
  standaloneChannel?: OriginationChannel;
  fundingSourceId: string;
  openedDaysAgo: number;
  bookings: BookingSeed[];
  holds?: HoldSeed[];
  /** Days ago the whole consignment's payout was released. */
  releasedDaysAgo?: number;
  /**
   * counterparty id -> days after release that party's SETTLEMENT was paid.
   *
   * One entry pays every booking that party carried on this shipment, under
   * one voucher. That is the whole point: a haulier with twelve containers
   * appears here once.
   */
  paidTransporters?: Record<string, number>;
  /** Days after issue the client settled the invoice; absent = open. */
  invoicePaidAfterDays?: number;
  /** Chasing history, for the facility invoices Fleetin collects itself. */
  reminders?: InvoiceReminder[];
}

/**
 * N near-identical containers on one leg — what a real consignment looks like.
 *
 * `tweak` is how one container in a run differs: the two that arrived without
 * proof, the one still on the road. Everything else stays identical, because
 * on a real shipment it is.
 */
function run(
  count: number,
  template: BookingSeed,
  tweak?: (index: number) => Partial<BookingSeed>,
): BookingSeed[] {
  return Array.from({ length: count }, (_, index) => ({ ...template, ...tweak?.(index) }));
}

// ─── The shipments ──────────────────────────────────────────────────────────

const SHIPMENT_SEEDS: ShipmentSeed[] = [
  /* ══ SHI-00001 — THE FLAGSHIP ════════════════════════════════════════════
   * Twenty containers, two hauliers, twelve and eight. Every one delivered and
   * proven, the consignment released. Red Sea Express has been paid for its
   * twelve under one voucher; Horn Transit's eight are payable in one click.
   * This single shipment is the entire restructure, visible at once.
   */
  {
    reference: 'AMN-BL-449120',
    clientId: 'SHP-101', projectKey: 'AMN_ELEC', fundingSourceId: 'CF-2026-AMINA',
    openedDaysAgo: 24,
    bookings: [
      ...run(12, {
        transporterId: 'PTR-001', destination: 'Addis Ababa', via: ['Galafi'],
        cargo: '1×40ft — consumer electronics', cargoType: 'containerized',
        rate: 43_500, rateSource: 'contract_tariff',
        costs: [['transport', 34_400], ['handling', 3_800]],
        completedDaysAgo: 12, podHoursAgo: 11 * 24,
      }, (index) => ({ podHoursAgo: 11 * 24 - index * 3 })),
      ...run(8, {
        transporterId: 'PTR-002', destination: 'Addis Ababa', via: ['Galafi'],
        cargo: '1×40ft — consumer electronics', cargoType: 'containerized',
        rate: 43_500, rateSource: 'contract_tariff',
        costs: [['transport', 33_700], ['handling', 3_800]],
        completedDaysAgo: 11, podHoursAgo: 10 * 24,
      }, (index) => ({ podHoursAgo: 10 * 24 - index * 4 })),
    ],
    releasedDaysAgo: 9,
    paidTransporters: { 'PTR-001': 2, 'HDL-001': 3 },
  },

  /* ══ SHI-00002 — THE BLOCKED CONSIGNMENT ═════════════════════════════════
   * Six containers delivered, four proven, TWO with no proof of delivery. The
   * release cannot happen and neither transporter can be paid — for want of
   * two signatures, the whole consignment's money is frozen. The two
   * containers must be named on screen, not summarised as "incomplete".
   */
  {
    reference: 'AMN-BL-449206',
    clientId: 'SHP-101', projectKey: 'AMN_ELEC', fundingSourceId: 'CF-2026-AMINA',
    openedDaysAgo: 11,
    bookings: [
      ...run(4, {
        transporterId: 'PTR-001', destination: 'Addis Ababa', via: ['Galafi'],
        cargo: '1×40ft — laptops and peripherals', cargoType: 'containerized',
        rate: 43_700, rateSource: 'contract_tariff',
        costs: [['transport', 34_500], ['handling', 3_900]],
        completedDaysAgo: 6, podHoursAgo: 5 * 24,
      }),
      // The two gaps. Delivered six days ago, still unproven.
      ...run(2, {
        transporterId: 'PTR-003', destination: 'Dire Dawa',
        cargo: '1×40ft — laptops and peripherals', cargoType: 'containerized',
        rate: 42_900, rateSource: 'contract_tariff',
        costs: [['transport', 34_000], ['handling', 3_800]],
        completedDaysAgo: 6,
      }),
    ],
  },

  /* ══ SHI-00003 — inside the 48h window, two hauliers ═════════════════════ */
  {
    reference: 'AMN-GRN-88104',
    clientId: 'SHP-101', projectKey: 'AMN_GRAIN', fundingSourceId: 'CF-2026-AMINA',
    openedDaysAgo: 6,
    bookings: [
      ...run(3, {
        transporterId: 'PTR-002', destination: 'Dire Dawa',
        cargo: 'Bulk wheat, 28t', cargoType: 'bulk',
        rate: 41_200, rateSource: 'contract_tariff',
        costs: [['transport', 33_200], ['handling', 3_600]],
        completedDaysAgo: 3, podHoursAgo: 40,
      }),
      ...run(2, {
        transporterId: 'PTR-003', destination: 'Dire Dawa',
        cargo: 'Bulk maize, 28t', cargoType: 'bulk',
        rate: 41_100, rateSource: 'contract_tariff',
        costs: [['transport', 33_000], ['handling', 3_600]],
        completedDaysAgo: 2, podHoursAgo: 30,
      }),
    ],
  },

  /* ══ SHI-00004 — settled history: the ~41-day truth ══════════════════════ */
  {
    reference: 'AMN-GRN-87740',
    clientId: 'SHP-101', projectKey: 'AMN_GRAIN', fundingSourceId: 'CF-2026-AMINA',
    openedDaysAgo: 70,
    bookings: run(4, {
      transporterId: 'PTR-001', destination: 'Addis Ababa', via: ['Galafi'],
      cargo: 'Bulk sorghum, 28t', cargoType: 'bulk',
      rate: 42_800, rateSource: 'contract_tariff',
      costs: [['transport', 34_200], ['handling', 3_700]],
      completedDaysAgo: 63, podHoursAgo: 60 * 24,
    }),
    releasedDaysAgo: 60,
    paidTransporters: { 'PTR-001': 2, 'HDL-001': 2 },
    invoicePaidAfterDays: 41,
  },

  /* ══ SHI-00005 — THE HOLD-PAUSE SHOWCASE ════════════════════════════════
   * Held at hour 30 of the 48-hour window over damage to one container. The
   * counter is FROZEN at 30h; when the hold clears it resumes there, never
   * from zero. The hold names the container so nobody has to guess which of
   * the two generators is in dispute.
   */
  {
    reference: 'AMN-PRJ-31088',
    clientId: 'SHP-101', projectKey: 'AMN_PROJ', fundingSourceId: 'CF-2026-AMINA',
    openedDaysAgo: 9,
    bookings: [
      {
        transporterId: 'PTR-001', destination: 'Addis Ababa', via: ['Galafi'],
        cargo: 'Generator set, 42t oversize', cargoType: 'machinery',
        rate: 48_000, rateSource: 'spot',
        costs: [['transport', 36_400], ['handling', 3_700], ['escort', 2_000]],
        completedDaysAgo: 4, podHoursAgo: 72,
      },
      {
        transporterId: 'PTR-001', destination: 'Addis Ababa', via: ['Galafi'],
        cargo: 'Transformer, 38t oversize', cargoType: 'machinery',
        rate: 47_500, rateSource: 'spot',
        costs: [['transport', 36_300], ['handling', 3_700], ['escort', 2_000]],
        completedDaysAgo: 4, podHoursAgo: 70,
      },
    ],
    holds: [
      {
        category: 'damage',
        reason: 'Transformer housing dented on arrival — client photographing damage',
        raisedBy: 'ops.warsame',
        bookingIndex: 1,
        raisedAfterProofH: 30,
      },
    ],
  },

  /* ══ SHI-00006 — three hauliers on one consignment ══════════════════════ */
  {
    reference: 'AMN-PRJ-31142',
    clientId: 'SHP-101', projectKey: 'AMN_PROJ', fundingSourceId: 'CF-2026-AMINA',
    openedDaysAgo: 17,
    bookings: [
      ...run(2, {
        transporterId: 'PTR-001', destination: 'Semera', via: ['Galafi'],
        cargo: 'Relief tents and bedding, palletised', cargoType: 'bulk',
        rate: 42_300, rateSource: 'contract_tariff',
        costs: [['transport', 33_700], ['handling', 3_600]],
        completedDaysAgo: 9, podHoursAgo: 8 * 24,
      }),
      ...run(2, {
        transporterId: 'PTR-002', destination: 'Semera', via: ['Galafi'],
        cargo: 'Water tanks and pumps', cargoType: 'bulk',
        rate: 42_100, rateSource: 'contract_tariff',
        costs: [['transport', 33_400], ['handling', 3_700]],
        completedDaysAgo: 9, podHoursAgo: 8 * 24 - 6,
      }),
      {
        transporterId: 'PTR-003', destination: 'Semera', via: ['Galafi'],
        cargo: 'Field kitchen units', cargoType: 'machinery',
        rate: 42_700, rateSource: 'spot',
        costs: [['transport', 33_800], ['handling', 3_700], ['customs', 1_600]],
        completedDaysAgo: 8, podHoursAgo: 7 * 24,
      },
    ],
    releasedDaysAgo: 6,
    paidTransporters: { 'PTR-002': 2 },
  },

  /* ══ SHI-00007 — DPCS channel, facility funded, 66 days past due ════════
   * The 90+ aging bracket. Margin at risk lives here.
   */
  {
    reference: 'AMN-DPC-22014',
    clientId: 'SHP-101', projectKey: 'AMN_DPCS', fundingSourceId: 'CF-2026-AMINA',
    openedDaysAgo: 105,
    bookings: run(3, {
      transporterId: 'PTR-002', destination: 'Addis Ababa', via: ['Galafi'],
      cargo: 'Project cargo — generators', cargoType: 'machinery',
      rate: 42_400, rateSource: 'manual_override',
      costs: [['transport', 33_900], ['handling', 3_700]],
      completedDaysAgo: 99, podHoursAgo: 96 * 24,
    }),
    releasedDaysAgo: 96,
    paidTransporters: { 'PTR-002': 2, 'HDL-001': 2 },
    reminders: [
      { sentAt: dAgo(55), by: 'finance.ayan' },
      { sentAt: dAgo(34), by: 'finance.ayan', note: 'Copied commercial director' },
      { sentAt: dAgo(12), by: 'daoud.cfo', note: 'Final notice before contract review' },
    ],
  },

  /* ══ SHI-00008 — NEGATIVE MARGIN: demurrage ate it ══════════════════════ */
  {
    reference: 'AMN-DPC-22090',
    clientId: 'SHP-101', projectKey: 'AMN_DPCS', fundingSourceId: 'CF-2026-AMINA',
    openedDaysAgo: 50,
    bookings: run(2, {
      transporterId: 'PTR-003', destination: 'Dikhil',
      cargo: 'Cement, delayed at port', cargoType: 'bulk',
      rate: 40_600, rateSource: 'contract_tariff',
      costs: [['transport', 35_400], ['handling', 4_000], ['demurrage', 2_600]],
      completedDaysAgo: 45, podHoursAgo: 42 * 24,
    }),
    releasedDaysAgo: 42,
    paidTransporters: { 'PTR-003': 2, 'HDL-001': 2, 'DPA-001': 6 },
    invoicePaidAfterDays: 40,
  },

  /* ══ SHI-00009 — Al-Baraka retail, eight containers, two hauliers ═══════ */
  {
    reference: 'BRK-RTL-70441',
    clientId: 'SHP-102', projectKey: 'BRK_RETAIL', fundingSourceId: 'CL-2026-BARAKA',
    openedDaysAgo: 20,
    bookings: [
      ...run(5, {
        transporterId: 'PTR-002', destination: 'Hawassa', via: ['Galafi', 'Addis Ababa'],
        cargo: 'Cooking oil, palletised', cargoType: 'bulk',
        rate: 42_600, rateSource: 'contract_tariff',
        costs: [['transport', 34_700], ['handling', 3_700]],
        completedDaysAgo: 10, podHoursAgo: 9 * 24,
      }),
      ...run(3, {
        transporterId: 'PTR-003', destination: 'Hawassa', via: ['Galafi', 'Addis Ababa'],
        cargo: 'Dry goods, palletised', cargoType: 'bulk',
        rate: 42_500, rateSource: 'contract_tariff',
        costs: [['transport', 34_300], ['handling', 3_700]],
        completedDaysAgo: 10, podHoursAgo: 9 * 24 - 5,
      }),
    ],
    releasedDaysAgo: 7,
    paidTransporters: { 'PTR-003': 2 },
  },

  /* ══ SHI-00010 — one container still on the road ════════════════════════
   * Not a failure: three delivered and proven, one genuinely still moving. The
   * consignment simply is not finished, and the model must be able to say that
   * without calling anyone late.
   */
  {
    reference: 'BRK-RTL-70510',
    clientId: 'SHP-102', projectKey: 'BRK_RETAIL', fundingSourceId: 'CL-2026-BARAKA',
    openedDaysAgo: 5,
    bookings: [
      ...run(3, {
        transporterId: 'PTR-001', destination: 'Dire Dawa',
        cargo: 'Perishables, reefer', cargoType: 'containerized',
        rate: 43_200, rateSource: 'contract_tariff',
        costs: [['transport', 34_700], ['handling', 3_700]],
        completedDaysAgo: 2, podHoursAgo: 36,
      }),
      {
        transporterId: 'PTR-001', destination: 'Dire Dawa',
        cargo: 'Perishables, reefer', cargoType: 'containerized',
        rate: 43_200, rateSource: 'contract_tariff',
        costs: [['transport', 34_700], ['handling', 3_700]],
        // No completedDaysAgo: still on the road.
      },
    ],
  },

  /* ══ SHI-00011 — Al-Baraka infrastructure, settled ══════════════════════ */
  {
    reference: 'BRK-INF-51220',
    clientId: 'SHP-102', projectKey: 'BRK_INFRA', fundingSourceId: 'CL-2026-BARAKA',
    openedDaysAgo: 84,
    bookings: run(3, {
      transporterId: 'PTR-002', destination: 'Dikhil',
      cargo: 'Steel pipe sections', cargoType: 'machinery',
      rate: 41_700, rateSource: 'contract_tariff',
      costs: [['transport', 33_400], ['handling', 3_600]],
      completedDaysAgo: 78, podHoursAgo: 75 * 24,
    }),
    releasedDaysAgo: 75,
    paidTransporters: { 'PTR-002': 3, 'HDL-001': 4 },
    invoicePaidAfterDays: 38,
  },

  /* ══ SHI-00012 — Red Sea steel under escort, five containers ════════════ */
  {
    reference: 'RSC-STL-90330',
    clientId: 'SHP-103', projectKey: 'RSC_STEEL', fundingSourceId: 'CF-2026-REDSEA',
    openedDaysAgo: 15,
    bookings: [
      ...run(3, {
        transporterId: 'PTR-001', destination: 'Addis Ababa', via: ['Galafi'],
        cargo: 'Steel coils, 27t + escort', cargoType: 'machinery',
        rate: 44_300, rateSource: 'spot',
        costs: [['transport', 35_100], ['handling', 3_900], ['escort', 2_200]],
        completedDaysAgo: 8, podHoursAgo: 7 * 24,
      }),
      ...run(2, {
        transporterId: 'PTR-003', destination: 'Addis Ababa', via: ['Galafi'],
        cargo: 'Rebar bundles, 26t + escort', cargoType: 'machinery',
        rate: 44_100, rateSource: 'spot',
        costs: [['transport', 34_900], ['handling', 3_900], ['escort', 2_200]],
        completedDaysAgo: 8, podHoursAgo: 7 * 24 - 4,
      }),
    ],
    releasedDaysAgo: 5,
    paidTransporters: { 'PTR-001': 2, 'ESC-001': 3 },
  },

  /* ══ SHI-00013 — the slow settle: 52 days ═══════════════════════════════
   * High margin, poor margin-per-capital-day. The comparison the business
   * cannot currently make.
   */
  {
    reference: 'RSC-STL-89802',
    clientId: 'SHP-103', projectKey: 'RSC_STEEL', fundingSourceId: 'CF-2026-REDSEA',
    openedDaysAgo: 96,
    bookings: run(3, {
      transporterId: 'PTR-001', destination: 'Addis Ababa', via: ['Galafi'],
      cargo: 'Steel coils, 27t + escort', cargoType: 'machinery',
      rate: 44_600, rateSource: 'contract_tariff',
      costs: [['transport', 34_800], ['handling', 3_800], ['escort', 2_100]],
      completedDaysAgo: 91, podHoursAgo: 88 * 24,
    }),
    releasedDaysAgo: 88,
    paidTransporters: { 'PTR-001': 2, 'HDL-001': 2, 'ESC-001': 2 },
    invoicePaidAfterDays: 52,
  },

  /* ══ SHI-00014 — fresh arrival, nothing proven yet ══════════════════════ */
  {
    reference: 'RSC-FRT-11907',
    clientId: 'SHP-103', projectKey: 'RSC_FERT', fundingSourceId: 'CF-2026-REDSEA',
    openedDaysAgo: 12,
    bookings: run(4, {
      transporterId: 'PTR-003', destination: 'Mekelle', via: ['Galafi', 'Semera'],
      cargo: 'Fertiliser bags, 26t', cargoType: 'bulk',
      rate: 43_000, rateSource: 'spot',
      costs: [['transport', 34_400], ['handling', 3_700], ['customs', 1_700]],
      completedDaysAgo: 9,
    }),
  },

  /* ══ SHI-00015 — RELEASED WITH UNPRICED BOOKINGS ════════════════════════
   * Six containers out the door, two of them with no client rate at all. Money
   * has left against an unknown price — the loudest item the queue can raise,
   * and the reason margin must never be estimated.
   */
  {
    reference: 'HRN-BEV-60220',
    clientId: 'SHP-104', projectKey: 'HRN_BEV', fundingSourceId: 'CL-2026-HORN',
    openedDaysAgo: 22,
    bookings: [
      ...run(4, {
        transporterId: 'PTR-001', destination: 'Addis Ababa', via: ['Galafi'],
        cargo: '1×40ft — bottled beverages', cargoType: 'containerized',
        rate: 41_900, rateSource: 'contract_tariff',
        costs: [['transport', 33_800], ['handling', 3_700]],
        completedDaysAgo: 13, podHoursAgo: 12 * 24,
      }),
      ...run(2, {
        transporterId: 'PTR-002', destination: 'Addis Ababa', via: ['Galafi'],
        cargo: '1×40ft — textiles, rate not agreed', cargoType: 'containerized',
        rate: null,
        costs: [['transport', 37_200], ['handling', 4_100]],
        completedDaysAgo: 13, podHoursAgo: 12 * 24,
      }),
    ],
    releasedDaysAgo: 10,
    paidTransporters: { 'PTR-001': 2 },
  },

  /* ══ SHI-00016 — 25 days past due on a credit line: CAC's chase ═════════ */
  {
    reference: 'HRN-BEV-59911',
    clientId: 'SHP-104', projectKey: 'HRN_BEV', fundingSourceId: 'CL-2026-HORN',
    openedDaysAgo: 64,
    bookings: run(3, {
      transporterId: 'PTR-003', destination: 'Addis Ababa', via: ['Galafi'],
      cargo: '1×20ft — spare parts', cargoType: 'containerized',
      rate: 41_500, rateSource: 'contract_tariff',
      costs: [['transport', 33_200], ['handling', 3_700]],
      completedDaysAgo: 58, podHoursAgo: 55 * 24,
    }),
    releasedDaysAgo: 55,
    paidTransporters: { 'PTR-003': 2, 'HDL-001': 2 },
  },

  /* ══ SHI-00017 — DPCS pool funded AND DPCS originated ═══════════════════
   * The other half of the contradiction: here the pool itself pays.
   */
  {
    reference: 'HRN-BLK-40118',
    clientId: 'SHP-104', projectKey: 'HRN_BULK', fundingSourceId: 'DPCS-2026-POOL',
    openedDaysAgo: 58,
    bookings: run(4, {
      transporterId: 'PTR-003', destination: 'Hawassa', via: ['Galafi', 'Addis Ababa'],
      cargo: 'Bottled water, palletised', cargoType: 'bulk',
      rate: 41_900, rateSource: 'spot',
      costs: [['transport', 33_500], ['handling', 3_700]],
      completedDaysAgo: 53, podHoursAgo: 50 * 24,
    }),
    releasedDaysAgo: 50,
    paidTransporters: { 'PTR-003': 2, 'HDL-001': 2 },
    invoicePaidAfterDays: 35,
  },

  /* ══ One-offs — real work belonging to no project ═══════════════════════
   * A client rings up for a single consignment and never turns it into a
   * programme. These are funded, billed and chased exactly like project work;
   * they simply have no project to roll up into. A null project is a
   * legitimate state, not missing data.
   */
  {
    reference: 'AMN-SPOT-7714',
    clientId: 'SHP-101', standaloneChannel: 'fleetin_direct', fundingSourceId: 'CF-2026-AMINA',
    openedDaysAgo: 10,
    bookings: run(2, {
      transporterId: 'PTR-001', destination: 'Addis Ababa', via: ['Galafi'],
      cargo: '1×40ft — spare parts, urgent', cargoType: 'containerized',
      rate: 42_700, rateSource: 'spot',
      costs: [['transport', 34_300], ['handling', 3_800]],
      completedDaysAgo: 7, podHoursAgo: 7 * 24 - 5,
    }),
    releasedDaysAgo: 4,
    paidTransporters: { 'PTR-001': 2, 'HDL-001': 2 },
  },
  {
    reference: 'AMN-SPOT-7820',
    clientId: 'SHP-101', standaloneChannel: 'fleetin_direct', fundingSourceId: 'CF-2026-AMINA',
    openedDaysAgo: 4,
    bookings: [
      {
        transporterId: 'PTR-002', destination: 'Dire Dawa',
        cargo: 'Loose cement, single lift', cargoType: 'bulk',
        rate: 40_000, rateSource: 'spot',
        costs: [['transport', 34_200]],
        completedDaysAgo: 2, podHoursAgo: 26,
      },
    ],
  },
  {
    // A one-off with no price AND no proof — the gap has to survive outside
    // projects too, on both axes at once.
    reference: 'RSC-SPOT-3390',
    clientId: 'SHP-103', standaloneChannel: 'fleetin_direct', fundingSourceId: 'CF-2026-REDSEA',
    openedDaysAgo: 6,
    bookings: [
      {
        transporterId: 'PTR-003', destination: 'Mekelle', via: ['Galafi', 'Semera'],
        cargo: 'Generator set, oversize', cargoType: 'machinery',
        rate: null,
        costs: [['transport', 38_600], ['escort', 2_600]],
        completedDaysAgo: 4,
      },
    ],
  },
  {
    reference: 'BRK-SPOT-2205',
    clientId: 'SHP-102', standaloneChannel: 'fleetin_direct', fundingSourceId: 'CL-2026-BARAKA',
    openedDaysAgo: 15,
    bookings: run(2, {
      transporterId: 'PTR-001', destination: 'Hawassa', via: ['Galafi', 'Addis Ababa'],
      cargo: '1×20ft — pharmaceuticals', cargoType: 'containerized',
      rate: 40_800, rateSource: 'spot',
      costs: [['transport', 32_800], ['handling', 3_600]],
      completedDaysAgo: 12, podHoursAgo: 12 * 24 - 6,
    }),
    releasedDaysAgo: 9,
    paidTransporters: { 'PTR-001': 2, 'HDL-001': 2 },
  },
  {
    reference: 'HRN-SPOT-1180',
    clientId: 'SHP-104', standaloneChannel: 'dpcs', fundingSourceId: 'CL-2026-HORN',
    openedDaysAgo: 12,
    bookings: run(2, {
      transporterId: 'PTR-002', destination: 'Addis Ababa', via: ['Galafi'],
      cargo: 'Bagged sugar, single lift', cargoType: 'bulk',
      rate: 40_500, rateSource: 'spot',
      costs: [['transport', 34_400], ['handling', 3_300]],
      completedDaysAgo: 9, podHoursAgo: 9 * 24 - 4,
    }),
    releasedDaysAgo: 6,
    paidTransporters: { 'PTR-002': 2 },
  },
];

// ─── Builder ────────────────────────────────────────────────────────────────

const SERVICE_FOR: Partial<Record<CostType, string>> = {
  handling: 'HDL-001',
  customs: 'CUS-001',
  escort: 'ESC-001',
  demurrage: 'DPA-001',
};

const NAME_OF = new Map(FINANCE_TRANSPORTERS.map((entry) => [entry.id, entry.name]));

/** Box numbers look like box numbers. Cosmetic, but a bare id reads as fake. */
const BOX_PREFIXES = ['MSCU', 'TGHU', 'CMAU', 'OOLU', 'HLXU'];
let boxCounter = 4_412_330;
function nextContainerNumber(): string {
  boxCounter += 7;
  const prefix = BOX_PREFIXES[boxCounter % BOX_PREFIXES.length] as string;
  return `${prefix}-${String(boxCounter).slice(0, 7)}`;
}

interface BuiltShipment {
  shipment: FinanceShipment;
  bookings: FinanceBooking[];
  invoice?: ClientInvoice;
  payments: ShipmentPayment[];
}

function buildShipment(seed: ShipmentSeed): BuiltShipment {
  const shipmentId = nextId('shipment');
  const project = seed.projectKey ? PROJECT_BY_KEY.get(seed.projectKey) : undefined;
  if (!project && !seed.standaloneChannel) {
    throw new Error(`Shipment seed ${seed.reference} has neither a project nor a channel`);
  }

  const releasedAt = seed.releasedDaysAgo !== undefined ? dAgo(seed.releasedDaysAgo) : undefined;

  // ── Bookings ──────────────────────────────────────────────────────────────
  const bookings: FinanceBooking[] = seed.bookings.map((bookingSeed, bookingIndex) => {
    const bookingId = nextId('booking');
    const podSentAt =
      bookingSeed.podHoursAgo !== undefined ? hAgo(bookingSeed.podHoursAgo) : undefined;
    const completedAt =
      bookingSeed.completedDaysAgo !== undefined ? dAgo(bookingSeed.completedDaysAgo) : undefined;

    /*
     * A seeded PoD is a PoD that was collected: both proofs exist behind it.
     * The engine refuses `podSentAt` without them, and seed data must not be
     * able to express a state the engine cannot produce.
     */
    const podDocuments: PodDocument[] = podSentAt
      ? [
          {
            kind: 'signed_pdf',
            fileName: `PoD-${bookingId}-signed.pdf`,
            mimeType: 'application/pdf',
            sizeBytes: 236_000 + bookingIndex * 1_100,
            uploadedAt: podSentAt,
            uploadedBy: 'ops.dispatch',
          },
          {
            kind: 'delivery_photo',
            fileName: `PoD-${bookingId}-drop.jpg`,
            mimeType: 'image/jpeg',
            sizeBytes: 1_420_000 + bookingIndex * 3_300,
            uploadedAt: podSentAt,
            uploadedBy: 'ops.dispatch',
          },
        ]
      : [];

    const costLines: CostLine[] = bookingSeed.costs.map((cost) => ({
      id: nextId('costLine'),
      type: cost[0],
      counterpartyId: cost[2] ?? SERVICE_FOR[cost[0]] ?? bookingSeed.transporterId,
      counterpartyName:
        NAME_OF.get(cost[2] ?? SERVICE_FOR[cost[0]] ?? bookingSeed.transporterId) ??
        bookingSeed.transporterId,
      amountDjf: cost[1],
      // Payment is stamped below, per settlement — never per line here.
    }));

    return {
      id: bookingId,
      shipmentId,
      containerNumber:
        bookingSeed.cargoType === 'containerized' ? nextContainerNumber() : undefined,
      cargoType: bookingSeed.cargoType,
      cargoSummary: bookingSeed.cargo,
      origin: 'Djibouti Port',
      transitPoints: bookingSeed.via,
      destination: bookingSeed.destination,
      transporterId: bookingSeed.transporterId,
      clientRateDjf: bookingSeed.rate,
      rateSource: bookingSeed.rate !== null ? bookingSeed.rateSource : undefined,
      proof: { completedAt, podSentAt, podDocuments },
      costLines,
    };
  });

  // ── Holds ─────────────────────────────────────────────────────────────────
  // A hold's clock is measured from the moment the consignment became fully
  // proven, because that is when its validation window started.
  const provenAt = bookings.every((booking) => booking.proof.podSentAt)
    ? bookings.reduce<string>(
        (latest, booking) =>
          (booking.proof.podSentAt as string) > latest
            ? (booking.proof.podSentAt as string)
            : latest,
        bookings[0]?.proof.podSentAt ?? dAgo(seed.openedDaysAgo),
      )
    : undefined;

  const holds: PayoutHold[] = (seed.holds ?? []).map((hold) => {
    const base = new Date(provenAt ?? dAgo(seed.openedDaysAgo)).getTime();
    const raisedMs = base + hold.raisedAfterProofH * HOUR;
    return {
      id: nextId('hold'),
      bookingId:
        hold.bookingIndex !== undefined ? bookings[hold.bookingIndex]?.id : undefined,
      category: hold.category,
      reason: hold.reason,
      raisedBy: hold.raisedBy,
      raisedAt: new Date(raisedMs).toISOString(),
      clearedAt:
        hold.clearedAfterH !== undefined
          ? new Date(raisedMs + hold.clearedAfterH * HOUR).toISOString()
          : undefined,
      clearedBy: hold.clearedAfterH !== undefined ? hold.clearedBy ?? 'finance.desk' : undefined,
    };
  });

  const shipment: FinanceShipment = {
    id: shipmentId,
    reference: seed.reference,
    projectId: project?.id ?? null,
    clientId: seed.clientId,
    clientContractRef: FINANCE_CLIENTS.find((client) => client.id === seed.clientId)?.contractRef,
    fundingSourceId: seed.fundingSourceId,
    // A project's shipments inherit its channel; a one-off carries its own.
    originationChannel: project?.channel ?? seed.standaloneChannel ?? 'fleetin_direct',
    openedAt: dAgo(seed.openedDaysAgo),
    payout: { releasedAt, releasedBy: releasedAt ? 'finance.desk' : undefined, holds },
  };

  // ── Settlements paid ──────────────────────────────────────────────────────
  /*
   * ONE payment per transporter per shipment — the whole point. A haulier with
   * twelve containers on this consignment gets one voucher covering all twelve,
   * and every one of his cost lines is stamped with that same reference. This
   * is what makes reconciliation possible: one bank transfer, one PAY id, N
   * bookings.
   */
  const payments: ShipmentPayment[] = [];
  const releasedDaysAgo = seed.releasedDaysAgo;
  if (releasedAt && releasedDaysAgo !== undefined && seed.paidTransporters) {
    for (const [transporterId, daysAfter] of Object.entries(seed.paidTransporters)) {
      const paidAt = dAgo(releasedDaysAgo - daysAfter);
      const covered = bookings.filter((booking) =>
        booking.costLines.some((line) => line.counterpartyId === transporterId),
      );
      if (covered.length === 0) continue;

      const paymentId = nextId('payment');
      let amountDjf = 0;
      const method = transporterId.startsWith('PTR') ? 'bank_transfer' : 'mobile_money';
      const paymentRef = `${method === 'mobile_money' ? 'MM' : 'TRF'}-${paymentId.slice(-5)}`;

      for (const booking of covered) {
        for (const line of booking.costLines) {
          if (line.counterpartyId !== transporterId) continue;
          line.paidAt = paidAt;
          line.paidVia = method;
          line.paymentId = paymentId;
          line.paymentRef = paymentRef;
          amountDjf += line.amountDjf;
        }
      }

      payments.push({
        id: paymentId,
        shipmentId,
        transporterId,
        transporterName: NAME_OF.get(transporterId) ?? transporterId,
        bookingIds: covered.map((booking) => booking.id),
        amountDjf,
        paidAt,
        paidVia: method,
        paymentRef,
        paidBy: 'finance.desk',
        // Older vouchers have come back signed; the most recent have not —
        // a real gap the desk has to be able to see.
        acknowledgedAt: daysAfter >= 2 && releasedDaysAgo > 8 ? paidAt : undefined,
        acknowledgedBy: daysAfter >= 2 && releasedDaysAgo > 8 ? 'transport.office' : undefined,
      });
    }
  }

  // ── Invoice ───────────────────────────────────────────────────────────────
  /*
   * One invoice per shipment, issued the moment the LAST container is proven —
   * that is when the consignment is complete and the client's terms start.
   * Unpriced bookings are simply not on it; a shipment with nothing priced gets
   * no invoice at all, and that gap is the point.
   */
  let invoice: ClientInvoice | undefined;
  const priced = bookings.filter((booking) => booking.clientRateDjf !== null);
  if (provenAt && priced.length > 0) {
    const terms =
      FINANCE_CLIENTS.find((client) => client.id === seed.clientId)?.paymentTermsDays ?? 30;
    const issuedMs = new Date(provenAt).getTime();
    invoice = {
      id: nextId('invoice'),
      shipmentId,
      clientId: seed.clientId,
      bookingIds: priced.map((booking) => booking.id),
      amountDjf: priced.reduce((sum, booking) => sum + (booking.clientRateDjf ?? 0), 0),
      issuedAt: provenAt,
      dueAt: new Date(issuedMs + terms * DAY).toISOString(),
      paidAt:
        seed.invoicePaidAfterDays !== undefined
          ? new Date(issuedMs + seed.invoicePaidAfterDays * DAY).toISOString()
          : undefined,
      reminders: seed.reminders ?? [],
    };
    shipment.invoiceId = invoice.id;
  }

  return { shipment, bookings, invoice, payments };
}

const built = SHIPMENT_SEEDS.map(buildShipment);

export const FINANCE_SHIPMENTS: FinanceShipment[] = built.map((entry) => entry.shipment);

export const FINANCE_BOOKINGS: FinanceBooking[] = built.flatMap((entry) => entry.bookings);

export const FINANCE_PAYMENTS: ShipmentPayment[] = built.flatMap((entry) => entry.payments);

export const FINANCE_INVOICES: ClientInvoice[] = built
  .map((entry) => entry.invoice)
  .filter((invoice): invoice is ClientInvoice => invoice !== undefined);

// ─── Ledger movements ───────────────────────────────────────────────────────

/**
 * Draws are generated from every released SHIPMENT — one release, one draw,
 * for the whole consignment's cost — so the ledger and the shipment board can
 * never disagree. The most recent draws are deliberately unconfirmed: they sit
 * in the action queue until someone ticks them off against the bank.
 *
 * Repayments are authored as LUMPS that match no draw. On the pool facilities
 * that is the design; on the credit lines they are the client's own repayments
 * restoring availability.
 */
const shipmentDraws: LedgerMovement[] = built.flatMap(({ shipment, bookings }) => {
  const releasedAt = shipment.payout.releasedAt;
  if (!releasedAt) return [];
  const total = bookings.reduce(
    (sum, booking) => sum + booking.costLines.reduce((s, line) => s + line.amountDjf, 0),
    0,
  );
  const releasedDaysAgo = (NOW - new Date(releasedAt).getTime()) / DAY;
  return [
    {
      id: nextId('draw'),
      fundingSourceId: shipment.fundingSourceId,
      kind: 'draw' as const,
      amountDjf: total,
      date: releasedAt,
      shipmentId: shipment.id,
      confirmed: releasedDaysAgo > 6.5,
      note: `Funded payout for ${shipment.id} — ${bookings.length} booking${
        bookings.length === 1 ? '' : 's'
      }`,
    },
  ];
});

const historyAndRepayments: LedgerMovement[] = [
  // Opening balances: settled consignments now archived, drawn before this dataset.
  { id: nextId('draw'), fundingSourceId: 'CF-2026-AMINA', kind: 'draw', amountDjf: 690_000, date: dAgo(130), confirmed: true, note: 'Archived consignments — March corridor push' },
  { id: nextId('draw'), fundingSourceId: 'CF-2026-AMINA', kind: 'draw', amountDjf: 540_000, date: dAgo(104), confirmed: true, note: 'Archived consignments batch' },
  { id: nextId('draw'), fundingSourceId: 'CF-2026-REDSEA', kind: 'draw', amountDjf: 480_000, date: dAgo(96), confirmed: true, note: 'Archived consignments batch' },
  { id: nextId('draw'), fundingSourceId: 'CL-2026-BARAKA', kind: 'draw', amountDjf: 720_000, date: dAgo(110), confirmed: true, note: 'Archived consignments batch' },
  { id: nextId('draw'), fundingSourceId: 'CL-2026-HORN', kind: 'draw', amountDjf: 310_000, date: dAgo(70), confirmed: true, note: 'Archived consignments batch' },
  // Labelled as a DPCS draw... on the Horn credit line. The contradiction, verbatim.
  { id: nextId('draw'), fundingSourceId: 'CL-2026-HORN', kind: 'draw', amountDjf: 124_000, date: dAgo(36), confirmed: true, note: 'DPCS draw (as labelled in bank advice) — see DPCS decision flag' },

  // Pool repayments: lumps, unmatched to draws — by design.
  { id: nextId('repayment'), fundingSourceId: 'CF-2026-AMINA', kind: 'repayment', amountDjf: 580_000, date: dAgo(58), confirmed: true, note: 'Pool repayment after AMINA settlements — no draw matching' },
  { id: nextId('repayment'), fundingSourceId: 'CF-2026-AMINA', kind: 'repayment', amountDjf: 390_000, date: dAgo(31), confirmed: true, note: 'Pool repayment' },
  { id: nextId('repayment'), fundingSourceId: 'CF-2026-AMINA', kind: 'repayment', amountDjf: 260_000, date: dAgo(12), confirmed: true, note: 'Pool repayment' },
  { id: nextId('repayment'), fundingSourceId: 'CF-2026-REDSEA', kind: 'repayment', amountDjf: 340_000, date: dAgo(26), confirmed: true, note: 'Pool repayment' },
  // Revolving: the client's own repayments restore availability.
  { id: nextId('repayment'), fundingSourceId: 'CL-2026-BARAKA', kind: 'repayment', amountDjf: 590_000, date: dAgo(41), confirmed: true, note: 'Client repayment to CAC — availability restored' },
  { id: nextId('repayment'), fundingSourceId: 'CL-2026-BARAKA', kind: 'repayment', amountDjf: 230_000, date: dAgo(9), confirmed: true, note: 'Client repayment to CAC' },
  { id: nextId('repayment'), fundingSourceId: 'CL-2026-HORN', kind: 'repayment', amountDjf: 240_000, date: dAgo(21), confirmed: true, note: 'Client repayment to CAC' },
];

export const FINANCE_MOVEMENTS: LedgerMovement[] = [...historyAndRepayments, ...shipmentDraws];

// ─── Settings ───────────────────────────────────────────────────────────────

/**
 * PLACEHOLDER thresholds. The brief is explicit that these values are a
 * business decision that has not been made — they exist so the warning states
 * are demonstrable, they are editable in Economics → thresholds, and they are
 * flagged for confirmation. The floor is advisory, never a block.
 */
export const FINANCE_DEFAULT_SETTINGS: FinanceSettings = {
  targetMarginPct: 15,
  marginFloorPct: 8,
  validationWindowHours: 48,
  payoutPromiseDays: 2,
};

export const FINANCE_TICK_MS = 30_000;
