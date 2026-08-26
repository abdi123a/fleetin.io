import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { ArrowUpRight } from '@/design-system/icons';
import { Card } from '@/design-system';
import { formatMetric } from '@/features/shipper-bi/format';
import type { DatePreset } from '@/features/shipper-bi/contracts';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  buildTooltipHtml,
  chartAnimSpeed,
  donutOptions,
  quietStates,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { cn } from '@/utils';

export interface ShipmentCostCardProps {
  preset?: DatePreset;
  from?: string;
  to?: string;
  className?: string;
  onViewDetails?: () => void;
  /** The account's own charge lines — what this card sums. */
  rows: ShipperShipmentRow[];
}

interface CostItem {
  name: string;
  value: number;
  delayPct: number;
  color: string;
  resolvedColor: string;
}

/**
 * What this account actually spent, split by the cargo it moved.
 *
 * Both halves used to be constants: a per-day spend rate multiplied by the
 * length of the selected range (2.31M DJF a day on containers, giving 133.5M
 * for a month) and a fixed 52/31/17 split that never moved whatever the
 * shipper shipped. The share now comes from summing each row's own charge,
 * and the "delay cost" ring is the accessorial part of that charge — the
 * avoidable money, which is the number this card exists to expose.
 */
function buildCostData(rows: ShipperShipmentRow[]) {
  const GROUPS: { name: string; color: string; fallback: string; match: (row: ShipperShipmentRow) => boolean }[] = [
    {
      name: 'Container (20ft / 40ft)',
      color: 'var(--primary)',
      fallback: '#60969d',
      match: (row) => Boolean(row.containerNo),
    },
    {
      name: 'Bulk (Commodities/Steel)',
      color: 'var(--accent)',
      fallback: '#f9ac17',
      match: (row) => !row.containerNo && row.cargoType !== 'Bulky Goods' && row.cargoType !== 'Vehicles',
    },
    {
      name: 'Special',
      color: 'var(--muted-foreground)',
      fallback: '#717b87',
      match: (row) => !row.containerNo && (row.cargoType === 'Bulky Goods' || row.cargoType === 'Vehicles'),
    },
  ];

  const buckets = GROUPS.map((group) => {
    const matched = rows.filter(group.match);
    return {
      ...group,
      spend: matched.reduce((sum, row) => sum + row.cost, 0),
      accessorial: matched.reduce((sum, row) => sum + row.accessorialCost, 0),
    };
  });

  const total = buckets.reduce((sum, bucket) => sum + bucket.spend, 0);

  const items: CostItem[] = buckets.map((bucket) => ({
    name: bucket.name,
    value: total > 0 ? Math.round((bucket.spend / total) * 100) : 0,
    delayPct: bucket.spend > 0 ? Math.round((bucket.accessorial / bucket.spend) * 100) : 0,
    color: bucket.color,
    resolvedColor: resolveColor(bucket.color, bucket.fallback),
  }));

  return { items, total };
}

export function ShipmentCostCard({
  className = '',
  onViewDetails,
  rows,
}: ShipmentCostCardProps) {
  const { items, total } = useMemo(() => buildCostData(rows), [rows]);
  /* The avoidable share of the bill — accessorials over total spend. It
   * replaces a hardcoded "+4.2% vs last period": this card is never given the
   * previous period, so it could not have known. */
  const avoidablePct = useMemo(() => {
    const accessorial = rows.reduce((sum, row) => sum + row.accessorialCost, 0);
    return total > 0 ? Math.round((accessorial / total) * 100) : 0;
  }, [rows, total]);

  const options: ApexOptions = useMemo(
    () =>
      donutOptions(
        items.map((i) => i.resolvedColor),
        {
          labels: items.map((i) => i.name),
          chart: {
            offsetY: 0,
            parentHeightOffset: 0,
            animations: {
              enabled: chartAnimSpeed() > 0,
              speed: chartAnimSpeed(800),
            },
          },
          plotOptions: {
            pie: {
              expandOnClick: false,
              offsetY: 0,
              donut: {
                size: '64%',
                background: 'transparent',
                labels: { show: false },
              },
            },
          },
          stroke: {
            show: true,
            width: 3,
            colors: [resolveColor('var(--surface)', '#ffffff')],
          },
          states: quietStates,
          tooltip: {
            shared: false,
            intersect: true,
            followCursor: true,
            custom: ({ seriesIndex }) => {
              const data = items[seriesIndex];
              if (!data) return '';
              return buildTooltipHtml(data.name, [
                {
                  key: 'share',
                  label: 'Share of spend',
                  value: `${data.value}%`,
                  color: data.resolvedColor,
                },
                {
                  key: 'delay',
                  label: 'Delay portion',
                  value: `${data.delayPct}%`,
                  color: '#f43f5e',
                },
              ]);
            },
          },
        },
      ),
    [items],
  );

  return (
    <Card
      variant="default"
      padding="lg"
      className={cn(
        'flex h-full min-h-0 flex-col items-center justify-between gap-5 overflow-visible shadow-card',
        className,
      )}
    >
      <div className="relative mx-auto size-[260px] shrink-0 overflow-visible">
        <ApexChart
          type="donut"
          series={items.map((i) => i.value)}
          options={options}
          height={260}
          width={260}
        />

        <div className="pointer-events-none absolute inset-0 z-0 flex flex-col items-center justify-center px-6 text-center">
          <span className="text-[11px] font-medium leading-none text-muted-foreground">
            Total spend
          </span>
          <span className="mt-1.5 text-2xl font-extrabold leading-none tabular-nums tracking-tight text-foreground">
            {formatMetric(total, 'currency')}
          </span>
        </div>
      </div>

      <div className="w-full shrink-0">
        <div className="flex items-center justify-between">
          <h3 className="text-lg font-extrabold tracking-tight text-foreground">Shipment Cost</h3>
          <div className="flex items-center gap-1 text-[10px] font-medium text-muted-foreground">
            <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-destructive" />
            <span>Red line = Delay cost</span>
          </div>
        </div>

        <ul className="mt-3.5 flex flex-col gap-3.5">
          {items.map((item) => {
            const mainPct = Math.max(0, item.value - item.delayPct);
            return (
              <li key={item.name} className="group relative flex items-center gap-2.5">
                <div className="flex shrink-0 items-center gap-2">
                  <span
                    className="size-2 shrink-0 rounded-full"
                    style={{ backgroundColor: item.resolvedColor }}
                    aria-hidden
                  />
                  <span className="whitespace-nowrap text-xs font-semibold text-foreground/90">
                    {item.name}
                  </span>
                </div>

                <div
                  className="relative flex h-1.5 min-w-[50px] flex-1 cursor-default items-center rounded-full bg-muted/50 transition duration-200 hover:h-2"
                  title={`${item.name}: ${item.value}% Total (${mainPct}% Standard + ${item.delayPct}% Delay Cost)`}
                >
                  <div className="flex h-full w-full overflow-hidden rounded-full">
                    <div
                      className="h-full transition-all duration-500 ease-out"
                      style={{ width: `${mainPct}%`, backgroundColor: item.resolvedColor }}
                    />
                    <div
                      className="h-full shrink-0 bg-destructive transition-all duration-500 ease-out"
                      style={{ width: `${item.delayPct}%` }}
                    />
                  </div>
                </div>

                <span
                  className="shrink-0 rounded-full px-2 py-0.5 text-xs font-extrabold tabular-nums"
                  style={{
                    color: item.resolvedColor,
                    backgroundColor: `color-mix(in srgb, ${item.resolvedColor} 15%, transparent)`,
                  }}
                >
                  {item.value}%
                </span>
              </li>
            );
          })}
        </ul>
      </div>

      <button
        type="button"
        onClick={onViewDetails}
        aria-label={`${avoidablePct}% of spend is accessorial charges. View more cost details.`}
        className={cn(
          'inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2.5',
          'text-xs font-semibold text-foreground transition-colors',
          'hover:border-primary/40 hover:bg-primary/5 hover:text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        {avoidablePct}% of spend is accessorial · View more info
        <ArrowUpRight className="size-3.5" />
      </button>
    </Card>
  );
}

export default ShipmentCostCard;
