import { useMemo, useState, type ReactNode } from 'react';
import { Link } from 'react-router-dom';

import { TablePager, usePagedRows } from '@/components';
import { ROUTES, buildPath } from '@/config/routes';
import { Lock, Search, UserPlus, Users } from '@/design-system/icons';
import { fmtDjfPlain } from '@/lib/finance';
import { useEmployees } from '@/features/hr/api/queries';
import type { Employee, EmployeeStatus } from '@/features/hr/api/hrService';
import {
  ActionButton,
  DataTable,
  EmptyState,
  FilterPills,
  PageHead,
  Panel,
  Pill,
  Td,
  Th,
} from '@/pages/finance/components/kit';

import { EmployeeFormModal } from './components/EmployeeFormModal';
import { LoadError } from './components/form';
import { EMPLOYEE_LABEL, EMPLOYEE_TONE, frDate } from './hrFormat';

type StatusFilter = 'all' | EmployeeStatus;

const ALL_DEPARTMENTS = '__all__';

/**
 * The staff directory.
 *
 * Salary is a column, which means the table has to cope with not being
 * allowed to show it: the server omits `baseSalary` for a caller without
 * `hr.view-salary` and names the omission in `redacted`. That is rendered as
 * a lock rather than a dash, because a dash reads as "nothing" and this is
 * "not yours".
 *
 * Eight columns do not fit a phone, so below `lg` the same rows are dealt as
 * cards instead of being left to a horizontal scrollbar nobody finds. It is
 * one list rendered twice, never two lists — both read from `paged.rows`, so
 * the pager, the filters and the search apply identically to each.
 */
export function HrEmployeesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const [department, setDepartment] = useState<string>(ALL_DEPARTMENTS);
  const [creating, setCreating] = useState(false);

  const { data, isLoading, error } = useEmployees({
    search: search.trim() || undefined,
    status,
    limit: 200,
  });

  const all = useMemo(() => data?.items ?? [], [data]);

  /* The department list is read off the records the server just sent rather
     than asked for separately — there is no departments endpoint, and a list
     built from the data cannot offer a department nobody is in. */
  const departments = useMemo(
    () => [...new Set(all.map((employee) => employee.department).filter(Boolean))].sort() as string[],
    [all],
  );

  const employees = useMemo(
    () =>
      department === ALL_DEPARTMENTS
        ? all
        : all.filter((employee) => employee.department === department),
    [all, department],
  );

  const salaryHidden = employees.some((employee) => employee.redacted?.includes('baseSalary'));

  /** The directory pages — a full staff list is not one scroll. */
  const [pageSize, setPageSize] = useState(25);
  const paged = usePagedRows(employees, {
    pageSize,
    resetKey: `${status}|${search}|${department}`,
  });

  const totalPayroll = employees.reduce((total, employee) => total + (employee.baseSalary ?? 0), 0);

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHead
        title="Employees"
        subtitle="Records, contracts and documents"
        badge={<Pill tone="teal">{data?.meta.total ?? 0} employees</Pill>}
        actions={
          <ActionButton icon={UserPlus} variant="primary" onClick={() => setCreating(true)}>
            New employee
          </ActionButton>
        }
      />

      <Panel
        title="Directory"
        subtitle={
          salaryHidden
            ? 'Salary hidden for this role'
            : `Monthly base payroll ${fmtDjfPlain(totalPayroll)} DJF`
        }
        action={
          <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto">
            <label className="relative w-full sm:w-56">
              <span className="sr-only">Search employees</span>
              <Search
                aria-hidden
                className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground"
              />
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Name, matricule, CNSS…"
                className="h-9 w-full rounded-lg border border-border bg-card pl-8 pr-3 text-xs font-semibold text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
            {departments.length > 1 ? (
              <label>
                <span className="sr-only">Filter by department</span>
                <select
                  value={department}
                  onChange={(event) => setDepartment(event.target.value)}
                  className="h-9 rounded-lg border border-border bg-card px-2.5 text-xs font-semibold text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <option value={ALL_DEPARTMENTS}>All departments</option>
                  {departments.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </label>
            ) : null}
            <FilterPills<StatusFilter>
              options={[
                { key: 'ACTIVE', label: 'Active' },
                { key: 'ON_LEAVE', label: 'On leave' },
                { key: 'TERMINATED', label: 'Archived' },
                { key: 'all', label: 'All' },
              ]}
              active={status}
              onChange={setStatus}
            />
          </div>
        }
        padded={false}
      >
        {error ? (
          <LoadError error={error} noun="the staff directory" />
        ) : isLoading ? (
          <div className="px-5 pb-5">
            <EmptyState message="Loading…" />
          </div>
        ) : employees.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState message="No employee matches those filters." />
          </div>
        ) : (
          <>
            <div className="hidden lg:block">
              <DataTable className="w-0 min-w-full">
                <thead>
                  <tr>
                    <Th>Matricule</Th>
                    <Th>Name</Th>
                    <Th>Profession</Th>
                    <Th>Department</Th>
                    <Th>Contract</Th>
                    <Th>Joined</Th>
                    <Th align="right">Base salary</Th>
                    <Th>Status</Th>
                  </tr>
                </thead>
                <tbody>
                  {paged.rows.map((employee) => (
                    <tr key={employee.id} className="hover:bg-surface-sunken">
                      <Td>
                        <Link
                          to={buildPath(ROUTES.hrEmployeeDetail, { id: employee.id })}
                          className="font-mono text-xs font-bold text-primary-subtle-foreground hover:underline"
                        >
                          {employee.matricule}
                        </Link>
                      </Td>
                      <Td>
                        <Link
                          to={buildPath(ROUTES.hrEmployeeDetail, { id: employee.id })}
                          className="font-bold text-foreground hover:underline"
                        >
                          {employee.fullName}
                        </Link>
                      </Td>
                      <Td>{employee.profession}</Td>
                      <Td>{employee.department ?? '—'}</Td>
                      <Td>{employee.contractType}</Td>
                      <Td>{frDate(employee.joiningDate)}</Td>
                      <Td align="right">
                        <Salary employee={employee} />
                      </Td>
                      <Td>
                        <Pill tone={EMPLOYEE_TONE[employee.status]}>
                          {EMPLOYEE_LABEL[employee.status]}
                        </Pill>
                      </Td>
                    </tr>
                  ))}
                </tbody>
              </DataTable>
            </div>

            <ul className="divide-y divide-border-subtle border-t border-border lg:hidden">
              {paged.rows.map((employee) => (
                <li key={employee.id}>
                  <EmployeeCard employee={employee} />
                </li>
              ))}
            </ul>
          </>
        )}
        {employees.length > 0 && !error ? (
          <TablePager
            paged={paged}
            noun="employees"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
            className="px-5 pb-4"
          />
        ) : null}
      </Panel>

      {employees.length > 0 ? (
        <p className="flex items-center gap-2 text-xs font-semibold text-muted-foreground">
          <Users aria-hidden className="size-4" />
          Every record view is audited.
        </p>
      ) : null}

      {creating ? <EmployeeFormModal open onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

/** A figure, or the lock that says the figure exists and is not yours. */
function Salary({ employee }: { employee: Employee }) {
  if (employee.baseSalary === undefined) {
    return (
      <span
        className="inline-flex items-center gap-1 text-muted-foreground"
        title="Salary hidden for this role"
      >
        <Lock aria-hidden className="size-3.5" />
        <span className="sr-only">Hidden for this role</span>
      </span>
    );
  }
  return <span className="tabular-nums">{fmtDjfPlain(employee.baseSalary)}</span>;
}

/**
 * One directory row below `lg`.
 *
 * Carries the same eight facts as the table, ranked: who and what they do
 * first, the contract and the money under it, and the whole card is the link
 * to the record rather than two separate ones a thumb has to hit.
 */
function EmployeeCard({ employee }: { employee: Employee }) {
  return (
    <Link
      to={buildPath(ROUTES.hrEmployeeDetail, { id: employee.id })}
      className="block px-4 py-3.5 transition-colors hover:bg-surface-sunken sm:px-5"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-extrabold text-foreground">{employee.fullName}</p>
          <p className="mt-0.5 truncate text-xs font-semibold text-muted-foreground">
            {employee.profession}
            {employee.department ? ` · ${employee.department}` : ''}
          </p>
        </div>
        <Pill tone={EMPLOYEE_TONE[employee.status]}>{EMPLOYEE_LABEL[employee.status]}</Pill>
      </div>

      <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-2 sm:grid-cols-4">
        <CardFact label="Matricule">
          <span className="font-mono">{employee.matricule}</span>
        </CardFact>
        <CardFact label="Contract">{employee.contractType}</CardFact>
        <CardFact label="Joined">{frDate(employee.joiningDate)}</CardFact>
        <CardFact label="Base salary">
          <Salary employee={employee} />
        </CardFact>
      </dl>
    </Link>
  );
}

function CardFact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10px] font-extrabold uppercase tracking-[0.07em] text-muted-foreground">
        {label}
      </dt>
      <dd className="mt-0.5 truncate text-xs font-bold text-foreground">{children}</dd>
    </div>
  );
}

export default HrEmployeesPage;
