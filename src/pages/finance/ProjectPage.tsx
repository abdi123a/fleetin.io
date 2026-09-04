import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import {
  DataTable,
  PageHeader,
  RecordStatusBadge,
  TablePager,
  usePagedRows,
  type DataColumn,
} from '@/components';
import { Button, Card, IconChip, Skeleton } from '@/design-system';
import { ArrowLeft, CheckCircle, FolderOpen, Package, Plus, Receipt, Send } from '@/design-system/icons';
import {
  documentStateOf,
  useCloseProject,
  useInvoices,
  useIssueProjectInvoice,
  useMarkInvoicePaid,
  useMarkInvoiceSent,
  useProject,
  type InvoiceRecord,
} from '@/features/finance';
import { usePermissions } from '@/hooks';
import { useShipper } from '@/features/shippers/api/queries';
import { AddShipmentsDialog } from './components/AddShipmentsDialog';
import { invoiceStatusOption, statusOf } from './invoiceStatus';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';
import { fmtDjf, fmtDocDate, fromMinorUnits } from '@/lib/finance';
import { cn } from '@/utils';

/**
 * One project: its shipments, and what they came to.
 *
 * Four figures across the top, and they answer four different questions on
 * purpose. **Contracted** is the work — what its shipments are priced at,
 * billed or not. **Invoiced** is what has been asked for. **Outstanding** is
 * what is still owed. **Our commission** is what Fleetin earned on it. The gap
 * between the first two is the operator's job; between the second and third,
 * the client's.
 */
export function ProjectPage() {
  const { projectId = '' } = useParams();
  const navigate = useNavigate();

  const [adding, setAdding] = useState(false);
  const { isSuperuser } = usePermissions();

  const { data: project, isLoading } = useProject(projectId);
  const { data: documents = [] } = useInvoices({ projectId, kind: 'all' }, { enabled: Boolean(projectId) });
  const close = useCloseProject();
  const issue = useIssueProjectInvoice();
  const markSent = useMarkInvoiceSent();
  const markPaid = useMarkInvoicePaid();

  const byShipment = useMemo(() => {
    const map = new Map<string, InvoiceRecord[]>();
    for (const doc of documents) {
      if (!doc.shipmentId) continue;
      const list = map.get(doc.shipmentId);
      if (list) list.push(doc);
      else map.set(doc.shipmentId, [doc]);
    }
    return map;
  }, [documents]);

  const shipments = useMemo(() => project?.shipments ?? [], [project]);

  /* The project's client, by name. Read from the account rather than from a
     shipment on the project — an EMPTY project has no shipment to read from,
     and empty is exactly when somebody opens "Add shipments". */
  const { data: client } = useShipper(project?.shipperId);
  const projectClient = client?.companyLegalName ?? shipments[0]?.customerCompany ?? 'this client';

  /* Shipments already covered by a PROJECT invoice. Those carry their ids in
     `missionIds` rather than `shipmentId`, so the per-shipment lookup above
     cannot see them and would offer to bill them a second time. */
  /* Invoices raised FOR the project as a whole — the documents a closed
     project must still be able to hand over. Kept separate from per-shipment
     invoices, which live in the table's Documents column. */
  const projectInvoices = useMemo(
    () =>
      documents
        .filter((doc) => doc.kind === 'invoice' && !doc.shipmentId && doc.status !== 'Cancelled')
        .sort((a, b) => b.issueDate.localeCompare(a.issueDate)),
    [documents],
  );

  const projectInvoiceCovers = useMemo(() => {
    const ids = new Set<string>();
    for (const doc of documents) {
      if (doc.kind !== 'invoice' || doc.status === 'Cancelled' || doc.shipmentId) continue;
      for (const id of doc.missionIds) ids.add(id);
    }
    return ids;
  }, [documents]);
  const paged = usePagedRows(shipments);

  /* Delivered, priced and not yet billed — exactly what "Invoice N" will
     raise. Computed here so the button can say how many rather than being a
     verb the operator has to guess the scope of. */
  /*
   * What the project invoice would cover: priced shipments with no live
   * invoice against them. Delivery is deliberately NOT a gate here — a project
   * is a commercial agreement billed as a whole, and the server excludes
   * anything already invoiced, so the count on the button is what will
   * actually appear on the document.
   */
  const billable = useMemo(
    () =>
      shipments.filter(
        (shipment) =>
          shipment.clientRateMinorUnits != null &&
          !(byShipment.get(shipment.id) ?? []).some(
            (doc) => doc.kind === 'invoice' && doc.status !== 'Cancelled',
          ) &&
          !projectInvoiceCovers.has(shipment.id),
      ),
    [shipments, byShipment, projectInvoiceCovers],
  );

  const columns: DataColumn<ShipmentRecord>[] = [
    {
      key: 'reference',
      label: 'Shipment',
      icon: Package,
      width: 'w-[26%]',
      card: 'identity',
      cell: (shipment) => (
        <div className="min-w-0">
          <p className="truncate font-semibold text-foreground">{shipment.reference}</p>
          <p className="truncate text-xs text-muted-foreground">
            {shipment.pickupLocationName} → {shipment.deliveryLocationName}
          </p>
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      width: 'w-[14%]',
      cell: (shipment) => <span className="text-sm text-muted-foreground">{shipment.status}</span>,
    },
    {
      key: 'price',
      label: 'Client pays',
      width: 'w-[16%]',
      align: 'right',
      cell: (shipment) =>
        shipment.clientRateMinorUnits == null ? (
          <span className="text-destructive">Unpriced</span>
        ) : (
          <span className="font-semibold tabular-nums">
            {fmtDjf(fromMinorUnits(shipment.clientRateMinorUnits, shipment.clientRateCurrency ?? 'DJF'))}
          </span>
        ),
    },
    {
      key: 'documents',
      label: 'Documents',
      width: 'w-[24%]',
      cell: (shipment) => {
        /* Its own documents, plus any PROJECT invoice that swept it up — those
           carry the shipment in `missionIds`, not `shipmentId`, so the
           per-shipment index alone reported "not billed" on work that had
           plainly been invoiced. */
        const docs = [
          ...(byShipment.get(shipment.id) ?? []),
          ...documents.filter(
            (doc) => !doc.shipmentId && doc.missionIds.includes(shipment.id),
          ),
        ].filter((doc) => doc.status !== 'Cancelled');
        if (docs.length === 0) return <span className="text-muted-foreground/60">—</span>;
        return (
          <div className="flex flex-wrap gap-1">
            {docs.map((doc) => (
              <Link
                key={doc.id}
                to={`/finance/invoices/${doc.id}`}
                className="rounded-md border border-border px-1.5 py-0.5 font-mono text-[11px] transition-colors hover:border-primary hover:text-primary"
              >
                {doc.number}
              </Link>
            ))}
          </div>
        );
      },
    },
    {
      key: 'state',
      label: 'Billing',
      width: 'w-[12%]',
      card: 'trailing',
      cell: (shipment) => {
        const state = documentStateOf(shipment.clientRateMinorUnits, [
          ...(byShipment.get(shipment.id) ?? []),
          ...documents.filter((doc) => !doc.shipmentId && doc.missionIds.includes(shipment.id)),
        ]);
        const label =
          state === 'paid'
            ? 'Paid'
            : state === 'billed'
              ? 'Invoiced'
              : state === 'quoted'
                ? 'Quoted'
                : state === 'unpriced'
                  ? 'No price'
                  : 'Not billed';
        return (
          <span
            className={cn(
              'inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium',
              state === 'paid'
                ? 'border-success/25 bg-success/12 text-success'
                : state === 'billed'
                  ? 'border-accent/30 bg-accent/15 text-accent-foreground'
                  : state === 'unpriced'
                    ? 'border-destructive/25 bg-destructive/10 text-destructive'
                    : 'border-border bg-muted text-muted-foreground',
            )}
          >
            {label}
          </span>
        );
      },
    },
  ];

  if (isLoading) {
    return (
      <div className="flex w-full min-w-0 flex-col gap-4">
        <Skeleton className="h-10 w-64" />
        <Skeleton className="h-24 w-full rounded-card" />
        <Skeleton className="h-64 w-full rounded-card" />
      </div>
    );
  }

  if (!project) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Project not found.</Card>;
  }

  const totals = project.totals;
  const active = project.status === 'active';

  /* Why the project cannot be closed yet, in the operator's words — or null
     when it can. Mirrors the server's two guards exactly. */
  const closeBlocker =
    billable.length > 0
      ? `${billable.length} shipment${billable.length === 1 ? '' : 's'} still to invoice`
      : projectInvoices.some((doc) => doc.status !== 'Paid')
        ? 'Every invoice must be paid first'
        : null;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <button
        type="button"
        onClick={() => navigate('/finance/projects')}
        className="flex w-fit items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
      >
        <ArrowLeft className="size-4" />
        All projects
      </button>

      <PageHeader
        title={project.name}
        badge={project.reference}
        actions={
          active ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => setAdding(true)}>
                <Plus className="mr-1.5 size-4" />
                Add shipments
              </Button>
              {/* ONE invoice for the whole project — that is what grouping is
                  for. A client under a single agreement settles it with a
                  single document, not an envelope per job. Shipments already
                  billed are excluded server-side, so this cannot double-bill. */}
              {billable.length > 0 ? (
                <Button
                  disabled={issue.isPending}
                  onClick={() =>
                    issue.mutate(project.id, {
                      onSuccess: (invoice) => navigate(`/finance/invoices/${invoice.id}`),
                    })
                  }
                >
                  <Receipt className="mr-1.5 size-4" />
                  {issue.isPending
                    ? 'Invoicing…'
                    : `Invoice ${billable.length} shipment${billable.length === 1 ? '' : 's'}`}
                </Button>
              ) : null}
              {/* Blocked until the money is finished, and it says which of the
                  two reasons applies rather than leaving a dead control. The
                  server refuses either way — this only saves the round trip. */}
              <Button
                variant="ghost"
                disabled={close.isPending || closeBlocker !== null}
                title={closeBlocker ?? undefined}
                onClick={() => close.mutate(project.id)}
              >
                <CheckCircle className="mr-1.5 size-4" />
                Close
              </Button>
            </div>
          ) : undefined
        }
      />

      {close.isError ? (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {(close.error as Error).message}
        </p>
      ) : null}

      {close.isSuccess ? (
        <p className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm text-success">
          Closed — every shipment invoiced and paid
          {close.data.skippedUnpriced > 0
            ? `, ${close.data.skippedUnpriced} closed unpriced and never billed`
            : ''}
          .
        </p>
      ) : null}

      <div className={cn('grid grid-cols-2 gap-3', isSuperuser ? 'lg:grid-cols-4' : 'lg:grid-cols-3')}>
        <Figure label="Contracted" value={totals.contractedMinorUnits} icon={Package} />
        <Figure label="Invoiced" value={totals.billedMinorUnits} icon={Receipt} />
        <Figure label="Outstanding" value={totals.outstandingMinorUnits} icon={Receipt} accent />
        {/* ADMIN ONLY — see the gate in `NewDocumentDialogs`. */}
        {isSuperuser ? (
          <Figure label="Our commission" value={totals.commissionMinorUnits} icon={FolderOpen} />
        ) : null}
      </div>

      {/*
        The project's own bills, always reachable.

        Closing a project used to hide every action on it, including any way to
        reach the invoice closing had just produced — the user's report. A
        document somebody has to send to a client cannot live behind a state
        the project has already left.
      */}
      {projectInvoices.length > 0 ? (
        <Card className="flex flex-col p-4">
          <h2 className="mb-2 text-sm font-semibold text-foreground">Project invoices</h2>
          <ul className="flex flex-col">
            {projectInvoices.map((doc) => {
              const status = statusOf(doc);
              /*
                The NEXT MOVE, not just the state.
                The row used to say "draft" and offer "Open & print", leaving
                the reader to work out that a draft still has to be sent. A
                document in a workflow should render the control that advances
                it — send it, then record the payment — with Open kept beside
                as the way to read the paper itself.
              */
              return (
                <li key={doc.id} className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2">
                  <IconChip icon={Receipt} size={36} tint="teal" className="shrink-0" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-mono text-sm font-semibold text-foreground">
                      {doc.number}
                    </span>
                    <span className="block truncate text-xs text-muted-foreground">
                      {doc.description} · issued {fmtDocDate(doc.issueDate)}
                    </span>
                  </span>

                  <span className="shrink-0 text-right">
                    <span className="block text-sm font-semibold tabular-nums text-foreground">
                      {fmtDjf(fromMinorUnits(doc.totalMinorUnits, doc.currency))}
                    </span>
                    <span className="mt-0.5 block">
                      <RecordStatusBadge option={invoiceStatusOption(status)} />
                    </span>
                  </span>

                  <span className="flex shrink-0 items-center gap-1.5">
                    {status === 'Draft' ? (
                      <Button
                        size="sm"
                        disabled={markSent.isPending}
                        onClick={() => markSent.mutate(doc.id)}
                      >
                        <Send className="mr-1.5 size-4" />
                        Send to client
                      </Button>
                    ) : status === 'Sent' || status === 'Overdue' ? (
                      <Button
                        size="sm"
                        disabled={markPaid.isPending}
                        onClick={() => markPaid.mutate(doc.id)}
                      >
                        <CheckCircle className="mr-1.5 size-4" />
                        Record payment
                      </Button>
                    ) : null}
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => navigate(`/finance/invoices/${doc.id}`)}
                    >
                      Open
                    </Button>
                  </span>
                </li>
              );
            })}
          </ul>

          {markSent.isError || markPaid.isError ? (
            <p className="mt-2 text-sm text-destructive">
              {((markSent.error ?? markPaid.error) as Error).message}
            </p>
          ) : null}
        </Card>
      ) : null}

      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={(shipment) => shipment.id}
        breakpoint="64rem"
        onRowClick={(shipment) => navigate(`/shipments/${shipment.reference}`)}
        emptyCopy="No shipments on this project yet."
        emptyAction={
          active ? (
            <Button size="sm" onClick={() => setAdding(true)}>
              <Plus className="mr-1.5 size-4" />
              Add shipments
            </Button>
          ) : undefined
        }
      />
      <TablePager paged={paged} noun="shipments" />

      <AddShipmentsDialog
        open={adding}
        onOpenChange={setAdding}
        projectId={project.id}
        shipperId={project.shipperId}
        shipperName={projectClient}
      />
    </div>
  );
}

function Figure({
  label,
  value,
  icon,
  accent,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
  accent?: boolean;
}) {
  return (
    <Card className="flex items-center gap-3 p-4">
      <IconChip icon={icon} size={36} tint={accent ? 'orange' : 'teal'} />
      <div className="min-w-0">
        <p className="truncate text-lg font-semibold tabular-nums text-foreground">
          {fmtDjf(fromMinorUnits(value, 'DJF'))}
        </p>
        <p className="truncate text-xs text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}
