import { useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { TablePager, usePagedRows } from '@/components';
import { ROUTES } from '@/config/routes';
import {
  ArrowLeft,
  Calculator,
  CheckCircle2,
  Clock,
  FileSpreadsheet,
  Info,
  Lock,
  Wallet,
} from '@/design-system/icons';
import { compactDjf } from '@/lib/finance';
import {
  useApprovePayroll,
  useCalculatePayroll,
  useMarkPayrollPaid,
  usePayrollPeriod,
  useSetOvertime,
} from '@/features/hr/api/queries';
import {
  ActionButton,
  DataTable,
  EmptyState,
  PageHead,
  Panel,
  Pill,
  StatCard,
  Td,
  Th,
} from '@/pages/finance/components/kit';
import { cn } from '@/utils';

import { money2, monthLabelFr, PERIOD_LABEL, PERIOD_TONE } from './hrFormat';

/**
 * One payroll run.
 *
 * The four buttons across the top are the whole lifecycle, and each one is
 * available in exactly one state. Once approved, the inputs go read-only and
 * stay that way — a correction is a new adjustment period, not an edit to a
 * filed one.
 */
export function HrPayrollPeriodPage() {
  const { periodId } = useParams<{ periodId: string }>();
  const { data: period, isLoading } = usePayrollPeriod(periodId);

  const calculate = useCalculatePayroll();
  const approve = useApprovePayroll();
  const markPaid = useMarkPayrollPaid();
  const setOvertime = useSetOvertime();

  const [tab, setTab] = useState<'lines' | 'inputs'>('lines');

  const locked = period?.status === 'APPROVED' || period?.status === 'PAID';
  const totals = period?.totals;

  const overtimeByEmployee = useMemo(
    () => new Map((period?.overtime ?? []).map((entry) => [entry.employeeId, entry])),
    [period],
  );

  /**
   * One page of payslips at a time. The totals row stays on every page and
   * names its own scope — "Total — N salariés" is the period, not the page.
   */
  const [linesPageSize, setLinesPageSize] = useState(25);
  const pagedLines = usePagedRows(period?.lines ?? [], { pageSize: linesPageSize });

  const error =
    (calculate.error as Error | null) ??
    (approve.error as Error | null) ??
    (markPaid.error as Error | null) ??
    (setOvertime.error as Error | null);

  if (isLoading || !period) {
    return (
      <div className="space-y-6">
        <PageHead title="Payroll period" subtitle="Loading…" />
        <Panel title="Lines">
          <EmptyState message="Loading the run…" />
        </Panel>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHead
        title={monthLabelFr(period.month, period.year)}
        subtitle={period.config.label}
        badge={<Pill tone={PERIOD_TONE[period.status]}>{PERIOD_LABEL[period.status]}</Pill>}
        actions={
          <>
            <Link to={ROUTES.hrPayroll}>
              <ActionButton icon={ArrowLeft}>All periods</ActionButton>
            </Link>
            {period.status === 'DRAFT' || period.status === 'CALCULATED' ? (
              <ActionButton
                icon={Calculator}
                variant="primary"
                onClick={() => calculate.mutate(period.id)}
              >
                {calculate.isPending ? 'Calculating…' : 'Calculate'}
              </ActionButton>
            ) : null}
            {period.status === 'CALCULATED' ? (
              <ActionButton
                icon={CheckCircle2}
                variant="primary"
                onClick={() => approve.mutate(period.id)}
              >
                {approve.isPending ? 'Approving…' : 'Approve'}
              </ActionButton>
            ) : null}
            {period.status === 'APPROVED' ? (
              <ActionButton
                icon={Wallet}
                variant="primary"
                onClick={() => markPaid.mutate(period.id)}
              >
                {markPaid.isPending ? 'Recording…' : 'Mark paid'}
              </ActionButton>
            ) : null}
          </>
        }
      />

      {error ? (
        <div className="flex items-start gap-3 rounded-card border border-destructive-subtle bg-destructive-subtle px-4 py-3">
          <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-destructive-subtle-foreground" />
          <p className="text-sm font-semibold text-destructive-subtle-foreground">{error.message}</p>
        </div>
      ) : null}

      {locked ? (
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface-sunken px-4 py-3">
          <Lock aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm font-semibold text-muted-foreground">
            This period is {PERIOD_LABEL[period.status].toLowerCase()} and cannot be changed.
            Post any correction as a new adjustment period.
          </p>
        </div>
      ) : null}

      {totals && totals.headcount > 0 ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <StatCard
            icon={Wallet}
            label="Gross"
            value={compactDjf(totals.currentGross)}
            hint={`${totals.headcount} employees`}
            fill="teal"
          />
          <StatCard
            icon={FileSpreadsheet}
            label="CNSS 21.7%"
            value={compactDjf(totals.totalCnss)}
            hint={`Employer ${compactDjf(totals.employerContribution)}`}
          />
          <StatCard icon={Calculator} label="ITS" value={compactDjf(totals.its)} />
          <StatCard
            icon={Clock}
            label="Net payable"
            value={compactDjf(totals.netSalary)}
            hint={totals.overtimeAmount > 0 ? `Overtime ${compactDjf(totals.overtimeAmount)}` : undefined}
          />
        </div>
      ) : null}

      <div className="flex gap-1 rounded-full bg-surface-sunken p-1 w-fit" role="tablist">
        {(
          [
            ['lines', `Payroll lines${totals?.headcount ? ` (${totals.headcount})` : ''}`],
            ['inputs', 'Overtime & absence'],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            role="tab"
            aria-selected={tab === key}
            onClick={() => setTab(key)}
            className={cn(
              'rounded-full px-4 py-1.5 text-xs font-bold transition-colors',
              tab === key
                ? 'bg-card text-foreground shadow-card'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {tab === 'lines' ? (
        <Panel
          title="Payroll lines"
          subtitle="Snapshots written at calculation. Never recomputed from today's records."
          padded={false}
        >
          {period.lines.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState message="Not calculated yet. Enter any overtime first, then calculate." />
            </div>
          ) : (
            <DataTable minWidth={1560}>
              <thead>
                <tr>
                  <Th>Matricule</Th>
                  <Th>Employee</Th>
                  <Th>Profession</Th>
                  <Th align="right">Base</Th>
                  <Th align="right">Overtime</Th>
                  <Th align="right">Absence</Th>
                  <Th align="right">Gross</Th>
                  <Th align="right">Sen.</Th>
                  <Th align="right">Capped</Th>
                  <Th align="right">Retraite 4%</Th>
                  <Th align="right">AMU 2%</Th>
                  <Th align="right">Patronale 15.7%</Th>
                  <Th align="right">CNSS 21.7%</Th>
                  <Th align="right">Taxable</Th>
                  <Th align="right">ITS</Th>
                  <Th align="right">Net</Th>
                </tr>
              </thead>
              <tbody>
                {pagedLines.rows.map((line) => (
                  <tr key={line.id} className="hover:bg-surface-sunken">
                    <Td>
                      <span className="font-mono text-xs font-bold">{line.matricule}</span>
                    </Td>
                    <Td>
                      <span className="font-bold text-foreground">{line.employeeName}</span>
                    </Td>
                    <Td>
                      <span className="text-muted-foreground">{line.profession}</span>
                    </Td>
                    <Td align="right"><span className="tabular-nums">{money2(line.baseSalary)}</span></Td>
                    <Td align="right">
                      <span className={cn('tabular-nums', line.overtimeAmount === 0 && 'text-muted-foreground')}>
                        {line.overtimeAmount === 0 ? '—' : money2(line.overtimeAmount)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className={cn('tabular-nums', line.absenceDeduction === 0 && 'text-muted-foreground')}>
                        {line.absenceDeduction === 0 ? '—' : money2(line.absenceDeduction)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="font-bold tabular-nums">{money2(line.currentGross)}</span>
                    </Td>
                    <Td align="right">
                      {/* Computed and displayed, never added to the gross —
                          unless the rate set says otherwise. */}
                      <span className="tabular-nums text-muted-foreground">
                        {(line.seniorityRate * 100).toFixed(0)}%
                      </span>
                    </Td>
                    <Td align="right"><span className="tabular-nums">{money2(line.cappedSalary)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(line.retirementEmployee)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(line.amuEmployee)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(line.employerContribution)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(line.totalCnss)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(line.taxableWages)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(line.its)}</span></Td>
                    <Td align="right">
                      <span className="font-bold tabular-nums">{money2(line.netSalary)}</span>
                    </Td>
                  </tr>
                ))}
                {totals ? (
                  <tr className="bg-surface-sunken font-bold">
                    <Td colSpan={3}>Total — {totals.headcount} salariés</Td>
                    <Td align="right"><span className="tabular-nums">—</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(totals.overtimeAmount)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(totals.absenceDeduction)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(totals.currentGross)}</span></Td>
                    <Td align="right" />
                    <Td align="right"><span className="tabular-nums">{money2(totals.cappedSalary)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(totals.retirementEmployee)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(totals.amuEmployee)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(totals.employerContribution)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(totals.totalCnss)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(totals.taxableWages)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(totals.its)}</span></Td>
                    <Td align="right"><span className="tabular-nums">{money2(totals.netSalary)}</span></Td>
                  </tr>
                ) : null}
              </tbody>
            </DataTable>
          )}
          {period.lines.length > 0 ? (
            <TablePager
              paged={pagedLines}
              noun="payslips"
              pageSize={linesPageSize}
              onPageSizeChange={setLinesPageSize}
              className="px-5 pb-4"
            />
          ) : null}
        </Panel>
      ) : (
        <OvertimePanel
          period={period}
          locked={Boolean(locked)}
          overtimeByEmployee={overtimeByEmployee}
          onSave={(employeeId, values) =>
            setOvertime.mutate({ periodId: period.id, payload: { employeeId, ...values } })
          }
          saving={setOvertime.isPending}
        />
      )}
    </div>
  );
}

/**
 * Overtime and absence, one row per employee.
 *
 * Rows are keyed by employee id — the whole point of the rewrite. The source
 * workbook joined this column to the payroll sheet by row position and slid
 * by one, paying employee 1's overtime to employee 2 and handing employee 10
 * the column total for hours they never worked.
 */
function OvertimePanel({
  period,
  locked,
  overtimeByEmployee,
  onSave,
  saving,
}: {
  period: NonNullable<ReturnType<typeof usePayrollPeriod>['data']>;
  locked: boolean;
  overtimeByEmployee: Map<string, { hours125: number; hours150: number; absenceDeduction: number }>;
  onSave: (
    employeeId: string,
    values: { overtimeHours?: number; absenceDeduction?: number },
  ) => void;
  saving: boolean;
}) {
  /* The employee list comes from the calculated lines when they exist, and
     from the overtime entries otherwise — a DRAFT period has no lines yet. */
  const rows =
    period.lines.length > 0
      ? period.lines.map((line) => ({
          employeeId: line.employeeId,
          matricule: line.matricule,
          fullName: line.employeeName,
        }))
      : period.overtime.map((entry) => ({
          employeeId: entry.employeeId,
          matricule: entry.employee?.matricule ?? '—',
          fullName: entry.employee?.fullName ?? entry.employeeId,
        }));

  const [pageSize, setPageSize] = useState(25);
  const paged = usePagedRows(rows, { pageSize });

  return (
    <Panel
      title="Overtime & absence"
      subtitle="Keyed to the employee, never to a row position. First 6 h at 125%, the rest at 150%."
      padded={false}
    >
      {rows.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState message="Calculate the period once to list its employees here." />
        </div>
      ) : (
        <DataTable minWidth={840}>
          <thead>
            <tr>
              <Th>Matricule</Th>
              <Th>Employee</Th>
              <Th align="right">Overtime hours</Th>
              <Th align="right">Absence (DJF)</Th>
              <Th />
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((row) => {
              const entry = overtimeByEmployee.get(row.employeeId);
              const hours = entry ? entry.hours125 + entry.hours150 : 0;
              return (
                <OvertimeRow
                  key={row.employeeId}
                  matricule={row.matricule}
                  fullName={row.fullName}
                  hours={hours}
                  absence={entry?.absenceDeduction ?? 0}
                  locked={locked}
                  saving={saving}
                  onSave={(values) => onSave(row.employeeId, values)}
                />
              );
            })}
          </tbody>
        </DataTable>
      )}
      {rows.length > 0 ? (
        <TablePager
          paged={paged}
          noun="employees"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          className="px-5 pb-4"
        />
      ) : null}
    </Panel>
  );
}

function OvertimeRow({
  matricule,
  fullName,
  hours,
  absence,
  locked,
  saving,
  onSave,
}: {
  matricule: string;
  fullName: string;
  hours: number;
  absence: number;
  locked: boolean;
  saving: boolean;
  onSave: (values: { overtimeHours?: number; absenceDeduction?: number }) => void;
}) {
  const [draftHours, setDraftHours] = useState(String(hours));
  const [draftAbsence, setDraftAbsence] = useState(String(absence));

  const dirty = Number(draftHours) !== hours || Number(draftAbsence) !== absence;

  return (
    <tr className="hover:bg-surface-sunken">
      <Td>
        <span className="font-mono text-xs font-bold">{matricule}</span>
      </Td>
      <Td>
        <span className="font-bold text-foreground">{fullName}</span>
      </Td>
      <Td align="right">
        <input
          type="number"
          min={0}
          step="0.5"
          value={draftHours}
          disabled={locked}
          onChange={(event) => setDraftHours(event.target.value)}
          className="h-8 w-24 rounded-lg border border-border bg-card px-2 text-right text-xs font-semibold tabular-nums text-foreground disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Td>
      <Td align="right">
        <input
          type="number"
          min={0}
          step="1"
          value={draftAbsence}
          disabled={locked}
          onChange={(event) => setDraftAbsence(event.target.value)}
          className="h-8 w-32 rounded-lg border border-border bg-card px-2 text-right text-xs font-semibold tabular-nums text-foreground disabled:opacity-45 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        />
      </Td>
      <Td align="right">
        {locked ? null : (
          <ActionButton
            disabled={!dirty || saving}
            onClick={() =>
              onSave({
                overtimeHours: Number(draftHours) || 0,
                absenceDeduction: Number(draftAbsence) || 0,
              })
            }
          >
            Save
          </ActionButton>
        )}
      </Td>
    </tr>
  );
}

export default HrPayrollPeriodPage;
