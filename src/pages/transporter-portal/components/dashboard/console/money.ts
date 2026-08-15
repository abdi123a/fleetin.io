import { formatNumber } from '@/utils';
import { tpCurrency, usdToDjf, toDjf } from '@/features/transporter-bi';

/**
 * The console's franc formatting.
 *
 * `transporter-bi` settles the corridor dataset in USD because that is how
 * cross-border linehaul contracts are written, but the operator sitting in
 * front of this screen quotes, invoices and gets paid in DJF — and the shipper
 * console next door already reads in DJF too. The peg and the conversion
 * itself live in the feature (`config.ts`, `format.ts`) so the dashboard and
 * the analytics suite can never disagree about what a franc is worth; what
 * remains here are the console's own display shapes.
 */

/**
 * The currency mark, read at call time.
 *
 * It was a module-level `const` until the base currency became a setting — a
 * constant captured at import cannot follow a value somebody changes on the
 * Settings screen.
 */
export const DJF = () => tpCurrency();

export { usdToDjf, toDjf };

/** 1_284_000 -> "1.28M". The card-scale abbreviation, no currency mark. */
export function compact(value: number): string {
  const abs = Math.abs(value);
  const sign = value < 0 ? '−' : '';
  if (abs >= 1_000_000_000) return `${sign}${(abs / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${sign}${(abs / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${sign}${(abs / 1_000).toFixed(0)}K`;
  return `${sign}${formatNumber(abs, { maximumFractionDigits: 0 })}`;
}

/** Card money, from a USD figure: "7.52M". */
export function djfCompact(usd: number): string {
  return compact(toDjf(usd));
}

/** Card money with its unit: "7.52M DJF". */
export function djfCard(usd: number): string {
  return `${compact(toDjf(usd))} ${DJF()}`;
}

/** Table money, from a USD figure: "48,200 DJF" — read carefully, keeps digits. */
export function djfFull(usd: number): string {
  const djf = toDjf(usd);
  const sign = djf < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(djf), { maximumFractionDigits: 0 })} ${DJF()}`;
}

/** Table money without the unit, for columns that head their own currency. */
export function djfPlain(usd: number): string {
  const djf = toDjf(usd);
  const sign = djf < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(djf), { maximumFractionDigits: 0 })}`;
}

/**
 * Money that is already in francs.
 *
 * The rate curves are quoted in DJF at source rather than converted from the
 * dataset's USD, so they format through here and skip `toDjf` entirely.
 */
export function fmtDjf(value: number): string {
  const sign = value < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(value), { maximumFractionDigits: 0 })} ${DJF()}`;
}

/** A signed franc figure: "+2,310 DJF". */
export function fmtDjfSigned(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(value), { maximumFractionDigits: 0 })} ${DJF()}`;
}

/** A signed DJF delta where the sign carries the message: "−4,400 DJF". */
export function djfSigned(usd: number): string {
  const djf = toDjf(usd);
  const sign = djf > 0 ? '+' : djf < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(djf), { maximumFractionDigits: 0 })} ${DJF()}`;
}

/** A percentage with an explicit sign: "+6.2%". */
export function signedPct(fraction: number, digits = 1): string {
  const pct = fraction * 100;
  const sign = pct > 0 ? '+' : pct < 0 ? '−' : '';
  return `${sign}${Math.abs(pct).toFixed(digits)}%`;
}

export function pct(fraction: number, digits = 0): string {
  return `${(fraction * 100).toFixed(digits)}%`;
}

/** "8.0 h" — hours always carry their unit so they never read as a count. */
export function hours(value: number, digits = 1): string {
  return `${value.toFixed(digits)} h`;
}
