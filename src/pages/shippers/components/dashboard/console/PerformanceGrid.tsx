import type { ComponentType, SVGProps } from 'react';
import { Card, IconChip, type IconChipTint } from '@/design-system';
import { cn } from '@/utils';
import { PanelHeader, PANEL_SURFACE } from './PanelHeader';

/**
 * Service quality: one score, then what drives it.
 *
 * The previous version was four equal tiles with four sparklines, which gave
 * the reader no entry point — everything was the same size, so nothing was the
 * answer. On-time rate is the number this account is judged on, so it gets the
 * ring and the target; the rest are the supporting figures, sized accordingly.
 *
 * The ring is drawn against the contractual floor rather than against 100%. A
 * gauge that fills to 100 makes 92% look like a near miss when it is in fact
 * comfortably over a 90% promise, and the arc's colour flips on that promise,
 * not on an arbitrary band.
 */

/**
 * Two intents, because the console has two colours. Teal for a figure that is
 * simply reporting, orange for one the reader may need to do something about.
 * The four-intent version handed out green, blue, gold and teal by position in
 * the list, which made colour decorative — three icons in three hues, none of
 * which meant anything the label did not already say.
 */
export type PerformanceIntent = 'brand' | 'accent';

const CHIP: Record<PerformanceIntent, IconChipTint> = {
  brand: 'teal',
  accent: 'orange',
};

/** Teal when the reading is fine, orange when it is not. */
const TONE_TEXT: Record<'good' | 'bad' | 'neutral', string> = {
  good: 'text-primary-subtle-foreground',
  bad: 'text-accent-subtle-foreground',
  neutral: 'text-muted-foreground',
};

export interface PerformanceStat {
  key: string;
  label: string;
  value: string;
  /** One clause of context under the figure — a target, a share, a count. */
  note?: string;
  delta?: string;
  deltaTone?: 'good' | 'bad' | 'neutral';
  intent: PerformanceIntent;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
}

export interface PerformanceGridProps {
  /** On-time rate as a fraction, and the contractual floor it is judged on. */
  onTimeRate: number;
  onTimeTarget: number;
  onTimeDelta?: string;
  onTimeDeltaTone?: 'good' | 'bad' | 'neutral';
  stats: PerformanceStat[];
}

export function PerformanceGrid({
  onTimeRate,
  onTimeTarget,
  onTimeDelta,
  onTimeDeltaTone = 'neutral',
  stats,
}: PerformanceGridProps) {
  const meetsTarget = onTimeRate >= onTimeTarget;
  const gap = (onTimeRate - onTimeTarget) * 100;

  return (
    <Card variant="default" padding="lg" className={cn('h-full gap-6', PANEL_SURFACE)}>
      <PanelHeader title="Performance" />

      <div className="flex flex-1 flex-col gap-6 lg:flex-row lg:items-stretch">
        {/* ── The score ──────────────────────────────────────────────── */}
        <div className="flex shrink-0 flex-col items-center justify-center gap-3 rounded-card-nested bg-surface-sunken px-6 py-5 lg:w-[230px]">
          <Gauge value={onTimeRate} target={onTimeTarget} meetsTarget={meetsTarget} />

          <div className="text-center">
            <p className="type-body-sm font-medium text-foreground">On-time Delivery</p>
            <p
              className={cn(
                'type-body-xs mt-1 font-medium tabular-nums',
                meetsTarget ? 'text-primary-subtle-foreground' : 'text-accent-subtle-foreground',
              )}
            >
              {meetsTarget ? '+' : ''}
              {gap.toFixed(1)} pts vs {(onTimeTarget * 100).toFixed(0)}% target
            </p>
            {onTimeDelta ? (
              <p className={cn('type-body-xs mt-0.5 tabular-nums', TONE_TEXT[onTimeDeltaTone])}>
                {onTimeDelta} vs previous period
              </p>
            ) : null}
          </div>
        </div>

        {/* ── What drives it ─────────────────────────────────────────── */}
        <ul className="flex min-w-0 flex-1 flex-col justify-between gap-3">
          {stats.map((stat) => {
            const Icon = stat.icon;
            return (
              <li
                key={stat.key}
                className="flex items-center gap-3.5 rounded-card-nested border border-border-subtle px-4 py-3"
              >
                <IconChip icon={Icon} size={36} tint={CHIP[stat.intent]} />

                <div className="min-w-0 flex-1">
                  <p className="type-body-xs truncate text-muted-foreground">{stat.label}</p>
                  {stat.note ? (
                    <p className="type-body-xs mt-0.5 truncate text-muted-foreground/80">
                      {stat.note}
                    </p>
                  ) : null}
                </div>

                <div className="shrink-0 text-right">
                  <p className="type-h3 tabular-nums text-foreground">{stat.value}</p>
                  {stat.delta ? (
                    <p
                      className={cn(
                        'type-body-xs font-semibold tabular-nums',
                        TONE_TEXT[stat.deltaTone ?? 'neutral'],
                      )}
                    >
                      {stat.delta}
                    </p>
                  ) : null}
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}

/**
 * A 270-degree arc with a tick at the target.
 *
 * Three quarters rather than a full circle: the open segment at the bottom is
 * where the label sits, and a full ring leaves the reader hunting for the start
 * of the sweep.
 */
function Gauge({
  value,
  target,
  meetsTarget,
}: {
  value: number;
  target: number;
  meetsTarget: boolean;
}) {
  const size = 132;
  const stroke = 11;
  const radius = (size - stroke) / 2;
  const centre = size / 2;
  const sweep = 0.75;
  const circumference = 2 * Math.PI * radius;
  const arc = circumference * sweep;

  const clamped = Math.max(0, Math.min(1, value));

  // A dasharray starts at 3 o'clock, so the rotated arc begins at 225 degrees
  // clockwise from noon. The tick is drawn at noon and rotated onto the dial,
  // which means it has to carry that same 225 degree offset — deriving it from
  // the group's 135 instead put the mark diametrically opposite the target.
  const ARC_START_DEG = 225;
  const targetAngle = ARC_START_DEG + target * sweep * 360;

  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <g transform={`rotate(135 ${centre} ${centre})`}>
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            // `--muted` is all but invisible on the sunken panel this sits on,
            // which left the arc looking broken and the target tick looking
            // like a stray mark floating beside it.
            stroke="var(--border-strong)"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arc} ${circumference}`}
            opacity={0.5}
          />
          <circle
            cx={centre}
            cy={centre}
            r={radius}
            fill="none"
            stroke={meetsTarget ? 'var(--primary)' : 'var(--accent-bold)'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${arc * clamped} ${circumference}`}
            style={{ transition: 'stroke-dasharray 600ms ease-out' }}
          />
        </g>

        {/* The promise, marked on the dial. */}
        <line
          x1={centre}
          y1={centre - radius - stroke / 2 - 1}
          x2={centre}
          y2={centre - radius + stroke / 2 + 1}
          stroke="var(--foreground)"
          strokeWidth={2}
          strokeLinecap="round"
          transform={`rotate(${targetAngle} ${centre} ${centre})`}
        />
      </svg>

      <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
        <span className="type-display text-foreground">{(value * 100).toFixed(1)}%</span>
      </div>
    </div>
  );
}
