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

/* `resolvePartnerRateMinorUnitsFdj` was removed on 2026-08-31 along with the
   `PricingTier` table it read. Nothing derives a shipment's price any more:
   the operator enters it in the wizard and it arrives as
   `clientRateMinorUnits`. What remains here is the commission split, which is
   still Fleetin's to compute — the shipper's figure is the entered one, and
   the transporter is paid it less the house percentage. */


/**
 * Fleetin's house commission, as a percentage. One rate for every
 * transporter — deliberately not a per-partner negotiation — read from the
 * single `AppSettings` row. Defaults to 0 when nobody has set one yet, which
 * makes the transporter payout equal the shipment total: visibly wrong to an
 * operator, rather than quietly skimming an invented percentage.
 */
export async function fleetinCommissionPct(prisma: PrismaService): Promise<number> {
  const settings = await prisma.appSettings.findUnique({ where: { id: 'SINGLETON' } });
  return settings?.fleetinCommissionPct ?? 0;
}

export interface CommissionSplit {
  /** What the shipper is billed — the partner's price list figure, unchanged. */
  totalMinorUnits: bigint;
  /** What Fleetin keeps out of that total. */
  fleetinMinorUnits: bigint;
  /** What the transporter is actually paid: total minus Fleetin's cut. */
  transporterMinorUnits: bigint;
}

/**
 * Splits a shipment total into the transporter's payout and Fleetin's cut.
 *
 * The total is the number the shipper sees and pays; Fleetin's percentage is
 * already inside it. Rounding is applied to Fleetin's side and the
 * transporter takes the remainder, so the two parts always add back to
 * exactly the total — a payout must never be a rounded figure that leaves an
 * unexplained franc behind.
 */
export function splitCommission(totalMinorUnits: bigint, pct: number): CommissionSplit {
  const safePct = Number.isFinite(pct) ? Math.min(100, Math.max(0, pct)) : 0;
  const fleetinMinorUnits = BigInt(Math.round((Number(totalMinorUnits) * safePct) / 100));
  return {
    totalMinorUnits,
    fleetinMinorUnits,
    transporterMinorUnits: totalMinorUnits - fleetinMinorUnits,
  };
}
