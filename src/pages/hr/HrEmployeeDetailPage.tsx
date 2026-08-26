import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { useBreadcrumbLabel } from '@/hooks/useBreadcrumbLabel';
import {
  Archive,
  ArrowLeft,
  BadgeCheck,
  Banknote,
  CalendarDays,
  Download,
  FileText,
  Lock,
  Pencil,
  Users,
} from '@/design-system/icons';
import { fmtDjfPlain } from '@/lib/finance';
import { issuedDocumentFile, openDocumentBlob } from '@/features/hr/api/hrService';
import {
  useArchiveEmployee,
  useDocumentTemplates,
  useEmployee,
  useIssuedDocuments,
  useLeaveRecords,
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

import { DocumentVault } from './components/DocumentVault';
import { EmployeeFormModal } from './components/EmployeeFormModal';
import { LoadError } from './components/form';
import {
  EMPLOYEE_LABEL,
  EMPLOYEE_TONE,
  LEAVE_LABEL,
  LEAVE_TONE,
  LEAVE_TYPE_LABEL,
  frDate,
} from './hrFormat';

/**
 * One staff record: the contract, the file, the leave balance and everything
 * that has ever been issued in this person's name.
 *
 * Salary and the identity fields are the two things a role can be refused, and
 * the server says so in `redacted` rather than sending a zero. A refused field
 * renders as a lock and never as a dash — "not yours" and "nothing" are
 * different answers, and only one of them is worth asking someone about.
 */
export function HrEmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { data: employee, isLoading, error } = useEmployee(id);
  const { data: leaveRecords = [] } = useLeaveRecords({ employeeId: id });
  const { data: issued = [] } = useIssuedDocuments({ employeeId: id });
  /* The catalogue is the only place a template's French label lives; without
     it the history column reads back the raw key. */
  const { data: templates = [] } = useDocumentTemplates();
  const archive = useArchiveEmployee();

  const [editing, setEditing] = useState(false);

  /* The URL carries the database's own key, which is not a thing anyone can
     read. The matricule is this record's reference in the app-wide AAA-#####
     scheme, so that is what the trail says. */
  useBreadcrumbLabel(employee?.matricule);

  if (error) {
    return (
      <div className="w-full min-w-0 space-y-6">
        <PageHead title="Employee" subtitle="This record could not be opened" />
        <Panel title="Record" padded={false}>
          <LoadError error={error} noun="this employee record" />
        </Panel>
      </div>
    );
  }

  if (isLoading || !employee) {
    return (
      <div className="w-full min-w-0 space-y-6">
        <PageHead title="Employee" subtitle="Loading…" />
        <Panel title="Record">
          <EmptyState message="Loading…" />
        </Panel>
      </div>
    );
  }

  const salaryHidden = employee.baseSalary === undefined;
  const years = employee.leave.serviceDays / 365;
  const terminated = employee.status === 'TERMINATED';

  return (
    <div className="w-full min-w-0 space-y-6">
      <PageHead
        title={employee.fullName}
        subtitle={`${employee.profession}${employee.department ? ` · ${employee.department}` : ''} · ${employee.matricule}`}
        badge={<Pill tone={EMPLOYEE_TONE[employee.status]}>{EMPLOYEE_LABEL[employee.status]}</Pill>}
        actions={
          <>
            <Link to={ROUTES.hrEmployees}>
              <ActionButton icon={ArrowLeft}>Directory</ActionButton>
            </Link>
            <Link to={`${ROUTES.hrDocuments}?employeeId=${employee.id}`}>
              <ActionButton icon={FileText}>Issue a document</ActionButton>
            </Link>
            {terminated ? null : (
              <>
                <ActionButton icon={Pencil} onClick={() => setEditing(true)}>
                  Edit
                </ActionButton>
                <ActionButton
                  icon={Archive}
                  onClick={() =>
                    archive.mutate(employee.id, {
                      onSuccess: () => navigate(ROUTES.hrEmployees),
                    })
                  }
                >
                  {archive.isPending ? 'Archiving…' : 'Archive'}
                </ActionButton>
              </>
            )}
          </>
        }
      />

      {terminated ? (
        <div className="flex items-center gap-3 rounded-card border border-border bg-surface-sunken px-4 py-3">
          <Archive aria-hidden className="size-4 shrink-0 text-muted-foreground" />
          <p className="text-sm font-semibold text-muted-foreground">
            Archived{employee.terminationDate ? ` on ${frDate(employee.terminationDate)}` : ''}.
            Kept for labour inspection and CNSS.
          </p>
        </div>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard
          icon={Banknote}
          label="Base salary"
          value={
            salaryHidden ? (
              <span className="inline-flex items-center gap-2 text-lg">
                <Lock aria-hidden className="size-5" />
                <span className="text-base font-bold">Hidden</span>
              </span>
            ) : (
              fmtDjfPlain(employee.baseSalary ?? 0)
            )
          }
          hint={salaryHidden ? 'Salary hidden for this role' : 'Monthly gross, DJF'}
          fill={salaryHidden ? undefined : 'teal'}
        />
        <StatCard
          icon={BadgeCheck}
          label="Seniority"
          value={`${years.toFixed(1)} y`}
          hint={`Joined ${frDate(employee.joiningDate)}`}
        />
        <StatCard
          icon={CalendarDays}
          label="Leave balance"
          value={`${employee.leave.balance.toFixed(1)} d`}
          hint={`${employee.leave.accrued.toFixed(1)} accrued · ${employee.leave.taken.toFixed(0)} taken`}
        />
        <StatCard
          icon={Users}
          label="Contract"
          value={employee.contractType}
          hint={
            employee.contractEndDate
              ? `Ends ${frDate(employee.contractEndDate)}`
              : employee.trialPeriodEnd
                ? `Trial ends ${frDate(employee.trialPeriodEnd)}`
                : 'Open-ended'
          }
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_1.15fr]">
        <Panel title="Record" subtitle="Source for every generated document">
          <dl className="grid gap-x-6 gap-y-3.5 sm:grid-cols-2">
            <Detail label="Matricule" value={employee.matricule} mono />
            <Detail label="Nationality" value={employee.nationality} />
            <Detail label="CNSS number" value={employee.cnssNumber ?? '— not registered'} mono />
            <Detail label="NIF" value={employee.nifNumber ?? '—'} mono />
            <Detail label="Profession" value={employee.profession} />
            <Detail label="Department" value={employee.department ?? '—'} />
            <Detail label="Joining date" value={frDate(employee.joiningDate)} />
            <Detail label="Trial period ends" value={frDate(employee.trialPeriodEnd)} />
            <Detail
              label="Bank account"
              value={
                employee.redacted?.includes('bankAccount') ? (
                  <span className="inline-flex items-center gap-1.5 text-muted-foreground">
                    <Lock aria-hidden className="size-3.5" /> Hidden for this role
                  </span>
                ) : (
                  (employee.bankAccount ?? '—')
                )
              }
              mono
            />
            <Detail label="Manager" value={employee.manager?.fullName ?? '—'} />
            <Detail label="Email" value={employee.email ?? '—'} />
            <Detail label="Phone" value={employee.phone ?? '—'} />
          </dl>
        </Panel>

        <DocumentVault
          employeeId={employee.id}
          documents={employee.documents}
          readOnly={terminated}
        />
      </div>

      <Panel
        title="Leave"
        subtitle="Accrues from the joining date, uncapped"
        action={
          <Link to={ROUTES.hrLeave}>
            <ActionButton icon={CalendarDays}>Planning grid</ActionButton>
          </Link>
        }
        padded={false}
      >
        {leaveRecords.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState message="No leave requests yet." />
          </div>
        ) : (
          <DataTable className="w-0 min-w-full" minWidth={720}>
            <thead>
              <tr>
                <Th>From</Th>
                <Th>To</Th>
                <Th align="right">Days</Th>
                <Th>Type</Th>
                <Th>Status</Th>
                <Th>Reason</Th>
              </tr>
            </thead>
            <tbody>
              {leaveRecords.map((record) => (
                <tr key={record.id} className="hover:bg-surface-sunken">
                  <Td>{frDate(record.startDate)}</Td>
                  <Td>{frDate(record.endDate)}</Td>
                  <Td align="right">
                    <span className="tabular-nums">{record.days}</span>
                  </Td>
                  <Td>{LEAVE_TYPE_LABEL[record.type] ?? record.type}</Td>
                  <Td>
                    <Pill tone={LEAVE_TONE[record.status]}>{LEAVE_LABEL[record.status]}</Pill>
                  </Td>
                  <Td>
                    <span className="text-muted-foreground">{record.reason ?? '—'}</span>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      <Panel
        title="Issued Documents"
        subtitle="Nothing is ever overwritten"
        padded={false}
      >
        {issued.length === 0 ? (
          <div className="px-5 pb-5">
            <EmptyState message="No documents issued yet." />
          </div>
        ) : (
          <DataTable className="w-0 min-w-full" minWidth={720}>
            <thead>
              <tr>
                <Th>Reference</Th>
                <Th>Document</Th>
                <Th>Issued</Th>
                <Th align="right" />
              </tr>
            </thead>
            <tbody>
              {issued.map((document) => (
                <tr key={document.id} className="hover:bg-surface-sunken">
                  <Td>
                    <span className="font-mono text-xs font-bold">{document.referenceNo}</span>
                  </Td>
                  <Td>
                    {templates.find((entry) => entry.key === document.templateKey)?.label ??
                      document.templateKey.replaceAll('_', ' ')}
                  </Td>
                  <Td>{frDate(document.issueDate)}</Td>
                  <Td align="right">
                    <ActionButton
                      icon={Download}
                      onClick={() =>
                        void openDocumentBlob(
                          () => issuedDocumentFile(document.id),
                          `${document.referenceNo}.pdf`,
                        )
                      }
                    >
                      Open PDF
                    </ActionButton>
                  </Td>
                </tr>
              ))}
            </tbody>
          </DataTable>
        )}
      </Panel>

      {editing ? (
        <EmployeeFormModal open onClose={() => setEditing(false)} employee={employee} />
      ) : null}
    </div>
  );
}

function Detail({
  label,
  value,
  mono,
}: {
  label: string;
  value: ReactNode;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd
        className={
          mono
            ? 'mt-0.5 font-mono text-sm font-bold text-foreground'
            : 'mt-0.5 text-sm font-bold text-foreground'
        }
      >
        {value}
      </dd>
    </div>
  );
}

export default HrEmployeeDetailPage;
