import type { ApexOptions } from 'apexcharts';
import { ApexChart } from './ApexChart';
import { baseChartOptions, buildTooltipHtml, MARK, X_AXIS_HEIGHT } from './apexChartTheme';
import { intentColor, seriesColor, type Intent } from './chartTheme';

export interface BubblePoint {
  key: string;
  label: string;
  x: number;
  y: number;
  z?: number;
  intent?: Intent;
}

export interface BubbleScatterProps {
  points: BubblePoint[];
  xLabel: string;
  yLabel: string;
  formatX: (value: number) => string;
  formatY: (value: number) => string;
  zLabel?: string;
  formatZ?: (value: number) => string;
  onSelect?: (point: BubblePoint) => void;
  height?: number;
  showTrend?: boolean;
  quadrants?: {
    x: number;
    y: number;
    labels?: [string, string, string, string];
  };
}

export function BubbleScatter({
  points,
  xLabel,
  yLabel,
  formatX,
  formatY,
  zLabel,
  formatZ,
  onSelect,
  height = 300,
  showTrend = false,
  quadrants,
}: BubbleScatterProps) {
  if (points.length === 0) return null;

  const hasZ = points.some((point) => point.z !== undefined);
  const xs = points.map((point) => point.x);
  const ys = points.map((point) => point.y);
  const xMax = Math.max(...xs);
  const yMax = Math.max(...ys);
  const xMin = Math.min(...xs, 0);
  const yMin = Math.min(...ys, 0);

  const fit = showTrend ? leastSquares(points) : null;
  const colors = points.map((point) =>
    point.intent ? intentColor(point.intent) : seriesColor(0),
  );

  const annotations: ApexOptions['annotations'] = { xaxis: [], yaxis: [] };

  if (quadrants) {
    annotations.xaxis?.push({
      x: quadrants.x,
      borderColor: 'var(--border-strong)',
      strokeDashArray: 4,
    });
    annotations.yaxis?.push({
      y: quadrants.y,
      borderColor: 'var(--border-strong)',
      strokeDashArray: 4,
    });
  }

  if (fit) {
    annotations.yaxis?.push({
      y: fit.intercept + fit.slope * xMin,
      y2: fit.intercept + fit.slope * xMax,
      borderColor: seriesColor(1),
      strokeDashArray: 5,
      borderWidth: 1.5,
    });
  }

  const options: ApexOptions = baseChartOptions({
    chart: {
      type: 'bubble',
      events: onSelect
        ? {
            dataPointSelection: (_event, _chart, config) => {
              const point = points[config?.dataPointIndex ?? -1];
              if (point) onSelect(point);
            },
          }
        : undefined,
    },
    colors,
    plotOptions: {
      bubble: {
        minBubbleRadius: hasZ ? 6 : 8,
        maxBubbleRadius: hasZ ? 22 : 10,
        zScaling: true,
      },
    },
    xaxis: {
      min: xMin,
      max: xMax,
      title: { text: xLabel, style: { fontSize: '11px', color: 'var(--muted-foreground)' } },
      labels: { formatter: (val: string) => formatX(Number(val)) },
      tickAmount: 6,
    },
    yaxis: {
      min: yMin,
      max: yMax,
      labels: { formatter: (val: number) => formatY(val) },
    },
    grid: {
      xaxis: { lines: { show: true } },
      yaxis: { lines: { show: true } },
    },
    fill: { opacity: 0.65 },
    stroke: { width: MARK.surfaceGap, colors: ['var(--surface)'] },
    annotations,
    legend: { show: false },
    tooltip: {
      custom: ({ dataPointIndex }) => {
        const point = points[dataPointIndex];
        if (!point) return '';
        return buildTooltipHtml(point.label, [
          { key: 'x', label: xLabel, value: formatX(point.x), color: seriesColor(0) },
          { key: 'y', label: yLabel, value: formatY(point.y), color: seriesColor(0) },
          ...(hasZ && zLabel && point.z !== undefined
            ? [
                {
                  key: 'z',
                  label: zLabel,
                  value: formatZ ? formatZ(point.z) : String(point.z),
                  color: seriesColor(0),
                },
              ]
            : []),
        ]);
      },
    },
  });

  return (
    <div className="flex flex-col gap-1.5">
      <div style={{ height: height + X_AXIS_HEIGHT, width: '100%' }}>
        <ApexChart
          type="bubble"
          series={[
            {
              name: yLabel,
              data: points.map((p) => ({
                x: p.x,
                y: p.y,
                z: p.z ?? 1,
              })),
            },
          ]}
          options={options}
          height={height + X_AXIS_HEIGHT}
        />
      </div>

      {quadrants?.labels ? (
        <div className="grid grid-cols-2 gap-x-4 px-2 text-[10px] text-muted-foreground">
          <span>◤ {quadrants.labels[0]}</span>
          <span className="text-right">{quadrants.labels[1]} ◥</span>
          <span>◣ {quadrants.labels[3]}</span>
          <span className="text-right">{quadrants.labels[2]} ◢</span>
        </div>
      ) : null}
    </div>
  );
}

function leastSquares(
  points: Array<{ x: number; y: number }>,
): { slope: number; intercept: number } | null {
  if (points.length < 3) return null;

  const n = points.length;
  const meanX = points.reduce((sum, point) => sum + point.x, 0) / n;
  const meanY = points.reduce((sum, point) => sum + point.y, 0) / n;

  let covariance = 0;
  let varianceX = 0;
  for (const point of points) {
    covariance += (point.x - meanX) * (point.y - meanY);
    varianceX += (point.x - meanX) ** 2;
  }
  if (varianceX === 0) return null;

  const slope = covariance / varianceX;
  return { slope, intercept: meanY - slope * meanX };
}
