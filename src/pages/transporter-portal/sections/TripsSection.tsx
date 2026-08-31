import { useMemo, useState } from 'react';
import { FileText, Search } from '@/design-system/icons';
import { Badge, Card, Input } from '@/design-system';
import { FilterMenu } from '@/components/common';
import { CardHeading } from '@/features/shipper-bi/charts';
import {
  CompanyLabel,
  TRIP_STATUSES,
  TRIP_STATUS_LABELS,
  formatCompact,
  formatKm,
  formatMoneyFull,
  inPeriod,
  type TripStatus,
} from '@/features/transporter-bi';
import type { TransporterSectionProps } from '../sectionContract';
import { TablePager, usePagedRows } from './cards/TablePager';

/**
 * Trips — searchable, filterable trip report for the current period.
 */
export function TripsSection({
  dataset,
  facts,
  period,
  onOpenDetail,
}: TransporterSectionProps) {
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<TripStatus | 'all'>('all');

  const periodFacts = useMemo(() => inPeriod(facts, period), [facts, period]);

  const routeById = useMemo(
    () => new Map(dataset.routes.map((route) => [route.id, route])),
    [dataset.routes],
  );
  const customerById = useMemo(
    () => new Map(dataset.customers.map((customer) => [customer.id, customer])),
    [dataset.customers],
  );

  const filteredRows = useMemo(() => {
    const term = query.trim().toLowerCase();
    return periodFacts.filter((fact) => {
      if (statusFilter !== 'all' && fact.status !== statusFilter) return false;
      if (!term) return true;
      const routeName = routeById.get(fact.routeId)?.name ?? '';
      const customerName = customerById.get(fact.customerId)?.name ?? '';
      return (
        fact.ref.toLowerCase().includes(term) ||
        routeName.toLowerCase().includes(term) ||
        customerName.toLowerCase().includes(term) ||
        TRIP_STATUS_LABELS[fact.status].toLowerCase().includes(term)
      );
    });
  }, [periodFacts, query, statusFilter, routeById, customerById]);

  // Any of the three narrowings means a different list, so paging restarts.
  const paged = usePagedRows(filteredRows, {
    resetKey: `${query}|${statusFilter}|${periodFacts.length}`,
  });
  const visible = paged.rows;

  const revenueTotal = filteredRows.reduce(
    (sum, row) => sum + (row.isCompleted ? row.totalRevenue : row.revenue),
    0,
  );

  return (
    <div className="flex flex-col gap-5">
      <Card variant="default" padding="lg" className="gap-5">
        <CardHeading
          title="Trip report"
          subtitle={`${formatCompact(periodFacts.length)} trips in period`}
          icon={<FileText className="size-4" />}
          actions={
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
              <div className="relative min-w-0 flex-1 sm:flex-none">
                <Search className="absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Search ref, route, customer…"
                  className="h-8 w-full pl-8 text-xs sm:w-64"
                />
              </div>
              <FilterMenu
                groups={[
                  {
                    key: 'status',
                    label: 'Status',
                    value: statusFilter,
                    onChange: (value) =>
                      setStatusFilter(value as TripStatus | 'all'),
                    options: [
                      { value: 'all', label: 'All statuses' },
                      ...TRIP_STATUSES.map((status) => ({
                        value: status,
                        label: TRIP_STATUS_LABELS[status],
                      })),
                    ],
                  },
                ]}
              />
            </div>
          }
        />

        <div className="overflow-x-auto">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                <th className="py-2 pr-4">Reference</th>
                <th className="py-2 pr-4">Route</th>
                <th className="py-2 pr-4">Customer</th>
                <th className="py-2 pr-4">Status</th>
                <th className="py-2 pr-4 text-right">Distance</th>
                <th className="py-2 pr-4 text-right">Revenue</th>
                <th className="py-2 text-right">On-time</th>
              </tr>
            </thead>
            <tbody>
              {visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="py-8 text-center text-sm text-muted-foreground">
                    No trips match the current search.
                  </td>
                </tr>
              ) : (
                visible.map((row) => (
                  <tr
                    key={row.tripId}
                    className="cursor-pointer border-b border-border/60 last:border-0 hover:bg-surface-sunken"
                    onClick={() => onOpenDetail({ kind: 'trip', tripId: row.tripId })}
                  >
                    <td className="py-2.5 pr-4 font-medium text-foreground">{row.ref}</td>
                    <td className="py-2.5 pr-4 text-muted-foreground">
                      {routeById.get(row.routeId)?.name ?? row.routeId}
                    </td>
                    <td className="py-2.5 pr-4">
                      <CompanyLabel
                        id={row.customerId}
                        name={customerById.get(row.customerId)?.name ?? row.customerId}
                      />
                    </td>
                    <td className="py-2.5 pr-4">
                      <Badge
                        variant="subtle"
                        intent={statusIntent(row.status)}
                        size="sm"
                      >
                        {TRIP_STATUS_LABELS[row.status]}
                      </Badge>
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-muted-foreground">
                      {formatKm(row.totalKm || row.distanceKm)}
                    </td>
                    <td className="py-2.5 pr-4 text-right tabular-nums text-foreground">
                      {formatMoneyFull(row.isCompleted ? row.totalRevenue : row.revenue)}
                    </td>
                    <td className="py-2.5 text-right">
                      {row.onTime === undefined ? (
                        <span className="text-muted-foreground">—</span>
                      ) : (
                        <Badge
                          variant="subtle"
                          intent={row.onTime ? 'success' : 'destructive'}
                          size="sm"
                        >
                          {row.onTime ? 'On time' : 'Late'}
                        </Badge>
                      )}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>

        <TablePager
          paged={paged}
          noun="trips"
          summary={`Revenue ${formatMoneyFull(revenueTotal)}`}
        />
      </Card>
    </div>
  );
}

function statusIntent(
  status: TripStatus,
): 'default' | 'primary' | 'success' | 'warning' | 'destructive' | 'info' {
  switch (status) {
    case 'completed':
      return 'success';
    case 'cancelled':
      return 'destructive';
    case 'enroute':
    case 'at_destination':
      return 'primary';
    case 'returning':
    case 'loading':
      return 'warning';
    default:
      return 'default';
  }
}

