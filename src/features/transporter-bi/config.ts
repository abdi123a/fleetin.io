/**
 * Policy constants of the transporter portal.
 *
 * Every threshold a card colours by or a badge counts against lives here, so
 * the tab badge and the table it opens can never disagree about what "at
 * risk" means. Emission and cost factors are stated once and derived from
 * everywhere.
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
export const TP_CURRENCY = 'DJF';

/**
 * DJF per USD.
 *
 * The franc is pegged to the dollar, so this is a fixed rate rather than a
 * market one: 177.721 DJF/USD, the Banque Centrale de Djibouti peg. Stated
 * here so the analytics suite and the dashboard console can never disagree
 * about what a franc is worth.
 */
export const USD_TO_DJF = 177.721;

/** A delivery this many minutes past plan still counts as on time. */
export const ON_TIME_GRACE_MINUTES = 120;

/** Contractual on-time target the gauges draw their marker at. */
export const ON_TIME_TARGET = 0.92;

/** Share of outbound trips the matching programme aims to cover. */
export const BACKHAUL_MATCH_TARGET = 0.75;

/** Fleet utilisation the operation plans around. */
export const UTILIZATION_TARGET = 0.8;

/**
 * Emission factors, kg CO₂ per vehicle-km, heavy tractor on corridor roads.
 * An empty truck still burns most of its fuel — which is exactly why an
 * avoided empty leg is worth stating in kg, not only in dollars.
 */
export const CO2_KG_PER_KM_LOADED = 0.92;
export const CO2_KG_PER_KM_EMPTY = 0.68;

/**
 * Direct running cost of an empty km (fuel, tyres, wear), USD.
 *
 * Built up from the WCTR 2019 Djibouti–Addis corridor cost study rather than
 * guessed. Over its 780 km reference trip a loaded tractor spends 0.71 USD/km
 * on fuel, 0.17 on tyres, 0.12 on spares, 0.09 on running repairs and 0.02 on
 * lubricants. Running empty takes roughly a fifth off the fuel and leaves the
 * rest alone, which lands at 0.95.
 *
 * It is worth saying plainly what that number means: an empty 910 km return
 * from Addis burns about USD 865 — most of what the loaded leg out earned. The
 * corridor's import/export imbalance sends nearly every truck home empty, so
 * this is the single figure the backhaul programme exists to attack.
 */
export const EMPTY_COST_PER_KM = 0.95;

/**
 * A live trip inside this arrival window with no return load yet is an
 * empty-return risk alert: close enough that dispatch must act today.
 */
export const EMPTY_RISK_HOURS = 24;

/** Risk score at or above which an alert row draws as critical. */
export const EMPTY_RISK_CRITICAL = 70;

/** Risk score at or above which a live trip appears in the alert table. */
export const EMPTY_RISK_ALERT = 40;

/** Payment terms: invoice due this many days after issue. */
export const PAYMENT_TERMS_DAYS = 30;

/** Settlement runs happen weekly on this UTC weekday (4 = Thursday). */
export const SETTLEMENT_WEEKDAY = 4;
