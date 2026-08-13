/**
 * All finance arithmetic in one place.
 *
 * Seven routes read this model; none of them do their own math. Every number
 * on any finance screen is either read straight off a record or computed here
 * through `@/lib/finance` — so two panels can never disagree about what a
 * franc is doing.
 *
 * The hierarchy the whole module navigates:
 *
 *   channel → client → project → SHIPMENT → booking
 *
 * The shipment row is the important one. It is where release, settlement and
 * both documents live, and every figure above it (project, client, portfolio)
 * is the sum of shipment rows rather than a second pass over the same records
 * — so a project page and its client page cannot disagree.
 */

import { useMemo } from 'react';

import {
  bookingStage,
  buildActionQueue,
  buildFundingPosition,
  costLineStatus,
  costTotalDjf,
  daysSalesOutstanding,
  financedDays,
  grossMarginDjf,
  headroomRunway,
  invoiceAgeDays,
  isHeld,
  marginFraction,
  marginPerCapitalDay,
  capitalDaysDjf,
  netMarginDjf,
  overdueDays,
  settlementsFor,
  shipmentProvenAt,
  shipmentStage,
  unprovenBookings,
  validationClock,
  agingBracket,
  HOUR_MS,
  type AgingBracket,
  type FundingPosition,
  type HeadroomRunway,
  type QueueItem,
  type ValidationClock,
} from '@/lib/finance';
import { useFinanceStore } from '@/stores/finance.store';
import type {
  BookingStage,
  ClientInvoice,
  FinanceBooking,
  FinanceClient,
  FinanceProject,
  FinanceSettings,
  FinanceShipment,
  FinanceTransporter,
  FundingSource,
  OriginationChannel,
  ShipmentPayment,
  ShipmentStage,
  TransporterSettlement,
} from '@/types/finance';

/** One container, with everything derivable about it. */
export interface BookingRow {
  booking: FinanceBooking;
  stage: BookingStage;
  costTotal: number;
  /** Per-container margin. Useful on the booking detail; never a cash figure. */
  gross: number | null;
  marginPct: number | null;
  transporter?: FinanceTransporter;
}

/**
 * Every franc attached to one body of work, whichever direction it points.
 *
 * Deliberately split three ways rather than netted: what the client owes is
 * not the same money as what transporters are owed, and neither is the same as
 * what has actually moved. A single "balance" would hide which of the three
 * is the problem.
 */
export interface MoneyPosition {
  /** Billed to the client across priced bookings. */
  revenueDjf: number;
  /** Invoiced and settled. */
  collectedDjf: number;
  /** Invoiced, still open. */
  outstandingDjf: number;
  /** Invoiced, past its due date. */
  overdueDjf: number;
  /** Every cost line, whatever its state. */
  costDjf: number;
  /** Cost lines actually paid out. */
  paidOutDjf: number;
  /** Released and unpaid — payable now. */
  payableDjf: number;
  /** Unpaid because a hold is freezing it. Never the same as payable. */
  frozenDjf: number;
  /** Unpaid and still ahead of release. */
  pipelineDjf: number;
  /** Revenue − cost, on priced work only. Null when nothing is priced. */
  grossDjf: number | null;
  marginPct: number | null;
  /** Bookings with no client rate — margin above excludes them entirely. */
  unpricedCount: number;
  unpricedCostDjf: number;
}

/**
 * One consignment — the row the module is built around.
 *
 * Carries the release decision, the proof progress that gates it, and the
 * per-transporter settlements that spend it. Everything a desk needs to answer
 * "can this go out, and who do I pay" is on this object.
 */
export interface ShipmentRow {
  shipment: FinanceShipment;
  stage: ShipmentStage;
  held: boolean;
  clock: ValidationClock;
  bookings: BookingRow[];
  bookingCount: number;
  /** Bookings with both proofs on file. */
  provenCount: number;
  /**
   * The containers blocking release, as records so the UI can NAME them.
   * "Release blocked" is useless; "BKG-00412, BKG-00413" is actionable.
   */
  unproven: FinanceBooking[];
  /** When the last container was proven — null while any is outstanding. */
  provenAt?: string;
  /** One row per counterparty: bookings delivered × total owed. */
  settlements: TransporterSettlement[];
  /** Vouchers already issued against this shipment. */
  payments: ShipmentPayment[];
  money: MoneyPosition;
  invoice?: ClientInvoice;
  client?: FinanceClient;
  project?: FinanceProject;
  source?: FundingSource;
  /** Sorts the lists — most recent movement on the consignment. */
  lastActivityAt: string;
}

export interface ClientArRow {
  client: FinanceClient;
  source?: FundingSource;
  openTotal: number;
  overdueTotal: number;
  buckets: Record<AgingBracket, number>;
  dso: number | null;
  openInvoices: number;
}

/**
 * What one transporter is owed across the WHOLE book — the sum of their
 * per-shipment settlements, never a re-walk of raw cost lines, so this page
 * and any shipment page always agree.
 */
export interface TransporterRow {
  transporter: FinanceTransporter;
  /** Unpaid settlement value across every stage — the full obligation. */
  owedTotal: number;
  /** Unpaid value sitting on HELD shipments. Not the same money as payable. */
  frozenOnHold: number;
  /** Released and unpaid — genuinely payable now. */
  payableNow: number;
  /** Unpaid value still ahead of release. */
  pipeline: number;
  /** Shipments where this party still has work or money outstanding. */
  activeShipments: number;
  /** Total containers carried across the book. */
  bookingsCarried: number;
  lastPaidAt?: string;
  /** Average days from shipment release to payment. */
  avgPayDays: number | null;
  /** Settlements paid within the promise window ÷ settlements paid. */
  promiseKeptRate: number | null;
  /** Vouchers paid but not yet signed back. */
  unsignedVouchers: number;
  fundingSourceIds: string[];
}

export interface ProjectRow {
  project: FinanceProject;
  client?: FinanceClient;
  source?: FundingSource;
  shipments: ShipmentRow[];
  shipmentCount: number;
  bookingCount: number;
  /** Shipments whose money has fully left and been recovered. */
  settled: number;
  money: MoneyPosition;
  /** Most recent activity on the project — sorts the list. */
  lastActivityAt: string;
}

export interface ClientRow {
  client: FinanceClient;
  channel: OriginationChannel;
  projects: ProjectRow[];
  /** One-off consignments belonging to no project. Billed and chased identically. */
  directShipments: ShipmentRow[];
  /** Project shipments + one-offs. */
  shipmentCount: number;
  bookingCount: number;
  money: MoneyPosition;
  dso: number | null;
  lastShipmentAt: string;
  sources: FundingSource[];
}

export interface ContractRow {
  client: FinanceClient;
  source?: FundingSource;
  shipments: number;
  bookings: number;
  unpriced: number;
  revenue: number;
  cost: number;
  gross: number;
  marginPct: number | null;
  capitalDays: number;
  marginPerCapitalDay: number | null;
}

export interface FinanceModel {
  nowMs: number;
  settings: FinanceSettings;
  clients: FinanceClient[];
  clientById: Map<string, FinanceClient>;
  transporterById: Map<string, FinanceTransporter>;
  sources: FundingSource[];
  sourceById: Map<string, FundingSource>;
  positions: Map<string, FundingPosition>;
  runways: Map<string, HeadroomRunway>;
  invoices: ClientInvoice[];
  invoiceById: Map<string, ClientInvoice>;
  payments: ShipmentPayment[];
  paymentById: Map<string, ShipmentPayment>;

  /** Every consignment, newest activity first. */
  shipmentRows: ShipmentRow[];
  shipmentById: Map<string, ShipmentRow>;
  /** Booking lookup, for the container detail route. */
  bookingById: Map<string, BookingRow>;
  /** Which shipment a booking belongs to — the detail page's way back up. */
  shipmentOfBooking: Map<string, ShipmentRow>;
  queue: QueueItem[];

  // Headline positions — the working-capital loop in four figures.
  bankDrawnTotal: number;
  bankCeilingTotal: number;
  arOpenTotal: number;
  arOverdueTotal: number;
  payableNowTotal: number;
  frozenOnHoldTotal: number;
  /** Consignments that cannot release because a container is unproven. */
  blockedShipmentCount: number;
  /** Individual containers delivered with no proof — what to go and chase. */
  unprovenBookingCount: number;
  dsoOverall: number | null;

  clientAr: ClientArRow[];
  transporterRows: TransporterRow[];
  contractRows: ContractRow[];

  // The hierarchy: channel → client → project → shipment.
  projects: FinanceProject[];
  projectRows: ProjectRow[];
  projectById: Map<string, ProjectRow>;
  /** Clients grouped per channel; a client appears in both if it works both. */
  clientRows: ClientRow[];

  economics: {
    priced: number;
    unpriced: number;
    unpricedCostValue: number;
    grossTotal: number;
    avgMarginPct: number | null;
    marginAtRisk: number;
    netTotal: number;
    worstShipments: ShipmentRow[];
    unpricedRows: BookingRow[];
  };
}

export function useFinanceModel(): FinanceModel {
  const shipments = useFinanceStore((state) => state.shipments);
  const bookings = useFinanceStore((state) => state.bookings);
  const invoices = useFinanceStore((state) => state.invoices);
  const payments = useFinanceStore((state) => state.payments);
  const movements = useFinanceStore((state) => state.movements);
  const sources = useFinanceStore((state) => state.sources);
  const clients = useFinanceStore((state) => state.clients);
  const transporters = useFinanceStore((state) => state.transporters);
  const projects = useFinanceStore((state) => state.projects);
  const settings = useFinanceStore((state) => state.settings);
  const nowMs = useFinanceStore((state) => state.now);

  return useMemo(() => {
    const clientById = new Map(clients.map((client) => [client.id, client]));
    const transporterById = new Map(transporters.map((entry) => [entry.id, entry]));
    const sourceById = new Map(sources.map((source) => [source.id, source]));
    const invoiceById = new Map(invoices.map((invoice) => [invoice.id, invoice]));
    const paymentById = new Map(payments.map((payment) => [payment.id, payment]));
    const projectRecordById = new Map(projects.map((project) => [project.id, project]));
    const windowMs = settings.validationWindowHours * HOUR_MS;

    const positions = new Map<string, FundingPosition>();
    const runways = new Map<string, HeadroomRunway>();
    for (const source of sources) {
      const position = buildFundingPosition(source, movements);
      positions.set(source.id, position);
      runways.set(source.id, headroomRunway(position, nowMs));
    }

    // ── Bookings, grouped under their shipment ────────────────────────────
    const bookingsByShipment = new Map<string, FinanceBooking[]>();
    for (const booking of bookings) {
      const bucket = bookingsByShipment.get(booking.shipmentId);
      if (bucket) bucket.push(booking);
      else bookingsByShipment.set(booking.shipmentId, [booking]);
    }
    const paymentsByShipment = new Map<string, ShipmentPayment[]>();
    for (const payment of payments) {
      const bucket = paymentsByShipment.get(payment.shipmentId);
      if (bucket) bucket.push(payment);
      else paymentsByShipment.set(payment.shipmentId, [payment]);
    }

    /*
     * One money reducer, used at every level above the shipment. Project and
     * client totals are the sum of their SHIPMENTS rather than a second
     * calculation over the same records, so no two pages can disagree.
     *
     * Priced revenue and priced cost are accumulated separately from the
     * headline totals: margin is computed on priced work ONLY, and folding an
     * unpriced booking's cost into it would report a loss the business has not
     * made.
     */
    function positionOf(rows: ShipmentSkeleton[]): MoneyPosition {
      const position: MoneyPosition = {
        revenueDjf: 0,
        collectedDjf: 0,
        outstandingDjf: 0,
        overdueDjf: 0,
        costDjf: 0,
        paidOutDjf: 0,
        payableDjf: 0,
        frozenDjf: 0,
        pipelineDjf: 0,
        grossDjf: null,
        marginPct: null,
        unpricedCount: 0,
        unpricedCostDjf: 0,
      };
      let pricedRevenue = 0;
      let pricedCost = 0;

      for (const row of rows) {
        const released = row.shipment.payout.releasedAt !== undefined;
        for (const booking of row.bookings) {
          const cost = costTotalDjf(booking);
          position.costDjf += cost;
          for (const line of booking.costLines) {
            if (line.paidAt) position.paidOutDjf += line.amountDjf;
            else if (row.held) position.frozenDjf += line.amountDjf;
            else if (released) position.payableDjf += line.amountDjf;
            else position.pipelineDjf += line.amountDjf;
          }
          if (booking.clientRateDjf === null) {
            position.unpricedCount += 1;
            position.unpricedCostDjf += cost;
          } else {
            position.revenueDjf += booking.clientRateDjf;
            pricedRevenue += booking.clientRateDjf;
            pricedCost += cost;
          }
        }
        if (row.invoice) {
          if (row.invoice.paidAt) {
            position.collectedDjf += row.invoice.amountDjf;
          } else {
            position.outstandingDjf += row.invoice.amountDjf;
            if (overdueDays(row.invoice, nowMs) > 0) {
              position.overdueDjf += row.invoice.amountDjf;
            }
          }
        }
      }

      if (pricedRevenue > 0) {
        position.grossDjf = pricedRevenue - pricedCost;
        position.marginPct = position.grossDjf / pricedRevenue;
      }
      return position;
    }

    // ── Shipment rows ─────────────────────────────────────────────────────
    const skeletons: ShipmentSkeleton[] = shipments.map((shipment) => {
      const own = bookingsByShipment.get(shipment.id) ?? [];
      return {
        shipment,
        bookings: own,
        held: isHeld(shipment.payout),
        invoice: shipment.invoiceId ? invoiceById.get(shipment.invoiceId) : undefined,
      };
    });

    const shipmentRows: ShipmentRow[] = skeletons
      .map((skeleton) => {
        const { shipment, bookings: own, held, invoice } = skeleton;
        const bookingRows: BookingRow[] = own.map((booking) => ({
          booking,
          stage: bookingStage(booking.proof),
          costTotal: costTotalDjf(booking),
          gross: grossMarginDjf(booking),
          marginPct: marginFraction(booking),
          transporter: transporterById.get(booking.transporterId),
        }));
        const missing = unprovenBookings(own);
        const provenAt = shipmentProvenAt(own);

        /*
         * Last activity is the most recent thing that HAPPENED to the money or
         * the cargo — a payment, a release, a proof — falling back to when the
         * consignment was opened. It is what the lists sort on, so a shipment
         * that moved this morning is at the top even if it opened months ago.
         */
        const stamps = [
          shipment.openedAt,
          shipment.payout.releasedAt,
          provenAt,
          ...own.flatMap((booking) => [
            booking.proof.completedAt,
            booking.proof.podSentAt,
            ...booking.costLines.map((line) => line.paidAt),
          ]),
        ].filter((value): value is string => Boolean(value));

        return {
          shipment,
          stage: shipmentStage(shipment, own),
          held,
          clock: validationClock(shipment, own, nowMs, windowMs),
          bookings: bookingRows,
          bookingCount: own.length,
          provenCount: own.length - missing.length,
          unproven: missing,
          provenAt,
          settlements: settlementsFor(shipment, own),
          payments: paymentsByShipment.get(shipment.id) ?? [],
          money: positionOf([skeleton]),
          invoice,
          client: clientById.get(shipment.clientId),
          project: shipment.projectId
            ? projectRecordById.get(shipment.projectId)
            : undefined,
          source: sourceById.get(shipment.fundingSourceId),
          lastActivityAt: stamps.sort().reverse()[0] ?? shipment.openedAt,
        };
      })
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));

    const shipmentById = new Map(shipmentRows.map((row) => [row.shipment.id, row]));
    const bookingById = new Map<string, BookingRow>();
    const shipmentOfBooking = new Map<string, ShipmentRow>();
    for (const row of shipmentRows) {
      for (const bookingRow of row.bookings) {
        bookingById.set(bookingRow.booking.id, bookingRow);
        shipmentOfBooking.set(bookingRow.booking.id, row);
      }
    }

    const queue = buildActionQueue({
      shipments,
      bookings,
      invoices,
      movements,
      sources: sourceById,
      settings,
      nowMs,
    });

    // ── Headline positions ────────────────────────────────────────────────
    let payableNowTotal = 0;
    let frozenOnHoldTotal = 0;
    for (const row of shipmentRows) {
      payableNowTotal += row.money.payableDjf;
      frozenOnHoldTotal += row.money.frozenDjf;
    }
    const openInvoices = invoices.filter((invoice) => !invoice.paidAt);
    const arOpenTotal = openInvoices.reduce((sum, invoice) => sum + invoice.amountDjf, 0);
    const arOverdueTotal = openInvoices
      .filter((invoice) => overdueDays(invoice, nowMs) > 0)
      .reduce((sum, invoice) => sum + invoice.amountDjf, 0);
    const bankDrawnTotal = [...positions.values()].reduce(
      (sum, position) => sum + position.drawnDjf,
      0,
    );
    const bankCeilingTotal = sources.reduce((sum, source) => sum + source.ceilingDjf, 0);

    // ── Receivables per client ────────────────────────────────────────────
    const clientAr: ClientArRow[] = clients.map((client) => {
      const own = openInvoices.filter((invoice) => invoice.clientId === client.id);
      const buckets: Record<AgingBracket, number> = {
        '0-30': 0,
        '31-60': 0,
        '61-90': 0,
        '90+': 0,
      };
      for (const invoice of own) {
        buckets[agingBracket(invoiceAgeDays(invoice, nowMs))] += invoice.amountDjf;
      }
      const source = sources.find((entry) => entry.clientId === client.id);
      return {
        client,
        source,
        openTotal: own.reduce((sum, invoice) => sum + invoice.amountDjf, 0),
        overdueTotal: own
          .filter((invoice) => overdueDays(invoice, nowMs) > 0)
          .reduce((sum, invoice) => sum + invoice.amountDjf, 0),
        buckets,
        dso: daysSalesOutstanding(invoices, nowMs, client.id),
        openInvoices: own.length,
      };
    });

    // ── Transporter obligations, summed from settlements ──────────────────
    const transporterRows: TransporterRow[] = transporters
      .map((transporter) => {
        let owedTotal = 0;
        let frozen = 0;
        let payableNow = 0;
        let pipeline = 0;
        let activeShipments = 0;
        let bookingsCarried = 0;
        let lastPaidAt: string | undefined;
        const sourceIds = new Set<string>();

        for (const row of shipmentRows) {
          const settlement = row.settlements.find(
            (entry) => entry.transporterId === transporter.id,
          );
          if (!settlement) continue;
          sourceIds.add(row.shipment.fundingSourceId);
          bookingsCarried += settlement.bookingsCount;

          const outstanding = settlement.totalDjf - settlement.paidDjf;
          if (outstanding > 0) {
            owedTotal += outstanding;
            activeShipments += 1;
            if (row.held) frozen += outstanding;
            else if (row.shipment.payout.releasedAt) payableNow += outstanding;
            else pipeline += outstanding;
          }
        }

        // Promise-keeping is measured on VOUCHERS, because a voucher is one
        // promise: "you delivered, here is your money for all of it".
        const own = payments.filter((payment) => payment.transporterId === transporter.id);
        const payDelays: number[] = [];
        let onPromise = 0;
        let unsignedVouchers = 0;
        for (const payment of own) {
          if (!lastPaidAt || payment.paidAt > lastPaidAt) lastPaidAt = payment.paidAt;
          if (!payment.acknowledgedAt) unsignedVouchers += 1;
          const releasedAt = shipmentById.get(payment.shipmentId)?.shipment.payout.releasedAt;
          if (!releasedAt) continue;
          const delay =
            (new Date(payment.paidAt).getTime() - new Date(releasedAt).getTime()) /
            (24 * HOUR_MS);
          payDelays.push(delay);
          if (delay <= settings.payoutPromiseDays + 0.5) onPromise += 1;
        }

        return {
          transporter,
          owedTotal,
          frozenOnHold: frozen,
          payableNow,
          pipeline,
          activeShipments,
          bookingsCarried,
          lastPaidAt,
          avgPayDays:
            payDelays.length > 0
              ? payDelays.reduce((sum, value) => sum + value, 0) / payDelays.length
              : null,
          promiseKeptRate: payDelays.length > 0 ? onPromise / payDelays.length : null,
          unsignedVouchers,
          fundingSourceIds: [...sourceIds],
        };
      })
      .filter((row) => row.owedTotal > 0 || row.lastPaidAt !== undefined)
      .sort((a, b) => b.owedTotal - a.owedTotal);

    // ── Contract economics ────────────────────────────────────────────────
    const contractRows: ContractRow[] = clients
      .map((client) => {
        const own = shipmentRows.filter((row) => row.shipment.clientId === client.id);
        const money = positionOf(own.map(toSkeleton));
        let capitalDays = 0;
        for (const row of own) {
          const value = capitalDaysDjf(
            row.shipment,
            row.bookings.map((entry) => entry.booking),
            row.invoice,
            nowMs,
          );
          if (value !== null) capitalDays += value;
        }
        const gross = money.grossDjf ?? 0;
        return {
          client,
          source: sources.find((entry) => entry.clientId === client.id),
          shipments: own.length,
          bookings: own.reduce((sum, row) => sum + row.bookingCount, 0),
          unpriced: money.unpricedCount,
          revenue: money.revenueDjf,
          cost: money.costDjf,
          gross,
          marginPct: money.marginPct,
          capitalDays,
          marginPerCapitalDay: capitalDays > 0 ? gross / capitalDays : null,
        };
      })
      .filter((row) => row.shipments > 0)
      .sort((a, b) => (b.marginPerCapitalDay ?? -1) - (a.marginPerCapitalDay ?? -1));

    // ── Projects ──────────────────────────────────────────────────────────
    const rowsByProject = new Map<string, ShipmentRow[]>();
    for (const row of shipmentRows) {
      const projectId = row.shipment.projectId;
      if (projectId === null) continue;
      const bucket = rowsByProject.get(projectId);
      if (bucket) bucket.push(row);
      else rowsByProject.set(projectId, [row]);
    }

    const projectRows: ProjectRow[] = projects
      .map((project) => {
        const own = rowsByProject.get(project.id) ?? [];
        return {
          project,
          client: clientById.get(project.clientId),
          source: sourceById.get(project.fundingSourceId),
          shipments: own,
          shipmentCount: own.length,
          bookingCount: own.reduce((sum, row) => sum + row.bookingCount, 0),
          settled: own.filter((row) => row.invoice?.paidAt).length,
          money: positionOf(own.map(toSkeleton)),
          lastActivityAt: own[0]?.lastActivityAt ?? project.startedAt,
        };
      })
      .sort((a, b) => b.lastActivityAt.localeCompare(a.lastActivityAt));
    const projectById = new Map(projectRows.map((row) => [row.project.id, row]));

    /*
     * A client is listed once per channel it actually trades through. AMINA
     * runs three Fleetin projects and one DPCS project, so it appears on both
     * tabs with only that channel's money — the tabs are a partition of the
     * book, not a filter that double-counts.
     */
    const clientRows: ClientRow[] = [];
    for (const client of clients) {
      for (const channel of ['fleetin_direct', 'dpcs'] as OriginationChannel[]) {
        const own = projectRows.filter(
          (row) => row.project.clientId === client.id && row.project.channel === channel,
        );
        // One-offs sit beside the projects, not inside a synthetic one.
        const direct = shipmentRows.filter(
          (row) =>
            row.shipment.projectId === null &&
            row.shipment.clientId === client.id &&
            row.shipment.originationChannel === channel,
        );
        if (own.length === 0 && direct.length === 0) continue;
        const every = [...own.flatMap((row) => row.shipments), ...direct];
        clientRows.push({
          client,
          channel,
          projects: own,
          directShipments: direct,
          shipmentCount: every.length,
          bookingCount: every.reduce((sum, row) => sum + row.bookingCount, 0),
          money: positionOf(every.map(toSkeleton)),
          dso: daysSalesOutstanding(invoices, nowMs, client.id),
          lastShipmentAt:
            [own[0]?.lastActivityAt, direct[0]?.lastActivityAt]
              .filter((value): value is string => Boolean(value))
              .sort()
              .reverse()[0] ?? client.id,
          sources: [
            ...new Map(
              own
                .map((row) => row.source)
                .filter((source): source is FundingSource => source !== undefined)
                .map((source) => [source.id, source]),
            ).values(),
          ],
        });
      }
    }
    clientRows.sort((a, b) => b.lastShipmentAt.localeCompare(a.lastShipmentAt));

    // ── Portfolio economics ───────────────────────────────────────────────
    const portfolio = positionOf(skeletons);
    const unpricedRows = [...bookingById.values()].filter(
      (row) => row.booking.clientRateDjf === null,
    );
    let netTotal = 0;
    for (const row of shipmentRows) {
      const net = netMarginDjf(
        row.shipment,
        row.bookings.map((entry) => entry.booking),
        row.invoice,
        row.source,
        nowMs,
      );
      if (net !== null) netTotal += net;
    }
    const marginAtRisk = shipmentRows
      .filter((row) => row.invoice && overdueDays(row.invoice, nowMs) >= 60)
      .reduce((sum, row) => sum + (row.money.grossDjf ?? 0), 0);

    const worstShipments = shipmentRows
      .filter((row) => row.money.marginPct !== null)
      .sort((a, b) => (a.money.marginPct ?? 0) - (b.money.marginPct ?? 0))
      .slice(0, 5);

    return {
      nowMs,
      settings,
      clients,
      clientById,
      transporterById,
      sources,
      sourceById,
      positions,
      runways,
      invoices,
      invoiceById,
      payments,
      paymentById,
      shipmentRows,
      shipmentById,
      bookingById,
      shipmentOfBooking,
      queue,
      bankDrawnTotal,
      bankCeilingTotal,
      arOpenTotal,
      arOverdueTotal,
      payableNowTotal,
      frozenOnHoldTotal,
      blockedShipmentCount: shipmentRows.filter((row) => row.stage === 'awaiting_pod').length,
      unprovenBookingCount: shipmentRows.reduce(
        (sum, row) =>
          sum + row.unproven.filter((booking) => booking.proof.completedAt).length,
        0,
      ),
      dsoOverall: daysSalesOutstanding(invoices, nowMs),
      clientAr,
      transporterRows,
      contractRows,
      projects,
      projectRows,
      projectById,
      clientRows,
      economics: {
        priced: bookingById.size - unpricedRows.length,
        unpriced: unpricedRows.length,
        unpricedCostValue: portfolio.unpricedCostDjf,
        grossTotal: portfolio.grossDjf ?? 0,
        avgMarginPct: portfolio.marginPct,
        marginAtRisk,
        netTotal,
        worstShipments,
        unpricedRows,
      },
    };
  }, [
    shipments,
    bookings,
    invoices,
    payments,
    movements,
    sources,
    clients,
    transporters,
    projects,
    settings,
    nowMs,
  ]);
}

/**
 * The minimum a money calculation needs from a shipment.
 *
 * Exists so `positionOf` can run BEFORE `ShipmentRow` is built (a row carries
 * its own money, so it cannot be the input to computing it) and afterwards on
 * finished rows, without two versions of the arithmetic.
 */
interface ShipmentSkeleton {
  shipment: FinanceShipment;
  bookings: FinanceBooking[];
  held: boolean;
  invoice?: ClientInvoice;
}

const toSkeleton = (row: ShipmentRow): ShipmentSkeleton => ({
  shipment: row.shipment,
  bookings: row.bookings.map((entry) => entry.booking),
  held: row.held,
  invoice: row.invoice,
});

/** Re-exported so pages can type against the row shapes without deep imports. */
export { costLineStatus, financedDays, marginPerCapitalDay, overdueDays, invoiceAgeDays };
