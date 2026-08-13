import {
  chartAxisTokens,
  chartOtherToken,
  chartStatusTokens,
  chartStepTokens,
  chartTokens,
} from '@/design-system/tokens';

/**
 * Shared chart styling.
 *
 * ApexCharts takes colours as attribute strings, so everything here resolves to a
 * `var(--token)` reference rather than a literal — a theme switch then flows
 * through at runtime without re-rendering, and no chart carries a hardcoded hex.
 *
 * The mark specs (thin bars, 2px lines, hairline solid grid, surface gaps) are
 * constants here so every chart in the section looks like one system rather
 * than seven separate opinions.
 */

/* ---------------------------------------------------------------------------
 * Colour assignment
 * ------------------------------------------------------------------------ */

/**
 * Colour for a *categorical* series by position.
 *
 * Position, never rank: filtering a series out must not repaint the survivors,
 * or a reader who learned "Horn Logistics is cyan" is quietly misled. Past the
 * seventh slot everything folds into the neutral "Other" colour rather than
 * generating an eighth hue that would collide under colour-blind simulation.
 */
export function seriesColor(index: number): string {
  return chartTokens[index] ?? chartOtherToken;
}

/**
 * Colour for an *ordinal* position — pipeline stages, tiers, buckets.
 *
 * One hue, light to dark, so the reader sees the order in the colour. Using
 * categorical hues here would spend the identity channel on something the
 * sequence already communicates.
 */
const MID_STEP: string =
  chartStepTokens[Math.floor(chartStepTokens.length / 2)] ?? 'var(--chart-step-3)';

export function stepColor(index: number, total: number): string {
  if (total <= 1) return MID_STEP;
  const position = (index / (total - 1)) * (chartStepTokens.length - 1);
  return chartStepTokens[Math.round(position)] ?? MID_STEP;
}

export type Intent = 'good' | 'warning' | 'critical' | 'neutral';

/** Colour for a value that *means* something, rather than merely identifying. */
export function intentColor(intent: Intent): string {
  return chartStatusTokens[intent === 'warning' ? 'warning' : intent];
}

/**
 * Resolve a slice's colour: explicit intent wins, otherwise position.
 *
 * The collision rule in one function — a series that means good/bad wears the
 * status scale, a series that is merely identity wears a categorical hue, and
 * no chart mixes the two by accident.
 */
export function sliceColor(intent: Intent | undefined, index: number): string {
  return intent ? intentColor(intent) : seriesColor(index);
}

export const CHART_OTHER_COLOR = chartOtherToken;

/* ---------------------------------------------------------------------------
 * Mark specs
 * ------------------------------------------------------------------------ */

export const MARK = {
  /** Bars are capped, never filled to the band — the leftover is deliberate air. */
  maxBarSize: 24,
  lineWidth: 2,
  /** Big enough to be a hover target, not just a dot. */
  dotRadius: 4,
  activeDotRadius: 6,
  /** White doing the separating, in place of a stroke around each mark. */
  surfaceGap: 2,
  areaOpacity: 0.1,
  /** Rounded at the data end, square at the baseline. */
  barRadius: [4, 4, 0, 0] as [number, number, number, number],
  barRadiusHorizontal: [0, 4, 4, 0] as [number, number, number, number],
} as const;

/** Hairline, solid, one step off the surface. Never dashed. */
export const gridProps = {
  stroke: chartAxisTokens.grid,
  strokeWidth: 1,
  vertical: false,
} as const;

export const axisProps = {
  stroke: chartAxisTokens.axis,
  strokeWidth: 1,
  tickLine: false,
  axisLine: false,
  tick: {
    // Axis text wears a text token, never a series colour.
    fill: 'var(--muted-foreground)',
    fontSize: 11,
    fontVariantNumeric: 'tabular-nums',
  },
} as const;

/**
 * Height reserved for the x-axis band.
 *
 * Charts size their container as plot + this, so the axis labels are never the
 * thing that overflows and gives a card its own tiny scrollbar.
 */
export const X_AXIS_HEIGHT = 28;

/* ---------------------------------------------------------------------------
 * Reduced motion
 * ------------------------------------------------------------------------ */

/**
 * Animation duration, zero when the reader has asked for less motion.
 *
 * Read at call time rather than through a hook so plain chart components stay
 * free of React state for something that never changes mid-session.
 */
export function animationDuration(preferred = 600): number {
  if (typeof window === 'undefined') return 0;
  return window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ? 0 : preferred;
}
