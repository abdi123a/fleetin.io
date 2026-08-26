import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import {
  ApexChart,
  MARK,
  X_AXIS_HEIGHT,
  baseChartOptions,
  buildTooltipHtml,
  quietStates,
  resolveColor,
} from '@/features/shipper-bi/charts';

/**
 * The two Apex charts this page uses, themed once.
 *
 * Both are built on `baseChartOptions`, so they inherit the system's grid,
 * axis, animation and tooltip treatment rather than carrying a second opinion
 * about what a chart looks like. Everything here is a *presentation* choice —
 * the numbers arrive already aggregated from `buildInsight`.
 *
 * Two rules apply to both and are not negotiable:
 *
 * - **One y-axis.** Two scales on one plot can make any pair of series look
 *   correlated, which is the most common way a dashboard lies. Where two
 *   measures do not share a unit they get two charts, not two axes.
 * - **Labels are selective.** A value on every point is the fastest way to make
 *   a chart go unread; the axis, the legend and the tooltip carry the rest.
 */

const AXIS_LABEL = {
  style: {
    colors: 'var(--muted-foreground)',
    fontSize: '11px',
    fontFamily: 'inherit',
    fontWeight: 600,
  },
} as const;

/* ---------------------------------------------------------------------------
 * Gradient spline area — "how has this moved?"
 * ------------------------------------------------------------------------ */

export interface AreaTrendProps {
  categories: string[];
  /** Nulls leave a genuine gap rather than a fabricated zero. */
  values: Array<number | null>;
  seriesName: string;
  formatValue: (value: number) => string;
  /** Drawn as a dashed rule in the same units — never a second axis. */
  target?: number;
  targetLabel?: string;
  color?: string;
  /** Minimum plot height; the chart grows past it to fill its card. */
  minHeight?: number;
}

export function AreaTrend({
  categories,
  values,
  seriesName,
  formatValue,
  target,
  targetLabel,
  color = 'var(--primary)',
  minHeight = 240,
}: AreaTrendProps) {
  const options = useMemo<ApexOptions>(() => {
    const stroke = resolveColor(color, '#60969D');

    /*
     * Headroom so the target rule lands *inside* the plot.
     *
     * Left to Apex, the axis tops out at the largest value it was given. When
     * the target is above every observation — which is exactly the interesting
     * case, an account under its SLA — the dashed rule is drawn along the top
     * gridline and disappears into it, so the one line that says "this is the
     * bar you are missing" becomes invisible at precisely the moment it
     * matters.
     */
    const observed = values.filter((value): value is number => value !== null);
    const ceiling = Math.max(...observed, target ?? Number.NEGATIVE_INFINITY);
    const floor = Math.min(...observed, target ?? Number.POSITIVE_INFINITY);
    const pad = Math.max((ceiling - floor) * 0.18, ceiling * 0.06, 1);

    return baseChartOptions({
      chart: { type: 'area', sparkline: { enabled: false }, parentHeightOffset: 0 },
      colors: [stroke],
      // Smooth, not stepped: these are rates and averages over time, where the
      // in-between is a real (if unobserved) quantity.
      stroke: { curve: 'smooth', width: MARK.lineWidth, lineCap: 'round' },
      fill: {
        type: 'gradient',
        gradient: {
          shadeIntensity: 1,
          opacityFrom: 0.32,
          opacityTo: 0,
          stops: [0, 92],
        },
      },
      markers: {
        size: 0,
        strokeWidth: 2,
        strokeColors: 'var(--surface)',
        hover: { size: MARK.activeDotRadius },
      },
      dataLabels: { enabled: false },
      legend: { show: false },
      xaxis: {
        categories,
        labels: AXIS_LABEL,
        axisBorder: { show: false },
        axisTicks: { show: false },
        /* The shared theme's category crosshair paints itself over slot 0 at
           rest, not only under the pointer, which reads as a highlighted first
           month that means nothing. The tooltip already carries hover feedback. */
        crosshairs: { show: false },
      },
      yaxis: {
        min: observed.length === 0 ? undefined : Math.max(0, floor - pad),
        max: observed.length === 0 ? undefined : ceiling + pad,
        forceNiceScale: true,
        labels: {
          ...AXIS_LABEL,
          formatter: (value: number) => formatValue(value),
        },
      },
      annotations:
        target === undefined
          ? {}
          : {
              yaxis: [
                {
                  y: target,
                  strokeDashArray: 4,
                  borderColor: 'var(--muted-foreground)',
                  opacity: 0.55,
                  label: {
                    text: targetLabel ?? formatValue(target),
                    position: 'left',
                    offsetX: 54,
                    offsetY: -2,
                    borderWidth: 0,
                    style: {
                      background: 'var(--surface-sunken)',
                      color: 'var(--muted-foreground)',
                      fontSize: '10.5px',
                      fontWeight: 600,
                      fontFamily: 'inherit',
                      padding: { left: 7, right: 7, top: 3, bottom: 3 },
                    },
                  },
                },
              ],
            },
      states: quietStates,
      tooltip: {
        custom: ({ series, seriesIndex, dataPointIndex }) => {
          const raw = (series as number[][])[seriesIndex]?.[dataPointIndex];
          if (raw === null || raw === undefined) return '';
          return buildTooltipHtml(categories[dataPointIndex], [
            { key: seriesName, label: seriesName, value: formatValue(raw), color: stroke },
          ]);
        },
      },
    });
  }, [categories, color, formatValue, seriesName, target, targetLabel, values]);

  /* Grows to fill the card. Cards in a grid row share a baseline, so a chart
     pinned to a fixed height leaves whatever the tallest card in the row does
     not need as dead white space above it — which is what made the first grid
     read as empty even after the bands were gone. */
  return (
    <div className="min-w-0 flex-1" style={{ minHeight: minHeight + X_AXIS_HEIGHT }}>
      <ApexChart
        type="area"
        series={[{ name: seriesName, data: values }]}
        options={options}
        height="100%"
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Rounded stacked column — "what is each period made of?"
 * ------------------------------------------------------------------------ */

export interface StackedColumnsProps {
  categories: string[];
  series: Array<{ name: string; data: number[]; color: string }>;
  formatValue: (value: number) => string;
  /** Minimum plot height; the chart grows past it to fill its card. */
  minHeight?: number;
}

/**
 * A stack per period, capped at 24px with a 4px rounded top and a 2px surface
 * gap between segments.
 *
 * The gap is what separates the segments — never a stroke around each one,
 * which adds ink that is not data. Total-only labels would clutter every
 * column, so the figures live in the tooltip and the legend names the parts.
 */
export function StackedColumns({
  categories,
  series,
  formatValue,
  minHeight = 260,
}: StackedColumnsProps) {
  const options = useMemo<ApexOptions>(() => {
    const colors = series.map((entry, index) =>
      resolveColor(entry.color, index === 0 ? '#60969D' : '#f9ac17'),
    );

    return baseChartOptions({
      chart: { type: 'bar', stacked: true, parentHeightOffset: 0 },
      colors,
      plotOptions: {
        bar: {
          columnWidth: '46%',
          borderRadius: 4,
          borderRadiusApplication: 'end',
          borderRadiusWhenStacked: 'last',
          horizontal: false,
        },
      },
      stroke: {
        // Apex draws the surface gap as a stroke in the surface colour, which
        // is the one place a stroke is spacing rather than ink.
        show: true,
        width: MARK.surfaceGap,
        colors: ['var(--surface)'],
      },
      dataLabels: { enabled: false },
      legend: {
        show: true,
        position: 'top',
        horizontalAlign: 'left',
        offsetX: -8,
        markers: { size: 5, shape: 'circle' },
        itemMargin: { horizontal: 10, vertical: 0 },
        fontSize: '12px',
        fontWeight: 500,
        labels: { colors: 'var(--muted-foreground)' },
      },
      xaxis: {
        categories,
        labels: AXIS_LABEL,
        axisBorder: { show: false },
        axisTicks: { show: false },
        /* The shared theme's category crosshair paints itself over slot 0 at
           rest, not only under the pointer, which reads as a highlighted first
           month that means nothing. The tooltip already carries hover feedback. */
        crosshairs: { show: false },
      },
      yaxis: {
        labels: {
          ...AXIS_LABEL,
          formatter: (value: number) => formatValue(value),
        },
      },
      states: quietStates,
      tooltip: {
        shared: true,
        intersect: false,
        custom: ({ series: data, dataPointIndex }) => {
          const rows = series.map((entry, index) => ({
            key: entry.name,
            label: entry.name,
            value: formatValue((data as number[][])[index]?.[dataPointIndex] ?? 0),
            color: colors[index],
          }));
          const total = (data as number[][]).reduce(
            (sum, row) => sum + (row[dataPointIndex] ?? 0),
            0,
          );
          return buildTooltipHtml(
            categories[dataPointIndex],
            rows,
            `Total ${formatValue(total)}`,
          );
        },
      },
    });
  }, [categories, formatValue, series]);

  return (
    <div className="min-w-0 flex-1" style={{ minHeight: minHeight + X_AXIS_HEIGHT }}>
      <ApexChart
        type="bar"
        series={series.map((entry) => ({ name: entry.name, data: entry.data }))}
        options={options}
        height="100%"
      />
    </div>
  );
}
