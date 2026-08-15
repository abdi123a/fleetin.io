import { useState } from 'react';
import { Link } from 'react-router-dom';

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

import { expiryLabel, expiryTone, frDate, monthLabelFr, PERIOD_LABEL, PERIOD_TONE } from './hrFormat';

/**
 * The workbook's Dashboard sheet, plus the one thing it never had: what is
 * about to expire.
 *
 * Every figure is read from the last calculated period, not recomputed here —
 * the dashboard and the filing must agree, and a second implementation of the
 * arithmetic is the surest way to make them disagree.
 */
export function HrDashboardPage() {
  const [horizon, setHorizon] = useState<30 | 60 | 90>(30);
  const { data, isLoading } = useHrDashboard();

  const period = data?.period;
  const payroll = data?.payroll;
  const uncalculated = period !== null && period !== undefined && !period.calculated;

  const expiringItems = (data?.expiring.items ?? []).filter((item) => item.daysUntil <= horizon);

  return (
    <div className="space-y-6">
      <PageHead
        title="HR & Payroll"
        subtitle={
          period
            ? `${monthLabelFr(period.month, period.year)} — ${PERIOD_LABEL[period.status].toLowerCase()}`
            : 'No payroll period has been opened yet'
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

      {uncalculated ? (
        <div className="flex flex-wrap items-center gap-3 rounded-card border border-warning-subtle bg-warning-subtle px-4 py-3">
          <AlertTriangle aria-hidden className="size-4 shrink-0 text-warning-subtle-foreground" />
          <p className="min-w-0 flex-1 text-sm font-semibold text-warning-subtle-foreground">
            {monthLabelFr(period.month, period.year)} has not been calculated. The totals below
            are empty until it is.
          </p>
          <Link to={buildPath(ROUTES.hrPayrollPeriod, { periodId: period.id })}>
            <ActionButton icon={ArrowRight}>Open the run</ActionButton>
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
        />
        <StatCard
          icon={Banknote}
          label="Gross payroll"
          value={payroll ? compactDjf(payroll.totalGross) : '—'}
          hint={payroll ? `${payroll.lines} lines filed` : 'Not calculated'}
        />
        <StatCard
          icon={Landmark}
          label="CNSS 21.7%"
          value={payroll ? compactDjf(payroll.totalCnss) : '—'}
          hint={payroll ? `Employer ${compactDjf(payroll.employerContribution)}` : undefined}
        />
        <StatCard
          icon={Receipt}
          label="Net for transfer"
          value={payroll ? compactDjf(payroll.totalNet) : '—'}
          hint={payroll ? `ITS ${compactDjf(payroll.totalIts)}` : undefined}
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
        <Panel
          title="Expiring soon"
          subtitle="ID cards, licences, medical certificates, CDD ends and trial periods"
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
              <EmptyState message={`Nothing lapses in the next ${horizon} days.`} />
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
          <Panel title="Leave" subtitle="Pending requests and days already planned">
            <dl className="grid grid-cols-2 gap-4">
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Awaiting approval
                </dt>
                <dd className="mt-1 text-2xl font-extrabold text-foreground">
                  {data?.leave.pendingRequests ?? 0}
                </dd>
              </div>
              <div>
                <dt className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
                  Days planned
                </dt>
                <dd className="mt-1 text-2xl font-extrabold text-foreground">
                  {(data?.leave.plannedDays ?? 0).toFixed(0)}
                </dd>
              </div>
            </dl>
            <Link to={ROUTES.hrLeave} className="mt-4 inline-block">
              <ActionButton icon={CalendarDays}>Open the planning grid</ActionButton>
            </Link>
          </Panel>

          <Panel title="Headcount by department" subtitle="Active staff only">
            {(data?.byDepartment ?? []).length === 0 ? (
              <EmptyState message="No departments recorded." />
            ) : (
              <ul className="space-y-2">
                {data?.byDepartment.map((row) => (
                  <li key={row.department} className="flex items-center justify-between gap-3">
                    <span className="min-w-0 truncate text-sm font-semibold text-foreground">
                      {row.department}
                    </span>
                    <span className="shrink-0 text-sm font-bold tabular-nums text-muted-foreground">
                      {row.count}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </Panel>
        </div>
      </div>

      <Panel title="Payroll detail" subtitle="The last calculated period, as filed">
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
          <EmptyState message="Calculate a payroll period to see its totals here." />
        )}
      </Panel>
    </div>
  );
}

export default HrDashboardPage;
