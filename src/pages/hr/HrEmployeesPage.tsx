import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import { TablePager, usePagedRows } from '@/components';
import { ROUTES, buildPath } from '@/config/routes';
import { Lock, Search, UserPlus, Users } from '@/design-system/icons';
import { fmtDjfPlain } from '@/lib/finance';
import { useEmployees } from '@/features/hr/api/queries';
import type { EmployeeStatus } from '@/features/hr/api/hrService';
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
import { EMPLOYEE_LABEL, EMPLOYEE_TONE, frDate } from './hrFormat';

type StatusFilter = 'all' | EmployeeStatus;

/**
 * The staff directory.
 *
 * Salary is a column, which means the table has to cope with not being
 * allowed to show it: the server omits `baseSalary` for a caller without
 * `hr.view-salary` and names the omission in `redacted`. That is rendered as
 * a lock rather than a dash, because a dash reads as "nothing" and this is
 * "not yours".
 */
export function HrEmployeesPage() {
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<StatusFilter>('ACTIVE');
  const [creating, setCreating] = useState(false);

  const { data, isLoading } = useEmployees({
    search: search.trim() || undefined,
    status,
    limit: 200,
  });

  const employees = useMemo(() => data?.items ?? [], [data]);
  const salaryHidden = employees.some((employee) => employee.redacted?.includes('baseSalary'));

  /** The directory pages — a full staff list is not one scroll. */
  const [pageSize, setPageSize] = useState(25);
  const paged = usePagedRows(employees, { pageSize, resetKey: `${status}|${search}` });

  const totalPayroll = employees.reduce((total, employee) => total + (employee.baseSalary ?? 0), 0);

  return (
    <div className="space-y-6">
      <PageHead
        title="Employees"
        subtitle="Staff records, contracts and document files"
        badge={<Pill tone="teal">{data?.meta.total ?? 0} on file</Pill>}
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
            ? 'Salary is hidden for your role'
            : `Base payroll ${fmtDjfPlain(totalPayroll)} DJF a month`
        }
        action={
          <div className="flex flex-wrap items-center gap-2">
            <label className="relative">
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
                className="h-9 w-56 rounded-lg border border-border bg-card pl-8 pr-3 text-xs font-semibold text-foreground placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              />
            </label>
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
        {isLoading ? (
          <div className="px-5 pb-5">
            <EmptyState message="Loading the directory…" />
          </div>
        ) : employees.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState message="No employee matches those filters." />
          </div>
        ) : (
          <DataTable>
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
                    {employee.baseSalary === undefined ? (
                      <span
                        className="inline-flex items-center gap-1 text-muted-foreground"
                        title="Your role cannot see salary figures"
                      >
                        <Lock aria-hidden className="size-3.5" />
                        <span className="sr-only">Hidden for your role</span>
                      </span>
                    ) : (
                      <span className="tabular-nums">{fmtDjfPlain(employee.baseSalary)}</span>
                    )}
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
        )}
        {employees.length > 0 ? (
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
          Every view of an employee record is written to the audit trail.
        </p>
      ) : null}

      {creating ? <EmployeeFormModal open onClose={() => setCreating(false)} /> : null}
    </div>
  );
}

export default HrEmployeesPage;
