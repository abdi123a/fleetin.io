/**
 * Urgency token class maps — the only saturated colour system on list rows.
 *
 * Brand: primary `#60969d` (Protected), secondary `#f9ac17` (Critical / orange).
 * Rule: one saturated colour per row, and urgency owns it. Only Overdue may
 * use a solid fill; every other level is a tinted surface + icon + label.
 */

import type { ReturnRiskLevel } from '@/types/emptyReturn';

export interface UrgencyTokenClasses {
  /** Badge / chip surface */
  bg: string;
  fg: string;
  border: string;
  /** Full-height row rail + KPI top rail */
  solid: string;
  /** Combined badge shell classes */
  badge: string;
}

export const URGENCY_TOKENS: Record<ReturnRiskLevel, UrgencyTokenClasses> = {
  overdue: {
    bg: 'bg-urgency-overdue-bg',
    fg: 'text-urgency-overdue-fg',
    border: 'border-urgency-overdue-border',
    solid: 'bg-urgency-overdue-solid',
    badge:
      'bg-urgency-overdue-bg text-urgency-overdue-fg border-urgency-overdue-border animate-pulse motion-reduce:animate-none',
  },
  at_risk: {
    bg: 'bg-urgency-at-risk-bg',
    fg: 'text-urgency-at-risk-fg',
    border: 'border-urgency-at-risk-border',
    solid: 'bg-urgency-at-risk-solid',
    badge: 'bg-urgency-at-risk-bg text-urgency-at-risk-fg border-urgency-at-risk-border',
  },
  critical: {
    bg: 'bg-urgency-critical-bg',
    fg: 'text-urgency-critical-fg',
    border: 'border-urgency-critical-border',
    solid: 'bg-urgency-critical-solid',
    badge: 'bg-urgency-critical-bg text-urgency-critical-fg border-urgency-critical-border',
  },
  watch: {
    bg: 'bg-urgency-watch-bg',
    fg: 'text-urgency-watch-fg',
    border: 'border-urgency-watch-border',
    solid: 'bg-urgency-watch-solid',
    badge: 'bg-urgency-watch-bg text-urgency-watch-fg border-transparent',
  },
  safe: {
    bg: 'bg-urgency-safe-bg',
    fg: 'text-urgency-safe-fg',
    border: 'border-urgency-safe-border',
    solid: 'bg-urgency-safe-solid',
    badge: 'bg-urgency-safe-bg text-urgency-safe-fg border-transparent',
  },
  protected: {
    bg: 'bg-urgency-protected-bg',
    fg: 'text-urgency-protected-fg',
    border: 'border-urgency-protected-border',
    solid: 'bg-urgency-protected-solid',
    badge: 'bg-urgency-protected-bg text-urgency-protected-fg border-transparent',
  },
};

/** Group header order — worst first, protected last. Null-risk rows go after. */
export const URGENCY_GROUP_ORDER: readonly (ReturnRiskLevel | 'none')[] = [
  'overdue',
  'at_risk',
  'critical',
  'watch',
  'safe',
  'protected',
  'none',
];

export const URGENCY_GROUP_LABELS: Record<ReturnRiskLevel | 'none', string> = {
  overdue: 'Overdue',
  at_risk: 'At risk',
  critical: 'Critical',
  watch: 'Watch',
  safe: 'Safe',
  protected: 'Protected',
  none: 'No deadline',
};

/** Deterministic pastel tint for monogram avatars from an org name/id. */
export function orgTintClass(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const tones = [
    'bg-primary-subtle text-primary-subtle-foreground',
    'bg-info-subtle text-info-subtle-foreground',
    'bg-success-subtle text-success-subtle-foreground',
    'bg-accent-subtle text-accent-subtle-foreground',
    'bg-warning-subtle text-warning-subtle-foreground',
    'bg-muted text-muted-foreground',
  ] as const;
  return tones[hash % tones.length] ?? tones[0];
}
