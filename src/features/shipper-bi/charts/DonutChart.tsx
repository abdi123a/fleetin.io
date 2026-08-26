import { cn } from '@/utils';
import type { CategorySlice } from '../contracts';
import { MARK, sliceColor, type Intent } from './chartTheme';

/**
 * A part-to-whole ring with the headline number in its middle and its slices
 * called out on leader lines.
 *
 * The hole is the point: a plain pie spends its centre on nothing, and the one
 * number a reader wants ("74.2% on time", "82% utilisation") ends up in a
 * caption somewhere else. Putting it in the middle makes the ring the evidence
 * for a figure that is right there.
 *
 * Labels sit outside on leader lines rather than in a legend block, so each
 * value is physically attached to its arc — the reference pattern. The share
 * also prints inside the arc when the slice is wide enough to hold it without
 * the text touching either edge; below that it would be clipped, so it is
 * dropped and the outside label carries it.
 *
 * Segments are separated by a 2px surface gap, never a stroke — same rule as
 * the stacked bar. Capped at six slices, because part-to-whole stops being
 * readable at a glance past that; the caller folds the tail into "Other".
 */

export interface DonutChartProps {
  slices: CategorySlice[];
  /** The figure in the hole — already formatted. */
  centerValue: string;
  /** One short line under it. */
  centerLabel?: string;
  /** Formats each callout's value. Defaults to the raw count. */
  formatValue?: (value: number) => string;
  onSelect?: (slice: CategorySlice) => void;
  /**
   * Explicit colour per slice, overriding the intent/positional rule.
   *
   * For rings whose categories are neither pure identity nor the system's
   * good/warning/critical scale — a brand-led outcome split, an all-bad
   * breakdown ranked by depth of one hue. Same length and order as `slices`;
   * a missing entry falls back to the default rule.
   */
  colors?: Array<string | undefined>;
  size?: number;
  className?: string;
}

/* Geometry, in viewBox units. Wide box so leader labels have room to run. */
const VB_W = 320;
const VB_H = 200;
const CX = 160;
const CY = 100;
const R_OUTER = 62;
const RING = 22;
const R_MID = R_OUTER - RING / 2;

export function DonutChart({
  slices,
  centerValue,
  centerLabel,
  formatValue = (value) => String(value),
  onSelect,
  colors,
  size = 300,
  className,
}: DonutChartProps) {
  const visible = slices.filter((slice) => slice.value > 0);
  const total = visible.reduce((sum, slice) => sum + slice.value, 0);

  if (total === 0) {
    return (
      <p className={cn('text-xs text-muted-foreground', className)}>
        Nothing to show for this period.
      </p>
    );
  }

  const gap = visible.length > 1 ? 1.2 : 0;

  let cursor = 0;
  const arcs = visible.map((slice, index) => {
    const share = (slice.value / total) * 100;
    // Mid-angle in SVG space: -90° puts the first slice's start at twelve.
    const midAngle = ((cursor + share / 2) / 100) * 360 - 90;
    const rad = (midAngle * Math.PI) / 180;
    const arc = {
      slice,
      index,
      share,
      dash: Math.max(0.4, share - gap),
      offset: -cursor,
      color: colors?.[index] ?? sliceColor(slice.intent as Intent | undefined, index),
      rad,
      isRight: Math.cos(rad) >= 0,
    };
    cursor += share;
    return arc;
  });

  return (
    <div className={cn('flex w-full justify-center', className)}>
      <svg
        viewBox={`0 0 ${VB_W} ${VB_H}`}
        width={size}
        style={{ maxWidth: '100%', height: 'auto' }}
        role="img"
        aria-label={`${centerLabel ?? 'Breakdown'}: ${visible
          .map((slice) => `${slice.label} ${Math.round((slice.value / total) * 100)}%`)
          .join(', ')}`}
      >
        <g transform={`rotate(-90 ${CX} ${CY})`}>
          {arcs.map(({ slice, dash, offset, color }) => (
            <circle
              key={slice.key}
              cx={CX}
              cy={CY}
              r={R_MID}
              fill="none"
              stroke={color}
              strokeWidth={RING}
              pathLength={100}
              strokeDasharray={`${dash} ${100 - dash}`}
              strokeDashoffset={offset}
              onClick={
                onSelect && slice.drillDown ? () => onSelect(slice) : undefined
              }
              style={onSelect && slice.drillDown ? { cursor: 'pointer' } : undefined}
            >
              <title>{`${slice.label}: ${formatValue(slice.value)}`}</title>
            </circle>
          ))}
        </g>

        {/* Leader lines out to the callouts. */}
        {arcs.map(({ slice, share, rad, isRight, color }) => {
          const x1 = CX + Math.cos(rad) * (R_OUTER + 2);
          const y1 = CY + Math.sin(rad) * (R_OUTER + 2);
          const x2 = CX + Math.cos(rad) * (R_OUTER + 14);
          const y2 = CY + Math.sin(rad) * (R_OUTER + 14);
          const x3 = isRight ? x2 + 16 : x2 - 16;
          const textX = isRight ? x3 + 5 : x3 - 5;

          return (
            <g key={`out-${slice.key}`} pointerEvents="none">
              <polyline
                points={`${x1},${y1} ${x2},${y2} ${x3},${y2}`}
                fill="none"
                stroke="var(--border-strong)"
                strokeWidth={1}
              />
              <circle cx={x1} cy={y1} r={1.8} fill={color} />
              <text
                x={textX}
                y={y2 - 3}
                textAnchor={isRight ? 'start' : 'end'}
                fontSize={11}
                fontWeight={600}
                fill="var(--foreground)"
              >
                {slice.label}
              </text>
              <text
                x={textX}
                y={y2 + 9}
                textAnchor={isRight ? 'start' : 'end'}
                fontSize={10}
                fill="var(--muted-foreground)"
              >
                {formatValue(slice.value)} · {share.toFixed(1)}%
              </text>
            </g>
          );
        })}

        {/* The headline, in the hole. Proportional figures — a standalone
            display number, not a column. */}
        <text
          x={CX}
          y={centerLabel ? CY - 4 : CY + 2}
          textAnchor="middle"
          dominantBaseline="central"
          fontSize={26}
          fontWeight={600}
          fill="var(--foreground)"
        >
          {centerValue}
        </text>
        {centerLabel ? (
          <text
            x={CX}
            y={CY + 16}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={9.5}
            fill="var(--muted-foreground)"
          >
            {centerLabel}
          </text>
        ) : null}
      </svg>
    </div>
  );
}

export const DONUT_SURFACE_GAP = MARK.surfaceGap;
