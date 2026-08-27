import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { pct } from '@/lib/finance';
import { formatDateTime } from '@/stores/emptyReturn.store';
import {
  ConsolePanel,
  InsightNote,
  Legend,
  Meter,
  PanelLink,
  SectionLabel,
  StatusChip,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { buildTooltipHtml, donutOptions } from './charts';
import type { EmptyReturnsModel } from '../model';

/**
 * How much demurrage risk is sitting outside the gate right now.
 *
 * A donut, because this is a share of one population — every box still out is
 * in exactly one risk bucket — and because the number that matters most is the
 * total in the middle, not any individual slice. Red is permitted here and
 * almost nowhere else on the console: a box past its line deadline is
 * accruing money now, not at the end of a reporting period.
 */
export function EmptyReturnCard({
  returns,
  className,
}: {
  returns: EmptyReturnsModel;
  className?: string;
}) {
  const buckets = useMemo(() => returns.buckets.filter((bucket) => bucket.count > 0), [returns.buckets]);

  const options = useMemo(
    () =>
      donutOptions({
        labels: buckets.map((bucket) => bucket.label),
        colors: buckets.map((bucket) => bucket.color),
        centreLabel: 'outstanding',
        centreValue: String(returns.stillOut),
        tooltip: {
          custom: ({ seriesIndex }) => {
            const bucket = buckets[seriesIndex];
            if (!bucket) return '';
            const share = returns.stillOut > 0 ? bucket.count / returns.stillOut : 0;
            return buildTooltipHtml(
              bucket.label,
              [{ key: 'count', label: 'Containers', value: String(bucket.count), color: bucket.color }],
              `${pct(share)} of containers outstanding`,
            );
          },
        },
      }),
    [buckets, returns.stillOut],
  );

  const series = useMemo(() => buckets.map((bucket) => bucket.count), [buckets]);

  return (
    <ConsolePanel
      className={className}
      title="Empty Container"
      subtitle={`${returns.chains} chains running · ${returns.matchable} empties ready to match`}
      action={
        <Link to={ROUTES.emptyReturns}>
          <PanelLink>Empty returns</PanelLink>
        </Link>
      }
      footer={
        <InsightNote tone={returns.kpis.overdue > 0 || returns.kpis.critical > 0 ? 'attention' : 'neutral'}>
          {returns.kpis.overdue > 0 ? (
            <>
              <span className="font-bold text-foreground">
                {returns.kpis.overdue} {returns.kpis.overdue === 1 ? 'container' : 'containers'} overdue
              </span>{' '}
              — demurrage accruing.
              {returns.sameDepotPairs > 0 ? ` ${returns.sameDepotPairs} same-depot pairings available.` : ''}
            </>
          ) : returns.kpis.critical > 0 ? (
            <>
              <span className="font-bold text-foreground">
                {returns.kpis.critical} {returns.kpis.critical === 1 ? 'container' : 'containers'} critical
              </span>{' '}
              — under six hours of margin.
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">No container overdue.</span>{' '}
              {returns.noDeadline > 0
                ? `${returns.noDeadline} carry no deadline.`
                : 'All carry a deadline.'}
            </>
          )}
        </InsightNote>
      }
    >
      {returns.stillOut === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">
          No outstanding containers yet.
        </p>
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
            <div className="h-[188px] w-[188px] shrink-0">
              <ApexChart type="donut" series={series} options={options} height={188} />
            </div>

            <div className="min-w-[10rem] flex-1">
              <Legend
                items={returns.buckets.map((bucket) => ({
                  label: `${bucket.label} ${bucket.count}`,
                  color: bucket.color,
                }))}
                className="flex-col !items-start gap-y-2"
              />

              <div className="mt-4">
                <div className="flex items-baseline justify-between gap-3">
                  <SectionLabel>Returned within deadline</SectionLabel>
                  <span className="text-sm font-extrabold tabular-nums text-foreground">
                    {returns.onTimeRate !== null ? pct(returns.onTimeRate) : '—'}
                  </span>
                </div>
                <Meter
                  value={returns.onTimeRate ?? 0}
                  color={
                    returns.onTimeRate !== null && returns.onTimeRate < 0.8
                      ? 'var(--accent-bold)'
                      : 'var(--primary)'
                  }
                  className="mt-2"
                />
                <p className="type-body-xs mt-2 text-muted-foreground">
                  {returns.returnedOnTime} on time · {returns.returnedLate} late
                </p>
              </div>
            </div>
          </div>

          {returns.breached.length > 0 ? (
            <div className="mt-4 border-t border-border-subtle pt-3.5">
              <SectionLabel>Closest to deadline</SectionLabel>
              <div className="mt-2 flex flex-col gap-1">
                {returns.breached.slice(0, 3).map((record) => (
                  <Link
                    key={record.id}
                    to={ROUTES.emptyReturnsCycles}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card-nested px-2.5 py-2 transition-colors hover:bg-surface-sunken focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-[8rem] flex-1">
                      <span className="block truncate text-xs font-bold text-foreground">
                        {record.container || record.id}
                      </span>
                      <span className="type-body-xs mt-0.5 block truncate text-muted-foreground">
                        {record.transporter} · {record.locationName}
                      </span>
                    </span>
                    <StatusChip tone={record.deadline && record.deadline < Date.now() ? 'critical' : 'attention'}>
                      {formatDateTime(record.deadline)}
                    </StatusChip>
                  </Link>
                ))}
              </div>
            </div>
          ) : null}
        </>
      )}
    </ConsolePanel>
  );
}
