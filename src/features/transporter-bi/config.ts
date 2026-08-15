import { getSettings } from '@/stores/settings.store';

/**
 * Policy constants of the transporter portal.
 *
 * Every threshold a card colours by or a badge counts against lives here, so
 * the tab badge and the table it opens can never disagree about what "at
 * risk" means. Emission and cost factors are stated once and derived from
 * everywhere.
 *
 * These read from Settings → Operations, so they are functions rather than
 * constants — a `const` captured at module load cannot follow a value the
 * operator changes. See `lib/bi/config.ts`, which does the same for the
 * shipper control tower and now shares the same answers.
 */

/**
 * The currency every screen in this portal reads in.
 *
 * The domain model underneath stays in USD — cross-border linehaul contracts
 * are written that way, and the corridor cost literature the rate card is
 * anchored to is published that way. But the operator sitting in front of the
 * screen quotes, invoices and gets paid in Djibouti francs, so the conversion
 * happens once at the presentation edge (`format.ts`) and nothing above it
 * ever sees a dollar.
 */
export function tpCurrency(): string {
  return getSettings().finance.baseCurrency;
}

/**
 * DJF per USD.
 *
 * The franc is pegged to the dollar, so this is a fixed rate rather than a
 * market one — 177.721 DJF/USD, the Banque Centrale de Djibouti peg, is the
 * shipped default. Read from settings so the analytics suite, the dashboard
 * console and the shipment pricing modal can never disagree about what a franc
 * is worth.
 */
export function usdToDjf(): number {
  return getSettings().finance.usdToDjf;
}

/**
 * A delivery this many minutes past plan still counts as on time.
 *
 * This used to be 120 here while the shipper control tower used 720 — the same
 * question answered two ways in one product, which is precisely the failure
 * the comment at the top of `lib/bi/config.ts` warns about. Both now read the
 * one setting.
 */
export function onTimeGraceMinutes(): number {
  return getSettings().operations.onTimeGraceMinutes;
}

/** Contractual on-time target the gauges draw their marker at. */
export function onTimeTarget(): number {
  return getSettings().operations.onTimeTarget;
}

/** Share of outbound trips the matching programme aims to cover. */
export function backhaulMatchTarget(): number {
  return getSettings().operations.backhaulMatchTarget;
}

/** Fleet utilisation the operation plans around. */
export function utilizationTarget(): number {
  return getSettings().operations.utilizationTarget;
}

/**
 * Emission factors, kg CO₂ per vehicle-km, heavy tractor on corridor roads.
 * An empty truck still burns most of its fuel — which is exactly why an
 * avoided empty leg is worth stating in kg, not only in dollars.
 */
export function co2KgPerKmLoaded(): number {
  return getSettings().operations.co2PerKmLoaded;
}

export function co2KgPerKmEmpty(): number {
  return getSettings().operations.co2PerKmEmpty;
}

/**
 * Direct running cost of an empty km (fuel, tyres, wear), USD.
 *
 * The shipped 0.95 is built up from the WCTR 2019 Djibouti–Addis corridor cost
 * study rather than guessed. Over its 780 km reference trip a loaded tractor
 * spends 0.71 USD/km on fuel, 0.17 on tyres, 0.12 on spares, 0.09 on running
 * repairs and 0.02 on lubricants. Running empty takes roughly a fifth off the
 * fuel and leaves the rest alone.
 *
 * It is worth saying plainly what that number means: an empty 910 km return
 * from Addis burns about USD 865 — most of what the loaded leg out earned. The
 * corridor's import/export imbalance sends nearly every truck home empty, so
 * this is the single figure the backhaul programme exists to attack.
 */
export function emptyCostPerKm(): number {
  return getSettings().operations.emptyCostPerKm;
}

/**
 * A live trip inside this arrival window with no return load yet is an
 * empty-return risk alert: close enough that dispatch must act today.
 */
export function emptyRiskHours(): number {
  return getSettings().operations.emptyRiskHours;
}

/** Risk score at or above which an alert row draws as critical. */
export function emptyRiskCritical(): number {
  return getSettings().operations.riskCritical;
}

/** Risk score at or above which a live trip appears in the alert table. */
export function emptyRiskAlert(): number {
  return getSettings().operations.riskWarning;
}

/** Payment terms: invoice due this many days after issue. */
export function paymentTermsDays(): number {
  return getSettings().finance.paymentTermsDays;
}

/** Settlement runs happen weekly on this UTC weekday (4 = Thursday). */
export function settlementWeekday(): number {
  return getSettings().finance.settlementWeekday;
}
