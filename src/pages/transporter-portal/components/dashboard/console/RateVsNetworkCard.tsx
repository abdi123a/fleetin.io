import { useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  baseChartOptions,
  buildTooltipHtml,
  chartAnimSpeed,
  quietStates,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';
import type { ContainerType } from '@/features/transporter-bi';
import { cn } from '@/utils';
import { ConsolePanel, UnderlineTabs } from './kit';
import type { RateTab } from './model';
import { compact, fmtDjf, fmtDjfSigned, signedPct } from './money';

/**
 * What you charge against what the rest of the network is getting.
 *
 * Two lines rather than one with a delta badge: the question is not only how
 * far apart they are today but whether ours tracks the market or drifts, and a
 * single number cannot show a drift. Tabs split by equipment because a 20-foot
 * box and a reefer are not the same negotiation, and averaging them together
 * hides the one that is actually underpriced.
 *
 * Both curves are DJF per move and come from `rateSeries` — see that file for
 * why the market side is modelled rather than derived from our own invoices.
 */

export interface RateVsNetworkCardProps {
  tabs: RateTab[];
  className?: string;
}

export function RateVsNetworkCard({ tabs, className }: RateVsNetworkCardProps) {
  const [active, setActive] = useState<ContainerType | undefined>(tabs[0]?.key);
  const tab = tabs.find((entry) => entry.key === active) ?? tabs[0];

  const networkColor = useMemo(() => resolveColor('var(--primary)', '#60969d'), []);
  const yourColor = useMemo(() => resolveColor('var(--accent-bold)', '#f9ac17'), []);

  const gap = tab ? tab.yours - tab.network : 0;
  const gapPct = tab && tab.network > 0 ? gap / tab.network : 0;

  const options: ApexOptions = useMemo(() => {
    const points = tab?.points ?? [];
    return baseChartOptions({
      chart: {
        type: 'area',
        animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
      },
      colors: [networkColor, yourColor],
      stroke: { curve: 'smooth', width: [2.4, 2.4], colors: [networkColor, yourColor] },
      fill: {
        type: 'gradient',
        gradient: {
          type: 'vertical',
          shadeIntensity: 0.2,
          opacityFrom: [0.22, 0.06],
          opacityTo: [0.02, 0],
          stops: [0, 100],
        },
      },
      markers: { size: 0, hover: { size: 5, sizeOffset: 1 } },
      legend: { show: false },
      grid: {
        borderColor: 'var(--border)',
        strokeDashArray: 4,
        padding: { left: 4, right: 8, top: 4, bottom: 0 },
      },
      xaxis: {
        categories: points.map((point) => point.label),
        tickAmount: Math.min(7, Math.max(1, points.length - 1)),
        labels: {
          hideOverlappingLabels: true,
          rotate: 0,
          style: { fontSize: '10.5px', fontWeight: 600, colors: 'var(--muted-foreground)' },
        },
        crosshairs: {
          show: true,
          width: 1,
          position: 'back',
          stroke: { color: 'var(--muted-foreground)', width: 1, dashArray: 3 },
        },
      },
      yaxis: {
        min: 0,
        forceNiceScale: true,
        labels: {
          style: {
            colors: 'var(--muted-foreground)',
            fontSize: '10.5px',
            fontWeight: 600,
            fontFamily: 'inherit',
          },
          formatter: (value: number) => compact(value),
        },
      },
      states: quietStates,
      tooltip: {
        shared: true,
        intersect: false,
        custom: ({ dataPointIndex }) => {
          const point = points[dataPointIndex];
          if (!point) return '';
          const diff = point.yours - point.network;
          return buildTooltipHtml(point.label, [
            { key: 'net', label: 'Network rate', value: fmtDjf(point.network), color: networkColor },
            { key: 'you', label: 'Your rate', value: fmtDjf(point.yours), color: yourColor },
            {
              key: 'gap',
              label: diff >= 0 ? 'Above network' : 'Below network',
              value: fmtDjfSigned(diff),
            },
          ]);
        },
      },
    });
  }, [tab, networkColor, yourColor]);

  const series = useMemo(
    () => [
      { name: 'Network rate', data: (tab?.points ?? []).map((point) => point.network) },
      { name: 'Your rate', data: (tab?.points ?? []).map((point) => point.yours) },
    ],
    [tab],
  );

  if (!tab) return null;

  return (
    <ConsolePanel
      className={className}
      title="Rate vs Network"
      subtitle={`DJF per booking · ${tab.label} · against the Fleetin network`}
      action={
        <div className="space-y-0.5">
          <p className="type-body-xs font-extrabold tabular-nums text-foreground">
            {fmtDjf(tab.network)} <span className="font-medium text-muted-foreground">network</span>
          </p>
          <p className="type-body-xs font-extrabold tabular-nums text-accent-subtle-foreground">
            {fmtDjf(tab.yours)} <span className="font-medium text-muted-foreground">you</span>
          </p>
          <p
            className={cn(
              'text-[11.5px] font-bold tabular-nums',
              gap >= 0 ? 'text-success-subtle-foreground' : 'text-destructive-subtle-foreground',
            )}
          >
            {gap >= 0 ? '▲' : '▼'} {fmtDjfSigned(gap)} ({signedPct(gapPct)})
            <span className="ml-1.5 font-medium text-muted-foreground">· {tab.moves} bookings</span>
          </p>
        </div>
      }
      band={
        <UnderlineTabs
          className="mt-4"
          tabs={tabs.map((entry) => ({ key: entry.key, label: entry.label }))}
          active={tab.key}
          onChange={setActive}
        />
      }
    >
      <div className="flex items-center gap-4 pb-1 text-[11px] font-semibold text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: 'var(--primary)' }} />
          Network rate
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full" style={{ background: 'var(--accent-bold)' }} />
          Your rate
        </span>
      </div>
      <div className="h-[190px] min-h-[160px] w-full flex-1">
        <ApexChart type="area" series={series} options={options} height="100%" />
      </div>
    </ConsolePanel>
  );
}

export default RateVsNetworkCard;
