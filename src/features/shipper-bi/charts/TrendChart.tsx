import type { ApexOptions } from 'apexcharts';
import type { TimeSeries } from '../contracts';
import { ApexChart } from './ApexChart';
import { baseChartOptions, buildTooltipHtml, MARK, X_AXIS_HEIGHT } from './apexChartTheme';
import { seriesColor } from './chartTheme';

/**
 * Time series as lines, with a prior-period overlay and value labels on the marks.
 */

export interface TrendChartProps {
  series: TimeSeries[];
  previousSeries?: TimeSeries[];
  formatValue: (value: number) => string;
  formatBucket: (key: string) => string;
  height?: number;
  visibleKeys?: string[];
  labelMode?: 'points' | 'extremes' | 'none';
  maxLabels?: number;
}

type ApexSeriesItem = {
  name: string;
  type?: string;
  data: number[] | Array<{ x: string; y: number | number[] }>;
};

export function TrendChart({
  series,
  previousSeries,
  formatValue,
  formatBucket,
  height = 240,
  visibleKeys,
  labelMode = 'points',
  maxLabels = 12,
}: TrendChartProps) {
  const shown = visibleKeys ? series.filter((s) => visibleKeys.includes(s.key)) : series;
  const reference = shown[0];
  if (!reference || reference.points.length === 0) return null;

  const isSingle = shown.length === 1;
  const mode = isSingle ? labelMode : 'none';
  const categories = reference.points.map((p) => p.t);
  const colorOf = (key: string) => seriesColor(series.findIndex((s) => s.key === key));

  const values = reference.points.map((point) => point.v);
  const lastIndex = values.length - 1;
  const maxIndex = values.indexOf(Math.max(...values));
  const nonZero = values.filter((value) => value > 0);
  const minIndex = nonZero.length > 0 ? values.indexOf(Math.min(...nonZero)) : -1;

  const labelled = new Set<number>();
  if (mode === 'points') {
    const stride = Math.max(1, Math.ceil(values.length / maxLabels));
    for (let index = 0; index < values.length; index += stride) labelled.add(index);
    labelled.add(maxIndex);
    labelled.add(lastIndex);
  } else if (mode === 'extremes') {
    if (values[maxIndex]) labelled.add(maxIndex);
    if (values.length > 2 && minIndex >= 0 && minIndex !== maxIndex) labelled.add(minIndex);
    if (values[lastIndex]) labelled.add(lastIndex);
  }

  const priorFor = (key: string) => previousSeries?.find((s) => s.key === key);

  const apexSeries: ApexSeriesItem[] = [];

  // Prior-period gap wash for single series
  if (isSingle && previousSeries) {
    apexSeries.push({
      name: 'Change band',
      type: 'area',
      data: reference.points.map((point, index) => {
        const current = point.v;
        const prior = priorFor(reference.key)?.points[index]?.v ?? current;
        return Math.abs(current - prior);
      }),
    });
  } else if (isSingle && !previousSeries) {
    apexSeries.push({
      name: reference.label,
      type: 'area',
      data: reference.points.map((p) => p.v),
    });
  }

  if (previousSeries) {
    for (const s of shown) {
      const prior = priorFor(s.key);
      if (prior) {
        apexSeries.push({
          name: `${s.label} (prior)`,
          type: 'line',
          data: prior.points.map((p) => p.v),
        });
      }
    }
  }

  for (const s of shown) {
    // Skip duplicate area series when we already added the filled area for single series without prior
    if (isSingle && !previousSeries && s.key === reference.key) continue;
    apexSeries.push({
      name: s.label,
      type: 'line',
      data: s.points.map((p) => p.v),
    });
  }

  // Rebuild cleanly: prefer a simpler composed chart without rangeArea typing pain
  const cleanSeries: ApexSeriesItem[] = [];
  const lineColors: string[] = [];
  const strokeWidths: number[] = [];
  const dashArrays: number[] = [];
  const fillOpacities: number[] = [];

  if (isSingle && !previousSeries) {
    cleanSeries.push({
      name: reference.label,
      type: 'area',
      data: reference.points.map((p) => p.v),
    });
    lineColors.push(colorOf(reference.key));
    strokeWidths.push(MARK.lineWidth);
    dashArrays.push(0);
    fillOpacities.push(0.24);
  } else {
    if (previousSeries) {
      for (const s of shown) {
        const prior = priorFor(s.key);
        if (prior) {
          cleanSeries.push({
            name: `${s.label} (prior)`,
            type: 'line',
            data: prior.points.map((p) => p.v),
          });
          lineColors.push('var(--muted-foreground)');
          strokeWidths.push(1.5);
          dashArrays.push(5);
          fillOpacities.push(0);
        }
      }
    }

    for (const s of shown) {
      cleanSeries.push({
        name: s.label,
        type: isSingle ? 'area' : 'line',
        data: s.points.map((p) => p.v),
      });
      lineColors.push(colorOf(s.key));
      strokeWidths.push(MARK.lineWidth);
      dashArrays.push(0);
      fillOpacities.push(isSingle ? 0.16 : 0);
    }
  }

  const options: ApexOptions = baseChartOptions({
    chart: { type: 'line' },
    colors: lineColors,
    stroke: {
      curve: 'smooth',
      width: strokeWidths,
      dashArray: dashArrays,
    },
    fill: {
      type: 'gradient',
      gradient: {
        shadeIntensity: 1,
        opacityFrom: 0.24,
        opacityTo: 0,
        stops: [0, 100],
      },
      opacity: fillOpacities,
    },
    xaxis: {
      categories,
      labels: { formatter: (val: string) => formatBucket(val) },
    },
    yaxis: {
      labels: { formatter: (val: number) => formatValue(val) },
    },
    legend: {
      show: shown.length > 1,
      position: 'top',
      horizontalAlign: 'left',
      offsetY: -4,
      markers: { size: 6, strokeWidth: 0 },
    },
    markers: {
      size: isSingle && mode === 'points' ? 3 : 0,
      strokeWidth: MARK.surfaceGap,
      strokeColors: 'var(--surface)',
      hover: { size: MARK.activeDotRadius },
    },
    dataLabels: {
      enabled: mode !== 'none' && isSingle,
      formatter: (val: number, opts) => {
        if (!opts || !labelled.has(opts.dataPointIndex)) return '';
        return formatValue(val);
      },
      offsetY: -12,
      style: {
        fontSize: '11px',
        fontWeight: 600,
        colors: ['var(--foreground)'],
      },
      background: {
        enabled: true,
        borderRadius: 4,
        borderWidth: 1,
        borderColor: 'var(--border)',
        backgroundColor: 'var(--surface)',
        padding: 4,
        opacity: 1,
      },
    },
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ dataPointIndex }) => {
        const bucket = categories[dataPointIndex];
        if (!bucket) return '';
        const rows = shown.flatMap((s) => {
          const current = s.points[dataPointIndex]?.v;
          const prior = priorFor(s.key)?.points[dataPointIndex]?.v;
          const items = [
            {
              key: s.key,
              label: s.label,
              value: current !== undefined ? formatValue(current) : '—',
              color: colorOf(s.key),
            },
          ];
          if (prior !== undefined) {
            items.push({
              key: `prev_${s.key}`,
              label: `${s.label} (prior period)`,
              value: formatValue(prior),
              color: 'var(--muted-foreground)',
            });
          }
          return items;
        });
        return buildTooltipHtml(formatBucket(bucket), rows);
      },
    },
  });

  return (
    <div style={{ height: height + X_AXIS_HEIGHT, width: '100%' }}>
      <ApexChart
        type="line"
        series={cleanSeries as ApexOptions['series']}
        options={options}
        height={height + X_AXIS_HEIGHT}
      />
    </div>
  );
}
