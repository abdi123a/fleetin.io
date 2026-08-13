import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import { Card } from '@/design-system';
import type { StageKey } from '@/features/shipper-bi/contracts';
import type { ShipperShipmentRow } from '@/features/shipper-bi';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  baseChartOptions,
  buildTooltipHtml,
  chartAnimSpeed,
  resolveColor,
} from '@/features/shipper-bi/charts/apexChartTheme';
import { stepColor } from '@/features/shipper-bi/charts/chartTheme';
import { cn } from '@/utils';
import { PANEL_SURFACE } from './PanelHeader';

interface JourneyStep {
  key: string;
  label: string;
  hint: string;
  stages: StageKey[];
}

const STEPS: JourneyStep[] = [
  { key: 'booked', label: 'Booked', hint: 'Order received, paperwork being cleared', stages: ['created', 'documentation'] },
  { key: 'dispatched', label: 'Dispatched', hint: 'Truck assigned and on its way to collect', stages: ['dispatched', 'gate_in'] },
  { key: 'picked_up', label: 'Picked up', hint: 'Cargo loaded, leaving the origin', stages: ['picked_up'] },
  { key: 'in_transit', label: 'In transit', hint: 'On the corridor, arriving and unloading', stages: ['in_transit', 'arrived', 'unloading'] },
  { key: 'delivered', label: 'Delivered', hint: 'Cargo handed over at destination', stages: ['delivered'] },
  { key: 'empty_awaiting', label: 'With you', hint: 'Empty container still out — detention starts here', stages: ['empty_awaiting'] },
  { key: 'empty_returned', label: 'Closed', hint: 'Empty returned, nothing left to pay', stages: ['empty_returned'] },
];

interface JourneyBar {
  key: string;
  label: string;
  hint: string;
  value: number;
  color: string;
  isAlert: boolean;
  overdueCount: number;
}

export interface JourneyStripProps {
  rows: ShipperShipmentRow[];
  overdueCount: number;
}

export function JourneyStrip({ rows, overdueCount }: JourneyStripProps) {
  const data = useMemo((): JourneyBar[] => {
    return STEPS.map((step, index) => {
      const value = rows.filter((row) => step.stages.includes(row.stage)).length;
      const isAlert = step.key === 'empty_awaiting' && overdueCount > 0;
      const token = isAlert ? 'var(--accent-bold)' : stepColor(index, STEPS.length);
      return {
        key: step.key,
        label: step.label,
        hint: step.hint,
        value,
        color: resolveColor(token, isAlert ? '#f9ac17' : '#60969d'),
        isAlert,
        overdueCount: isAlert ? overdueCount : 0,
      };
    });
  }, [rows, overdueCount]);

  const moving = data.slice(0, 4).reduce((total, step) => total + step.value, 0);
  const outstanding = data.find((step) => step.key === 'empty_awaiting')?.value ?? 0;
  const peak = data.reduce((max, step) => Math.max(max, step.value), 0);
  const ceiling = Math.max(4, Math.ceil(peak / 4) * 4);

  const options: ApexOptions = baseChartOptions({
    chart: {
      type: 'bar',
      animations: { enabled: chartAnimSpeed() > 0, speed: chartAnimSpeed() },
    },
    colors: data.map((step) => step.color),
    fill: { opacity: 1, type: 'solid' },
    plotOptions: {
      bar: {
        borderRadius: 4,
        borderRadiusApplication: 'end',
        columnWidth: '55%',
        distributed: true,
      },
    },
    xaxis: { categories: data.map((d) => d.label) },
    yaxis: {
      min: 0,
      max: ceiling,
      tickAmount: 5,
      labels: { formatter: (val: number) => String(Math.round(val)) },
    },
    tooltip: {
      custom: ({ dataPointIndex }) => {
        const point = data[dataPointIndex];
        if (!point) return '';
        return buildTooltipHtml(
          point.label,
          [{ key: 'shipments', label: 'Shipments', value: String(point.value), color: point.color }],
          point.isAlert
            ? `${point.overdueCount} past free time — detention starts here`
            : point.hint,
        );
      },
    },
  });

  return (
    <Card variant="default" padding="lg" className={cn('p-6 sm:p-8 md:p-9 gap-8', PANEL_SURFACE)}>
      <div className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 border-b border-border-subtle/60 pb-5">
        <div>
          <h3 className="type-h3 font-bold text-foreground tracking-tight">
            The journey of every shipment
          </h3>
          <p className="type-body-xs text-muted-foreground mt-0.5">
            Operational pipeline tracking cargo progress from booking to container return
          </p>
        </div>

        <div className="flex items-center gap-3.5 type-body-sm">
          <div className="flex items-center gap-2 rounded-full bg-primary/10 px-3.5 py-1.5 type-body-xs text-primary">
            <span className="h-2 w-2 rounded-full bg-primary animate-pulse motion-reduce:animate-none" />
            <span>
              <strong className="font-bold">{moving}</strong> still moving
            </span>
          </div>

          <div className="flex items-center gap-2 rounded-full bg-muted/60 px-3.5 py-1.5 type-body-xs text-foreground">
            <span
              className={cn(
                'h-2 w-2 rounded-full',
                overdueCount > 0 ? 'bg-accent-bold' : 'bg-muted-foreground',
              )}
            />
            <span>
              <strong className="font-bold">{outstanding}</strong> container
              {outstanding === 1 ? '' : 's'} with you
            </span>
          </div>
        </div>
      </div>

      <div className="min-h-[280px] w-full">
        <ApexChart
          type="bar"
          series={[{ name: 'Shipments', data: data.map((d) => d.value) }]}
          options={options}
          height={280}
        />
      </div>
    </Card>
  );
}
