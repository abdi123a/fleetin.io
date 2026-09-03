import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';

import { DataTable, PageHeader, TablePager, usePagedRows, type DataColumn } from '@/components';
import { Button, Card, IconChip, Skeleton } from '@/design-system';
import { ArrowLeft, CheckCircle, FolderOpen, Package, Receipt } from '@/design-system/icons';
import {
  documentStateOf,
  useCloseProject,
  useInvoices,
  useProject,
  type InvoiceRecord,
} from '@/features/finance';
import type { ShipmentRecord } from '@/features/shipments/api/shipmentsService';
import { fmtDjf, fromMinorUnits } from '@/lib/finance';
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

  const { data: project, isLoading } = useProject(projectId);
  const { data: documents = [] } = useInvoices({ projectId, kind: 'all' }, { enabled: Boolean(projectId) });
  const close = useCloseProject();

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

  const shipments = project?.shipments ?? [];
  const paged = usePagedRows(shipments);

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
        const docs = (byShipment.get(shipment.id) ?? []).filter((doc) => doc.status !== 'Cancelled');
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
        const state = documentStateOf(
          shipment.clientRateMinorUnits,
          byShipment.get(shipment.id) ?? [],
        );
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
            <Button
              variant="outline"
              disabled={close.isPending}
              onClick={() => close.mutate(project.id)}
            >
              <CheckCircle className="mr-1.5 size-4" />
              Close &amp; invoice
            </Button>
          ) : undefined
        }
      />

      {close.isSuccess ? (
        <p className="rounded-lg border border-success/25 bg-success/10 px-3 py-2 text-sm text-success">
          Closed — {close.data.issued} invoice{close.data.issued === 1 ? '' : 's'} raised
          {close.data.skippedUnpriced > 0
            ? `, ${close.data.skippedUnpriced} shipment${close.data.skippedUnpriced === 1 ? '' : 's'} skipped for having no price`
            : ''}
          .
        </p>
      ) : null}

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Figure label="Contracted" value={totals.contractedMinorUnits} icon={Package} />
        <Figure label="Invoiced" value={totals.billedMinorUnits} icon={Receipt} />
        <Figure label="Outstanding" value={totals.outstandingMinorUnits} icon={Receipt} accent />
        <Figure label="Our commission" value={totals.commissionMinorUnits} icon={FolderOpen} />
      </div>

      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={(shipment) => shipment.id}
        breakpoint="64rem"
        onRowClick={(shipment) => navigate(`/shipments/${shipment.reference}`)}
        emptyCopy="No shipments on this project yet."
      />
      <TablePager paged={paged} noun="shipments" />
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
