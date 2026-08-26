import { useMemo, useState } from 'react';
import type { ApexOptions } from 'apexcharts';
import { Card } from '@/design-system';
import type { DatePreset } from '@/features/shipper-bi/contracts';
import { formatCompact, formatCurrencyFull } from '@/features/shipper-bi/format';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  baseChartOptions,
  buildTooltipHtml,
  chartAnimSpeed,
  quietStates,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';
import { biCurrency } from '@/lib/bi/config';
import { cn } from '@/utils';
import { PANEL_SURFACE } from './PanelHeader';

export interface ShipmentTypesMixedChartProps {
  preset?: DatePreset;
  from?: string;
  to?: string;
  className?: string;
}

type GoodsType = 'containers' | 'bulk_commodities' | 'bulk_steel' | 'livestock';

interface GoodsTab {
  key: GoodsType;
  label: string;
}

/** Non-empty by construction, so `GOODS_TABS[0]` is always a safe fallback. */
const GOODS_TABS: [GoodsTab, ...GoodsTab[]] = [
  { key: 'containers', label: 'Containers' },
  { key: 'bulk_commodities', label: 'Commodities' },
  { key: 'bulk_steel', label: 'Steel' },
  { key: 'livestock', label: 'Livestock' },
];

/**
 * Market spot is volatile — swings from the mid-40s up through the 60s so
 * the line does not sit flat. Fleetin stays in a tight, reliable band and
 * is always cheaper when the market spikes.
 */
const MARKET_BASES: Record<
  GoodsType,
  { spot: number; volatility: number; min: number; max: number }
> = {
  containers: { spot: 52_000, volatility: 1.15, min: 44_000, max: 68_000 },
  bulk_commodities: { spot: 53_500, volatility: 1.2, min: 43_000, max: 70_000 },
  bulk_steel: { spot: 55_000, volatility: 1.25, min: 45_000, max: 72_000 },
  livestock: { spot: 51_000, volatility: 1.15, min: 43_000, max: 66_000 },
};

/** Fleetin — reliable, tight band; always under a spiking market. */
const FLEETIN_BASES: Record<
  GoodsType,
  { spot: number; volatility: number; min: number; max: number }
> = {
  containers: { spot: 48_000, volatility: 0.2, min: 41_000, max: 50_000 },
  bulk_commodities: { spot: 43_000, volatility: 0.22, min: 40_500, max: 45_500 },
  bulk_steel: { spot: 44_000, volatility: 0.22, min: 41_000, max: 46_500 },
  livestock: { spot: 42_000, volatility: 0.2, min: 40_000, max: 44_500 },
};

interface RatePoint {
  label: string;
  fullLabel: string;
  marketRate: number;
  fleetinRate: number;
  marketDiff: number;
  marketDiffPct: number;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function generateRateSeries(
  goodsType: GoodsType,
  fromStr?: string,
  toStr?: string,
): RatePoint[] {
  const end = toStr
    ? new Date(toStr.slice(0, 10) + 'T00:00:00')
    : new Date('2026-08-05T00:00:00');
  const start = fromStr
    ? new Date(fromStr.slice(0, 10) + 'T00:00:00')
    : new Date(end.getTime() - 29 * 86_400_000);

  const market = MARKET_BASES[goodsType];
  const fleetin = FLEETIN_BASES[goodsType];
  const points: RatePoint[] = [];
  const cur = new Date(start);
  let i = 0;
  let prevMarket = 0;

  while (cur <= end && points.length < 90) {
    const isWeekend = cur.getDay() === 0 || cur.getDay() === 6;
    const d = cur.getDate();
    const mon = cur.toLocaleString('en-US', { month: 'short' });
    const fullLabel = cur.toLocaleDateString('en-GB', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    // Market — clear swings so some days sit near 45k and others near 60k+.
    const mVol = market.volatility;
    const mCycle = Math.sin(i * 0.28) * 9_500 * mVol;
    const mRipple =
      (Math.sin(i * 0.55) * 2_800 + Math.cos(i * 0.9) * 1_600) * mVol;
    const mWeekend = isWeekend ? -2_200 * mVol : 0;
    // Soft peaks / dips every ~10 days so the line visibly moves
    const mPeak = i % 11 === 4 ? 4_800 * mVol : i % 11 === 9 ? -3_500 * mVol : 0;
    const rawMarket = Math.round(
      market.spot + mCycle + mRipple + mWeekend + mPeak,
    );
    const marketRate = clamp(rawMarket, market.min, market.max);

    // Fleetin — almost flat (reliable). Mild drift only; always below market.
    const fVol = fleetin.volatility;
    const fDrift = Math.sin(i * 0.15) * 700 * fVol;
    const fRipple = Math.cos(i * 0.4) * 350 * fVol;
    const rawFleetin = Math.round(fleetin.spot + fDrift + fRipple);
    const fleetinRate = clamp(
      Math.min(rawFleetin, marketRate - 2_500),
      fleetin.min,
      fleetin.max,
    );

    const marketDiff = i === 0 ? 0 : marketRate - prevMarket;
    const marketDiffPct =
      i === 0 || prevMarket === 0 ? 0 : (marketDiff / prevMarket) * 100;
    prevMarket = marketRate;

    points.push({
      label: `${mon} ${d}`,
      fullLabel,
      marketRate,
      fleetinRate,
      marketDiff,
      marketDiffPct,
    });
    cur.setDate(cur.getDate() + 1);
    i++;
  }

  return points.length > 0
    ? points
    : [
        {
          label: 'Aug 1',
          fullLabel: 'Aug 1, 2026',
          marketRate: market.spot,
          fleetinRate: fleetin.spot,
          marketDiff: 0,
          marketDiffPct: 0,
        },
      ];
}

function formatSignedDjf(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${formatCompact(Math.abs(value))} ${biCurrency()}`;
}

function formatSignedPct(value: number): string {
  const sign = value > 0 ? '+' : value < 0 ? '−' : '';
  return `${sign}${Math.abs(value).toFixed(1)}%`;
}

export function ShipmentTypesMixedChart({
  from,
  to,
  className = '',
}: ShipmentTypesMixedChartProps) {
  const [activeGoods, setActiveGoods] = useState<GoodsType>('containers');

  const data = useMemo(
    () => generateRateSeries(activeGoods, from, to),
    [activeGoods, from, to],
  );

  const marketColor = useMemo(() => resolveColor('var(--primary)', '#60969d'), []);
  const fleetinColor = useMemo(() => resolveColor('var(--accent)', '#f9ac17'), []);
  const activeLabel = (GOODS_TABS.find((t) => t.key === activeGoods) ?? GOODS_TABS[0]).label;

  const latest = data[data.length - 1];
  const first = data[0];
  const currentMarket = latest?.marketRate ?? 0;
  const currentFleetin = latest?.fleetinRate ?? 0;
  const savings = currentMarket - currentFleetin;

  const periodChange = useMemo(() => {
    const open = first?.marketRate ?? 0;
    const close = latest?.marketRate ?? 0;
    if (data.length < 2 || open === 0) return { abs: 0, pct: 0 };
    return { abs: close - open, pct: ((close - open) / open) * 100 };
  }, [data, first, latest]);

  const isUp = periodChange.pct >= 0;

  const yMin = 0;

  const yMax = useMemo(() => {
    const peak = Math.max(
      ...data.map((d) => Math.max(d.marketRate, d.fleetinRate)),
    );
    // Round up to a clean thousands band so the top isn’t cramped.
    return Math.ceil((peak + 5_000) / 5_000) * 5_000;
  }, [data]);

  const options: ApexOptions = useMemo(
    () =>
      baseChartOptions({
        chart: {
          type: 'area',
          selection: { enabled: false },
          animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
        },
        colors: [marketColor, fleetinColor],
        stroke: {
          curve: 'smooth',
          width: [2.5, 3],
          colors: [marketColor, fleetinColor],
        },
        markers: { size: 0, hover: { size: 5, sizeOffset: 1 } },
        fill: {
          type: 'gradient',
          gradient: {
            shade: 'dark',
            type: 'vertical',
            shadeIntensity: 0.25,
            opacityFrom: 0.28,
            opacityTo: 0.04,
            stops: [0, 100],
          },
        },
        legend: {
          show: true,
          position: 'top',
          horizontalAlign: 'left',
          fontSize: '11px',
          fontWeight: 600,
          labels: { colors: 'var(--muted-foreground)' },
          markers: { size: 4, shape: 'circle' },
          itemMargin: { horizontal: 12, vertical: 0 },
        },
        grid: {
          borderColor: 'var(--border)',
          strokeDashArray: 4,
          padding: { left: 4, right: 8, top: 4, bottom: 0 },
        },
        xaxis: {
          categories: data.map((d) => d.label),
          tickAmount: Math.min(8, Math.max(1, data.length - 1)),
          labels: {
            hideOverlappingLabels: true,
            rotate: 0,
            style: {
              fontSize: data.length > 20 ? '10px' : '11px',
              fontWeight: 700,
              colors: 'var(--muted-foreground)',
            },
          },
          crosshairs: {
            show: true,
            width: 1,
            position: 'back',
            opacity: 0.6,
            stroke: { color: 'var(--muted-foreground)', width: 1, dashArray: 3 },
          },
        },
        yaxis: {
          min: yMin,
          max: yMax,
          forceNiceScale: true,
          labels: {
            style: {
              colors: 'var(--muted-foreground)',
              fontSize: '11px',
              fontWeight: 600,
              fontFamily: 'inherit',
            },
            formatter: (v: number) => formatCompact(Math.round(v)),
          },
        },
        states: quietStates,
        tooltip: {
          shared: true,
          intersect: false,
          custom: ({ dataPointIndex }) => {
            const point = data[dataPointIndex];
            if (!point) return '';

            const change =
              dataPointIndex === 0
                ? '—'
                : `${formatSignedDjf(point.marketDiff)} (${formatSignedPct(point.marketDiffPct)})`;

            return buildTooltipHtml(point.fullLabel, [
              {
                key: 'market',
                label: 'Market rate',
                value: formatCurrencyFull(point.marketRate),
                color: marketColor,
              },
              {
                key: 'fleetin',
                label: 'Fleetin rate',
                value: formatCurrencyFull(point.fleetinRate),
                color: fleetinColor,
              },
              {
                key: 'save',
                label: 'You save',
                value: formatCurrencyFull(point.marketRate - point.fleetinRate),
                color: '#22c55e',
              },
              {
                key: 'diff',
                label: 'Market change',
                value: change,
                color: point.marketDiff >= 0 ? '#ef4444' : '#22c55e',
              },
            ]);
          },
        },
      }),
    [data, marketColor, fleetinColor, yMin, yMax],
  );

  const series = useMemo(
    () => [
      {
        name: 'Market rate',
        data: data.map((d) => d.marketRate),
      },
      {
        name: 'Fleetin rate',
        data: data.map((d) => d.fleetinRate),
      },
    ],
    [data],
  );

  return (
    <Card
      variant="default"
      padding="none"
      className={cn('flex h-full min-h-0 flex-col', PANEL_SURFACE, className)}
    >
      <div className="border-b border-border/60 px-6 pt-5 pb-0">
        <div className="flex items-start justify-between gap-4 pb-3">
          <div className="min-w-0">
            <h3 className="type-h3 text-foreground">Shipment Market Rate</h3>
            <p className="type-body-xs mt-0.5 text-muted-foreground">
              {activeLabel} · DJF per vehicle · Fleetin vs market
            </p>
          </div>
          <div className="shrink-0 text-right">
            <p className="type-body-xs font-extrabold tabular-nums text-foreground">
              {formatCurrencyFull(currentMarket)}
              <span className="ml-1.5 font-semibold text-muted-foreground">market</span>
            </p>
            <p className="type-body-xs mt-0.5 font-extrabold tabular-nums text-accent-subtle-foreground">
              {formatCurrencyFull(currentFleetin)}
              <span className="ml-1.5 font-semibold text-muted-foreground">Fleetin</span>
            </p>
            <p
              className={cn(
                'type-body-xs mt-0.5 font-bold tabular-nums',
                isUp ? 'text-destructive-subtle-foreground' : 'text-success-subtle-foreground',
              )}
            >
              {isUp ? '▲' : '▼'} {formatSignedDjf(periodChange.abs)} ({formatSignedPct(periodChange.pct)})
              <span className="ml-1.5 font-medium text-success-subtle-foreground">
                · save {formatCompact(savings)}
              </span>
            </p>
          </div>
        </div>

        <div className="flex gap-0 overflow-x-auto -mb-px scrollbar-none">
          {GOODS_TABS.map((tab) => (
            <button
              key={tab.key}
              type="button"
              onClick={() => setActiveGoods(tab.key)}
              className={cn(
                'shrink-0 border-b-2 px-3 py-2 text-xs font-bold whitespace-nowrap transition-colors focus-visible:outline-none',
                activeGoods === tab.key
                  ? 'border-primary text-primary'
                  : 'border-transparent text-muted-foreground hover:text-foreground',
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      <div className="h-[280px] min-h-[240px] w-full flex-1 px-6 pb-5 pt-4">
        <ApexChart type="area" series={series} options={options} height="100%" />
      </div>
    </Card>
  );
}

export default ShipmentTypesMixedChart;
