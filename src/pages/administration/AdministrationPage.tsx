import { useMemo, useState } from 'react';

import { PageHeader, TablePager, usePagedRows } from '@/components';
import { Button, IconChip } from '@/design-system';
import {
  Building2,
  Check,
  Clock,
  Mail,
  Phone,
  UserPlus,
  Users,
  XCircle,
} from '@/design-system/icons';
import { useAccessRequestStore, type AccessRequest, type AccessRequestStatus } from '@/stores';

function RequesterAvatar({ firstName, lastName }: { firstName: string; lastName: string }) {
  const initials = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase();
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
      {initials || <UserPlus className="h-4 w-4" />}
    </div>
  );
}

function renderStatusBadge(status: AccessRequestStatus) {
  switch (status) {
    case 'PENDING':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-warning/20 bg-warning-subtle px-2.5 py-0.5 text-[11px] font-semibold text-warning-subtle-foreground">
          <Clock className="h-3 w-3" />
          Pending
        </span>
      );
    case 'APPROVED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-success/20 bg-success-subtle px-2.5 py-0.5 text-[11px] font-semibold text-success-subtle-foreground">
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-success" />
          Approved
        </span>
      );
    case 'REJECTED':
      return (
        <span className="inline-flex items-center gap-1.5 rounded-full border border-destructive/20 bg-destructive-subtle px-2.5 py-0.5 text-[11px] font-semibold text-destructive-subtle-foreground">
          <XCircle className="h-3 w-3" />
          Rejected
        </span>
      );
  }
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' });
}

const FILTERS: { id: 'all' | AccessRequestStatus; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'PENDING', label: 'Pending' },
  { id: 'APPROVED', label: 'Approved' },
  { id: 'REJECTED', label: 'Rejected' },
];

/**
 * Administration — Access Requests.
 *
 * "Register" (RegisterPage.tsx) no longer creates an account: it files a
 * request here. Approving one creates the account (with the password the
 * requester chose) in the local directory login() checks — see
 * access-request.store.ts.
 */
export function AdministrationPage() {
  const requests = useAccessRequestStore((state) => state.requests);
  const approveRequest = useAccessRequestStore((state) => state.approveRequest);
  const rejectRequest = useAccessRequestStore((state) => state.rejectRequest);

  const [statusFilter, setStatusFilter] = useState<'all' | AccessRequestStatus>('all');

  const counts = useMemo(
    () => ({
      total: requests.length,
      pending: requests.filter((r) => r.status === 'PENDING').length,
      approved: requests.filter((r) => r.status === 'APPROVED').length,
      rejected: requests.filter((r) => r.status === 'REJECTED').length,
    }),
    [requests],
  );

  const filteredRequests = useMemo(() => {
    const list = statusFilter === 'all' ? requests : requests.filter((r) => r.status === statusFilter);
    return [...list].sort((a, b) => b.requestedAt.localeCompare(a.requestedAt));
  }, [requests, statusFilter]);

  const [pageSize, setPageSize] = useState(12);
  const pagedRequests = usePagedRows(filteredRequests, { pageSize, resetKey: statusFilter });

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Administration"
        description="Access requests and account approvals"
      />

      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
        <StatTile label="Total Requests" value={counts.total} icon={<Users className="h-5 w-5" />} />
        <StatTile label="Pending Review" value={counts.pending} icon={<Clock className="h-5 w-5" />} highlight={counts.pending > 0} />
        <StatTile label="Approved" value={counts.approved} icon={<Check className="h-5 w-5" />} />
        <StatTile label="Rejected" value={counts.rejected} icon={<XCircle className="h-5 w-5" />} />
      </div>

      <div className="flex items-center gap-1 overflow-x-auto rounded-lg border border-border bg-card p-2.5">
        {FILTERS.map((filter) => {
          const count = filter.id === 'all' ? counts.total : counts[filter.id.toLowerCase() as 'pending' | 'approved' | 'rejected'];
          return (
            <button
              key={filter.id}
              type="button"
              onClick={() => setStatusFilter(filter.id)}
              className={`flex items-center gap-1.5 whitespace-nowrap rounded-md px-2.5 py-1 text-xs font-medium transition-all ${
                statusFilter === filter.id
                  ? 'bg-primary text-primary-foreground shadow-2xs'
                  : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
              }`}
            >
              <span>{filter.label}</span>
              <span
                className={`rounded-sm px-1 py-0.2 text-[10px] font-semibold ${
                  statusFilter === filter.id
                    ? 'bg-primary-foreground/20 text-primary-foreground'
                    : 'border border-border/40 bg-background/80 text-muted-foreground'
                }`}
              >
                {count}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {pagedRequests.rows.map((request) => (
          <RequestRow
            key={request.id}
            request={request}
            onApprove={() => approveRequest(request.id)}
            onReject={() => rejectRequest(request.id)}
          />
        ))}

        {filteredRequests.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-12 text-center">
            <IconChip icon={UserPlus} tint="neutral" className="mb-3" />
            <h3 className="text-base font-bold text-foreground">No Access Requests</h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {statusFilter === 'all'
                ? 'Submitted requests appear here.'
                : `No ${statusFilter.toLowerCase()} requests.`}
            </p>
          </div>
        )}

        {filteredRequests.length > 0 && (
          <TablePager
            paged={pagedRequests}
            noun="requests"
            pageSize={pageSize}
            onPageSizeChange={setPageSize}
          />
        )}
      </div>
    </div>
  );
}

function StatTile({
  label,
  value,
  icon,
  highlight,
}: {
  label: string;
  value: number;
  icon: React.ReactNode;
  highlight?: boolean;
}) {
  return (
    <div
      className={`flex items-center justify-between gap-3 rounded-card border p-4 ${
        highlight ? 'border-primary/30 bg-primary-subtle' : 'border-border bg-card'
      }`}
    >
      <div>
        <p className={`text-2xl font-bold tracking-tight ${highlight ? 'text-primary-subtle-foreground' : 'text-foreground'}`}>
          {value}
        </p>
        <p className="text-xs font-medium text-muted-foreground">{label}</p>
      </div>
      <span className={highlight ? 'text-primary' : 'text-muted-foreground'}>{icon}</span>
    </div>
  );
}

function RequestRow({
  request,
  onApprove,
  onReject,
}: {
  request: AccessRequest;
  onApprove: () => void;
  onReject: () => void;
}) {
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border/80 bg-card p-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-center gap-3">
        <RequesterAvatar firstName={request.firstName} lastName={request.lastName} />
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-bold text-foreground">
              {request.firstName} {request.lastName}
            </span>
            {renderStatusBadge(request.status)}
          </div>
          <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
            <span className="flex items-center gap-1 truncate">
              <Mail className="h-2.5 w-2.5 shrink-0" />
              {request.email}
            </span>
            {request.phone && (
              <span className="flex items-center gap-1">
                <Phone className="h-2.5 w-2.5 shrink-0" />
                {request.phone}
              </span>
            )}
            {request.companyName && (
              <span className="flex items-center gap-1">
                <Building2 className="h-2.5 w-2.5 shrink-0" />
                {request.companyName}
              </span>
            )}
            <span>Requested {formatDate(request.requestedAt)}</span>
          </div>
        </div>
      </div>

      {request.status === 'PENDING' ? (
        <div className="flex shrink-0 items-center gap-2 border-t border-border/40 pt-2 sm:border-t-0 sm:pt-0">
          <Button
            size="sm"
            variant="outline"
            shape="pill"
            onClick={onReject}
            leadingIcon={<XCircle className="h-3.5 w-3.5" />}
            className="flex-1 justify-center text-xs font-medium sm:flex-initial"
          >
            Reject
          </Button>
          <Button
            size="sm"
            variant="primary"
            shape="pill"
            onClick={onApprove}
            leadingIcon={<Check className="h-3.5 w-3.5" />}
            className="flex-1 justify-center text-xs font-medium sm:flex-initial"
          >
            Approve
          </Button>
        </div>
      ) : (
        <span className="shrink-0 text-2xs text-muted-foreground">
          {request.decidedAt && `Decided ${formatDate(request.decidedAt)}`}
        </span>
      )}
    </div>
  );
}

export default AdministrationPage;
