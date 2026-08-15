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
        centreLabel: 'still out',
        centreValue: String(returns.stillOut),
        tooltip: {
          custom: ({ seriesIndex }) => {
            const bucket = buckets[seriesIndex];
            if (!bucket) return '';
            const share = returns.stillOut > 0 ? bucket.count / returns.stillOut : 0;
            return buildTooltipHtml(
              bucket.label,
              [{ key: 'count', label: 'Containers', value: String(bucket.count), color: bucket.color }],
              `${pct(share)} of everything still out`,
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
      title="Containers going back"
      subtitle={`${returns.chains} chains running · ${returns.matchable} empties cleared for matching`}
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
                {returns.kpis.overdue} {returns.kpis.overdue === 1 ? 'box is' : 'boxes are'} past the line&rsquo;s
                deadline
              </span>{' '}
              and demurrage is accruing on {returns.kpis.overdue === 1 ? 'it' : 'them'} right now.
              {returns.sameDepotPairs > 0
                ? ` ${returns.sameDepotPairs} same-depot pairings are available to shorten the next cycle.`
                : ''}
            </>
          ) : returns.kpis.critical > 0 ? (
            <>
              <span className="font-bold text-foreground">
                {returns.kpis.critical} {returns.kpis.critical === 1 ? 'box has' : 'boxes have'} under six hours of
                margin left
              </span>{' '}
              — they need a truck assigned before the window closes.
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">Every outstanding box is inside its deadline.</span>{' '}
              {returns.noDeadline > 0
                ? `${returns.noDeadline} of them carry no deadline at all, so that verdict does not cover them.`
                : 'Every one of them has a deadline recorded against it.'}
            </>
          )}
        </InsightNote>
      }
    >
      {returns.stillOut === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">
          No container is currently outstanding.
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
                  <SectionLabel>Returned inside the deadline</SectionLabel>
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
              <SectionLabel>Worst clocks right now</SectionLabel>
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
