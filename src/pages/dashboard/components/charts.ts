import type { ApexOptions } from 'apexcharts';

import {
  baseChartOptions,
  buildTooltipHtml,
  chartAnimSpeed,
} from '@/features/shipper-bi/charts/apexChartTheme';

/**
 * The option builders every chart on this console shares.
 *
 * The shipper and transporter consoles proved the point the hard way: once
 * each panel writes its own axis styling, its own column width and its own
 * tooltip, six charts on one screen stop reading as one instrument. These
 * builders sit on top of `baseChartOptions` — which already owns the token
 * colours, the no-flash hover states and the tooltip card — and add only the
 * decisions this console makes the same way every time.
 *
 * Colour discipline is unchanged from the sibling consoles: **teal reports,
 * orange asks**, red is reserved for a rule already broken, and grey is
 * whatever is merely context. No chart here cycles a categorical palette for
 * decoration, and none of them is dual-axis.
 */

export const CHART_INK = {
  teal: 'var(--primary)',
  tealDeep: 'var(--fl-teal-800)',
  tealLight: 'var(--fl-teal-400)',
  orange: 'var(--accent-bold)',
  orangeLight: 'var(--fl-orange-300)',
  red: 'var(--destructive)',
  grey: 'var(--chart-other)',
} as const;

/** Column chart with categories along the bottom. The console's default. */
export function columnOptions({
  categories,
  colors,
  formatter,
  stacked = false,
  height,
  tooltip,
}: {
  categories: string[];
  colors: string[];
  /** Y-axis tick text. Defaults to a rounded integer. */
  formatter?: (value: number) => string;
  stacked?: boolean;
  height?: number;
  tooltip?: ApexOptions['tooltip'];
}): ApexOptions {
  return baseChartOptions({
    chart: {
      type: 'bar',
      stacked,
      height,
      animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
    },
    colors,
    plotOptions: {
      bar: {
        columnWidth: categories.length > 8 ? '62%' : '44%',
        borderRadius: 4,
        borderRadiusApplication: 'end',
      },
    },
    legend: { show: false },
    grid: {
      borderColor: 'var(--border-subtle)',
      strokeDashArray: 4,
      padding: { left: 2, right: 8, top: 4, bottom: 0 },
    },
    xaxis: {
      categories,
      labels: {
        hideOverlappingLabels: true,
        rotate: 0,
        style: { fontSize: '10.5px', fontWeight: 600, colors: 'var(--muted-foreground)' },
      },
    },
    yaxis: {
      min: 0,
      forceNiceScale: true,
      labels: {
        style: { colors: 'var(--muted-foreground)', fontSize: '10.5px', fontWeight: 600, fontFamily: 'inherit' },
        formatter: formatter ?? ((value: number) => String(Math.round(value))),
      },
    },
    ...(tooltip ? { tooltip } : {}),
  });
}

/**
 * Ranked horizontal bars — for a league table where the label is a name.
 *
 * Names go on the left because a vertical column forces them sideways, and a
 * rotated company name is a name nobody reads.
 */
export function rankedBarOptions({
  categories,
  colors,
  formatter,
  distributed = false,
  tooltip,
}: {
  categories: string[];
  colors: string[];
  formatter?: (value: number) => string;
  /** One colour per bar rather than one per series. */
  distributed?: boolean;
  tooltip?: ApexOptions['tooltip'];
}): ApexOptions {
  return baseChartOptions({
    chart: {
      type: 'bar',
      animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
    },
    colors,
    plotOptions: {
      bar: {
        horizontal: true,
        barHeight: categories.length > 5 ? '58%' : '44%',
        borderRadius: 4,
        borderRadiusApplication: 'end',
        distributed,
      },
    },
    legend: { show: false },
    grid: {
      borderColor: 'var(--border-subtle)',
      strokeDashArray: 4,
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
      padding: { left: 2, right: 12, top: 0, bottom: 0 },
    },
    xaxis: {
      categories,
      labels: {
        style: { fontSize: '10.5px', fontWeight: 600, colors: 'var(--muted-foreground)' },
        formatter: formatter ? (value: string) => formatter(Number(value)) : undefined,
      },
      crosshairs: { show: false },
    },
    yaxis: {
      labels: {
        style: { colors: 'var(--foreground)', fontSize: '11px', fontWeight: 600, fontFamily: 'inherit' },
        maxWidth: 150,
      },
    },
    ...(tooltip ? { tooltip } : {}),
  });
}

/** Donut with the total in the middle — a share of a whole, never a trend. */
export function donutOptions({
  labels,
  colors,
  centreLabel,
  centreValue,
  tooltip,
}: {
  labels: string[];
  colors: string[];
  centreLabel: string;
  centreValue: string;
  tooltip?: ApexOptions['tooltip'];
}): ApexOptions {
  /*
   * The centre figure has to fit inside the hollow, and "1.25M DJF" is four
   * times the width of "6". Apex has no auto-fit, so the size steps down with
   * the string — without this a money donut prints its own total straight
   * through the ring.
   */
  const centreFontSize =
    centreValue.length > 9 ? '17px' : centreValue.length > 6 ? '20px' : '26px';

  return baseChartOptions({
    chart: {
      type: 'donut',
      animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
    },
    labels,
    colors,
    stroke: { width: 2, colors: ['var(--surface)'] },
    legend: { show: false },
    grid: { padding: { left: 0, right: 0, top: 0, bottom: 0 } },
    plotOptions: {
      pie: {
        expandOnClick: false,
        donut: {
          size: '72%',
          labels: {
            show: true,
            name: {
              show: true,
              offsetY: 18,
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--muted-foreground)',
              formatter: () => centreLabel,
            },
            value: {
              show: true,
              offsetY: -14,
              fontSize: centreFontSize,
              fontWeight: 800,
              fontFamily: 'inherit',
              color: 'var(--foreground)',
              formatter: () => centreValue,
            },
            total: {
              show: true,
              showAlways: true,
              label: centreLabel,
              fontSize: '10px',
              fontWeight: 700,
              color: 'var(--muted-foreground)',
              formatter: () => centreValue,
            },
          },
        },
      },
    },
    ...(tooltip ? { tooltip } : {}),
  });
}

/** A single share of a ceiling, drawn as a ring. */
export function gaugeOptions({
  label,
  color,
  formatter,
}: {
  label: string;
  color: string;
  formatter: (value: number) => string;
}): ApexOptions {
  return baseChartOptions({
    chart: {
      type: 'radialBar',
      animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
    },
    colors: [color],
    stroke: { lineCap: 'round' },
    grid: { padding: { left: 0, right: 0, top: -8, bottom: -8 } },
    plotOptions: {
      radialBar: {
        hollow: { size: '64%' },
        track: { background: 'var(--surface-sunken)', strokeWidth: '100%' },
        dataLabels: {
          name: {
            offsetY: 20,
            fontSize: '10px',
            fontWeight: 700,
            color: 'var(--muted-foreground)',
          },
          value: {
            offsetY: -14,
            fontSize: '24px',
            fontWeight: 800,
            fontFamily: 'inherit',
            color: 'var(--foreground)',
            formatter,
          },
        },
      },
    },
    labels: [label],
  });
}

export { buildTooltipHtml };
