import { useState } from 'react';
import { Link } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import { CalendarDays, Plus } from '@/design-system/icons';
import { useCreatePayrollPeriod, usePayrollPeriods } from '@/features/hr/api/queries';
import {
  ActionButton,
  DataTable,
  EmptyState,
  PageHead,
  Panel,
  Pill,
  Td,
  Th,
} from '@/pages/finance/components/kit';

import { LoadError } from './components/form';
import { frDate, monthLabel, PERIOD_LABEL, PERIOD_TONE } from './hrFormat';

const MONTHS = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
];

/**
 * Every payroll period, newest first.
 *
 * A period carries the rate configuration it was calculated with, shown in
 * its own column: reopening an old period must show the rates it was filed
 * under, and the column is the reminder that it does.
 */
export function HrPayrollPage() {
  const now = new Date();
  const [month, setMonth] = useState(now.getUTCMonth() + 1);
  const [year, setYear] = useState(now.getUTCFullYear());

  const { data: periods = [], isLoading, error } = usePayrollPeriods();
  const createPeriod = useCreatePayrollPeriod();

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHead
        title="Payroll"
        subtitle="Approved periods are immutable"
        badge={<Pill tone="teal">{periods.length} pay periods</Pill>}
      />

      <Panel
        title="Open a Pay Period"
        subtitle="Rates come from the period end date"
      >
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-foreground">Month</span>
            <select
              value={month}
              onChange={(event) => setMonth(Number(event.target.value))}
              className="h-9 w-40 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              {MONTHS.map((label, index) => (
                <option key={label} value={index + 1}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1.5">
            <span className="text-xs font-bold text-foreground">Year</span>
            <input
              type="number"
              value={year}
              min={2000}
              max={2100}
              onChange={(event) => setYear(Number(event.target.value))}
              className="h-9 w-28 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold tabular-nums text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <ActionButton
            icon={Plus}
            variant="primary"
            onClick={() => createPeriod.mutate({ month, year })}
          >
            {createPeriod.isPending ? 'Opening…' : 'Open period'}
          </ActionButton>
          {createPeriod.isError ? (
            <p className="text-xs font-semibold text-destructive">
              {(createPeriod.error as Error).message}
            </p>
          ) : null}
        </div>
      </Panel>

      <Panel title="Pay Periods" subtitle="Newest first" padded={false}>
        {error ? (
          <LoadError error={error} noun="the pay periods" />
        ) : isLoading ? (
          <div className="px-5 pb-5">
            <EmptyState message="Loading…" />
          </div>
        ) : periods.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState message="No pay period yet." />
          </div>
        ) : (
          <DataTable className="w-0 min-w-full" minWidth={920}>
            <thead>
              <tr>
                <Th>Period</Th>
                <Th>Status</Th>
                <Th align="right">Employees</Th>
                <Th>Calculated</Th>
                <Th>Approved</Th>
                <Th>Rate set</Th>
                <Th />
              </tr>
            </thead>
            <tbody>
              {periods.map((period) => (
                <tr key={period.id} className="hover:bg-surface-sunken">
                  <Td>
                    <Link
                      to={buildPath(ROUTES.hrPayrollPeriod, { periodId: period.id })}
                      className="font-bold text-foreground hover:underline"
                    >
                      {monthLabel(period.month, period.year)}
                    </Link>
                  </Td>
                  <Td>
                    <Pill tone={PERIOD_TONE[period.status]}>{PERIOD_LABEL[period.status]}</Pill>
                  </Td>
                  <Td align="right">
                    <span className="tabular-nums">{period._count.lines || '—'}</span>
                  </Td>
                  <Td>{frDate(period.calculatedAt)}</Td>
                  <Td>{frDate(period.approvedAt)}</Td>
                  <Td>
                    <span className="text-xs font-semibold text-muted-foreground">
                      {period.config.label}
                    </span>
                  </Td>
                  <Td align="right">
                    <Link to={buildPath(ROUTES.hrPayrollPeriod, { periodId: period.id })}>
                      <ActionButton icon={CalendarDays}>Open</ActionButton>
                    </Link>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>
    </div>
  );
}

export default HrPayrollPage;
