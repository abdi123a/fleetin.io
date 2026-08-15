import { useMemo } from 'react';
import { useShipmentRaw } from '@/features/shipments/api/queries';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';
import { useBookingsForShipment } from '@/features/bookings/api/queries';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import {
  useHoldsForShipment,
  useInvoices,
  usePaymentOrdersForShipment,
  type InvoiceRecord,
  type PayoutHoldRecord,
  type PaymentOrderRecord,
} from '@/features/finance';

/**
 * Real replacement for the mock's `payoutEngine.ts`/`derived.ts` — small,
 * real-shape functions, not a 1:1 port. Client revenue is shipment-level
 * only and transporter cost is booking-level only (no per-booking client
 * price exists in the real model — Fleetin pays per shipment, not per
 * booking), so there is nothing here resembling the mock's per-booking
 * `CostLine`/`RateSource` breakdown.
 */

/** Matches `shipments.service.ts release()`'s own gate exactly — stricter than the auto-invoice hook's DELIVERED_STATUSES (which also allows Arrived/Unloading), so the UI never claims releasable when the server would 400. */
const RELEASE_READY_STATUSES = new Set(['POD Submitted', 'Completed']);
const NON_BLOCKING_STATUSES = new Set(['Cancelled', 'Failed']);

export function unprovenBookings(bookings: BookingRecord[]): BookingRecord[] {
  return bookings.filter((b) => !RELEASE_READY_STATUSES.has(b.status) && !NON_BLOCKING_STATUSES.has(b.status));
}

export function hasOpenHold(holds: PayoutHoldRecord[]): boolean {
  return holds.some((h) => !h.clearedAt);
}

const AWAITING_POD_STATUSES = new Set(['Arrived', 'Unloading']);

/** Structurally compatible with `kit.tsx`'s `BookingStage` union — same literal values, no shared import needed. */
export function bookingStage(booking: BookingRecord): 'in_transit' | 'awaiting_pod' | 'proven' {
  if (RELEASE_READY_STATUSES.has(booking.status)) return 'proven';
  if (AWAITING_POD_STATUSES.has(booking.status)) return 'awaiting_pod';
  return 'in_transit';
}

/** Structurally compatible with `kit.tsx`'s `ShipmentStage` union. */
export type ShipmentFinanceStage = 'awaiting_pod' | 'ready' | 'released' | 'settled';

export function shipmentStage(
  shipment: ShipmentRecord | undefined,
  unproven: BookingRecord[],
  settlements: TransporterSettlement[],
): ShipmentFinanceStage {
  if (shipment?.payoutReleasedAt) {
    const allSettled = settlements.length === 0 || settlements.every((s) => s.status === 'paid');
    return allSettled ? 'settled' : 'released';
  }
  return unproven.length > 0 ? 'awaiting_pod' : 'ready';
}

export function isReleasable(shipment: ShipmentRecord | undefined, bookings: BookingRecord[], holds: PayoutHoldRecord[]): boolean {
  if (!shipment || shipment.payoutReleasedAt) return false;
  if (bookings.length === 0) return false;
  return unprovenBookings(bookings).length === 0 && !hasOpenHold(holds);
}

/* ─── Settlements — one row per transporter this shipment owes ─────────── */

export type SettlementStatus = 'blocked' | 'payable' | 'paid';

export interface TransporterSettlement {
  partnerId: string;
  partnerName: string;
  bookingsCount: number;
  totalMinorUnits: number;
  hasUnpricedBookings: boolean;
  paidOrder: PaymentOrderRecord | null;
  status: SettlementStatus;
}

export function settlementsForShipment(
  shipment: ShipmentRecord | undefined,
  bookings: BookingRecord[],
  paymentOrders: PaymentOrderRecord[],
): TransporterSettlement[] {
  const released = Boolean(shipment?.payoutReleasedAt);
  const byPartner = new Map<string, BookingRecord[]>();
  for (const booking of bookings) {
    if (!booking.partnerId) continue;
    const list = byPartner.get(booking.partnerId) ?? [];
    list.push(booking);
    byPartner.set(booking.partnerId, list);
  }

  return Array.from(byPartner.entries())
    .map(([partnerId, partnerBookings]) => {
      const hasUnpricedBookings = partnerBookings.some((b) => b.transporterCostMinorUnits == null);
      const totalMinorUnits = partnerBookings.reduce(
        (sum, b) => sum + (b.transporterCostMinorUnits ? Number(b.transporterCostMinorUnits) : 0),
        0,
      );
      const paidOrder = paymentOrders.find((po) => po.transporterId === partnerId && po.status === 'Paid') ?? null;
      const status: SettlementStatus = paidOrder
        ? 'paid'
        : released && !hasUnpricedBookings
          ? 'payable'
          : 'blocked';

      return {
        partnerId,
        partnerName: partnerBookings[0]?.partner?.companyLegalName ?? partnerId,
        bookingsCount: partnerBookings.length,
        totalMinorUnits,
        hasUnpricedBookings,
        paidOrder,
        status,
      };
    })
    .sort((a, b) => b.totalMinorUnits - a.totalMinorUnits);
}

/* ─── Money position — the three-way split MoneyBreakdown.tsx renders ──── */

export interface MoneyPosition {
  revenueDjf: number;
  collectedDjf: number;
  outstandingDjf: number;
  overdueDjf: number;
  costDjf: number;
  paidOutDjf: number;
  payableDjf: number;
  frozenDjf: number;
  pipelineDjf: number;
  grossDjf: number | null;
  marginPct: number | null;
  unpricedCount: number;
  unpricedCostDjf: number;
}

export function moneyPosition(
  shipment: ShipmentRecord | undefined,
  bookings: BookingRecord[],
  paymentOrders: PaymentOrderRecord[],
  invoice: InvoiceRecord | undefined,
  holds: PayoutHoldRecord[],
): MoneyPosition {
  const priced = shipment?.clientRateMinorUnits != null;
  const revenueDjf = shipment?.clientRateMinorUnits != null ? Number(shipment.clientRateMinorUnits) : 0;

  const isPaid = invoice?.status === 'Paid';
  const collectedDjf = invoice && isPaid ? Number(invoice.totalMinorUnits) : 0;
  const outstandingDjf = invoice && !isPaid ? Number(invoice.remainingMinorUnits) : 0;
  const isOverdue = Boolean(invoice && !isPaid && new Date(invoice.contractDeadline).getTime() < Date.now());
  const overdueDjf = isOverdue ? outstandingDjf : 0;

  const costDjf = bookings.reduce((sum, b) => sum + (b.transporterCostMinorUnits ? Number(b.transporterCostMinorUnits) : 0), 0);
  const paidOutDjf = paymentOrders.filter((po) => po.status === 'Paid').reduce((sum, po) => sum + Number(po.amountMinorUnits), 0);
  const unpaidDjf = Math.max(0, costDjf - paidOutDjf);

  const released = Boolean(shipment?.payoutReleasedAt);
  const held = hasOpenHold(holds);
  const payableDjf = released && !held ? unpaidDjf : 0;
  const frozenDjf = released && held ? unpaidDjf : 0;
  const pipelineDjf = !released ? unpaidDjf : 0;

  const grossDjf = priced ? revenueDjf - costDjf : null;
  const marginPct = grossDjf !== null && revenueDjf > 0 ? grossDjf / revenueDjf : null;

  return {
    revenueDjf,
    collectedDjf,
    outstandingDjf,
    overdueDjf,
    costDjf,
    paidOutDjf,
    payableDjf,
    frozenDjf,
    pipelineDjf,
    grossDjf,
    marginPct,
    unpricedCount: priced ? 0 : 1,
    unpricedCostDjf: priced ? 0 : costDjf,
  };
}

/**
 * The same three-way split as `moneyPosition()`, computed cheaply over a
 * LIST of shipments — for the project/client/overview tiers, where fetching
 * every shipment's bookings and holds individually would be N+1. Uses
 * `shipment.rateMinorUnits` (the aggregate transporter cost, computed at
 * booking-assignment time) as a stand-in for a booking-summed total.
 * Cancelled/Failed shipments are skipped entirely — the backend excludes
 * them from billing, so counting their cost or commission here would claim
 * money that never moves.
 *
 * Two deliberate departures from a per-shipment sum of `moneyPosition()`:
 * an invoice is counted ONCE if any of its `missionIds` is in scope — a
 * monthly statement covers many shipments, and adding its total per shipment
 * would multiply it — and holds are only honoured when the caller passes
 * `heldShipmentIds` (shipments with an open hold); without it, a released
 * shipment's unpaid balance lands in `payableDjf` and `frozenDjf` stays 0,
 * because book-wide open holds aren't cheaply fetchable per shipment.
 *
 * `invoices` and `paidPaymentOrders` are expected to already be fetched once
 * for the relevant scope (e.g. `useInvoices({shipperId})`,
 * `usePaymentOrders({status: 'Paid'})`) and passed in — this function itself
 * makes no requests.
 */
export function aggregateMoneyPosition(
  shipments: ShipmentRecord[],
  invoices: InvoiceRecord[],
  paidPaymentOrders: PaymentOrderRecord[],
  heldShipmentIds?: ReadonlySet<string>,
): MoneyPosition {
  const now = Date.now();
  let revenueDjf = 0;
  let collectedDjf = 0;
  let outstandingDjf = 0;
  let overdueDjf = 0;
  let costDjf = 0;
  let paidOutDjf = 0;
  let payableDjf = 0;
  let frozenDjf = 0;
  let pipelineDjf = 0;
  let unpricedCount = 0;
  let unpricedCostDjf = 0;
  let grossSum = 0;
  let pricedRevenue = 0;
  let anyPriced = false;

  const shipmentIds = new Set<string>();

  for (const shipment of shipments) {
    if (NON_BLOCKING_STATUSES.has(shipment.status)) continue;
    shipmentIds.add(shipment.id);

    const cost = Number(shipment.rateMinorUnits);
    costDjf += cost;

    const priced = shipment.clientRateMinorUnits != null;
    if (priced) {
      const revenue = Number(shipment.clientRateMinorUnits);
      revenueDjf += revenue;
      anyPriced = true;
      pricedRevenue += revenue;
      grossSum += revenue - cost;
    } else {
      unpricedCount += 1;
      unpricedCostDjf += cost;
    }

    const paidForShipment = paidPaymentOrders
      .filter((po) => po.missionId === shipment.id)
      .reduce((sum, po) => sum + Number(po.amountMinorUnits), 0);
    paidOutDjf += paidForShipment;
    const unpaid = Math.max(0, cost - paidForShipment);
    if (shipment.payoutReleasedAt) {
      if (heldShipmentIds?.has(shipment.id)) frozenDjf += unpaid;
      else payableDjf += unpaid;
    } else {
      pipelineDjf += unpaid;
    }
  }

  for (const invoice of invoices) {
    if (!Array.isArray(invoice.missionIds) || !invoice.missionIds.some((id) => shipmentIds.has(id))) continue;
    if (invoice.status === 'Paid') {
      collectedDjf += Number(invoice.totalMinorUnits);
    } else {
      const remaining = Number(invoice.remainingMinorUnits);
      outstandingDjf += remaining;
      if (new Date(invoice.contractDeadline).getTime() < now) overdueDjf += remaining;
    }
  }

  return {
    revenueDjf,
    collectedDjf,
    outstandingDjf,
    overdueDjf,
    costDjf,
    paidOutDjf,
    payableDjf,
    frozenDjf,
    pipelineDjf,
    grossDjf: anyPriced ? grossSum : null,
    marginPct: anyPriced && pricedRevenue > 0 ? grossSum / pricedRevenue : null,
    unpricedCount,
    unpricedCostDjf,
  };
}

/* ─── The composing hook ────────────────────────────────────────────────── */

export interface ShipmentFinanceDetail {
  shipment: ShipmentRecord | undefined;
  bookings: BookingRecord[];
  holds: PayoutHoldRecord[];
  paymentOrders: PaymentOrderRecord[];
  invoice: InvoiceRecord | undefined;
  isLoading: boolean;
  unproven: BookingRecord[];
  releasable: boolean;
  held: boolean;
  settlements: TransporterSettlement[];
  money: MoneyPosition;
  stage: ShipmentFinanceStage;
}

/**
 * Everything about one shipment's money, assembled from independent
 * `useQuery` calls (this codebase's established composing pattern —
 * `useQueries` is used nowhere else here) rather than one Zustand store.
 */
export function useShipmentFinanceDetail(shipmentId: string | undefined): ShipmentFinanceDetail {
  const shipmentQuery = useShipmentRaw(shipmentId);
  const bookingsQuery = useBookingsForShipment(shipmentId);
  const holdsQuery = useHoldsForShipment(shipmentId);
  const paymentOrdersQuery = usePaymentOrdersForShipment(shipmentId);

  const shipperId = shipmentQuery.data?.shipperId;
  // No `GET /invoices?shipmentId=` exists — `missionIds` is a JSON array with
  // only a `shipperId` filter exposed, so resolve "the invoice for this
  // shipment" by fetching that shipper's invoices and filtering client-side.
  const invoicesQuery = useInvoices({ shipperId, limit: 200 }, { enabled: Boolean(shipperId) });

  const bookings = useMemo(() => bookingsQuery.data ?? [], [bookingsQuery.data]);
  const holds = useMemo(() => holdsQuery.data ?? [], [holdsQuery.data]);
  const paymentOrders = useMemo(() => paymentOrdersQuery.data?.items ?? [], [paymentOrdersQuery.data]);

  const invoice = useMemo(() => {
    const shipmentId = shipmentQuery.data?.id;
    if (!shipmentId) return undefined;
    return invoicesQuery.data?.items.find(
      (inv) => Array.isArray(inv.missionIds) && inv.missionIds.includes(shipmentId),
    );
  }, [invoicesQuery.data, shipmentQuery.data]);

  const unproven = useMemo(() => unprovenBookings(bookings), [bookings]);
  const held = hasOpenHold(holds);
  const releasable = isReleasable(shipmentQuery.data, bookings, holds);
  const settlements = useMemo(
    () => settlementsForShipment(shipmentQuery.data, bookings, paymentOrders),
    [shipmentQuery.data, bookings, paymentOrders],
  );
  const money = useMemo(
    () => moneyPosition(shipmentQuery.data, bookings, paymentOrders, invoice, holds),
    [shipmentQuery.data, bookings, paymentOrders, invoice, holds],
  );
  const stage = useMemo(
    () => shipmentStage(shipmentQuery.data, unproven, settlements),
    [shipmentQuery.data, unproven, settlements],
  );

  return {
    shipment: shipmentQuery.data,
    bookings,
    holds,
    paymentOrders,
    invoice,
    isLoading: shipmentQuery.isLoading || bookingsQuery.isLoading || holdsQuery.isLoading || paymentOrdersQuery.isLoading,
    unproven,
    releasable,
    held,
    settlements,
    money,
    stage,
  };
}
