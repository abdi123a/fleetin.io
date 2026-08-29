import type { BankAccountRecord } from '@/features/bank-accounts/api/bankAccountsService';
import type {
  CreditFacilityRecord,
  DrawdownRecord,
  InvoiceRecord,
  LedgerEntryRecord,
  PaymentOrderRecord,
  PayoutHoldRecord,
} from '@/features/finance';
import type { HrDashboard } from '@/features/hr/api/hrService';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';
import type { EnrichedDriver, EnrichedVehicle } from '@/data/partnerData';
import { isChainBroken, isCritical, riskOf, selectChains, selectKpis } from '@/stores/emptyReturn.store';
import type { EmptyReturnKpis, EmptyReturnRecord, FullLoadMission } from '@/types/emptyReturn';
import type { PartnerRecord } from '@/types/partner';
import type { ShipperRecord } from '@/types/shipper';
import { aggregateMoneyPosition, type MoneyPosition } from '@/pages/finance/shipmentFinance';

/**
 * Every figure the admin control room shows, derived in one pass.
 *
 * Same contract as the shipper, transporter and Empty Returns consoles: the
 * page builds this model once per render and every panel below it is purely
 * presentational. Two panels quoting the same number read it from the same
 * field, so they cannot disagree — and each figure keeps the module's own
 * selector as its source (`aggregateMoneyPosition` for money, `riskOf`/
 * `selectKpis` for returns, the HR dashboard endpoint for people), so this
 * screen and the module it summarises cannot disagree either.
 *
 * Nothing here invents a number. Where the real model has no field for
 * something a dashboard would normally show, the figure is absent rather than
 * estimated — an admin acting on an invented total is worse off than one who
 * can see the gap.
 */

export const DAY_MS = 86_400_000;

/* ═══════════════════════════════════════════════════════════════════════════
 * Operations — shipments
 * ═══════════════════════════════════════════════════════════════════════ */

export type ShipmentStageKey = 'scheduled' | 'moving' | 'awaiting_pod' | 'proof_in' | 'closed' | 'stopped';

export interface ShipmentStage {
  key: ShipmentStageKey;
  label: string;
  /** What an operator does about it — the line under the count. */
  caption: string;
  count: number;
  color: string;
  fg: string;
}

/**
 * The twelve backend statuses folded into the six states an administrator
 * actually steers by. The fills follow the house law the Empty Returns
 * pipeline established — neutral while nothing is owed, orange for the one
 * stage that is somebody's fault, then a darkening teal ramp as the
 * consignment firms up — with red kept for the only stage that is a loss.
 */
const STAGE_OF: Record<string, ShipmentStageKey> = {
  Pending: 'scheduled',
  'Payment Pending': 'scheduled',
  Assigned: 'scheduled',
  'Driver Assigned': 'scheduled',
  'Heading to Pickup': 'moving',
  'At Pickup': 'moving',
  Loading: 'moving',
  Loaded: 'moving',
  'En Route': 'moving',
  Arrived: 'awaiting_pod',
  Unloading: 'awaiting_pod',
  'POD Submitted': 'proof_in',
  'Empty Ready': 'proof_in',
  Completed: 'closed',
  Cancelled: 'stopped',
  Failed: 'stopped',
};

const STAGE_META: Record<ShipmentStageKey, { label: string; caption: string; color: string; fg: string }> = {
  scheduled: {
    label: 'Scheduled',
    caption: 'Booked, not yet moving',
    color: 'var(--chart-other)',
    fg: 'var(--fl-neutral-950)',
  },
  moving: {
    label: 'In transit',
    caption: 'Loading or en route',
    color: 'var(--fl-teal-400)',
    fg: 'var(--fl-neutral-950)',
  },
  awaiting_pod: {
    label: 'Awaiting POD',
    caption: 'Delivered, POD not filed',
    color: 'var(--accent-bold)',
    fg: 'var(--fl-neutral-950)',
  },
  proof_in: {
    label: 'POD filed',
    caption: 'Release can proceed',
    color: 'var(--fl-teal-600)',
    fg: 'var(--fl-neutral-0)',
  },
  closed: {
    label: 'Closed',
    caption: 'Delivered and complete',
    color: 'var(--fl-teal-800)',
    fg: 'var(--fl-neutral-0)',
  },
  stopped: {
    label: 'Stopped',
    caption: 'Cancelled or failed',
    color: 'var(--destructive)',
    fg: 'var(--fl-neutral-0)',
  },
};

const STAGE_ORDER: ShipmentStageKey[] = ['scheduled', 'moving', 'awaiting_pod', 'proof_in', 'closed', 'stopped'];

export interface OperationsModel {
  /** Every shipment on the books, whatever its state. */
  total: number;
  /** Not closed, not stopped — the live workload. */
  live: number;
  /** Containers under the live shipments, from the server's own `bookingCount`. */
  containers: number;
  stages: ShipmentStage[];
  /** Delivered with the paper in, payout not yet released — the desk's move. */
  awaitingRelease: number;
  /** Released to transporters but no client price on the shipment. */
  releasedUnpriced: number;
  /** Carrying no client price at all — revenue that cannot be billed yet. */
  unpriced: number;
  /** Live shipments with no vehicle attached. */
  unassigned: number;
  /** Share of closed-or-stopped shipments that closed rather than stopped. */
  completionRate: number | null;
}

function buildOperations(shipments: ShipmentRecord[]): OperationsModel {
  const counts = new Map<ShipmentStageKey, number>();
  for (const stage of STAGE_ORDER) counts.set(stage, 0);

  let containers = 0;
  let live = 0;
  let awaitingRelease = 0;
  let releasedUnpriced = 0;
  let unpriced = 0;
  let unassigned = 0;

  for (const shipment of shipments) {
    const stage = STAGE_OF[shipment.status] ?? 'scheduled';
    counts.set(stage, (counts.get(stage) ?? 0) + 1);

    const isLive = stage !== 'closed' && stage !== 'stopped';
    if (isLive) {
      live += 1;
      containers += shipment.bookingCount ?? 0;
      if (!shipment.vehicleId) unassigned += 1;
    }

    if (shipment.clientRateMinorUnits == null && stage !== 'stopped') unpriced += 1;
    if (shipment.payoutReleasedAt && shipment.clientRateMinorUnits == null) releasedUnpriced += 1;
    if (!shipment.payoutReleasedAt && (stage === 'proof_in' || stage === 'closed')) awaitingRelease += 1;
  }

  const closed = counts.get('closed') ?? 0;
  const stopped = counts.get('stopped') ?? 0;
  const finished = closed + stopped;

  return {
    total: shipments.length,
    live,
    containers,
    stages: STAGE_ORDER.map((key) => ({ key, count: counts.get(key) ?? 0, ...STAGE_META[key] })),
    awaitingRelease,
    releasedUnpriced,
    unpriced,
    unassigned,
    completionRate: finished > 0 ? closed / finished : null,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Empty returns
 * ═══════════════════════════════════════════════════════════════════════ */

export interface ReturnBucket {
  key: 'overdue' | 'critical' | 'watch' | 'safe' | 'none';
  label: string;
  count: number;
  color: string;
}

export interface EmptyReturnsModel {
  kpis: EmptyReturnKpis;
  /** Physically still out: not completed, not yet gated in. */
  stillOut: number;
  buckets: ReturnBucket[];
  /** Back inside the line's deadline — the protected set. */
  returnedOnTime: number;
  /** Back after it, on the records that carry a deadline at all. */
  returnedLate: number;
  /** On-time share of everything already returned. Null while nothing is back. */
  onTimeRate: number | null;
  /** Open records with no deadline captured — the blind spot, stated. */
  noDeadline: number;
  /** `empty_ready` with no exception: what a cycle can be built on right now. */
  matchable: number;
  /** Open full loads a matchable empty could be welded to. */
  openFullLoads: number;
  /** Same-depot pairings available immediately. */
  sameDepotPairs: number;
  /** Chains still handing boxes forward — the card says "running", so broken ones are out. */
  chains: number;
  /** Worst-slack-first, already-breached only. The board's rows. */
  breached: EmptyReturnRecord[];
}

function buildEmptyReturns(
  records: EmptyReturnRecord[],
  missions: FullLoadMission[],
  now: number,
): EmptyReturnsModel {
  const open = records.filter((record) => record.status !== 'completed');
  const stillOut = open.filter((record) => !record.returnedAt);

  const counts = { overdue: 0, critical: 0, watch: 0, safe: 0, none: 0 };
  for (const record of stillOut) {
    const risk = riskOf(record, now);
    if (risk === 'overdue') counts.overdue += 1;
    else if (isCritical(risk)) counts.critical += 1;
    else if (risk === 'watch') counts.watch += 1;
    else if (risk === 'safe') counts.safe += 1;
    else counts.none += 1;
  }

  /*
   * Only records carrying both timestamps can be judged. A box that came back
   * with no deadline recorded is not "on time" — it is unmeasurable, and
   * counting it either way would move the rate the panel reports.
   */
  const returned = records.flatMap((record) =>
    record.returnedAt !== null && record.deadline !== null
      ? [{ returnedAt: record.returnedAt, deadline: record.deadline }]
      : [],
  );
  const returnedOnTime = returned.filter((entry) => entry.returnedAt <= entry.deadline).length;
  const returnedLate = returned.length - returnedOnTime;

  const matchableRecords = records.filter(
    (record) => record.status === 'empty_ready' && !record.exception,
  );
  const depots = new Set(missions.map((mission) => mission.locationId));
  const sameDepotPairs = matchableRecords.filter((record) => depots.has(record.locationId)).length;

  const breached = stillOut
    .filter((record) => riskOf(record, now) === 'overdue' || isCritical(riskOf(record, now)))
    .sort((a, b) => (a.deadline ?? Infinity) - (b.deadline ?? Infinity));

  return {
    kpis: selectKpis(records, now),
    stillOut: stillOut.length,
    buckets: [
      { key: 'overdue', label: 'Overdue', count: counts.overdue, color: 'var(--destructive)' },
      { key: 'critical', label: 'Critical', count: counts.critical, color: 'var(--accent-bold)' },
      { key: 'watch', label: 'Watch', count: counts.watch, color: 'var(--fl-orange-300)' },
      { key: 'safe', label: 'Safe', count: counts.safe, color: 'var(--primary)' },
      { key: 'none', label: 'No deadline', count: counts.none, color: 'var(--chart-other)' },
    ],
    returnedOnTime,
    returnedLate,
    onTimeRate: returned.length > 0 ? returnedOnTime / returned.length : null,
    noDeadline: open.filter((record) => !record.deadline).length,
    matchable: matchableRecords.length,
    openFullLoads: missions.length,
    sameDepotPairs,
    chains: selectChains(records).filter((chain) => !isChainBroken(chain)).length,
    breached,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Money — receivables, payables, treasury
 * ═══════════════════════════════════════════════════════════════════════ */

export interface AgeingBucket {
  key: 'current' | 'd30' | 'd60' | 'd60plus';
  label: string;
  amountDjf: number;
  count: number;
  color: string;
}

export interface TreasuryAccount {
  id: string;
  bankName: string;
  accountHolder: string;
  currency: string;
  balance: number;
  isPrimary: boolean;
  logoUrl?: string | null;
}

export interface MoneyModel extends MoneyPosition {
  /** Unpaid invoices bucketed by how far past their contract date they are. */
  ageing: AgeingBucket[];
  /** Invoices issued and not yet paid. */
  openInvoices: number;
  /** Of those, already past the contract date. */
  overdueInvoices: number;
  /** Payouts a hold is currently stopping. */
  openHolds: number;
  /** Cash across active DJF accounts. */
  cashDjf: number;
  /** Accounts held in another currency — counted, never summed into DJF. */
  foreignAccounts: number;
  accounts: TreasuryAccount[];
  /** Facility ceiling, what is drawn against it, and the share used. */
  facilityLimitDjf: number;
  facilityDrawnDjf: number;
  facilityUse: number | null;
  /** Drawdowns already past their due date. */
  drawdownsOverdue: number;
  /**
   * The platform rate configured in Settings, as a fraction. Fleetin's cut is
   * taken off the transporter's price list, so this is what the book *should*
   * be keeping — kept beside `marginPct`, which is what it actually kept.
   */
  configuredTakeRate: number;
}

function buildMoney(
  shipments: ShipmentRecord[],
  invoices: InvoiceRecord[],
  paidOrders: PaymentOrderRecord[],
  holds: PayoutHoldRecord[],
  accounts: BankAccountRecord[],
  facilities: CreditFacilityRecord[],
  drawdowns: DrawdownRecord[],
  configuredTakeRate: number,
  now: number,
): MoneyModel {
  const position = aggregateMoneyPosition(
    shipments,
    invoices,
    paidOrders,
    new Set(holds.map((hold) => hold.shipmentId)),
  );

  const ageingCounts = { current: 0, d30: 0, d60: 0, d60plus: 0 };
  const ageingAmounts = { current: 0, d30: 0, d60: 0, d60plus: 0 };
  let openInvoices = 0;
  let overdueInvoices = 0;

  for (const invoice of invoices) {
    if (invoice.status === 'Paid') continue;
    const remaining = Number(invoice.remainingMinorUnits);
    if (remaining <= 0) continue;
    openInvoices += 1;

    // Ceil, not floor: anything past the deadline at all is day 1 late — the
    // same strict `deadline < now` boundary `drawdownsOverdue` below and
    // `aggregateMoneyPosition`'s overdue test use.
    const daysPast = Math.ceil((now - new Date(invoice.contractDeadline).getTime()) / DAY_MS);
    const key = daysPast <= 0 ? 'current' : daysPast <= 30 ? 'd30' : daysPast <= 60 ? 'd60' : 'd60plus';
    ageingCounts[key] += 1;
    ageingAmounts[key] += remaining;
    if (daysPast > 0) overdueInvoices += 1;
  }

  const active = accounts.filter((account) => account.isActive);
  const djfAccounts = active.filter((account) => account.currency === 'DJF');

  const facilityLimitDjf = facilities
    .filter((facility) => facility.currency === 'DJF')
    .reduce((sum, facility) => sum + Number(facility.limitMinorUnits), 0);
  const facilityDrawnDjf = drawdowns.reduce(
    (sum, drawdown) => sum + Math.max(0, Number(drawdown.amountMinorUnits) - Number(drawdown.repaidMinorUnits)),
    0,
  );

  return {
    ...position,
    ageing: [
      { key: 'current', label: 'Within terms', count: ageingCounts.current, amountDjf: ageingAmounts.current, color: 'var(--primary)' },
      { key: 'd30', label: '1–30 days overdue', count: ageingCounts.d30, amountDjf: ageingAmounts.d30, color: 'var(--fl-orange-300)' },
      { key: 'd60', label: '31–60 days overdue', count: ageingCounts.d60, amountDjf: ageingAmounts.d60, color: 'var(--accent-bold)' },
      { key: 'd60plus', label: 'Over 60 days', count: ageingCounts.d60plus, amountDjf: ageingAmounts.d60plus, color: 'var(--destructive)' },
    ],
    openInvoices,
    overdueInvoices,
    openHolds: holds.length,
    cashDjf: djfAccounts.reduce((sum, account) => sum + Number(account.currentBalance), 0),
    foreignAccounts: active.length - djfAccounts.length,
    accounts: active
      .map((account) => ({
        id: account.id,
        bankName: account.bankName,
        accountHolder: account.accountHolder,
        currency: account.currency,
        balance: Number(account.currentBalance),
        isPrimary: account.isPrimary,
        logoUrl: account.logoUrl,
      }))
      .sort((a, b) => Number(b.isPrimary) - Number(a.isPrimary) || b.balance - a.balance),
    facilityLimitDjf,
    facilityDrawnDjf,
    facilityUse: facilityLimitDjf > 0 ? facilityDrawnDjf / facilityLimitDjf : null,
    drawdownsOverdue: drawdowns.filter(
      (drawdown) =>
        Number(drawdown.amountMinorUnits) - Number(drawdown.repaidMinorUnits) > 0 &&
        new Date(drawdown.dueAt).getTime() < now,
    ).length,
    configuredTakeRate,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The network — who Fleetin runs the work with
 * ═══════════════════════════════════════════════════════════════════════ */

export interface PartyRow {
  id: string;
  name: string;
  logoUrl?: string;
  shipments: number;
  containers: number;
  /** DJF. Revenue for a shipper, cost for a transporter. */
  valueDjf: number;
  /** Priced share — how much of this party's value is actually billable. */
  unpriced: number;
}

export interface NetworkModel {
  shippers: PartyRow[];
  transporters: PartyRow[];
  /** Every registered counterparty, not only those with shipments running. */
  shipperCount: number;
  transporterCount: number;
  /** Registered but not yet approved to trade. */
  shippersPending: number;
  transportersPending: number;
}

function buildNetwork(
  shipments: ShipmentRecord[],
  shippers: ShipperRecord[],
  partners: PartnerRecord[],
): NetworkModel {
  const byShipper = new Map<string, PartyRow>();
  const byTransporter = new Map<string, PartyRow>();

  const bump = (
    map: Map<string, PartyRow>,
    id: string,
    name: string,
    logoUrl: string | undefined,
    containers: number,
    valueDjf: number,
    priced: boolean,
  ) => {
    const row = map.get(id) ?? { id, name, logoUrl, shipments: 0, containers: 0, valueDjf: 0, unpriced: 0 };
    row.shipments += 1;
    row.containers += containers;
    row.valueDjf += valueDjf;
    if (!priced) row.unpriced += 1;
    map.set(id, row);
  };

  const shipperLogo = new Map(shippers.map((shipper) => [shipper.id, shipper.logoUrl]));
  const partnerLogo = new Map(partners.map((partner) => [partner.id, partner.logoUrl]));

  for (const shipment of shipments) {
    const containers = shipment.bookingCount ?? 0;
    const priced = shipment.clientRateMinorUnits != null;

    if (shipment.shipperId) {
      bump(
        byShipper,
        shipment.shipperId,
        shipment.customerCompany || shipment.customerName,
        shipperLogo.get(shipment.shipperId),
        containers,
        priced ? Number(shipment.clientRateMinorUnits) : 0,
        priced,
      );
    }
    if (shipment.partnerId) {
      bump(
        byTransporter,
        shipment.partnerId,
        shipment.transporterCompany || shipment.transporterName,
        partnerLogo.get(shipment.partnerId),
        containers,
        Number(shipment.rateMinorUnits),
        priced,
      );
    }
  }

  const rank = (map: Map<string, PartyRow>) =>
    [...map.values()].sort((a, b) => b.valueDjf - a.valueDjf || b.shipments - a.shipments);

  return {
    shippers: rank(byShipper),
    transporters: rank(byTransporter),
    shipperCount: shippers.length,
    transporterCount: partners.length,
    shippersPending: shippers.filter((shipper) => shipper.approvalStatus !== 'Verified').length,
    transportersPending: partners.filter((partner) => partner.partnerStatus !== 'Active').length,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Fleet compliance — the papers that ground a truck
 * ═══════════════════════════════════════════════════════════════════════ */

export interface ExpiryRow {
  id: string;
  subject: string;
  /** Which paper: insurance, registration, driving licence. */
  paper: string;
  owner: string;
  expiresOn: string;
  daysLeft: number;
}

export interface FleetModel {
  vehicles: number;
  vehiclesAvailable: number;
  vehiclesMoving: number;
  vehiclesDown: number;
  drivers: number;
  driversAvailable: number;
  /** Papers already out of date — a truck that cannot legally roll. */
  expired: number;
  /** Papers running out inside 30 days. */
  expiring: number;
  /** Soonest first, expired ones leading. */
  rows: ExpiryRow[];
}

function daysUntil(iso: string | undefined, now: number): number | null {
  if (!iso) return null;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) return null;
  return Math.floor((ms - now) / DAY_MS);
}

function buildFleet(vehicles: EnrichedVehicle[], drivers: EnrichedDriver[], now: number): FleetModel {
  const rows: ExpiryRow[] = [];

  const add = (id: string, subject: string, paper: string, owner: string, iso: string | undefined) => {
    const daysLeft = daysUntil(iso, now);
    if (daysLeft === null || daysLeft > 30) return;
    rows.push({ id, subject, paper, owner, expiresOn: iso as string, daysLeft });
  };

  for (const vehicle of vehicles) {
    add(`${vehicle.id}-ins`, vehicle.plateNumber, 'Insurance', vehicle.partnerName, vehicle.insuranceExpiry);
    add(`${vehicle.id}-reg`, vehicle.plateNumber, 'Registration', vehicle.partnerName, vehicle.registrationExpiry);
  }
  for (const driver of drivers) {
    add(`${driver.id}-lic`, driver.fullName, 'Driving licence', driver.partnerName, driver.licenseExpiry);
    add(`${driver.id}-nid`, driver.fullName, 'National ID', driver.partnerName, driver.nationalIdExpiry);
  }

  rows.sort((a, b) => a.daysLeft - b.daysLeft);

  return {
    vehicles: vehicles.length,
    vehiclesAvailable: vehicles.filter((vehicle) => vehicle.operationalStatus === 'Available').length,
    vehiclesMoving: vehicles.filter((vehicle) => vehicle.operationalStatus === 'In Transit').length,
    vehiclesDown: vehicles.filter(
      (vehicle) => vehicle.operationalStatus === 'Under Maintenance' || vehicle.operationalStatus === 'Out of Service',
    ).length,
    drivers: drivers.length,
    driversAvailable: drivers.filter((driver) => driver.status === 'Available').length,
    expired: rows.filter((row) => row.daysLeft < 0).length,
    expiring: rows.filter((row) => row.daysLeft >= 0).length,
    rows,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Movement — this month against last
 * ═══════════════════════════════════════════════════════════════════════ */

export interface MonthPoint {
  /** `2026-08`, so the series sorts and keys itself. */
  key: string;
  label: string;
  shipments: number;
  containers: number;
  revenueDjf: number;
  costDjf: number;
  /**
   * What Fleetin kept: the client price minus what the transporter is paid.
   * Counted only on priced shipments — an unpriced one has no commission to
   * report, and treating its cost as a loss would be a different claim.
   */
  commissionDjf: number;
}

export interface MovementModel {
  /** Oldest first, six months ending this one. */
  months: MonthPoint[];
  thisMonth: MonthPoint;
  lastMonth: MonthPoint | null;
  /** Fractions. Null when last month has no base to compare against. */
  shipmentsDelta: number | null;
  revenueDelta: number | null;
  /** Gross margin this month, on priced shipments only. */
  marginThisMonth: number | null;
  marginLastMonth: number | null;
}

function monthKey(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function buildMovement(shipments: ShipmentRecord[], now: number): MovementModel {
  const anchor = new Date(now);
  const months: MonthPoint[] = [];
  const index = new Map<string, MonthPoint>();

  for (let back = 5; back >= 0; back -= 1) {
    const date = new Date(anchor.getFullYear(), anchor.getMonth() - back, 1);
    const point: MonthPoint = {
      key: monthKey(date),
      label: date.toLocaleDateString('en-GB', { month: 'short' }),
      shipments: 0,
      containers: 0,
      revenueDjf: 0,
      costDjf: 0,
      commissionDjf: 0,
    };
    months.push(point);
    index.set(point.key, point);
  }

  for (const shipment of shipments) {
    const created = new Date(shipment.createdAt);
    const point = index.get(monthKey(created));
    if (!point) continue;
    point.shipments += 1;
    point.containers += shipment.bookingCount ?? 0;
    // Stopped shipments stay in the volume counts — they happened — but out
    // of every money series: the backend excludes Cancelled/Failed from
    // billing, so their cost and commission never move.
    if (STAGE_OF[shipment.status] === 'stopped') continue;
    const cost = Number(shipment.rateMinorUnits);
    point.costDjf += cost;
    if (shipment.clientRateMinorUnits != null) {
      const revenue = Number(shipment.clientRateMinorUnits);
      point.revenueDjf += revenue;
      point.commissionDjf += revenue - cost;
    }
  }

  const thisMonth = months[months.length - 1] as MonthPoint;
  const lastMonth = months[months.length - 2] ?? null;

  const delta = (current: number, previous: number | undefined) =>
    previous !== undefined && previous > 0 ? (current - previous) / previous : null;

  const margin = (point: MonthPoint | null) =>
    point && point.revenueDjf > 0 ? (point.revenueDjf - point.costDjf) / point.revenueDjf : null;

  return {
    months,
    thisMonth,
    lastMonth,
    shipmentsDelta: delta(thisMonth.shipments, lastMonth?.shipments),
    revenueDelta: delta(thisMonth.revenueDjf, lastMonth?.revenueDjf),
    marginThisMonth: margin(thisMonth),
    marginLastMonth: margin(lastMonth),
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The attention queue — everything asking for a decision, ranked
 * ═══════════════════════════════════════════════════════════════════════ */

export type AttentionSeverity = 'breach' | 'ask';

export interface AttentionItem {
  id: string;
  severity: AttentionSeverity;
  /** Which module owns the fix. */
  module: 'Shipments' | 'Empty Container' | 'Finance' | 'HR' | 'Fleet';
  title: string;
  /**
   * A second line, only where it carries a fact the title does not — a bucket
   * count, a location. Most rows have none: "Shipments with no vehicle"
   * followed by "No vehicle assigned yet." was the same sentence twice, and
   * thirteen of those cost the queue a screen.
   */
  detail?: string;
  count: number;
  /** Where clicking it lands. */
  to: string;
}

/* ═══════════════════════════════════════════════════════════════════════════
 * People
 * ═══════════════════════════════════════════════════════════════════════ */

export interface WorkforceModel {
  headcount: number;
  active: number;
  onLeave: number;
  byDepartment: { department: string; count: number }[];
  /** The open payroll run, or null when no period exists yet. */
  period: HrDashboard['period'];
  payroll: HrDashboard['payroll'];
  leave: HrDashboard['leave'];
  expiring: HrDashboard['expiring'];
  /** Employer cost for the period: net pay plus the employer's CNSS share. */
  employerCostDjf: number;
}

function buildWorkforce(hr: HrDashboard | undefined): WorkforceModel | null {
  if (!hr) return null;
  const statusCount = (status: string) =>
    hr.byStatus.find((entry) => entry.status === status)?.count ?? 0;

  return {
    headcount: hr.headcount,
    active: statusCount('ACTIVE'),
    onLeave: statusCount('ON_LEAVE'),
    byDepartment: [...hr.byDepartment].sort((a, b) => b.count - a.count),
    period: hr.period,
    payroll: hr.payroll,
    leave: hr.leave,
    expiring: hr.expiring,
    employerCostDjf: hr.payroll.totalGross + hr.payroll.employerContribution,
  };
}

/* ═══════════════════════════════════════════════════════════════════════════
 * The model
 * ═══════════════════════════════════════════════════════════════════════ */

export interface AdminConsoleModel {
  operations: OperationsModel;
  returns: EmptyReturnsModel;
  money: MoneyModel;
  network: NetworkModel;
  fleet: FleetModel;
  workforce: WorkforceModel | null;
  movement: MovementModel;
  attention: AttentionItem[];
  /** Most recent postings, newest first — the book's own audit trail. */
  activity: LedgerEntryRecord[];
}

export interface BuildAdminModelArgs {
  shipments: ShipmentRecord[];
  returnRecords: EmptyReturnRecord[];
  fullLoads: FullLoadMission[];
  invoices: InvoiceRecord[];
  paidOrders: PaymentOrderRecord[];
  holds: PayoutHoldRecord[];
  accounts: BankAccountRecord[];
  facilities: CreditFacilityRecord[];
  drawdowns: DrawdownRecord[];
  shippers: ShipperRecord[];
  partners: PartnerRecord[];
  vehicles: EnrichedVehicle[];
  drivers: EnrichedDriver[];
  hr: HrDashboard | undefined;
  ledger: LedgerEntryRecord[];
  /** Percent, the way Settings stores it — 7.5 means 7.5%. */
  commissionPct: number;
  /** Routes the queue items link to, injected so the model stays route-free. */
  routes: {
    shipments: string;
    emptyReturns: string;
    emptyReturnCycles: string;
    emptyReturnMatching: string;
    finance: string;
    financeInvoices: string;
    hr: string;
    hrEmployees: string;
    vehicles: string;
  };
  now: number;
}

export function buildAdminConsoleModel(args: BuildAdminModelArgs): AdminConsoleModel {
  const { now, routes } = args;

  const operations = buildOperations(args.shipments);
  const returns = buildEmptyReturns(args.returnRecords, args.fullLoads, now);
  const money = buildMoney(
    args.shipments,
    args.invoices,
    args.paidOrders,
    args.holds,
    args.accounts,
    args.facilities,
    args.drawdowns,
    args.commissionPct / 100,
    now,
  );
  const network = buildNetwork(args.shipments, args.shippers, args.partners);
  const fleet = buildFleet(args.vehicles, args.drivers, now);
  const workforce = buildWorkforce(args.hr);
  const movement = buildMovement(args.shipments, now);

  /*
   * The queue is the page's argument: a breach is something that has already
   * cost money or broken a rule, an ask is something that will if nobody acts.
   * Nothing enters it without a real count behind it, and the order is
   * severity first, then size — never module order, which would rank by
   * whoever wrote the panel rather than by what matters tonight.
   */
  const attention: AttentionItem[] = [];
  const push = (item: AttentionItem) => {
    if (item.count > 0) attention.push(item);
  };

  const overdueBucket = money.ageing.find((bucket) => bucket.key === 'd60plus');

  push({
    id: 'returns-overdue',
    severity: 'breach',
    module: 'Empty Container',
    title: 'Containers past return deadline',
    count: returns.kpis.overdue,
    // The Control Tower, not Cycles: Cycles is the history of what happened,
    // and a container still out is not history.
    to: routes.emptyReturns,
  });
  push({
    id: 'invoices-overdue',
    severity: 'breach',
    module: 'Finance',
    title: 'Overdue invoices',
    detail: overdueBucket && overdueBucket.count > 0
      ? `${overdueBucket.count} over 60 days overdue`
      : undefined,
    count: money.overdueInvoices,
    to: routes.financeInvoices,
  });
  push({
    id: 'fleet-expired',
    severity: 'breach',
    module: 'Fleet',
    title: 'Expired vehicle and driver documents',
    count: fleet.expired,
    to: routes.vehicles,
  });
  push({
    id: 'drawdowns-overdue',
    severity: 'breach',
    module: 'Finance',
    title: 'Overdue drawdowns',
    count: money.drawdownsOverdue,
    to: routes.finance,
  });
  push({
    id: 'returns-critical',
    severity: 'ask',
    module: 'Empty Container',
    title: 'Containers in critical window',
    count: returns.kpis.critical,
    to: routes.emptyReturns,
  });
  push({
    id: 'holds-open',
    severity: 'ask',
    module: 'Finance',
    title: 'Settlements on hold',
    count: money.openHolds,
    to: routes.finance,
  });
  push({
    id: 'released-unpriced',
    severity: 'ask',
    module: 'Finance',
    title: 'Unpriced released shipments',
    count: operations.releasedUnpriced,
    to: routes.finance,
  });
  push({
    id: 'awaiting-release',
    severity: 'ask',
    module: 'Shipments',
    title: 'Shipments pending release',
    count: operations.awaitingRelease,
    to: routes.shipments,
  });
  push({
    id: 'returns-matchable',
    severity: 'ask',
    module: 'Empty Container',
    title: 'Empties awaiting a decision',
    /* Only when there are any: "0 already at a location…" is a line that says
       nothing, and a row with nothing to add is shorter without one. */
    detail: returns.sameDepotPairs > 0
      ? `${returns.sameDepotPairs} already at a location with an open load`
      : undefined,
    count: returns.matchable,
    // Straight to the workbench — this row is an invitation to work the pile.
    to: routes.emptyReturnMatching,
  });
  push({
    id: 'hr-expiring',
    severity: 'ask',
    module: 'HR',
    title: 'Employee documents expiring',
    count: workforce?.expiring.in30 ?? 0,
    to: routes.hrEmployees,
  });
  push({
    id: 'leave-pending',
    severity: 'ask',
    module: 'HR',
    title: 'Leave requests pending',
    count: workforce?.leave.pendingRequests ?? 0,
    to: routes.hr,
  });
  push({
    id: 'fleet-expiring',
    severity: 'ask',
    module: 'Fleet',
    title: 'Vehicle and driver documents expiring',
    count: fleet.expiring,
    to: routes.vehicles,
  });
  push({
    id: 'unassigned',
    severity: 'ask',
    module: 'Shipments',
    title: 'Shipments with no vehicle',
    count: operations.unassigned,
    to: routes.shipments,
  });

  attention.sort((a, b) => {
    if (a.severity !== b.severity) return a.severity === 'breach' ? -1 : 1;
    return b.count - a.count;
  });

  return {
    operations,
    returns,
    money,
    network,
    fleet,
    workforce,
    movement,
    attention,
    activity: [...args.ledger]
      .sort((a, b) => new Date(b.postedAt).getTime() - new Date(a.postedAt).getTime())
      .slice(0, 8),
  };
}
