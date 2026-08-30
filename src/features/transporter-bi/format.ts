import { formatNumber } from '@/utils';
import { tpCurrency, usdToDjf } from './config';
import type { MetricUnit } from './contracts';

/**
 * Formatting for transporter BI values.
 *
 * Same rule as the shipper suite: **numbers on a card are read at a glance,
 * numbers in a table are read carefully.** Card values abbreviate; table
 * values keep their digits.
 *
 * This module is also the portal's currency edge. Everything upstream — the
 * dataset, the derivations, the aggregates — is denominated in USD; every
 * money function here takes that USD figure and renders Djibouti francs, the
 * currency the carrier actually invoices in. Callers pass what they have and
 * get what the operator reads, so no section has to remember to convert.
 */

/** 1_284_000 -> "1.28M". */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatNumber(value, { maximumFractionDigits: 0 });
}

/** USD in, francs out. The one conversion in the suite. */
export function toDjf(usd: number): number {
  return usd * usdToDjf();
}

/** Card money, from a USD figure: "22.8M DJF". */
export function formatMoney(usd: number): string {
  const value = toDjf(usd);
  const sign = value < 0 ? '−' : '';
  return `${sign}${formatCompact(Math.abs(value))} ${tpCurrency()}`;
}

/** Table money, from a USD figure: "195,700 DJF" — every digit kept. */
export function formatMoneyFull(usd: number): string {
  const value = toDjf(usd);
  const sign = value < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(value), { maximumFractionDigits: 0 })} ${tpCurrency()}`;
}

/**
 * Money for a chart axis or a dense cell, from a USD figure: "195.7k".
 *
 * Drops the unit because the axis title or column header already carries it —
 * repeating "DJF" on every tick is noise, not information.
 */
export function formatMoneyCompact(usd: number): string {
  const value = toDjf(usd);
  const sign = value < 0 ? '−' : '';
  return `${sign}${formatCompact(Math.abs(value))}`;
}

/**
 * A per-kilometre rate, from a USD/km figure: "215 DJF/km".
 *
 * Francs have no subunit in practice, so a rate that reads "1.21" in dollars
 * reads as a whole number here — which is the right resolution for comparing
 * one lane against another.
 */
export function formatRatePerKm(usdPerKm: number): string {
  const value = toDjf(usdPerKm);
  const sign = value < 0 ? '−' : '';
  return `${sign}${formatNumber(Math.abs(value), { maximumFractionDigits: 0 })} ${tpCurrency()}/km`;
}

/** Kilometres at card scale: "12.4k km". */
export function formatKm(value: number): string {
  return `${formatCompact(value)} km`;
}

/**
 * CO₂ mass. Reads in tonnes once it earns them — "18.2 t CO₂" is a figure a
 * sustainability report can reuse; "18,214 kg" is not.
 */
export function formatCo2(kg: number): string {
  if (Math.abs(kg) >= 1000) return `${(kg / 1000).toFixed(1)} t CO₂`;
  return `${Math.round(kg)} kg CO₂`;
}

export function formatMetric(value: number, unit: MetricUnit): string {
  switch (unit) {
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'currency':
      return formatMoney(value);
    case 'days':
      return `${value.toFixed(1)}d`;
    case 'hours':
      return `${value.toFixed(1)}h`;
    case 'minutes':
      return formatDuration(value);
    case 'km':
      return formatKm(value);
    case 'kg':
      return formatCo2(value);
    case 'count':
      return formatNumber(value, { maximumFractionDigits: 0 });
  }
}

/** Minutes as the largest sensible unit: "2d 4h" beats "3120 minutes". */
export function formatDuration(minutes: number): string {
  const sign = minutes < 0 ? '-' : '';
  const abs = Math.abs(minutes);
  if (abs < 60) return `${sign}${Math.round(abs)}m`;
  if (abs < 60 * 24) {
    const hours = Math.floor(abs / 60);
    const rest = Math.round(abs % 60);
    return rest === 0 ? `${sign}${hours}h` : `${sign}${hours}h ${rest}m`;
  }
  const days = Math.floor(abs / (60 * 24));
  const hours = Math.round((abs % (60 * 24)) / 60);
  return hours === 0 ? `${sign}${days}d` : `${sign}${days}d ${hours}h`;
}

/** Signed variance, where the sign is the message. */
export function formatVariance(minutes: number): string {
  if (Math.abs(minutes) < 1) return 'on plan';
  return minutes > 0 ? `${formatDuration(minutes)} late` : `${formatDuration(-minutes)} early`;
}

/** A delta as a percentage with an explicit sign. */
export function formatDelta(deltaPct: number | undefined): string | undefined {
  if (deltaPct === undefined) return undefined;
  const pct = deltaPct * 100;
  const sign = pct > 0 ? '+' : '';
  return `${sign}${pct.toFixed(1)}%`;
}

/** Whether a change is good news, given what the metric measures. */
export function deltaIntent(
  deltaPct: number | undefined,
  polarity: 'higher_is_better' | 'lower_is_better' | 'neutral',
): 'good' | 'bad' | 'neutral' {
  if (deltaPct === undefined || polarity === 'neutral' || Math.abs(deltaPct) < 0.0005) {
    return 'neutral';
  }
  const rising = deltaPct > 0;
  if (polarity === 'higher_is_better') return rising ? 'good' : 'bad';
  return rising ? 'bad' : 'good';
}

export { tpCurrency, usdToDjf };
