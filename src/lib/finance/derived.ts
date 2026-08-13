/**
 * Derived economics. Compute, never store.
 *
 * Two levels, and the distinction matters:
 *
 * - BOOKING margin answers "was this container worth moving". Useful on a
 *   container's detail, useless for cash, because nothing is invoiced or
 *   financed at that level.
 * - SHIPMENT margin is the real one. The invoice is per shipment, the release
 *   is per shipment, so revenue, cost, financed days and capital days are all
 *   shipment-scoped. Anything that touches the working-capital loop uses these.
 *
 * The one rule that outranks all others here: NEVER estimate a missing client
 * rate. An unpriced booking yields `null` margins all the way up, and a
 * shipment carrying one reports its priced portion plus an explicit unpriced
 * count — a margin figure built on a guessed price is worse than an obvious
 * gap, because it will be trusted.
 *
 * Cost of capital flows through every net-margin figure via the funding
 * source's rate field. It is 0 for CAC today; the PATH must still exist so a
 * rate discovered later (e.g. embedded in ceiling pricing) drops in without
 * touching call sites.
 */

import type {
  ClientInvoice,
  FinanceBooking,
  FinanceProject,
  FinanceShipment,
  FundingSource,
} from '@/types/finance';
import { DAY_MS } from './payoutEngine';

const toMs = (iso: string): number => new Date(iso).getTime();

// ─── Per booking ────────────────────────────────────────────────────────────

export function costTotalDjf(booking: FinanceBooking): number {
  return booking.costLines.reduce((sum, line) => sum + line.amountDjf, 0);
}

export function paidOutDjf(booking: FinanceBooking): number {
  return booking.costLines.reduce((sum, line) => sum + (line.paidAt ? line.amountDjf : 0), 0);
}

/** Client rate − Σ cost lines, for one container. Null when unpriced. */
export function grossMarginDjf(booking: FinanceBooking): number | null {
  if (booking.clientRateDjf === null) return null;
  return booking.clientRateDjf - costTotalDjf(booking);
}

/** Gross margin ÷ client rate, as a fraction. Null when unpriced. */
export function marginFraction(booking: FinanceBooking): number | null {
  const gross = grossMarginDjf(booking);
  if (gross === null || booking.clientRateDjf === null || booking.clientRateDjf === 0) {
    return null;
  }
  return gross / booking.clientRateDjf;
}

// ─── Per shipment ───────────────────────────────────────────────────────────

export function shipmentCostDjf(bookings: FinanceBooking[]): number {
  return bookings.reduce((sum, booking) => sum + costTotalDjf(booking), 0);
}

export function shipmentPaidOutDjf(bookings: FinanceBooking[]): number {
  return bookings.reduce((sum, booking) => sum + paidOutDjf(booking), 0);
}

/**
 * What the shipper is billed for the whole consignment — the figure on the
 * invoice and on the delivery document.
 *
 * Null when NOTHING on the shipment is priced. When only some bookings are
 * priced this returns the priced portion; `unpricedBookings` is how a caller
 * finds out the total is partial, and every screen showing this must say so.
 */
export function shipmentRevenueDjf(bookings: FinanceBooking[]): number | null {
  const priced = bookings.filter((booking) => booking.clientRateDjf !== null);
  if (priced.length === 0) return null;
  return priced.reduce((sum, booking) => sum + (booking.clientRateDjf ?? 0), 0);
}

/** The containers with no price on them. A gap to be shown, never averaged away. */
export function unpricedBookings(bookings: FinanceBooking[]): FinanceBooking[] {
  return bookings.filter((booking) => booking.clientRateDjf === null);
}

/**
 * Shipment gross margin, computed on the PRICED bookings only.
 *
 * Deliberately excludes unpriced bookings from both sides rather than counting
 * their cost against zero revenue — that would report a loss the business has
 * not made. The unpriced cost is reported separately so it cannot hide.
 */
export function shipmentGrossDjf(bookings: FinanceBooking[]): number | null {
  const priced = bookings.filter((booking) => booking.clientRateDjf !== null);
  if (priced.length === 0) return null;
  const revenue = priced.reduce((sum, booking) => sum + (booking.clientRateDjf ?? 0), 0);
  const cost = priced.reduce((sum, booking) => sum + costTotalDjf(booking), 0);
  return revenue - cost;
}

export function shipmentMarginFraction(bookings: FinanceBooking[]): number | null {
  const gross = shipmentGrossDjf(bookings);
  const revenue = shipmentRevenueDjf(bookings);
  if (gross === null || revenue === null || revenue === 0) return null;
  return gross / revenue;
}

/**
 * Days Fleetin's money was out: client payment date − shipment release date.
 * For a still-unpaid invoice the counter is RUNNING — pass `nowMs` to read
 * the exposure so far; the settled figure exists only once the client pays.
 */
export function financedDays(
  shipment: FinanceShipment,
  invoice: ClientInvoice | undefined,
  nowMs: number,
): number | null {
  const releasedAt = shipment.payout.releasedAt;
  if (!releasedAt) return null;
  const end = invoice?.paidAt ? toMs(invoice.paidAt) : nowMs;
  return Math.max(0, (end - toMs(releasedAt)) / DAY_MS);
}

/**
 * DJF-days of working capital the shipment consumed: amount paid out ×
 * financed days. The unit is deliberately awkward — it measures how much
 * money was tied up AND for how long, which is the resource each contract
 * actually competes for.
 */
export function capitalDaysDjf(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
  invoice: ClientInvoice | undefined,
  nowMs: number,
): number | null {
  const days = financedDays(shipment, invoice, nowMs);
  if (days === null) return null;
  const out = shipmentPaidOutDjf(bookings) || shipmentCostDjf(bookings);
  return out * days;
}

/**
 * Gross margin ÷ capital days — the number Fleetin cannot currently see:
 * whether a high-margin contract is worth it once you count how long its
 * money stays out. 12% settling in 25 days can beat 18% settling in 60.
 */
export function marginPerCapitalDay(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
  invoice: ClientInvoice | undefined,
  nowMs: number,
): number | null {
  const gross = shipmentGrossDjf(bookings);
  const capDays = capitalDaysDjf(shipment, bookings, invoice, nowMs);
  if (gross === null || capDays === null || capDays === 0) return null;
  return gross / capDays;
}

/**
 * What the borrowed franc costs for the days it was out. Zero today only
 * because the RATE is zero — the charge is always computed, never skipped.
 */
export function costOfCapitalDjf(
  amountOutDjf: number,
  annualRate: number,
  daysOut: number,
): number {
  return amountOutDjf * annualRate * (daysOut / 365);
}

/** Gross margin minus the funding charge for this shipment's financed days. */
export function netMarginDjf(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
  invoice: ClientInvoice | undefined,
  source: FundingSource | undefined,
  nowMs: number,
): number | null {
  const gross = shipmentGrossDjf(bookings);
  if (gross === null) return null;
  const days = financedDays(shipment, invoice, nowMs);
  if (days === null || !source) return gross;
  const out = shipmentPaidOutDjf(bookings) || shipmentCostDjf(bookings);
  return gross - costOfCapitalDjf(out, source.costOfCapitalRate, days);
}

/**
 * One invoice covering every PRICED booking on a shipment, on the client's
 * terms. Shared by `confirmPod` (the normal, per-shipment trigger) and
 * `closeProjectContract` (the contract-end trigger) so there is exactly one
 * place that decides what a shipment's invoice contains — never two
 * implementations drifting apart. Null when nothing on the shipment is
 * priced; a caller must not invoice an empty line.
 */
export function buildShipmentInvoice(
  shipment: FinanceShipment,
  bookings: FinanceBooking[],
  id: string,
  termsDays: number,
  issuedAt: string,
): ClientInvoice | null {
  const priced = bookings.filter((booking) => booking.clientRateDjf !== null);
  if (priced.length === 0) return null;
  return {
    id,
    shipmentId: shipment.id,
    clientId: shipment.clientId,
    bookingIds: priced.map((booking) => booking.id),
    amountDjf: priced.reduce((sum, booking) => sum + (booking.clientRateDjf ?? 0), 0),
    issuedAt,
    dueAt: new Date(toMs(issuedAt) + termsDays * DAY_MS).toISOString(),
    reminders: [],
  };
}

// ─── Contracts ──────────────────────────────────────────────────────────────

/**
 * Days until the contract expires; negative once it is overdue to close.
 * Null for spot work / an open-ended project with no end date.
 */
export function contractDaysRemaining(project: FinanceProject, nowMs: number): number | null {
  if (!project.contractEndAt) return null;
  return (toMs(project.contractEndAt) - nowMs) / DAY_MS;
}

/**
 * True the moment a contract needs the desk's attention: its end date falls
 * in the current calendar month, or has already passed, and the project is
 * still open. This is what drives the in-app reminder list — there is no
 * notification backend to fire a real push/email from, so "reminder" here
 * means "stays visible on the module's screens until it is closed."
 */
export function isContractEndingThisMonth(project: FinanceProject, nowMs: number): boolean {
  if (project.status !== 'active' || !project.contractEndAt) return false;
  const now = new Date(nowMs);
  const end = new Date(project.contractEndAt);
  const sameMonth =
    end.getUTCFullYear() === now.getUTCFullYear() && end.getUTCMonth() === now.getUTCMonth();
  return sameMonth || toMs(project.contractEndAt) <= nowMs;
}

// ─── Receivables ────────────────────────────────────────────────────────────

export type AgingBracket = '0-30' | '31-60' | '61-90' | '90+';

export const AGING_BRACKETS: AgingBracket[] = ['0-30', '31-60', '61-90', '90+'];

/** Age of an open invoice in days since issue. */
export function invoiceAgeDays(invoice: ClientInvoice, nowMs: number): number {
  const end = invoice.paidAt ? toMs(invoice.paidAt) : nowMs;
  return Math.max(0, (end - toMs(invoice.issuedAt)) / DAY_MS);
}

/** Days past due; 0 while inside terms or already paid. */
export function overdueDays(invoice: ClientInvoice, nowMs: number): number {
  if (invoice.paidAt) return 0;
  return Math.max(0, (nowMs - toMs(invoice.dueAt)) / DAY_MS);
}

export function agingBracket(ageDays: number): AgingBracket {
  if (ageDays <= 30) return '0-30';
  if (ageDays <= 60) return '31-60';
  if (ageDays <= 90) return '61-90';
  return '90+';
}

/**
 * Days sales outstanding: the amount-weighted average age of receivables —
 * paid invoices at their settled collection time, open invoices at their
 * running age. Against 30-day terms the business currently lives near 41;
 * the gap is a CAPACITY constraint, because each extra day consumes every
 * facility ~3% longer than its ceiling was priced for.
 */
export function daysSalesOutstanding(
  invoices: ClientInvoice[],
  nowMs: number,
  clientId?: string,
): number | null {
  const relevant = invoices.filter(
    (invoice) => !clientId || invoice.clientId === clientId,
  );
  if (relevant.length === 0) return null;
  let weighted = 0;
  let total = 0;
  for (const invoice of relevant) {
    weighted += invoiceAgeDays(invoice, nowMs) * invoice.amountDjf;
    total += invoice.amountDjf;
  }
  return total > 0 ? weighted / total : null;
}
