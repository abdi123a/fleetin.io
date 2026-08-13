import type { ApexOptions } from 'apexcharts';
import type { CategorySlice } from '../contracts';
import { ApexChart } from './ApexChart';
import { baseChartOptions, buildTooltipHtml, quietStates, X_AXIS_HEIGHT } from './apexChartTheme';
import { seriesColor, sliceColor } from './chartTheme';

/**
 * Ranked categories as horizontal bars.
 *
 * Horizontal because category names are words: rotated x-axis labels are the
 * most common reason a bar chart becomes unreadable at narrow widths, and a
 * horizontal layout gives the label a whole row to sit in.
 */

export interface CategoryBarChartProps {
  slices: CategorySlice[];
  /** Formats the value for the axis, the tooltip and the direct label. */
  formatValue: (value: number) => string;
  onSelect?: (slice: CategorySlice) => void;
  height?: number;
  /** Give each bar its own hue. Only for genuinely separate series. */
  colorByIndex?: boolean;
  valueLabel?: string;
}

export function CategoryBarChart({
  slices,
  formatValue,
  onSelect,
  height = 220,
  colorByIndex = false,
  valueLabel = 'Value',
}: CategoryBarChartProps) {
  const colors = slices.map((slice, index) =>
    slice.intent ? sliceColor(slice.intent, index) : seriesColor(colorByIndex ? index : 0),
  );

  const options: ApexOptions = baseChartOptions({
    chart: {
      type: 'bar',
      events: onSelect
        ? {
            dataPointSelection: (_event, _chart, config) => {
              const slice = slices[config?.dataPointIndex ?? -1];
              if (slice) onSelect(slice);
            },
          }
        : undefined,
    },
    plotOptions: {
      bar: {
        horizontal: true,
        borderRadius: 4,
        borderRadiusApplication: 'end',
        barHeight: '65%',
        distributed: true,
      },
    },
    colors,
    xaxis: {
      categories: slices.map((s) => s.label),
      labels: { formatter: (val: string) => formatValue(Number(val)) },
    },
    yaxis: {
      labels: {
        style: {
          colors: 'var(--muted-foreground)',
          fontSize: '11px',
          fontFamily: 'inherit',
        },
      },
    },
    grid: {
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: false } },
    },
    tooltip: {
      custom: ({ dataPointIndex }) => {
        const slice = slices[dataPointIndex];
        if (!slice) return '';
        return buildTooltipHtml(
          slice.label,
          [
            {
              key: 'value',
              label: valueLabel,
              value: formatValue(slice.value),
              color: colors[dataPointIndex],
            },
          ],
          slice.drillDown ? 'Click to open the shipments behind this bar' : undefined,
        );
      },
    },
    states: quietStates,
  });

  return (
    <div style={{ height: height + X_AXIS_HEIGHT, width: '100%' }}>
      <ApexChart
        type="bar"
        series={[{ name: valueLabel, data: slices.map((s) => s.value) }]}
        options={options}
        height={height + X_AXIS_HEIGHT}
      />
    </div>
  );
}
