import { useMemo } from 'react';
import { Package, Truck, CheckCircle2, Timer, TrendingUp, TrendingDown } from 'lucide-react';
import { Card, Badge, IconChip, type IconChipTint } from '@/design-system';
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
  from?: string;
  to?: string;
}

export function ShipperKpiStrip({ from, to }: ShipperKpiStripProps) {
  const kpiData = useMemo(() => {
    const end = to ? new Date(to.slice(0, 10) + 'T00:00:00') : new Date('2026-08-05T00:00:00');
    const start = from
      ? new Date(from.slice(0, 10) + 'T00:00:00')
      : new Date(end.getTime() - 6 * 86400000);

    const diffMs = Math.max(0, end.getTime() - start.getTime());
    const diffDays = Math.max(1, Math.round(diffMs / 86400000) + 1);

    const totalShipments = Math.round(96 * diffDays);
    const activeTracking = Math.round(16 * diffDays);
    const deliveredShipments = Math.round(78 * diffDays);
    const avgDays = (2.4 + (diffDays % 3) * 0.2).toFixed(1);

    return [
      {
        title: 'TOTAL SHIPMENTS',
        value: totalShipments.toLocaleString(),
        change: '+6.73%',
        isPositive: true,
        icon: Package,
        description: 'Total orders processed',
        tone: 'teal' as const,
      },
      {
        title: 'ACTIVE SHIPMENTS',
        value: activeTracking.toLocaleString(),
        change: '-1.98%',
        isPositive: false,
        icon: Truck,
        description: 'In transit & active routes',
        tone: 'sky' as const,
      },
      {
        title: 'DELIVERED SHIPMENTS',
        value: deliveredShipments.toLocaleString(),
        change: '+5.31%',
        isPositive: true,
        icon: CheckCircle2,
        description: 'Completed deliveries',
        tone: 'peach' as const,
      },
      {
        title: 'AVERAGE TIME',
        value: `${avgDays} days`,
        change: '+5.31%',
        isPositive: true,
        icon: Timer,
        description: 'Average shipping duration',
        tone: 'amber' as const,
      },
    ];
  }, [from, to]);

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

              <Badge
                variant="subtle"
                intent={item.isPositive ? 'success' : 'destructive'}
                className="shrink-0 whitespace-nowrap px-2 py-0.5 text-[11px] font-semibold"
              >
                {item.isPositive ? (
                  <TrendingUp className="mr-0.5 inline h-3 w-3" />
                ) : (
                  <TrendingDown className="mr-0.5 inline h-3 w-3" />
                )}
                {item.change}
              </Badge>
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
