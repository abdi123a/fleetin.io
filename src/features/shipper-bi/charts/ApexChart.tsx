import Chart from 'react-apexcharts';
import type { ApexOptions } from 'apexcharts';
import { cn } from '@/utils';

export interface ApexChartProps {
  type:
    | 'line'
    | 'area'
    | 'bar'
    | 'pie'
    | 'donut'
    | 'radialBar'
    | 'scatter'
    | 'bubble'
    | 'heatmap'
    | 'candlestick'
    | 'boxPlot'
    | 'radar'
    | 'polarArea'
    | 'rangeBar'
    | 'rangeArea'
    | 'treemap';
  series: ApexOptions['series'];
  options: ApexOptions;
  height?: number | string;
  width?: number | string;
  className?: string;
}

/**
 * Thin wrapper around react-apexcharts so chart components stay declarative
 * and share a single import path.
 */
export function ApexChart({
  type,
  series,
  options,
  height = '100%',
  width = '100%',
  className,
}: ApexChartProps) {
  return (
    <div
      className={cn(
        'apex-chart-host relative z-10 h-full w-full overflow-visible',
        '[&_.apexcharts-tooltip]:!pointer-events-none',
        '[&_.apexcharts-tooltip]:!border-0 [&_.apexcharts-tooltip]:!bg-transparent [&_.apexcharts-tooltip]:!shadow-none',
        '[&_.apexcharts-tooltip.apexcharts-theme-light]:!border-0 [&_.apexcharts-tooltip.apexcharts-theme-light]:!bg-transparent',
        '[&_.apexcharts-xaxistooltip]:!hidden',
        '[&_foreignObject]:!pointer-events-none',
        '[&_.apexcharts-canvas]:cursor-default',
        '[&_.apexcharts-bar-area]:cursor-pointer [&_.apexcharts-pie-area]:cursor-pointer',
        '[&_.apexcharts-series_path]:outline-none',
        className,
      )}
      style={{ width: '100%', height: '100%' }}
    >
      <Chart type={type} series={series} options={options} height={height} width={width} />
    </div>
  );
}
