/**
 * The daily action queue — derived by query, never stored.
 *
 * Every item is something a human must DECIDE today, mixing money going out
 * (holds, closing windows, unpaid settlements) with money coming in (overdue
 * invoices) in one worklist, because it is one person's morning, not a
 * ledger. Each item carries its funding source, because the source decides
 * who is carrying the risk while the item sits unresolved.
 *
 * Scoped to SHIPMENTS since the 2026-08-13 restructure — one release decision,
 * one settlement decision per transporter — with ONE exception: a missing proof
 * of delivery is raised against the BOOKING, because that is the container
 * someone has to go and chase. It names the shipment it is blocking, since a
 * single unproven container freezes the whole consignment's money.
 */

import type {
  ClientInvoice,
  FinanceBooking,
  FinanceSettings,
  FinanceShipment,
  FundingSource,
  LedgerMovement,
} from '@/types/finance';
import {
  daysAwaitingPod,
  isHeld,
  settlementsFor,
  shipmentCostLines,
  shipmentStage,
  unprovenBookings,
  validationClock,
  HOUR_MS,
} from './payoutEngine';
import {
  overdueDays,
  shipmentGrossDjf,
  shipmentMarginFraction,
  unpricedBookings,
} from './derived';

export type QueueKind =
  | 'unpriced_released' // money left against an unknown price — loudest
  | 'window_expired' // 48h done, needs the release decision
  | 'payout_on_hold' // needs release or escalation
  | 'missing_pod' // a container with no proof, freezing its shipment
  | 'window_closing' // <24h left — decide today
  | 'invoice_overdue' // banded by how far
  | 'settlement_pending' // released, transporter still waiting to be paid
  | 'draw_unconfirmed' // bank has not confirmed the disbursement
  | 'unpriced_pending' // proven with no rate, money not yet out
  | 'below_floor'; // review flag — never an automatic block

export type QueuePriority = 'now' | 'today' | 'watch';

export interface QueueItem {
  id: string;
  kind: QueueKind;
  priority: QueuePriority;
  /** Higher sorts first inside a priority band. */
  score: number;
  title: string;
  detail: string;
  amountDjf?: number;
  /** 'out' = payout side, 'in' = collection side. Never confusable. */
  direction: 'out' | 'in';
  shipmentId?: string;
  /** Set only where the action is against one container — a missing PoD. */
  bookingId?: string;
  invoiceId?: string;
  clientId?: string;
  transporterId?: string;
  fundingSourceId: string;
  /** Overdue band label for invoice items, e.g. "31–60 d over". */
  band?: string;
}

export interface QueueInput {
  shipments: FinanceShipment[];
  /** Every booking in the book; grouped per shipment internally. */
  bookings: FinanceBooking[];
  invoices: ClientInvoice[];
  movements: LedgerMovement[];
  sources: Map<string, FundingSource>;
  settings: FinanceSettings;
  nowMs: number;
}

export function buildActionQueue(input: QueueInput): QueueItem[] {
  const { shipments, bookings, invoices, movements, sources, settings, nowMs } = input;
  const windowMs = settings.validationWindowHours * HOUR_MS;
  const items: QueueItem[] = [];

  const bookingsByShipment = new Map<string, FinanceBooking[]>();
  for (const booking of bookings) {
    const bucket = bookingsByShipment.get(booking.shipmentId);
    if (bucket) bucket.push(booking);
    else bookingsByShipment.set(booking.shipmentId, [booking]);
  }

  for (const shipment of shipments) {
    const own = bookingsByShipment.get(shipment.id) ?? [];
    const stage = shipmentStage(shipment, own);
    const clock = validationClock(shipment, own, nowMs, windowMs);
    const costTotal = shipmentCostLines(own).reduce((sum, line) => sum + line.amountDjf, 0);
    const held = isHeld(shipment.payout);
    const unpriced = unpricedBookings(own);
    const label = `${shipment.id} (${own.length} booking${own.length === 1 ? '' : 's'})`;

    // Unpriced — urgency depends on whether money has already left.
    if (unpriced.length > 0 && unprovenBookings(own).length === 0) {
      const unpricedCost = unpriced.reduce(
        (sum, booking) => sum + booking.costLines.reduce((s, line) => s + line.amountDjf, 0),
        0,
      );
      if (shipment.payout.releasedAt) {
        items.push({
          id: `unpriced-released-${shipment.id}`,
          kind: 'unpriced_released',
          priority: 'now',
          score: 1000 + unpricedCost / 1000,
          title: `${shipment.id} released with ${unpriced.length} unpriced booking${unpriced.length === 1 ? '' : 's'}`,
          detail: `${fmt(unpricedCost)} DJF left against an unknown price — price ${unpriced
            .slice(0, 3)
            .map((booking) => booking.id)
            .join(', ')} first thing`,
          amountDjf: unpricedCost,
          direction: 'out',
          shipmentId: shipment.id,
          clientId: shipment.clientId,
          fundingSourceId: shipment.fundingSourceId,
        });
      } else {
        items.push({
          id: `unpriced-${shipment.id}`,
          kind: 'unpriced_pending',
          priority: 'today',
          score: 320,
          title: `${label} proven with ${unpriced.length} booking${unpriced.length === 1 ? '' : 's'} unpriced`,
          detail: 'Pricing is not a gate, but margin is unknowable until this is set',
          amountDjf: unpricedCost,
          direction: 'out',
          shipmentId: shipment.id,
          clientId: shipment.clientId,
          fundingSourceId: shipment.fundingSourceId,
        });
      }
    }

    // Holds — needs release or escalation.
    if (!shipment.payout.releasedAt && held) {
      const hold = shipment.payout.holds.find((entry) => !entry.clearedAt);
      const heldHours = hold ? (nowMs - new Date(hold.raisedAt).getTime()) / HOUR_MS : 0;
      items.push({
        id: `hold-${shipment.id}`,
        kind: 'payout_on_hold',
        priority: heldHours >= 48 ? 'now' : 'today',
        score: 600 + heldHours,
        title: `${shipment.id} held — ${hold?.reason ?? 'reason unrecorded'}`,
        detail: `${hold?.bookingId ? `${hold.bookingId} disputed; ` : ''}held ${Math.floor(
          heldHours,
        )}h by ${hold?.raisedBy ?? '—'}; clock paused at ${Math.floor(
          clock.elapsedMs / HOUR_MS,
        )}h of ${settings.validationWindowHours}h — clear or escalate`,
        amountDjf: costTotal,
        direction: 'out',
        shipmentId: shipment.id,
        fundingSourceId: shipment.fundingSourceId,
      });
    }

    // Fully proven, unheld, unreleased: the release decision is due.
    if (stage === 'ready' && !held) {
      if (clock.expired) {
        items.push({
          id: `expired-${shipment.id}`,
          kind: 'window_expired',
          priority: 'now',
          score: 900,
          title: `${label} validation window complete`,
          detail: `${fmt(costTotal)} DJF due to release — every extra hour is the fast-payment promise slipping`,
          amountDjf: costTotal,
          direction: 'out',
          shipmentId: shipment.id,
          fundingSourceId: shipment.fundingSourceId,
        });
      } else if (clock.remainingMs <= 24 * HOUR_MS) {
        items.push({
          id: `closing-${shipment.id}`,
          kind: 'window_closing',
          priority: 'today',
          score: 500 + (24 * HOUR_MS - clock.remainingMs) / HOUR_MS,
          title: `${shipment.id} window closes in ${Math.ceil(clock.remainingMs / HOUR_MS)}h`,
          detail: `Last chance to flag a problem before ${fmt(costTotal)} DJF leaves`,
          amountDjf: costTotal,
          direction: 'out',
          shipmentId: shipment.id,
          fundingSourceId: shipment.fundingSourceId,
        });
      }
    }

    /*
     * Missing proof, per container.
     *
     * Raised against the booking because that is what someone drives out to
     * chase, but priced by what it is FREEZING: one unproven container holds
     * the entire shipment's money, so the amount shown is the shipment's, not
     * the container's. That is the whole reason this item is loud.
     */
    for (const booking of unprovenBookings(own)) {
      if (!booking.proof.completedAt) continue; // still moving — not yet a failure
      const stuckDays = daysAwaitingPod(booking.proof, nowMs);
      items.push({
        id: `pod-${booking.id}`,
        kind: 'missing_pod',
        priority: stuckDays >= 5 ? 'now' : 'today',
        score: 700 + stuckDays * 10,
        title: `${booking.id} delivered ${stuckDays}d ago — no proof of delivery`,
        detail: `Blocking all ${fmt(costTotal)} DJF on ${shipment.id}: neither its release nor the client terms can start until this container is proven`,
        amountDjf: costTotal,
        direction: 'out',
        shipmentId: shipment.id,
        bookingId: booking.id,
        transporterId: booking.transporterId,
        fundingSourceId: shipment.fundingSourceId,
      });
    }

    // Released and someone is still waiting for their money.
    if (shipment.payout.releasedAt && !held) {
      for (const settlement of settlementsFor(shipment, own)) {
        if (settlement.payableDjf <= 0) continue;
        items.push({
          id: `settle-${shipment.id}-${settlement.transporterId}`,
          kind: 'settlement_pending',
          priority: 'today',
          score: 400 + settlement.payableDjf / 10_000,
          title: `${settlement.transporterName} unpaid on ${shipment.id}`,
          detail: `${settlement.bookingsCount} booking${
            settlement.bookingsCount === 1 ? '' : 's'
          } delivered · ${fmt(settlement.payableDjf)} DJF payable in one transfer`,
          amountDjf: settlement.payableDjf,
          direction: 'out',
          shipmentId: shipment.id,
          transporterId: settlement.transporterId,
          fundingSourceId: shipment.fundingSourceId,
        });
      }
    }

    // Priced below the margin floor — a review flag, never a block.
    const fraction = shipmentMarginFraction(own);
    if (fraction !== null && fraction * 100 < settings.marginFloorPct) {
      const gross = shipmentGrossDjf(own);
      items.push({
        id: `floor-${shipment.id}`,
        kind: 'below_floor',
        priority: 'watch',
        score: 100 + (settings.marginFloorPct - fraction * 100),
        title: `${shipment.id} priced at ${(fraction * 100).toFixed(1)}% margin`,
        detail: `Below the ${settings.marginFloorPct}% floor (${fmt(gross ?? 0)} DJF gross) — review the rate`,
        direction: 'in',
        shipmentId: shipment.id,
        clientId: shipment.clientId,
        fundingSourceId: shipment.fundingSourceId,
      });
    }
  }

  // Overdue invoices, banded by how far over.
  const shipmentById = new Map(shipments.map((shipment) => [shipment.id, shipment]));
  for (const invoice of invoices) {
    const over = overdueDays(invoice, nowMs);
    if (over <= 0) continue;
    const band =
      over <= 15 ? '1–15 d over' : over <= 30 ? '16–30 d over' : over <= 60 ? '31–60 d over' : '60+ d over';
    const shipment = shipmentById.get(invoice.shipmentId);
    const source = shipment ? sources.get(shipment.fundingSourceId) : undefined;
    const bankCollects = source?.riskBearer === 'bank';
    items.push({
      id: `overdue-${invoice.id}`,
      kind: 'invoice_overdue',
      priority: bankCollects ? 'watch' : over > 30 ? 'now' : over > 15 ? 'today' : 'watch',
      score: (bankCollects ? 50 : 300) + over * 4,
      title: `${invoice.id} is ${Math.floor(over)}d past due`,
      detail: bankCollects
        ? 'Credit line — collections sit with CAC Bank; tracked for exposure only'
        : `Contract facility — Fleetin chases this one; send the next reminder`,
      amountDjf: invoice.amountDjf,
      direction: 'in',
      invoiceId: invoice.id,
      clientId: invoice.clientId,
      shipmentId: invoice.shipmentId,
      fundingSourceId: shipment?.fundingSourceId ?? source?.id ?? '',
      band,
    });
  }

  // Draws the bank has not confirmed.
  for (const movement of movements) {
    if (movement.kind !== 'draw' || movement.confirmed) continue;
    items.push({
      id: `draw-${movement.id}`,
      kind: 'draw_unconfirmed',
      priority: 'today',
      score: 450,
      title: `Draw ${movement.id} awaiting bank confirmation`,
      detail: `${fmt(movement.amountDjf)} DJF from ${movement.fundingSourceId} not yet confirmed by CAC`,
      amountDjf: movement.amountDjf,
      direction: 'out',
      shipmentId: movement.shipmentId,
      fundingSourceId: movement.fundingSourceId,
    });
  }

  const order: Record<QueuePriority, number> = { now: 0, today: 1, watch: 2 };
  return items.sort(
    (a, b) => order[a.priority] - order[b.priority] || b.score - a.score,
  );
}

function fmt(value: number): string {
  return Math.abs(value).toLocaleString('en-US', { maximumFractionDigits: 0 });
}
