import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { TablePager, usePagedRows } from '@/components';
import { ROUTES, buildPath } from '@/config/routes';
import { CalendarDays, Check, Info, Plus, X } from '@/design-system/icons';
import type { LeaveRecord } from '@/features/hr/api/hrService';
import {
  useCancelLeave,
  useDecideLeave,
  useEmployees,
  useLeavePlanning,
  useLeaveRecords,
  useRequestLeave,
} from '@/features/hr/api/queries';
import {
  ActionButton,
  DataTable,
  EmptyState,
  FilterPills,
  PageHead,
  Panel,
  Pill,
  StatCard,
  Td,
  Th,
} from '@/pages/finance/components/kit';
import { cn } from '@/utils';

import { Field, FormError, ModalShell, inputClass } from './components/form';
import { LEAVE_TONE, frDate, shortMonthLabel } from './hrFormat';

const LEAVE_TYPES = ['ANNUAL', 'SICK', 'UNPAID', 'MATERNITY', 'OTHER'] as const;

type Tab = 'planning' | 'requests';

/**
 * Leave, in the two shapes the team actually uses it.
 *
 * The planning grid is the workbook's "Leav plan" sheet — one row per person,
 * one column per month — because that is the view the office already reads,
 * and replacing it with a list of records would be a downgrade dressed as a
 * migration. The request queue is the part the workbook never had.
 */
export function HrLeavePage() {
  const [tab, setTab] = useState<Tab>('planning');
  const [requesting, setRequesting] = useState(false);

  const { data: grid, isLoading } = useLeavePlanning(undefined, 12);
  const { data: pending = [] } = useLeaveRecords({ status: 'REQUESTED' });
  const { data: allRecords = [] } = useLeaveRecords();

  const plannedDays = useMemo(
    () =>
      (grid?.rows ?? []).reduce(
        (total, row) => total + row.cells.reduce((sum, cell) => sum + cell.days, 0),
        0,
      ),
    [grid],
  );

  const largestBalance = useMemo(
    () =>
      (grid?.rows ?? []).reduce(
        (highest, row) => (row.balance.balance > highest ? row.balance.balance : highest),
        0,
      ),
    [grid],
  );

  return (
    <div className="space-y-6">
      <PageHead
        title="Leave"
        subtitle="A rolling 13-month window. Accrual is continuous from the joining date."
        badge={<Pill tone={pending.length > 0 ? 'amber' : 'teal'}>{pending.length} awaiting</Pill>}
        actions={
          <ActionButton icon={Plus} variant="primary" onClick={() => setRequesting(true)}>
            Request leave
          </ActionButton>
        }
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        <StatCard
          icon={CalendarDays}
          label="Days in the window"
          value={plannedDays.toFixed(0)}
          hint={`${grid?.rows.length ?? 0} employees`}
          fill="teal"
        />
        <StatCard
          icon={Info}
          label="Awaiting approval"
          value={String(pending.length)}
          hint={pending.length > 0 ? 'Decide before the payroll run' : 'Nothing outstanding'}
          tone={pending.length > 0 ? 'attention' : 'plain'}
        />
        <StatCard
          icon={CalendarDays}
          label="Largest balance"
          value={`${largestBalance.toFixed(1)} d`}
          hint="No annual reset and no carry-over cap"
        />
      </div>

      {/*
        The uncapped accrual is the workbook's behaviour and is reproduced
        deliberately, so the balances agree with what the office already has.
        It is surfaced rather than silently fixed — capping it changes what
        staff are owed, and that is not a decision this screen gets to make.
      */}
      <div className="flex items-start gap-3 rounded-card border border-warning-subtle bg-warning-subtle px-4 py-3">
        <Info aria-hidden className="mt-0.5 size-4 shrink-0 text-warning-subtle-foreground" />
        <p className="text-sm font-semibold text-warning-subtle-foreground">
          Balances accrue at 30 days a year from the joining date with no annual reset and no cap,
          exactly as the spreadsheet did — which is why long-serving staff carry very large
          balances. Say the word and a carry-over cap goes into the rate configuration.
        </p>
      </div>

      <FilterPills<Tab>
        options={[
          { key: 'planning', label: 'Planning grid' },
          { key: 'requests', label: 'Requests', count: allRecords.length },
        ]}
        active={tab}
        onChange={setTab}
      />

      {tab === 'planning' ? (
        <Panel
          title="Leave planning"
          subtitle="Days taken per employee per month. Requested days are shown before approval."
          padded={false}
        >
          {isLoading ? (
            <div className="px-5 pb-5">
              <EmptyState message="Loading the grid…" />
            </div>
          ) : !grid || grid.rows.length === 0 ? (
            <div className="px-5 pb-5">
              <EmptyState message="No employees to plan for." />
            </div>
          ) : (
            <DataTable minWidth={260 + grid.months.length * 64 + 200}>
              <thead>
                <tr>
                  <Th>Employee</Th>
                  {grid.months.map((month) => (
                    <Th key={month.key} align="right">
                      {shortMonthLabel(month.key)}
                    </Th>
                  ))}
                  <Th align="right">Taken</Th>
                  <Th align="right">Balance</Th>
                </tr>
              </thead>
              <tbody>
                {grid.rows.map((row) => (
                  <tr key={row.employeeId} className="hover:bg-surface-sunken">
                    <Td>
                      <Link
                        to={buildPath(ROUTES.hrEmployeeDetail, { id: row.employeeId })}
                        className="font-bold text-foreground hover:underline"
                      >
                        {row.fullName}
                      </Link>
                      <span className="mt-0.5 block text-xs font-semibold text-muted-foreground">
                        {row.profession}
                      </span>
                    </Td>
                    {row.cells.map((cell) => (
                      <Td key={cell.key} align="right">
                        {cell.days === 0 ? (
                          <span className="text-muted-foreground/50">·</span>
                        ) : (
                          <span
                            className={cn(
                              'inline-flex min-w-7 justify-center rounded-md px-1.5 py-0.5 text-xs font-bold tabular-nums',
                              cell.status === 'REQUESTED'
                                ? 'border border-dashed border-warning/60 bg-warning-subtle text-warning-subtle-foreground'
                                : 'bg-primary-subtle text-primary-subtle-foreground',
                            )}
                            title={cell.status === 'REQUESTED' ? 'Requested, not approved' : 'Approved'}
                          >
                            {cell.days}
                          </span>
                        )}
                      </Td>
                    ))}
                    <Td align="right">
                      <span className="tabular-nums text-muted-foreground">
                        {row.balance.taken.toFixed(0)}
                      </span>
                    </Td>
                    <Td align="right">
                      <span className="font-bold tabular-nums">
                        {row.balance.balance.toFixed(1)}
                      </span>
                    </Td>
                  </tr>
                ))}
              </tbody>
            </DataTable>
          )}
        </Panel>
      ) : (
        <RequestsPanel records={allRecords} />
      )}

      <LeaveRequestModal open={requesting} onClose={() => setRequesting(false)} />
    </div>
  );
}

/** The queue: everything requested, and the two decisions that clear it. */
function RequestsPanel({ records }: { records: LeaveRecord[] }) {
  const decide = useDecideLeave();
  const cancel = useCancelLeave();
  const [pageSize, setPageSize] = useState(25);
  const paged = usePagedRows(records, { pageSize });

  return (
    <Panel
      title="Leave requests"
      subtitle="Approving a request is what moves it onto the planning grid and the balance"
      padded={false}
    >
      {records.length === 0 ? (
        <div className="px-5 pb-5">
          <EmptyState message="No leave has been requested." />
        </div>
      ) : (
        <DataTable minWidth={960}>
          <thead>
            <tr>
              <Th>Employee</Th>
              <Th>From</Th>
              <Th>To</Th>
              <Th align="right">Days</Th>
              <Th>Type</Th>
              <Th>Status</Th>
              <Th align="right" />
            </tr>
          </thead>
          <tbody>
            {paged.rows.map((record) => (
              <tr key={record.id} className="hover:bg-surface-sunken">
                <Td>
                  {record.employee ? (
                    <Link
                      to={buildPath(ROUTES.hrEmployeeDetail, { id: record.employeeId })}
                      className="font-bold text-foreground hover:underline"
                    >
                      {record.employee.fullName}
                    </Link>
                  ) : (
                    <span className="font-bold text-foreground">{record.employeeId}</span>
                  )}
                </Td>
                <Td>{frDate(record.startDate)}</Td>
                <Td>{frDate(record.endDate)}</Td>
                <Td align="right">
                  <span className="tabular-nums">{record.days}</span>
                </Td>
                <Td>{record.type}</Td>
                <Td>
                  <Pill tone={LEAVE_TONE[record.status]}>{record.status}</Pill>
                </Td>
                <Td align="right">
                  {record.status === 'REQUESTED' ? (
                    <span className="inline-flex gap-2">
                      <ActionButton
                        icon={Check}
                        variant="primary"
                        disabled={decide.isPending}
                        onClick={() =>
                          decide.mutate({ leaveId: record.id, decision: 'APPROVED' })
                        }
                      >
                        Approve
                      </ActionButton>
                      <ActionButton
                        icon={X}
                        disabled={decide.isPending}
                        onClick={() =>
                          decide.mutate({ leaveId: record.id, decision: 'REJECTED' })
                        }
                      >
                        Reject
                      </ActionButton>
                    </span>
                  ) : record.status === 'APPROVED' ? (
                    <ActionButton
                      icon={X}
                      disabled={cancel.isPending}
                      onClick={() => cancel.mutate(record.id)}
                    >
                      Cancel
                    </ActionButton>
                  ) : null}
                </Td>
              </tr>
            ))}
          </tbody>
        </DataTable>
      )}
      {records.length > 0 ? (
        <TablePager
          paged={paged}
          noun="requests"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          className="px-5 pb-4"
        />
      ) : null}
    </Panel>
  );
}

function LeaveRequestModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data: employees } = useEmployees({ status: 'ACTIVE', limit: 200 });
  const request = useRequestLeave();

  const [employeeId, setEmployeeId] = useState('');
  const [type, setType] = useState<(typeof LEAVE_TYPES)[number]>('ANNUAL');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [reason, setReason] = useState('');

  const list = employees?.items ?? [];
  const chosen = list.find((employee) => employee.id === employeeId);

  /* Inclusive of both ends, which is how the attestation de congé reads the
     same two dates — "du 14/02 au 19/03, soit 34 jours". */
  const days =
    startDate && endDate
      ? Math.max(
          0,
          Math.round((Date.parse(endDate) - Date.parse(startDate)) / 86_400_000) + 1,
        )
      : 0;

  function close() {
    setStartDate('');
    setEndDate('');
    setReason('');
    request.reset();
    onClose();
  }

  return (
    <ModalShell
      open={open}
      onClose={close}
      icon={Plus}
      title="Request leave"
      subtitle="Approval is what moves the days onto the grid and off the balance."
      footer={
        <>
          <ActionButton onClick={close}>Cancel</ActionButton>
          <ActionButton
            variant="primary"
            disabled={!employeeId || !startDate || !endDate || days <= 0 || request.isPending}
            onClick={() =>
              request.mutate(
                {
                  employeeId,
                  type,
                  startDate,
                  endDate,
                  reason: reason.trim() || undefined,
                },
                { onSuccess: close },
              )
            }
          >
            {request.isPending ? 'Submitting…' : 'Submit request'}
          </ActionButton>
        </>
      }
    >
      <div className="space-y-4">
        <FormError error={request.error} />

        <Field
          label="Employee"
          required
          hint={
            chosen
              ? `Joined ${frDate(chosen.joiningDate)} · ${chosen.profession}`
              : 'Active staff only.'
          }
        >
          <select
            className={inputClass}
            value={employeeId}
            onChange={(event) => setEmployeeId(event.target.value)}
          >
            <option value="">Choose an employee…</option>
            {list.map((employee) => (
              <option key={employee.id} value={employee.id}>
                {employee.fullName} — {employee.profession}
              </option>
            ))}
          </select>
        </Field>

        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Start" required>
            <input
              type="date"
              className={inputClass}
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
            />
          </Field>
          <Field label="End" required hint={days > 0 ? `${days} days inclusive` : undefined}>
            <input
              type="date"
              className={inputClass}
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
            />
          </Field>
        </div>

        <Field label="Type">
          <select
            className={inputClass}
            value={type}
            onChange={(event) => setType(event.target.value as (typeof LEAVE_TYPES)[number])}
          >
            {LEAVE_TYPES.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Reason">
          <input
            className={inputClass}
            value={reason}
            onChange={(event) => setReason(event.target.value)}
            placeholder="Optional"
          />
        </Field>
      </div>
    </ModalShell>
  );
}

export default HrLeavePage;
