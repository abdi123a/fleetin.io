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
import { cn } from '@/utils';

export interface ShipmentCostCardProps {
  preset?: DatePreset;
  from?: string;
  to?: string;
  className?: string;
  onViewDetails?: () => void;
}

interface CostItem {
  name: string;
  value: number;
  delayPct: number;
  color: string;
  resolvedColor: string;
}

const DAILY_DJF = {
  container: 2_314_098,
  bulk: 1_380_600,
  special: 755_436,
} as const;

const SPEND_DELTA_PCT = 0.042;

function generateCostData(fromStr?: string, toStr?: string) {
  const end = toStr ? new Date(toStr.slice(0, 10) + 'T00:00:00') : new Date('2026-08-05T00:00:00');
  const start = fromStr
    ? new Date(fromStr.slice(0, 10) + 'T00:00:00')
    : new Date(end.getTime() - 6 * 86400000);

  const diffMs = Math.max(0, end.getTime() - start.getTime());
  const diffDays = Math.max(1, Math.round(diffMs / 86400000) + 1);

  const containerPrice = Math.round(DAILY_DJF.container * diffDays);
  const bulkPrice = Math.round(DAILY_DJF.bulk * diffDays);
  const specialPrice = Math.round(DAILY_DJF.special * diffDays);
  const total = containerPrice + bulkPrice + specialPrice;

  const items: CostItem[] = [
    {
      name: 'Container (20ft / 40ft)',
      value: 52,
      delayPct: 10,
      color: 'var(--primary)',
      resolvedColor: resolveColor('var(--primary)', '#60969d'),
    },
    {
      name: 'Bulk (Commodities/Steel)',
      value: 31,
      delayPct: 6,
      color: 'var(--accent)',
      resolvedColor: resolveColor('var(--accent)', '#f9ac17'),
    },
    {
      name: 'Special',
      value: 17,
      delayPct: 3,
      color: 'var(--muted-foreground)',
      resolvedColor: resolveColor('var(--muted-foreground)', '#717b87'),
    },
  ];

  return { items, total };
}

export function ShipmentCostCard({
  from,
  to,
  className = '',
  onViewDetails,
}: ShipmentCostCardProps) {
  const { items, total } = useMemo(() => generateCostData(from, to), [from, to]);
  const deltaPct = Math.round(SPEND_DELTA_PCT * 100);

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
        aria-label={`Total Spend increased by ${deltaPct}%. View more cost details.`}
        className={cn(
          'inline-flex w-full shrink-0 items-center justify-center gap-1.5 rounded-full border border-border px-4 py-2.5',
          'text-xs font-semibold text-foreground transition-colors',
          'hover:border-primary/40 hover:bg-primary/5 hover:text-primary',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        )}
      >
        Total Spend increased by {deltaPct}% · View more info
        <ArrowUpRight className="size-3.5" />
      </button>
    </Card>
  );
}

export default ShipmentCostCard;
