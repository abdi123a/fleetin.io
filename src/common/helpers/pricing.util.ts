import { PrismaService } from '../../modules/prisma/prisma.service';

/**
 * The BCD Djibouti franc peg, ported from `transporter-bi/config.ts` — the
 * one place in the frontend this conversion happened. Fixed here rather than
 * env-configurable for now; if the peg ever moves, this is the only line to
 * change.
 */
const USD_TO_DJF = 177.721;

/**
 * DJF has no subunit in practice (scale 0); most other currencies here use
 * scale 2 (BR-5.1). Exported because writers of rate-card rows must store at
 * the same scale the resolvers below read at — a row written at scale 2 and
 * read at scale 0 is off by 100×.
 */
export function scaleForCurrency(currency: string): number {
  return currency === 'FDJ' || currency === 'DJF' ? 0 : 2;
}

/** Whole currency units → minor units at that currency's own scale. */
export function toMinorUnits(amount: number, currency: string): bigint {
  return BigInt(Math.round(amount * 10 ** scaleForCurrency(currency)));
}

/** Whole DJF from a USD figure, at the fixed peg above. */
export function usdToDjf(usd: number): number {
  return usd * USD_TO_DJF;
}

/**
 * Where Fleetin's cut comes from, and in what order.
 *
 * Three sources, most specific first:
 *
 *   1. **The client's own deal.** The rate negotiated with this shipper. It
 *      wins because the invoice is the client's document — the number they
 *      agreed to is the number that must apply to their bill.
 *   2. **The haulier's deal.** The rate negotiated with this transporter, for
 *      jobs they carry where the client has no deal of their own.
 *   3. **The house rate** under Settings, which is what almost every job uses.
 *
 * A deal is present when its `commissionMode` is set — never inferred from the
 * amount. That distinction is the whole point: a negotiated **0%** or a
 * **0-franc** fee is a real commercial decision (a favour, a first job, a
 * loss-leader) and must not be mistaken for an unset field that quietly falls
 * back to the house rate.
 *
 * The house rate is percentage-only and defaults to 0 when nobody has set one,
 * which makes the transporter payout equal the shipment total — visibly wrong
 * to an operator, rather than quietly skimming an invented percentage.
 */
export type CommissionMode = 'percent' | 'fixed';
export type CommissionOrigin = 'shipper' | 'transporter' | 'house';

export interface ResolvedCommission {
  mode: CommissionMode;
  /** Meaningful in `percent` mode: 7.5 means 7.5%. */
  pct: number;
  /** Meaningful in `fixed` mode: the fee for ONE booking (one container). */
  fixedMinorUnits: bigint;
  /** Which deal won. Stored on the document so a reader can see why. */
  source: CommissionOrigin;
}

/** A row carrying a negotiated deal — either counterparty has the same shape. */
interface DealRow {
  commissionMode: string | null;
  commissionPct: number | null;
  commissionFixedMinorUnits: bigint | null;
}

function dealOf(row: DealRow | null, source: CommissionOrigin): ResolvedCommission | null {
  if (!row?.commissionMode) return null;
  if (row.commissionMode === 'fixed') {
    return {
      mode: 'fixed',
      pct: 0,
      fixedMinorUnits: row.commissionFixedMinorUnits ?? 0n,
      source,
    };
  }
  return { mode: 'percent', pct: row.commissionPct ?? 0, fixedMinorUnits: 0n, source };
}

export async function resolveCommission(
  prisma: PrismaService,
  params: { shipperId?: string | null; partnerId?: string | null },
): Promise<ResolvedCommission> {
  const select = { commissionMode: true, commissionPct: true, commissionFixedMinorUnits: true };

  if (params.shipperId) {
    const shipper = await prisma.shipper.findUnique({ where: { id: params.shipperId }, select });
    const deal = dealOf(shipper, 'shipper');
    if (deal) return deal;
  }

  if (params.partnerId) {
    const partner = await prisma.partner.findUnique({ where: { id: params.partnerId }, select });
    const deal = dealOf(partner, 'transporter');
    if (deal) return deal;
  }

  const settings = await prisma.appSettings.findUnique({ where: { id: 'SINGLETON' } });
  return {
    mode: 'percent',
    pct: settings?.fleetinCommissionPct ?? 0,
    fixedMinorUnits: 0n,
    source: 'house',
  };
}

/** The house rate on its own, for callers with no shipment in hand. */
export async function fleetinCommissionPct(prisma: PrismaService): Promise<number> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 'SINGLETON' } });
  return settings?.fleetinCommissionPct ?? 0;
}

export interface CommissionSplit {
  /** What the shipper is billed — the shipment's entered price, unchanged. */
  totalMinorUnits: bigint;
  /** What Fleetin keeps out of that total. */
  fleetinMinorUnits: bigint;
  /** What the transporter is actually paid: total minus Fleetin's cut. */
  transporterMinorUnits: bigint;
}

/**
 * Splits a shipment total into the transporter's payout and Fleetin's cut.
 *
 * The total is the number the shipper sees and pays; Fleetin's share comes out
 * of it either way. In `percent` mode the cut is a share of the total; in
 * `fixed` mode it is the agreed fee times the number of containers on the job,
 * which is why `bookingCount` is required rather than defaulted — a fixed deal
 * silently applied once to a twenty-container shipment would under-charge by
 * nineteen fees.
 *
 * Two guards, both deliberate:
 *
 *   - A percentage is clamped to 0–100, so a nonsense rate cannot invert the
 *     payout.
 *   - A fixed fee is capped at the total. A flat fee larger than the job it is
 *     charged against would otherwise pay the transporter a NEGATIVE amount;
 *     taking the whole total is wrong too, but it is wrong in a direction an
 *     operator can see and fix, rather than a minus sign nobody reads.
 *
 * Rounding falls on Fleetin's side and the transporter takes the remainder, so
 * the two parts always add back to exactly the total — a payout must never
 * leave an unexplained franc behind.
 */
export function splitCommission(
  totalMinorUnits: bigint,
  commission: { mode: CommissionMode; pct: number; fixedMinorUnits: bigint },
  bookingCount: number,
): CommissionSplit {
  let fleetinMinorUnits: bigint;

  if (commission.mode === 'fixed') {
    const boxes = BigInt(Math.max(1, Math.trunc(bookingCount) || 1));
    const raw = (commission.fixedMinorUnits < 0n ? 0n : commission.fixedMinorUnits) * boxes;
    fleetinMinorUnits = raw > totalMinorUnits ? totalMinorUnits : raw;
  } else {
    const safePct = Number.isFinite(commission.pct) ? Math.min(100, Math.max(0, commission.pct)) : 0;
    fleetinMinorUnits = BigInt(Math.round((Number(totalMinorUnits) * safePct) / 100));
  }

  return {
    totalMinorUnits,
    fleetinMinorUnits,
    transporterMinorUnits: totalMinorUnits - fleetinMinorUnits,
  };
}
