import { useMemo } from 'react';

import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { compactDjf, pct } from '@/lib/finance';
import {
  ConsolePanel,
  InsightNote,
  StatBox,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { CHART_INK, gaugeOptions } from './charts';
import type { MoneyModel } from '../model';

/**
 * What the platform actually keeps, against the house rate in Settings.
 *
 * The ring is the rate the book achieved; the tick under it names the house
 * rate. The two differ LEGITIMATELY here — a client or a haulier with a
 * negotiated deal is billed at their own rate, and a fixed per-container fee
 * lands wherever the container count puts it. So the gap is information, not
 * an error: it says how much of the book runs off the house rate.
 */
export function CommissionCard({ money, className }: { money: MoneyModel; className?: string }) {
  const effective = money.takeRate;
  const configured = money.configuredTakeRate;

  const options = useMemo(
    () =>
      gaugeOptions({
        label: 'of billing',
        color:
          effective === null
            ? CHART_INK.grey
            : configured > 0 && effective < configured * 0.9
              ? CHART_INK.orange
              : CHART_INK.teal,
        formatter: () => (effective !== null ? pct(effective, 1) : '—'),
      }),
    [effective, configured],
  );

  const series = useMemo(() => [Math.max(0, Math.min(100, (effective ?? 0) * 100))], [effective]);

  const shortfall = effective !== null && configured > 0 ? effective - configured : null;

  return (
    <ConsolePanel
      className={className}
      title="Commission"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="h-[168px] w-[168px] shrink-0">
          <ApexChart type="radialBar" series={series} options={options} height={168} />
        </div>

        <div className="grid min-w-[11rem] flex-1 gap-2.5">
          <StatBox
            label="Commission earned"
            value={compactDjf(money.commissionDjf)}
            note={`on ${compactDjf(money.billedDjf)} billed`}
          />
          <StatBox
            label="House rate"
            value={configured > 0 ? pct(configured, 1) : 'not set'}
            note={
              shortfall === null
                ? 'nothing billed yet'
                : shortfall < 0
                  ? `${pct(Math.abs(shortfall), 1)} under`
                  : `${pct(shortfall, 1)} over`
            }
          />
        </div>
      </div>

      {money.unpricedCount > 0 ? (
        <InsightNote tone="attention" className="mt-3">
          <span className="font-bold text-foreground">
            {money.unpricedCount} {money.unpricedCount === 1 ? 'shipment' : 'shipments'} unpriced
          </span>{' '}
          — no commission can be worked out until somebody sets a price.
        </InsightNote>
      ) : (
        <InsightNote className="mt-3">Every shipment is priced.</InsightNote>
      )}
    </ConsolePanel>
  );
}
