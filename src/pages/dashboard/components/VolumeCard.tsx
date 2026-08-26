import { useMemo } from 'react';

import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import {
  ConsolePanel,
  InsightNote,
  Legend,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { buildTooltipHtml, CHART_INK, columnOptions } from './charts';
import type { MovementModel } from '../model';

/**
 * How much work the platform actually moved, month by month.
 *
 * Shipments and containers as two columns rather than one stacked: a
 * consignment can carry one container or twelve, so stacking them would imply
 * a total that means nothing. Apart, the distance between the pair IS the
 * average consignment size, which is the thing worth noticing when it moves.
 */
export function VolumeCard({ movement, className }: { movement: MovementModel; className?: string }) {
  const categories = movement.months.map((month) => month.label);

  const options = useMemo(
    () =>
      columnOptions({
        categories,
        colors: [CHART_INK.teal, CHART_INK.tealLight],
        tooltip: {
          shared: true,
          intersect: false,
          custom: ({ dataPointIndex }) => {
            const month = movement.months[dataPointIndex];
            if (!month) return '';
            const perShipment = month.shipments > 0 ? month.containers / month.shipments : 0;
            return buildTooltipHtml(
              month.label,
              [
                { key: 's', label: 'Shipments', value: String(month.shipments), color: CHART_INK.teal },
                { key: 'c', label: 'Containers', value: String(month.containers), color: CHART_INK.tealLight },
              ],
              month.shipments > 0 ? `${perShipment.toFixed(1)} containers per shipment` : undefined,
            );
          },
        },
      }),
    [categories, movement.months],
  );

  const series = useMemo(
    () => [
      { name: 'Shipments', data: movement.months.map((month) => month.shipments) },
      { name: 'Containers', data: movement.months.map((month) => month.containers) },
    ],
    [movement.months],
  );

  const { thisMonth, lastMonth, shipmentsDelta } = movement;

  return (
    <ConsolePanel
      className={className}
      title="Volume"
      subtitle="Shipments and containers by month"
      action={
        <div className="text-right">
          <p className="type-body-xs text-muted-foreground">This month</p>
          <p className="text-sm font-extrabold tabular-nums text-foreground">{thisMonth.shipments}</p>
        </div>
      }
      footer={
        <InsightNote tone={shipmentsDelta !== null && shipmentsDelta < 0 ? 'attention' : 'neutral'}>
          {shipmentsDelta !== null && lastMonth ? (
            <>
              <span className="font-bold text-foreground">
                {thisMonth.shipments} shipments this month
              </span>{' '}
              vs {lastMonth.shipments} last · {shipmentsDelta >= 0 ? 'up' : 'down'}{' '}
              {Math.abs(shipmentsDelta * 100).toFixed(0)}% · {thisMonth.containers} containers.
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">
                {thisMonth.shipments} shipments this month
              </span>{' '}
              · {thisMonth.containers} containers.
            </>
          )}
        </InsightNote>
      }
    >
      <div className="min-h-0 flex-1">
        <ApexChart type="bar" series={series} options={options} height={220} />
      </div>
      <Legend
        className="mt-2"
        items={[
          { label: 'Shipments', color: CHART_INK.teal, shape: 'square' },
          { label: 'Containers', color: CHART_INK.tealLight, shape: 'square' },
        ]}
      />
    </ConsolePanel>
  );
}
