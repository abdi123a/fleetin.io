import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { pct } from '@/lib/finance';
import {
  ConsolePanel,
  InsightNote,
  Legend,
  PanelLink,
  SectionLabel,
  StatusChip,
} from '@/pages/transporter-portal/components/dashboard/console/kit';

import { buildTooltipHtml, CHART_INK, donutOptions } from './charts';
import type { FleetModel } from '../model';

/**
 * What the fleet is doing, and which papers are about to ground it.
 *
 * The donut answers capacity — how much of the network is actually available
 * to dispatch — and the list under it answers legality, which is the harder
 * constraint: a truck with expired insurance counts as available and cannot
 * legally roll. Anything already expired wears red, because that rule is
 * broken now rather than soon.
 */
export function FleetCard({ fleet, className }: { fleet: FleetModel; className?: string }) {
  const slices = useMemo(
    () =>
      [
        { label: 'Available', value: fleet.vehiclesAvailable, color: CHART_INK.teal },
        { label: 'In transit', value: fleet.vehiclesMoving, color: CHART_INK.tealLight },
        { label: 'Unavailable', value: fleet.vehiclesDown, color: CHART_INK.orange },
      ].filter((slice) => slice.value > 0),
    [fleet],
  );

  const options = useMemo(
    () =>
      donutOptions({
        labels: slices.map((slice) => slice.label),
        colors: slices.map((slice) => slice.color),
        centreLabel: 'vehicles',
        centreValue: String(fleet.vehicles),
        tooltip: {
          custom: ({ seriesIndex }) => {
            const slice = slices[seriesIndex];
            if (!slice) return '';
            return buildTooltipHtml(
              slice.label,
              [{ key: 'v', label: 'Vehicles', value: String(slice.value), color: slice.color }],
              fleet.vehicles > 0 ? `${pct(slice.value / fleet.vehicles)} of the fleet` : undefined,
            );
          },
        },
      }),
    [slices, fleet.vehicles],
  );

  const series = useMemo(() => slices.map((slice) => slice.value), [slices]);

  return (
    <ConsolePanel
      className={className}
      title="Fleet Compliance"
      subtitle={`${fleet.vehicles} vehicles · ${fleet.drivers} drivers`}
      action={
        <Link to={ROUTES.vehicles}>
          <PanelLink>Fleet</PanelLink>
        </Link>
      }
      footer={
        <InsightNote tone={fleet.expired > 0 || fleet.expiring > 0 ? 'attention' : 'neutral'}>
          {fleet.expired > 0 ? (
            <>
              <span className="font-bold text-foreground">
                {fleet.expired} {fleet.expired === 1 ? 'document' : 'documents'} expired
              </span>{' '}
              — those vehicles and drivers are not compliant.
            </>
          ) : fleet.expiring > 0 ? (
            <>
              <span className="font-bold text-foreground">
                {fleet.expiring} {fleet.expiring === 1 ? 'document expires' : 'documents expire'} within 30 days
              </span>
              .
            </>
          ) : (
            <>
              <span className="font-bold text-foreground">Every vehicle and driver is compliant.</span> No document
              expires within 30 days.
            </>
          )}
        </InsightNote>
      }
    >
      {fleet.vehicles === 0 ? (
        <p className="py-10 text-center text-sm font-semibold text-muted-foreground">
          No vehicles yet.
        </p>
      ) : (
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <div className="h-[176px] w-[176px] shrink-0">
            <ApexChart type="donut" series={series} options={options} height={176} />
          </div>
          <div className="min-w-[10rem] flex-1">
            <Legend
              items={slices.map((slice) => ({ label: `${slice.label} ${slice.value}`, color: slice.color }))}
              className="flex-col !items-start gap-y-2"
            />
            <p className="type-body-xs mt-3 text-muted-foreground">
              {fleet.driversAvailable} of {fleet.drivers} drivers available.
            </p>
          </div>
        </div>
      )}

      <div className="mt-4 border-t border-border-subtle pt-3.5">
        <SectionLabel>Documents expiring</SectionLabel>
        {fleet.rows.length === 0 ? (
          <p className="type-body-xs mt-2 text-muted-foreground">
            No document expires within 30 days.
          </p>
        ) : (
          <div className="mt-2 flex flex-col gap-1">
            {fleet.rows.slice(0, 4).map((row) => (
              <div
                key={row.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-1 rounded-card-nested px-2.5 py-2 hover:bg-surface-sunken"
              >
                <span className="min-w-[8rem] flex-1">
                  <span className="block truncate text-xs font-bold text-foreground">
                    {row.subject}
                    <span className="ml-1.5 font-semibold text-muted-foreground">{row.paper}</span>
                  </span>
                  <span className="type-body-xs mt-0.5 block truncate text-muted-foreground">{row.owner}</span>
                </span>
                <StatusChip tone={row.daysLeft < 0 ? 'critical' : 'attention'}>
                  {row.daysLeft < 0
                    ? `${Math.abs(row.daysLeft)} days overdue`
                    : row.daysLeft === 0
                      ? 'Expires today'
                      : `${row.daysLeft} days left`}
                </StatusChip>
              </div>
            ))}
          </div>
        )}
      </div>
    </ConsolePanel>
  );
}
