import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { Card } from '@/design-system';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  buildTooltipHtml,
  chartAnimSpeed,
  donutOptions,
  quietStates,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';
import { cn } from '@/utils';
import { PanelHeader, PANEL_SURFACE } from './PanelHeader';

export interface StatusSlice {
  key: string;
  label: string;
  value: number;
  color: string;
}

export interface StatusDonutCardProps {
  total: number;
  slices: StatusSlice[];
}

export function StatusDonutCard({ total, slices }: StatusDonutCardProps) {
  const resolved = useMemo(
    () =>
      slices.map((s) => ({
        ...s,
        paint: resolveColor(s.color, '#60969d'),
      })),
    [slices],
  );

  const options: ApexOptions = useMemo(
    () =>
      donutOptions(
        resolved.map((s) => s.paint),
        {
          chart: {
            animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
          },
          labels: resolved.map((s) => s.label),
          plotOptions: {
            pie: {
              donut: { size: '68%' },
              expandOnClick: false,
            },
          },
          stroke: {
            show: true,
            width: 3,
            colors: [resolveColor('var(--surface)', '#ffffff')],
          },
          states: quietStates,
          tooltip: {
            custom: ({ seriesIndex }) => {
              const slice = resolved[seriesIndex];
              if (!slice) return '';
              const share = total > 0 ? ((slice.value / total) * 100).toFixed(1) : '0.0';
              return buildTooltipHtml(slice.label, [
                {
                  key: 'count',
                  label: 'Shipments',
                  value: slice.value.toLocaleString(),
                  color: slice.paint,
                },
                {
                  key: 'share',
                  label: 'Share',
                  value: `${share}%`,
                  color: slice.paint,
                },
              ]);
            },
          },
        },
      ),
    [resolved, total],
  );

  return (
    <Card variant="default" padding="lg" className={cn('h-full gap-6', PANEL_SURFACE)}>
      <PanelHeader title="Shipments by Status" />

      <div className="flex flex-1 flex-col items-center justify-center gap-6">
        <div className="relative size-[176px] shrink-0">
          <ApexChart
            type="donut"
            series={resolved.map((s) => s.value)}
            options={options}
            height={176}
          />
          <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
            <span className="type-display text-foreground">{total.toLocaleString()}</span>
            <span className="type-body-xs text-muted-foreground">Total</span>
          </div>
        </div>

        <ul className="flex w-full flex-col gap-3">
          {resolved.map((slice) => {
            const share = total > 0 ? (slice.value / total) * 100 : 0;
            return (
              <li key={slice.key} className="flex items-start gap-2.5">
                <span
                  className="mt-1.5 size-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: slice.paint }}
                  aria-hidden
                />
                <span className="min-w-0">
                  <span className="type-body-sm block truncate text-muted-foreground">
                    {slice.label}
                  </span>
                  <span className="type-body-sm block font-semibold tabular-nums text-foreground">
                    {slice.value.toLocaleString()}{' '}
                    <span className="font-normal text-muted-foreground">
                      ({share.toFixed(1)}%)
                    </span>
                  </span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </Card>
  );
}
