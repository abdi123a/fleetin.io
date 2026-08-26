import { useMemo } from 'react';
import { Package, Truck, CheckCircle2, Timer } from 'lucide-react';
import { Card, IconChip, type IconChipTint } from '@/design-system';
import type { ShipperAccountSummary, ShipperShipmentRow } from '@/features/shipper-bi';
import { cn } from '@/utils';

/** FLEETIN KPI fills — teal, brand amber (#fbb626), peach, sky. */
type TileTone = 'teal' | 'amber' | 'peach' | 'sky';

const TILE: Record<
  TileTone,
  {
    card: string;
    label: string;
    value: string;
    description: string;
    icon: IconChipTint;
  }
> = {
  teal: {
    card: 'border-transparent bg-tile-teal text-tile-teal-foreground shadow-sm hover:shadow-card',
    label: 'text-tile-teal-foreground/85',
    value: 'text-tile-teal-foreground',
    description: 'text-tile-teal-foreground/75',
    icon: 'on-teal',
  },
  amber: {
    card: 'border-transparent bg-[var(--fl-orange-400)] text-tile-foreground shadow-sm hover:shadow-card',
    label: 'text-tile-foreground/80',
    value: 'text-tile-foreground',
    description: 'text-tile-foreground/70',
    icon: 'on-light',
  },
  peach: {
    card: 'border-transparent bg-tile-peach text-tile-foreground shadow-sm hover:shadow-card',
    label: 'text-tile-foreground/80',
    value: 'text-tile-foreground',
    description: 'text-tile-foreground/70',
    icon: 'on-light',
  },
  sky: {
    card: 'border-transparent bg-tile-sky text-tile-foreground shadow-sm hover:shadow-card',
    label: 'text-tile-foreground/80',
    value: 'text-tile-foreground',
    description: 'text-tile-foreground/70',
    icon: 'on-light',
  },
};

export interface ShipperKpiStripProps {
  /** The account's own book — the source of every figure on this strip. */
  summary: ShipperAccountSummary;
  rows: ShipperShipmentRow[];
}

/**
 * The four headline numbers, read off the account's real book.
 *
 * They used to be arithmetic on the *length of the selected date range* —
 * `96 × days` shipments, `78 × days` delivered, and a "+6.73%" that never
 * moved — so the tile read 2,880 shipments for an account with nine. A
 * headline figure is the one number a shipper checks at a glance, and
 * inventing it discredits every real chart underneath it.
 *
 * No period-over-period delta is shown, deliberately: an honest one needs the
 * previous window's book, which this strip is not given. A tile that shows
 * nothing beats a tile that shows a number somebody typed in.
 */
export function ShipperKpiStrip({ summary, rows }: ShipperKpiStripProps) {
  const kpiData = useMemo(() => {
    /* Promised date plus the recorded variance is when the cargo actually
     * landed; measured from its own pickup, that is the transit the shipper
     * experienced. The empty-return tail is excluded on purpose — this tile
     * answers "how long until my cargo arrives", which the container cycle
     * does not delay. */
    const transitDays = rows
      .filter((row) => row.arrivalAt && row.outcome)
      .map((row) => {
        const landed = new Date(row.arrivalAt as string).getTime();
        const planned = new Date(row.plannedDeliveryAt).getTime();
        return (landed - planned + (row.varianceMinutes ?? 0) * 60_000) / 86_400_000;
      })
      .filter((days) => Number.isFinite(days));
    const avgDays = transitDays.length
      ? Math.abs(transitDays.reduce((sum, days) => sum + days, 0) / transitDays.length)
      : null;

    return [
      {
        title: 'Total Shipments',
        value: summary.totalShipments.toLocaleString(),
        icon: Package,
        description: 'Containers on record',
        tone: 'teal' as const,
      },
      {
        title: 'Active Shipments',
        value: summary.inProgress.toLocaleString(),
        icon: Truck,
        description: 'Moving now',
        tone: 'sky' as const,
      },
      {
        title: 'Delivered Shipments',
        value: summary.deliveredShipments.toLocaleString(),
        icon: CheckCircle2,
        description: `${Math.round(summary.onTimeRate * 100)}% on time`,
        tone: 'peach' as const,
      },
      {
        title: 'Awaiting Empty Return',
        value: summary.containersOut.toLocaleString(),
        icon: Timer,
        description:
          summary.containersOverdue > 0
            ? `${summary.containersOverdue} past free time`
            : avgDays !== null
              ? `avg ${avgDays.toFixed(1)}d to deliver`
              : 'all boxes back',
        tone: 'amber' as const,
      },
    ];
  }, [summary, rows]);

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      {kpiData.map((item) => {
        const Icon = item.icon;
        const tone = TILE[item.tone];
        return (
          <Card
            key={item.title}
            variant="default"
            padding="md"
            className={cn(
              'group relative overflow-hidden transition duration-200 hover:-translate-y-0.5',
              tone.card,
            )}
          >
            <div className="flex items-center justify-between gap-2">
              <span
                className={cn(
                  'min-w-0 line-clamp-2 text-[11px] font-extrabold uppercase leading-tight tracking-wider',
                  tone.label,
                )}
              >
                {item.title}
              </span>
              <IconChip
                icon={Icon}
                tint={tone.icon}
                size={36}
                className="transition-transform duration-200 group-hover:scale-110"
              />
            </div>

            <div className="mt-3 flex flex-nowrap items-baseline justify-between gap-2">
              <span
                className={cn(
                  'min-w-0 truncate whitespace-nowrap text-xl font-bold tracking-tight sm:text-2xl',
                  tone.value,
                )}
              >
                {item.value}
              </span>
            </div>

            <p className={cn('mt-2 truncate text-[11px] font-medium leading-snug', tone.description)}>
              {item.description}
            </p>
          </Card>
        );
      })}
    </div>
  );
}

export default ShipperKpiStrip;
