import type { ApexOptions } from 'apexcharts';
import { ApexChart } from './ApexChart';
import {
  baseChartOptions,
  buildTooltipHtml,
  MARK,
  resolveColor,
  X_AXIS_HEIGHT,
} from './apexChartTheme';
import { intentColor, seriesColor, type Intent } from './chartTheme';

/**
 * Several parts of a whole, over time.
 *
 * A single stacked bar answers "what is the mix right now"; this answers
 * "is the mix getting better", which is the question a snapshot can never
 * settle.
 */

export interface StackedSeries {
  key: string;
  label: string;
  /** Status colour when the band *means* something; otherwise categorical. */
  intent?: Intent;
  /** Explicit token/colour — wins over intent when set. */
  color?: string;
  points: Array<{ t: string; v: number }>;
}

export interface StackedAreaChartProps {
  series: StackedSeries[];
  formatValue: (value: number) => string;
  formatBucket: (key: string) => string;
  height?: number;
  /** Renders each band as a share of the period's total instead of a count. */
  normalize?: boolean;
}

const INTENT_FALLBACK: Record<Intent, string> = {
  good: '#2e7d32',
  warning: '#ffb502',
  critical: '#d32f2f',
  neutral: '#717b87',
};

const COLOR_FALLBACK: Record<string, string> = {
  'var(--primary)': '#60969d',
  'var(--warning)': '#ffb502',
  'var(--destructive)': '#d32f2f',
  'var(--success)': '#2e7d32',
  'var(--accent)': '#f9ac17',
};

function resolveSeriesColor(s: StackedSeries, index: number): string {
  if (s.color) {
    return resolveColor(s.color, COLOR_FALLBACK[s.color] ?? '#60969d');
  }
  if (s.intent) {
    return resolveColor(intentColor(s.intent), INTENT_FALLBACK[s.intent]);
  }
  return resolveColor(seriesColor(index), '#60969d');
}

export function StackedAreaChart({
  series,
  formatValue,
  formatBucket,
  height = 240,
  normalize = false,
}: StackedAreaChartProps) {
  const reference = series[0];
  if (!reference || reference.points.length === 0) return null;

  const colors = series.map((s, index) => resolveSeriesColor(s, index));
  const categories = reference.points.map((p) => p.t);

  const apexSeries = series.map((s) => {
    const data = reference.points.map((_point, index) => {
      const total = series.reduce((sum, item) => sum + (item.points[index]?.v ?? 0), 0);
      const raw = s.points[index]?.v ?? 0;
      return normalize ? (total === 0 ? 0 : (raw / total) * 100) : raw;
    });
    return { name: s.label, data };
  });

  const options: ApexOptions = baseChartOptions({
    chart: { type: 'area', stacked: true },
    colors,
    stroke: {
      curve: 'smooth',
      width: MARK.surfaceGap,
      colors,
    },
    fill: {
      type: 'solid',
      opacity: 0.55,
    },
    xaxis: {
      categories,
      labels: { formatter: (val: string) => formatBucket(val) },
    },
    yaxis: {
      min: normalize ? 0 : undefined,
      max: normalize ? 100 : undefined,
      labels: {
        formatter: (val: number) => (normalize ? `${val}%` : formatValue(val)),
      },
    },
    legend: {
      show: true,
      position: 'top',
      horizontalAlign: 'left',
      offsetY: -4,
    },
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ dataPointIndex }) => {
        const bucket = categories[dataPointIndex];
        if (!bucket) return '';
        const rows = [...series].reverse().map((s, revIndex) => {
          const index = series.length - 1 - revIndex;
          const raw = s.points[dataPointIndex]?.v ?? 0;
          const total = series.reduce((sum, item) => sum + (item.points[dataPointIndex]?.v ?? 0), 0);
          const value = normalize
            ? total === 0
              ? '0.0%'
              : `${((raw / total) * 100).toFixed(1)}%`
            : formatValue(raw);
          return {
            key: s.key,
            label: s.label,
            value,
            color: colors[index] ?? resolveSeriesColor(s, index),
          };
        });
        return buildTooltipHtml(formatBucket(bucket), rows);
      },
    },
  });

  return (
    <div style={{ height: height + X_AXIS_HEIGHT, width: '100%' }}>
      <ApexChart
        type="area"
        series={apexSeries}
        options={options}
        height={height + X_AXIS_HEIGHT}
      />
    </div>
  );
}
