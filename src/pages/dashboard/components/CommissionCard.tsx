import { useMemo } from 'react';

import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { compactDjf, fmtDjf, pct } from '@/lib/finance';
import {
  ConsolePanel,
  InsightNote,
  StatBox,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { CHART_INK, gaugeOptions } from './charts';
import type { MoneyModel } from '../model';

/**
 * What the platform actually keeps, against what Settings says it should.
 *
 * Fleetin's cut is taken off the transporter's price list, so the configured
 * percentage is a promise the book either keeps or does not. The ring shows
 * the rate the book actually achieved; the tick under it names the configured
 * rate, and the note says which way the gap runs. An effective rate below the
 * configured one is not a rounding artefact — it means shipments were priced
 * off-list, or paid out at more than the list allowed.
 */
export function CommissionCard({ money, className }: { money: MoneyModel; className?: string }) {
  const effective = money.marginPct;
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
      subtitle="Share of billing kept after transport cost"
    >
      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <div className="h-[168px] w-[168px] shrink-0">
          <ApexChart type="radialBar" series={series} options={options} height={168} />
        </div>

        <div className="grid min-w-[11rem] flex-1 gap-2.5">
          <StatBox
            label="Commission earned"
            value={money.grossDjf !== null ? compactDjf(money.grossDjf) : '—'}
            note={`on ${compactDjf(money.revenueDjf)} billed`}
          />
          <StatBox
            label="Configured rate"
            value={configured > 0 ? pct(configured, 1) : 'not set'}
            note={
              shortfall === null
                ? 'no priced shipments'
                : shortfall < 0
                  ? `${pct(Math.abs(shortfall), 1)} under`
                  : `${pct(shortfall, 1)} over`
            }
            tone={shortfall !== null && shortfall < -0.005 ? 'attention' : 'neutral'}
          />
        </div>
      </div>

      {money.unpricedCount > 0 ? (
        <InsightNote tone="attention" className="mt-3">
          <span className="font-bold text-foreground">
            {money.unpricedCount} {money.unpricedCount === 1 ? 'shipment' : 'shipments'} unpriced
          </span>{' '}
          — {fmtDjf(money.unpricedCostDjf)} transport cost outside this rate.
        </InsightNote>
      ) : (
        <InsightNote className="mt-3">Every shipment is priced.</InsightNote>
      )}
    </ConsolePanel>
  );
}
