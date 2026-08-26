import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CalendarDays,
  FileText,
  Landmark,
  Receipt,
  Users,
} from '@/design-system/icons';
import { compactDjf, fmtDjf } from '@/lib/finance';
import { useHrDashboard } from '@/features/hr/api/queries';
import {
  ActionButton,
  EmptyState,
  ListRow,
  PageHead,
  Panel,
  Pill,
  StatCard,
} from '@/pages/finance/components/kit';
import { cn } from '@/utils';

import { LoadError } from './components/form';
import { expiryLabel, expiryTone, frDate, monthLabel, PERIOD_LABEL, PERIOD_TONE } from './hrFormat';

/**
 * The workbook's Dashboard sheet, plus the one thing it never had: what is
 * about to expire.
 *
 * Every figure is read from the last calculated period, not recomputed here —
 * the dashboard and the filing must agree, and a second implementation of the
 * arithmetic is the surest way to make them disagree.
 */
export function HrDashboardPage() {
  const navigate = useNavigate();
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30);
  const { data, isLoading, error } = useHrDashboard();

  const period = data?.period;
  const payroll = data?.payroll;
  const uncalculated = period !== null && period !== undefined && !period.calculated;

  const expiringItems = (data?.expiring.items ?? []).filter((item) => item.daysUntil <= horizon);

  /* Every payroll figure on this page was read off one period, so each tile
     opens that period rather than the list of all of them. */
  const openPeriod = period
    ? () => navigate(buildPath(ROUTES.hrPayrollPeriod, { periodId: period.id }))
    : undefined;

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHead
        title="HR & Payroll"
        subtitle={
          period
            ? `${monthLabel(period.month, period.year)} — ${PERIOD_LABEL[period.status].toLowerCase()}`
            : 'No pay period opened yet'
        }
        badge={period ? <Pill tone={PERIOD_TONE[period.status]}>{PERIOD_LABEL[period.status]}</Pill> : null}
        actions={
          <>
            <Link to={ROUTES.hrDocuments}>
              <ActionButton icon={FileText}>Documents</ActionButton>
            </Link>
            <Link to={ROUTES.hrPayroll}>
              <ActionButton icon={Receipt} variant="primary">
                Payroll
              </ActionButton>
            </Link>
          </>
        }
      />

      {error ? (
        <div className="overflow-hidden rounded-card border border-border bg-card shadow-card pt-5">
          <LoadError error={error} noun="the HR dashboard" />
        </div>
      ) : null}

      {uncalculated ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-warning-subtle bg-warning-subtle px-4 py-3">
          <AlertTriangle aria-hidden className="size-4 shrink-0 text-warning-subtle-foreground" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-warning-subtle-foreground">
            {monthLabel(period.month, period.year)} is not calculated yet.
          </p>
          <Link to={buildPath(ROUTES.hrPayrollPeriod, { periodId: period.id })}>
            <ActionButton icon={ArrowRight}>Open period</ActionButton>
          </Link>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Users}
          label="Headcount"
          value={isLoading ? '—' : String(data?.headcount ?? 0)}
          hint={`${data?.byDepartment.length ?? 0} departments`}
          fill="teal"
          onClick={() => navigate(ROUTES.hrEmployees)}
        />
        <StatCard
          icon={Banknote}
          label="Gross payroll"
          onClick={openPeriod}
          value={payroll ? compactDjf(payroll.totalGross) : '—'}
          hint={payroll ? `${payroll.lines} payroll lines` : 'Not calculated'}
        />
        <StatCard
          icon={Landmark}
          label="CNSS 21.7%"
          onClick={openPeriod}
          value={payroll ? compactDjf(payroll.totalCnss) : '—'}
          hint={payroll ? `Employer ${compactDjf(payroll.employerContribution)}` : undefined}
        />
        <StatCard
          icon={Receipt}
          label="Net for transfer"
          onClick={openPeriod}
          value={payroll ? compactDjf(payroll.totalNet) : '—'}
          hint={payroll ? `ITS ${compactDjf(payroll.totalIts)}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel
          title="Expiring Soon"
          subtitle="Documents, CDD ends and trial periods"
          action={
            <div
              role="tablist"
              className="inline-flex gap-1 rounded-full bg-surface-sunken p-1"
              aria-label="Expiry horizon"
            >
              {([30, 60, 90] as const).map((option) => (
                <button
                  key={option}
                  type="button"
                  role="tab"
                  aria-selected={horizon === option}
                  onClick={() => setHorizon(option)}
                  className={cn(
                    'rounded-full px-3 py-1 text-xs font-bold transition-colors',
                    horizon === option
                      ? 'bg-card text-foreground shadow-card'
                      : 'text-muted-foreground hover:text-foreground',
                  )}
                >
                  {option} d
                </button>
              ))}
            </div>
          }
          padded={false}
        >
          {expiringItems.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState message={`No expiries in the next ${horizon} days.`} />
            </div>
          ) : (
            <ul className="divide-y divide-border">
              {expiringItems.slice(0, 10).map((item) => (
                <li key={`${item.kind}-${item.id}`}>
                  <Link
                    to={buildPath(ROUTES.hrEmployeeDetail, { id: item.employeeId })}
                    className="block hover:bg-surface-sunken"
                  >
                    <ListRow
                      name={item.employeeName}
                      sub={`${item.label} · ${frDate(item.expiresOn)}`}
                      right={<Pill tone={expiryTone(item.daysUntil)}>{expiryLabel(item.daysUntil)}</Pill>}
                    />
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <div className="space-y-4">
          <Panel title="Leave" subtitle="Pending requests and planned days">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Pending
                </dt>
                <dd className="mt-1 text-2xl font-extrabold text-foreground">
                  {data?.leave.pendingRequests ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Planned days
                </dt>
                <dd className="mt-1 text-2xl font-extrabold text-foreground">
                  {(data?.leave.plannedDays ?? 0).toFixed(0)}
                </dd>
              </div>
            </dl>
            <Link to={ROUTES.hrLeave} className="mt-4 inline-block">
              <ActionButton icon={CalendarDays}>Open planning grid</ActionButton>
            </Link>
          </Panel>

          <Panel title="Headcount by Department" subtitle="Active employees only">
            {(data?.byDepartment ?? []).length === 0 ? (
              <EmptyState message="No departments yet." />
            ) : (
              <ul className="space-y-1">
                {data?.byDepartment.map((row) => (
                  <li key={row.department}>
                    <Link
                      to={ROUTES.hrEmployees}
                      className="flex items-center justify-between gap-3 rounded-card-nested px-2 py-1.5 transition-colors hover:bg-surface-sunken"
                    >
                      <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                        {row.department}
                      </span>
                      <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
                        {row.count}
                      </span>
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Payroll Detail" subtitle="Last calculated period, as filed">
        {payroll && payroll.lines > 0 ? (
          <dl className="grid gap-x-6 gap-y-4 sm:grid-cols-3 lg:grid-cols-5">
            {[
              ['Gross', payroll.totalGross],
              ['Overtime', payroll.totalOvertime],
              ['Absence', payroll.totalAbsence],
              ['CNSS total', payroll.totalCnss],
              ['ITS', payroll.totalIts],
            ].map(([label, value]) => (
              <div key={label as string}>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  {label}
                </dt>
                <dd className="mt-1 text-base font-extrabold tabular-nums text-foreground">
                  {fmtDjf(value as number)}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <EmptyState message="No calculated pay period yet." />
        )}
      </Panel>
    </div>
  );
}

export default HrDashboardPage;
