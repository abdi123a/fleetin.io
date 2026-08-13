import type { ApexOptions } from 'apexcharts';
import { ApexChart } from './ApexChart';
import { baseChartOptions, buildTooltipHtml } from './apexChartTheme';
import { seriesColor } from './chartTheme';

export interface ParetoRow {
  key: string;
  label: string;
  value: number;
  share: number;
  cumulativeShare: number;
}

export interface ParetoChartProps {
  rows: ParetoRow[];
  formatValue: (value: number) => string;
  onSelect?: (row: ParetoRow) => void;
  height?: number;
  threshold?: number | null;
}

const BAR_COLOR = seriesColor(0);
const LINE_COLOR = '#f59e0b';

export function ParetoChart({
  rows,
  formatValue,
  onSelect,
  height = 240,
  threshold = 0.8,
}: ParetoChartProps) {
  if (rows.length === 0) return null;

  const data = rows.map((row) => ({
    ...row,
    sharePct: Math.round(row.share * 100),
    cumulativePct: Math.round(row.cumulativeShare * 100),
  }));

  const maxVal = Math.max(...data.map((r) => r.value), 1);
  const leftMax = Math.max(10, Math.ceil((maxVal * 1.3) / 100) * 100);

  const vitalFew =
    threshold === null ? 0 : data.findIndex((row) => row.cumulativeShare >= threshold) + 1;

  const categories = data.map((row) => {
    if (row.label.includes('—')) {
      const parts = row.label.split('—');
      return `${parts[0]?.trim()} (${parts[1]?.trim().slice(0, 4)}.)`;
    }
    return row.label.length > 15 ? `${row.label.slice(0, 14)}…` : row.label;
  });

  const barColors = data.map((_, idx) => `color-mix(in srgb, var(--color-primary) ${Math.round(Math.max(50, 100 - idx * 12))}%, transparent)`);

  const options: ApexOptions = baseChartOptions({
    chart: {
      type: 'line',
      events: onSelect
        ? {
            dataPointSelection: (_event, _chart, config) => {
              const row = rows[config?.dataPointIndex ?? -1];
              if (row) onSelect(row);
            },
          }
        : undefined,
    },
    plotOptions: {
      bar: {
        borderRadius: 6,
        borderRadiusApplication: 'end',
        columnWidth: '55%',
        distributed: true,
      },
    },
    colors: [LINE_COLOR, ...barColors],
    stroke: {
      width: [2, 0],
      curve: 'straight',
    },
    fill: {
      type: ['gradient', 'solid'],
      opacity: [0.12, 1],
      gradient: {
        shade: 'light',
        type: 'vertical',
        opacityFrom: 0.12,
        opacityTo: 0.01,
        stops: [0, 100],
      },
    },
    xaxis: {
      categories,
      labels: { rotate: 0, hideOverlappingLabels: true },
    },
    yaxis: [
      {
        seriesName: 'Hours Lost',
        min: 0,
        max: leftMax,
        labels: { formatter: (val: number) => formatValue(val) },
      },
      {
        seriesName: 'Cumulative %',
        opposite: true,
        min: 0,
        max: 100,
        tickAmount: 5,
        labels: { formatter: (val: number) => `${val}%` },
      },
    ],
    annotations: threshold !== null
      ? {
          yaxis: [
            {
              y: threshold * 100,
              yAxisIndex: 1,
              borderColor: LINE_COLOR,
              strokeDashArray: 4,
              borderWidth: 1.5,
            },
          ],
        }
      : undefined,
    dataLabels: {
      enabled: true,
      enabledOnSeries: [0, 1],
      formatter: (val: number, opts) => {
        if (opts?.seriesIndex === 0) {
          return `${Math.round(val)}%`;
        }
        const idx = opts?.dataPointIndex ?? -1;
        const row = data[idx];
        if (!row) return '';
        return formatValue(row.value);
      },
      style: {
        fontSize: '10px',
        fontWeight: 800,
        colors: ['#d97706', 'var(--surface)'],
      },
      offsetY: -10,
      background: { enabled: false },
    },
    legend: { show: false },
    tooltip: {
      shared: true,
      intersect: false,
      custom: ({ dataPointIndex }) => {
        const row = data[dataPointIndex];
        if (!row) return '';
        return buildTooltipHtml(row.label, [
          { key: 'value', label: 'Delay hours', value: formatValue(row.value), color: BAR_COLOR },
          { key: 'share', label: 'Share of total', value: `${row.sharePct}%`, color: BAR_COLOR },
          { key: 'cumulative', label: 'Cumulative total', value: `${row.cumulativePct}%`, color: LINE_COLOR },
        ]);
      },
    },
  });

  return (
    <div className="flex flex-col gap-3 py-1">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        {threshold !== null && vitalFew > 0 ? (
          <div className="inline-flex items-center gap-1.5 rounded-md border border-warning/20 bg-warning-subtle px-2.5 py-1 text-xs text-warning-subtle-foreground">
            <span className="font-bold">80/20 Rule:</span>
            <span>
              <strong className="font-extrabold">{vitalFew} of {rows.length}</strong> parties cause{' '}
              <strong className="font-extrabold">{(threshold * 100).toFixed(0)}%</strong> of total delay.
            </span>
          </div>
        ) : (
          <div />
        )}

        <div className="flex items-center gap-4 text-xs">
          <div className="flex items-center gap-1.5" title="Left Y-Axis: Delay Hours">
            <span className="size-2.5 rounded-sm bg-primary" />
            <span className="font-medium text-foreground">Hours Lost (Left Axis)</span>
          </div>
          <div className="flex items-center gap-1.5" title="Right Y-Axis: Cumulative Coverage %">
            <span className="size-2.5 rounded-full bg-warning" />
            <span className="font-medium text-foreground">Cumulative % (Right Axis)</span>
          </div>
        </div>
      </div>

      <div style={{ height: height + 36, width: '100%' }}>
        <ApexChart
          type="line"
          series={[
            { name: 'Cumulative %', type: 'area', data: data.map((r) => r.cumulativePct) },
            { name: 'Hours Lost', type: 'column', data: data.map((r) => r.value) },
          ]}
          options={options}
          height={height + 36}
        />
      </div>
    </div>
  );
}
