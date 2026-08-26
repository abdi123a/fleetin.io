import { CheckCircle2, Clock, Gauge, TimerReset, TrendingDown, TrendingUp } from 'lucide-react';
import { Card, IconChip, type IconChipTint } from '@/design-system';
import { cn } from '@/utils';
import type { Delta, KpiSummary } from './model';
import { hours as formatHours, pct, signedPct } from './money';

/**
 * The four numbers the morning starts with.
 *
 * Same tile fills as the shipper strip — teal, sky, peach, amber — because the
 * two consoles share a page grammar, and the same rule about what each one
 * says: a label, one figure, its movement, and a line of arithmetic underneath
 * that shows where the figure came from. "78%" is a claim; "11 of 14 trucks
 * rolling" is the receipt.
 */

type TileTone = 'teal' | 'sky' | 'peach' | 'amber';

const TILE: Record<
  TileTone,
  {
    card: string;
    label: string;
    value: string;
    description: string;
    /** The one solid disc used app-wide; white on a filled tile. */
    icon: IconChipTint;
    badge: string;
  }
> = {
  teal: {
    card: 'border-transparent bg-tile-teal text-tile-teal-foreground shadow-sm hover:shadow-card',
    label: 'text-tile-teal-foreground/85',
    value: 'text-tile-teal-foreground',
    description: 'text-tile-teal-foreground/75',
    icon: 'on-teal',
    badge: 'bg-white/20 text-tile-teal-foreground',
  },
  sky: {
    card: 'border-transparent bg-tile-sky text-tile-foreground shadow-sm hover:shadow-card',
    label: 'text-tile-foreground/80',
    value: 'text-tile-foreground',
    description: 'text-tile-foreground/70',
    icon: 'on-light',
    badge: 'bg-white/70 text-tile-foreground',
  },
  peach: {
    card: 'border-transparent bg-tile-peach text-tile-foreground shadow-sm hover:shadow-card',
    label: 'text-tile-foreground/80',
    value: 'text-tile-foreground',
    description: 'text-tile-foreground/70',
    icon: 'on-light',
    badge: 'bg-white/70 text-tile-foreground',
  },
  amber: {
    card: 'border-transparent bg-accent-bold text-accent-bold-foreground shadow-sm hover:shadow-card',
    label: 'text-accent-bold-foreground/80',
    value: 'text-accent-bold-foreground',
    description: 'text-accent-bold-foreground/75',
    icon: 'on-light',
    badge: 'bg-white/55 text-accent-bold-foreground',
  },
};

export interface KpiTilesProps {
  kpis: KpiSummary;
  className?: string;
}

export function KpiTiles({ kpis, className }: KpiTilesProps) {
  const tiles = [
    {
      key: 'utilization',
      title: 'FLEET UTILIZATION',
      value: pct(kpis.utilization),
      delta: kpis.utilizationDelta,
      icon: Gauge,
      description: `${kpis.activeTrucks} of ${kpis.fleetSize} trucks rolling`,
      tone: 'teal' as const,
    },
    {
      key: 'idle',
      title: 'IDLE FLEET',
      value: String(kpis.idleDays),
      delta: kpis.idleDelta,
      icon: Clock,
      description: 'Vehicle-days idle',
      tone: 'sky' as const,
    },
    {
      key: 'ontime',
      title: 'ON-TIME RATE',
      value: pct(kpis.onTime),
      delta: kpis.onTimeDelta,
      icon: CheckCircle2,
      description: `${kpis.onTimeCount} of ${kpis.judgedCount} bookings on slot`,
      tone: 'peach' as const,
    },
    {
      key: 'delay',
      title: 'DELAY RATE',
      value: pct(kpis.delayRate),
      delta: kpis.delayDelta,
      icon: TimerReset,
      description: `${formatHours(kpis.hoursLost, 0)} lost this period`,
      tone: 'amber' as const,
    },
  ];

  return (
    <div className={cn('grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4', className)}>
      {tiles.map((tile) => {
        const tone = TILE[tile.tone];
        const Icon = tile.icon;
        return (
          <Card
            key={tile.key}
            variant="default"
            padding="md"
            className={cn(
              'group relative overflow-hidden transition duration-200 hover:-translate-y-0.5',
              tone.card,
            )}
          >
            <div className="flex items-start justify-between gap-2">
              <span
                className={cn(
                  'min-w-0 line-clamp-2 text-[10px] font-extrabold uppercase leading-tight tracking-[0.09em]',
                  tone.label,
                )}
              >
                {tile.title}
              </span>
              <IconChip
                icon={Icon}
                tint={tone.icon}
                size={36}
                className="transition-transform duration-200 group-hover:scale-110"
              />
            </div>

            <div className="mt-4 flex flex-nowrap items-center gap-2">
              <span
                className={cn(
                  'min-w-0 truncate text-2xl font-extrabold tracking-tight tabular-nums',
                  tone.value,
                )}
              >
                {tile.value}
              </span>
              <DeltaChip delta={tile.delta} className={tone.badge} />
            </div>

            <p className={cn('mt-2 truncate text-[11px] font-medium', tone.description)}>
              {tile.description}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

function DeltaChip({ delta, className }: { delta: Delta; className?: string }) {
  if (delta.pct === undefined) return null;
  const Icon = delta.pct >= 0 ? TrendingUp : TrendingDown;
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-0.5 whitespace-nowrap rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums',
        className,
      )}
      title={delta.good ? 'Moving the right way' : 'Moving the wrong way'}
    >
      <Icon className="size-3" />
      {signedPct(delta.pct)}
    </span>
  );
}

export default KpiTiles;
