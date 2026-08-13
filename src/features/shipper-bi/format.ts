import { formatNumber } from '@/utils';
import { BI_CURRENCY } from '@/lib/bi/config';
import type { MetricUnit } from './contracts';

/**
 * Formatting for BI values.
 *
 * Domain-specific, so it lives with the feature rather than in `utils/format`.
 * The rule throughout: **numbers on a card are read at a glance, numbers in a
 * table are read carefully.** Card values are abbreviated to two or three
 * significant characters; table values keep their digits.
 */

/** 1_284_000 -> "1.28M". Keeps a KPI card readable at any magnitude. */
export function formatCompact(value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000_000) return `${(value / 1_000_000_000).toFixed(2)}B`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(2)}M`;
  if (abs >= 10_000) return `${(value / 1_000).toFixed(1)}k`;
  return formatNumber(value, { maximumFractionDigits: 0 });
}

/** Full precision, for tables and tooltips. */
export function formatCurrencyFull(value: number): string {
  return `${formatNumber(value, { maximumFractionDigits: 0 })} ${BI_CURRENCY}`;
}

export function formatMetric(value: number, unit: MetricUnit): string {
  switch (unit) {
    case 'percent':
      return `${(value * 100).toFixed(1)}%`;
    case 'currency':
      return `${formatCompact(value)} ${BI_CURRENCY}`;
    case 'days':
      return `${value.toFixed(1)}d`;
    case 'hours':
      return `${value.toFixed(1)}h`;
    case 'minutes':
      return formatDuration(value);
    case 'count':
      return formatNumber(value, { maximumFractionDigits: 0 });
  }
}

/**
 * Minutes as the largest sensible unit.
 *
 * "2d 4h" beats "3120 minutes": delay figures are compared against intuitions
 * about working days, and a raw minute count has to be divided in the reader's
 * head before it means anything.
 */
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

/**
 * Whether a change is good news, given what the metric measures.
 *
 * Cost rising and on-time rate rising are both "up", and treating them alike is
 * how a dashboard ends up colouring a demurrage spike green.
 */
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
