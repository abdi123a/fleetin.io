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

/**
 * What a shipment of `vehicles` trips of `vehicleType` COSTS THE SHIPPER on
 * this partner's price list, in FDJ minor units — containers times the
 * partner's own per-mission price, which is the whole pricing rule.
 *
 * This figure is shipper-facing and already includes Fleetin's commission;
 * the transporter is paid this minus that commission (`splitCommission`).
 * Ports `resolvePartnerRateFDJ()` from `CreateShipmentModal.tsx` server-side
 * (BR-2.6) — the wizard must display the price, never be the one setting it.
 * Same fuzzy vehicle-type match, same USD peg.
 *
 * Returns `null` — never an invented figure — when the partner has no
 * pricing tiers at all, or when none of their tiers matches the vehicle
 * type. Callers treat null as "unpriced" and leave the rate unset, so the
 * gap surfaces to an operator instead of being billed at a made-up price.
 *
 * Shared by `ShipmentsService` (summed across every assignment, for the
 * shipment total) and `BookingsService` (called once per booking) — one
 * resolution rule, not two copies that could drift.
 */
export async function resolvePartnerRateMinorUnitsFdj(
  prisma: PrismaService,
  partnerId: string,
  vehicleType: string,
  vehicles: number,
): Promise<bigint | null> {
  const tiers = await prisma.pricingTier.findMany({ where: { partnerId } });
  if (tiers.length === 0) return null;

  const needle = vehicleType.toLowerCase();
  const match = tiers.find(
    (tier) => needle.includes(tier.vehicleType.toLowerCase()) || tier.vehicleType.toLowerCase().includes(needle),
  );
  if (!match) return null;

  const scale = scaleForCurrency(match.currency);
  const baseAmount = Number(match.basePriceMinorUnits) / 10 ** scale;
  const amountFdj = match.currency === 'USD' ? baseAmount * USD_TO_DJF : baseAmount;
  return BigInt(vehicles) * BigInt(Math.round(amountFdj));
}

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
