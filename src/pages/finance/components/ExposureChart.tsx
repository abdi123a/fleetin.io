import { useId, useState } from 'react';

import { compactDjf, fmtDjf } from '@/lib/finance';
import { cn } from '@/utils';

export interface ExposurePoint {
  id: string;
  label: string;
  /** Open money still inside the client's agreed terms. Drawn above the line. */
  withinTermsDjf: number;
  /** Open money past its due date. Drawn below the line. */
  pastDueDjf: number;
  /** Average days this client actually takes to settle. */
  dso: number | null;
  termsDays: number;
}

/**
 * Client exposure as a diverging area chart.
 *
 * The zero line is the deadline, not an amount: money above it is still inside
 * the client's terms, money below it is past due. Reading the two bands against
 * each other answers the question a total cannot — 4.1M outstanding is healthy
 * or alarming depending entirely on which side of the line it sits.
 *
 * Colour follows the module's existing money semantics rather than the usual
 * green/red: teal is money behaving, orange is money that needs chasing, and
 * red stays reserved for the destructive actions elsewhere on the page.
 */
export function ExposureChart({
  points,
  height = 280,
  className,
}: {
  points: ExposurePoint[];
  height?: number;
  className?: string;
}) {
  const rawId = useId();
  const id = rawId.replace(/[^a-zA-Z0-9-_]/g, '');
  const [hover, setHover] = useState<number | null>(null);

  if (points.length < 2) return null;

  const width = 760;
  const pad = { top: 16, right: 16, bottom: 34, left: 66 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;

  const step = niceStep(
    Math.max(
      ...points.map((point) => Math.max(point.withinTermsDjf, point.pastDueDjf)),
      1,
    ) / 2,
  );
  const max = Math.max(step, Math.ceil(Math.max(...points.map((p) => p.withinTermsDjf)) / step) * step);
  const min = -Math.max(step, Math.ceil(Math.max(...points.map((p) => p.pastDueDjf)) / step) * step);
  const span = max - min || 1;

  const xFor = (index: number) => pad.left + (index / (points.length - 1)) * plotW;
  const yFor = (value: number) => pad.top + ((max - value) / span) * plotH;
  const baseline = yFor(0);

  const abovePoints = points.map((point, index) => ({
    x: xFor(index),
    y: yFor(point.withinTermsDjf),
  }));
  const belowPoints = points.map((point, index) => ({
    x: xFor(index),
    y: yFor(-point.pastDueDjf),
  }));

  const closeTo = (
    pts: Array<{ x: number; y: number }>,
  ) => `${smoothPath(pts)} L ${pts[pts.length - 1]?.x ?? 0} ${baseline} L ${pts[0]?.x ?? 0} ${baseline} Z`;

  const ticks: number[] = [];
  for (let value = min; value <= max + 0.5 * step; value += step) ticks.push(value);

  const active = hover !== null ? points[hover] : undefined;
  const activeX = hover !== null ? xFor(hover) : undefined;

  return (
    <div className={cn('relative w-full', className)}>
      <svg
        viewBox={`0 0 ${width} ${height}`}
        width="100%"
        height={height}
        role="img"
        aria-label="Shipper exposure — within terms against overdue"
        onMouseLeave={() => setHover(null)}
        onMouseMove={(event) => {
          const box = event.currentTarget.getBoundingClientRect();
          const x = ((event.clientX - box.left) / box.width) * width;
          const index = Math.round(((x - pad.left) / plotW) * (points.length - 1));
          setHover(Math.max(0, Math.min(points.length - 1, index)));
        }}
      >
        <defs>
          {/* The fills are split at y = 0 so a band never bleeds across the
              deadline, whatever the curve does between two clients. */}
          <clipPath id={`${id}-above`}>
            <rect x={0} y={0} width={width} height={Math.max(0, baseline)} />
          </clipPath>
          <clipPath id={`${id}-below`}>
            <rect x={0} y={baseline} width={width} height={Math.max(0, height - baseline)} />
          </clipPath>
        </defs>

        {ticks.map((tick) => (
          <g key={tick}>
            <line
              x1={pad.left}
              x2={width - pad.right}
              y1={yFor(tick)}
              y2={yFor(tick)}
              stroke="var(--chart-grid)"
              strokeWidth={1}
            />
            <text
              x={pad.left - 10}
              y={yFor(tick) + 4}
              textAnchor="end"
              className="fill-[var(--muted-foreground)] text-[11px] font-semibold"
            >
              {tick === 0 ? '0' : compactDjf(Math.abs(tick)).replace(' DJF', '')}
            </text>
          </g>
        ))}

        <path
          d={closeTo(abovePoints)}
          fill="var(--primary)"
          opacity={0.85}
          clipPath={`url(#${id}-above)`}
        />
        <path
          d={closeTo(belowPoints)}
          fill="var(--accent)"
          opacity={0.85}
          clipPath={`url(#${id}-below)`}
        />

        {/* The deadline itself */}
        <line
          x1={pad.left}
          x2={width - pad.right}
          y1={baseline}
          y2={baseline}
          stroke="var(--foreground)"
          strokeWidth={1.5}
        />
        <text
          x={width - pad.right}
          y={baseline - 6}
          textAnchor="end"
          className="fill-[var(--muted-foreground)] text-[10px] font-bold uppercase tracking-wider"
        >
          due date
        </text>

        {points.map((point, index) => (
          <text
            key={point.id}
            x={xFor(index)}
            y={height - 10}
            textAnchor={index === 0 ? 'start' : index === points.length - 1 ? 'end' : 'middle'}
            className={cn(
              'text-[11px] font-bold',
              hover === index ? 'fill-[var(--foreground)]' : 'fill-[var(--muted-foreground)]',
            )}
          >
            {shortName(point.label)}
          </text>
        ))}

        {activeX !== undefined ? (
          <g>
            <line
              x1={activeX}
              x2={activeX}
              y1={pad.top}
              y2={height - pad.bottom}
              stroke="var(--chart-axis)"
              strokeWidth={1}
              strokeDasharray="4 4"
            />
            <circle
              cx={activeX}
              cy={yFor(active?.withinTermsDjf ?? 0)}
              r={5}
              fill="var(--surface)"
              stroke="var(--primary)"
              strokeWidth={2.5}
            />
            {(active?.pastDueDjf ?? 0) > 0 ? (
              <circle
                cx={activeX}
                cy={yFor(-(active?.pastDueDjf ?? 0))}
                r={5}
                fill="var(--surface)"
                stroke="var(--accent)"
                strokeWidth={2.5}
              />
            ) : null}
          </g>
        ) : null}
      </svg>

      {active ? (
        <div
          className="pointer-events-none absolute top-2 rounded-card-nested border border-border bg-popover px-3 py-2.5 shadow-md"
          style={{ left: `${Math.min(70, Math.max(2, ((activeX ?? 0) / width) * 100))}%` }}
        >
          <p className="text-xs font-extrabold text-foreground">{active.label}</p>
          <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full bg-primary" />
            Within terms {fmtDjf(active.withinTermsDjf)}
          </p>
          <p className="mt-0.5 flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
            <span aria-hidden className="size-2 rounded-full bg-accent" />
            Past due {fmtDjf(active.pastDueDjf)}
          </p>
          <p className="mt-1.5 border-t border-border-subtle pt-1.5 text-xs font-bold text-foreground">
            Pays in {active.dso !== null ? `${active.dso.toFixed(0)}d` : '—'} on{' '}
            {active.termsDays}d terms
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** "Al-Baraka Logistics Ltd" -> "Al-Baraka" — the axis has ~150px per client. */
function shortName(name: string): string {
  const first = name.split(/\s+/)[0] ?? name;
  return first.length > 14 ? `${first.slice(0, 13)}…` : first;
}

/** Catmull-Rom through the points, emitted as cubic béziers. */
function smoothPath(pts: Array<{ x: number; y: number }>): string {
  const first = pts[0];
  if (!first) return '';
  let path = `M ${first.x} ${first.y}`;
  for (let index = 0; index < pts.length - 1; index += 1) {
    const p0 = pts[index - 1] ?? pts[index];
    const p1 = pts[index];
    const p2 = pts[index + 1];
    const p3 = pts[index + 2] ?? p2;
    if (!p0 || !p1 || !p2 || !p3) continue;
    // Tension 6 keeps the curve near the data rather than inventing a swing
    // that would read as a client whose figure it is not.
    path += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${
      p2.x - (p3.x - p1.x) / 6
    } ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
  }
  return path;
}

/** 1/2/5 × 10ⁿ — so the axis lands on figures a person would say out loud. */
function niceStep(rough: number): number {
  const magnitude = 10 ** Math.floor(Math.log10(Math.max(rough, 1)));
  const scaled = rough / magnitude;
  return (scaled <= 1 ? 1 : scaled <= 2 ? 2 : scaled <= 5 ? 5 : 10) * magnitude;
}

export default ExposureChart;
