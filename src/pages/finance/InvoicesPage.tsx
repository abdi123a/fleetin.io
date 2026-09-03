import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  DataTable,
  FilterBar,
  PageHeader,
  RecordStatusBadge,
  TablePager,
  ViewTabs,
  usePagedRows,
  type DataColumn,
} from '@/components';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  IconChip,
} from '@/design-system';
import {
  Ban,
  Building2,
  CheckCircle,
  ExternalLink,
  FileText,
  MoreVertical,
  Plus,
  Receipt,
  Send,
} from '@/design-system/icons';
import { usePermissions } from '@/hooks';
import {
  useCancelInvoice,
  useInvoices,
  useMarkInvoicePaid,
  useMarkInvoiceSent,
  type InvoiceRecord,
} from '@/features/finance';
import { fmtDjf, fmtDocDate, fromMinorUnits } from '@/lib/finance';
import { CompanyAvatar } from '@/design-system';
import { useCompanyLogo } from '@/features/companies/companyLogos';
import { companyInitials, getEmptyReturnCompanyLogo } from '@/data/emptyReturnData';

import { NewInvoiceDialog, NewQuotationDialog } from './components/NewDocumentDialogs';
import { INVOICE_STATUS_OPTIONS, invoiceStatusOption, statusOf, type InvoiceStatusKey } from './invoiceStatus';

/**
 * The billing directory — and it is a directory, built the way the vehicle,
 * driver, shipper and transporter lists are: one band for the view and the
 * page's actions, one for the filter tabs and search, then the shared
 * `DataTable` that becomes cards on a narrow screen, and a ⋮ menu per row.
 *
 * Two views, because the two documents are made differently and it matters:
 *
 *   - **Invoices** bill a shipment that has already run. Raised FROM a
 *     shipment, so the dialog picks one.
 *   - **Quotations** price work that has not happened. Composed by hand,
 *     because there is nothing yet to derive them from.
 *
 * Status wears the same five tones the directories use — green paid, red
 * overdue, blue sent, amber draft, grey withdrawn — so a row here reads
 * exactly like a row on the fleet screens.
 */

type View = 'invoice' | 'proforma';
type StatusFilter = 'all' | InvoiceStatusKey;

export function InvoicesPage() {
  const navigate = useNavigate();
  const { can } = usePermissions();

  const [view, setView] = useState<View>('invoice');
  const [status, setStatus] = useState<StatusFilter>('all');
  const [search, setSearch] = useState('');
  const [creating, setCreating] = useState<View | null>(null);

  const { data: documents = [], isLoading } = useInvoices({ kind: 'all' });
  const markSent = useMarkInvoiceSent();
  const markPaid = useMarkInvoicePaid();
  const cancel = useCancelInvoice();

  const canCreate = can('finance.create');
  const canUpdate = can('finance.update');
  const canApprove = can('finance.approve');

  /* Status is derived per row and used by the tabs, their counts and the
     filter — computed once so the badge and the count cannot disagree. */
  const rows = useMemo(() => {
    const now = Date.now();
    return documents
      .filter((doc) => doc.kind === view)
      .map((doc) => ({ doc, status: statusOf(doc, now) }))
      .sort((a, b) => b.doc.issueDate.localeCompare(a.doc.issueDate));
  }, [documents, view]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    return rows.filter((row) => {
      if (status !== 'all' && row.status !== status) return false;
      if (!term) return true;
      return (
        row.doc.number.toLowerCase().includes(term) ||
        row.doc.shipperCompany.toLowerCase().includes(term) ||
        row.doc.description.toLowerCase().includes(term)
      );
    });
  }, [rows, status, search]);

  const paged = usePagedRows(filtered, { resetKey: `${view}:${status}:${search}` });

  const statusTabs = useMemo(
    () => [
      { key: 'all' as const, label: 'All', count: rows.length },
      ...INVOICE_STATUS_OPTIONS
        .map((option) => ({
          key: option.value as StatusFilter,
          label: option.label,
          count: rows.filter((row) => row.status === option.value).length,
        }))
        /* A tab for a state nothing is in is a dead control. Withdrawn and
           overdue are often empty, and hiding them keeps the bar honest. */
        .filter((tab) => tab.count > 0),
    ],
    [rows],
  );

  const outstanding = useMemo(
    () =>
      filtered
        .filter((row) => row.status !== 'Cancelled' && row.status !== 'Paid')
        .reduce((sum, row) => sum + fromMinorUnits(row.doc.totalMinorUnits, row.doc.currency), 0),
    [filtered],
  );

  /*
   * Five columns, not eight.
   *
   * The first cut had number, client, description, issued, due, total, our cut
   * and status as separate columns; at nine percent each nothing could breathe
   * and every text cell truncated mid-word. These pair the facts that are read
   * together — the number with its client, the two dates with each other, the
   * total with the share taken out of it — which is how the fleet directories
   * are built and why they stay legible.
   */
  const columns: DataColumn<{ doc: InvoiceRecord; status: InvoiceStatusKey }>[] = [
    {
      key: 'number',
      label: 'Document',
      icon: view === 'proforma' ? FileText : Receipt,
      width: 'w-[16%]',
      card: 'identity',
      cell: ({ doc }) => (
        <div className="flex min-w-0 items-center gap-2.5">
          <IconChip
            icon={view === 'proforma' ? FileText : Receipt}
            size={36}
            tint={view === 'proforma' ? 'neutral' : 'teal'}
            className="hidden shrink-0 sm:inline-flex"
          />
          <p className="truncate font-mono text-sm font-semibold text-foreground">{doc.number}</p>
        </div>
      ),
    },
    {
      key: 'client',
      label: 'Client',
      icon: Building2,
      width: 'w-[22%]',
      /* Its own column, at full avatar size. Squeezed under the document
         number the mark was a 16px smudge doing no work at all — and the
         client is the first thing anybody scans a billing list for. */
      cell: ({ doc }) => <ClientCell name={doc.shipperCompany} />,
    },
    {
      key: 'description',
      label: 'For',
      width: 'w-[19%]',
      cell: ({ doc }) => (
        <span className="block truncate text-sm text-muted-foreground" title={doc.description}>
          {doc.description}
        </span>
      ),
    },
    {
      key: 'dates',
      label: view === 'proforma' ? 'Issued · valid to' : 'Issued · due',
      width: 'w-[14%]',
      cell: ({ doc, status: key }) => (
        <div className="text-sm leading-tight">
          <p className="whitespace-nowrap text-foreground">{fmtDocDate(doc.issueDate)}</p>
          <p
            className={
              key === 'Overdue'
                ? 'whitespace-nowrap text-xs font-semibold text-destructive'
                : 'whitespace-nowrap text-xs text-muted-foreground'
            }
          >
            {key === 'Overdue' ? 'was due ' : ''}
            {fmtDocDate(doc.contractDeadline)}
          </p>
        </div>
      ),
    },
    {
      key: 'total',
      label: 'Amount',
      width: 'w-[14%]',
      align: 'right',
      cell: ({ doc }) => {
        const cut = fromMinorUnits(doc.commissionMinorUnits, doc.currency);
        return (
          <div className="leading-tight">
            <p className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground">
              {fmtDjf(fromMinorUnits(doc.totalMinorUnits, doc.currency))}
            </p>
            {/* Our share under the total, not in its own column: it is a part
                of this number, and a reader compares the two by looking down
                two lines rather than across two headings. */}
            <p className="whitespace-nowrap text-xs tabular-nums text-muted-foreground">
              {cut > 0 ? `${fmtDjf(cut)} ours` : 'no commission'}
            </p>
          </div>
        );
      },
    },
    {
      key: 'status',
      label: 'Status',
      width: 'w-[8%]',
      card: 'trailing',
      cell: ({ status: key }) => <RecordStatusBadge option={invoiceStatusOption(key)} />,
    },
    {
      key: 'actions',
      label: 'Actions',
      /* 7%, not 5%: the ⋮ button fits at 5% and the word above it does not —
         the heading truncated to "ACTI…". Same figure the fleet directories
         landed on for the same reason. */
      width: 'w-[7%]',
      card: 'trailing',
      cell: ({ doc, status: key }) => {
        const live = key !== 'Cancelled' && key !== 'Paid';
        return (
          <div className="flex items-center justify-center">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  onClick={(event) => event.stopPropagation()}
                  aria-label={`${doc.number} actions`}
                  className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  <MoreVertical className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-52">
                <DropdownMenuItem
                  onClick={(event) => {
                    event.stopPropagation();
                    navigate(`/finance/invoices/${doc.id}`);
                  }}
                  className="cursor-pointer gap-2 text-xs"
                >
                  <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                  <span>Open document</span>
                </DropdownMenuItem>

                {canUpdate && live && !doc.sentAt ? (
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      markSent.mutate(doc.id);
                    }}
                    className="cursor-pointer gap-2 text-xs"
                  >
                    <Send className="h-3.5 w-3.5 text-muted-foreground" />
                    <span>Mark sent</span>
                  </DropdownMenuItem>
                ) : null}

                {/* Only a bill can be settled. A quotation has nothing owed
                    against it, so the item is absent rather than disabled. */}
                {canApprove && live && doc.kind === 'invoice' ? (
                  <DropdownMenuItem
                    onClick={(event) => {
                      event.stopPropagation();
                      markPaid.mutate(doc.id);
                    }}
                    className="cursor-pointer gap-2 text-xs"
                  >
                    <CheckCircle className="h-3.5 w-3.5 text-success" />
                    <span>Record payment</span>
                  </DropdownMenuItem>
                ) : null}

                {canUpdate && live ? (
                  <>
                    <DropdownMenuSeparator />
                    <DropdownMenuItem
                      onClick={(event) => {
                        event.stopPropagation();
                        cancel.mutate({ id: doc.id, reason: 'Withdrawn by Finance' });
                      }}
                      className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                    >
                      <Ban className="h-3.5 w-3.5" />
                      <span>Withdraw</span>
                    </DropdownMenuItem>
                  </>
                ) : null}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    },
  ];

  const error = (cancel.error ?? markPaid.error ?? markSent.error) as Error | undefined;

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      <PageHeader title="Invoices" />

      {/* View and page action share one band — the house rule. Both create
          actions live here because this is the page that makes documents. */}
      <ViewTabs
        label="Document type"
        value={view}
        onChange={(next) => {
          setView(next);
          setStatus('all');
        }}
        tabs={[
          { key: 'invoice', label: 'Invoices', icon: Receipt },
          { key: 'proforma', label: 'Quotations', icon: FileText },
        ]}
        actions={
          canCreate ? (
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" size="sm" onClick={() => setCreating('proforma')}>
                <Plus className="mr-1.5 size-4" />
                Quotation
              </Button>
              <Button size="sm" onClick={() => setCreating('invoice')}>
                <Plus className="mr-1.5 size-4" />
                Invoice
              </Button>
            </div>
          ) : undefined
        }
      />

      <FilterBar
        tabs={statusTabs}
        active={status}
        onSelect={setStatus}
        label="Document status"
        search={{
          value: search,
          onChange: setSearch,
          placeholder: 'Number, client or description',
          matched: filtered.length,
          total: rows.length,
        }}
      />

      {error ? (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive">
          {error.message}
        </p>
      ) : null}

      <DataTable
        columns={columns}
        rows={paged.rows}
        rowKey={({ doc }) => doc.id}
        breakpoint="72rem"
        onRowClick={({ doc }) => navigate(`/finance/invoices/${doc.id}`)}
        emptyCopy={
          isLoading
            ? 'Loading…'
            : view === 'proforma'
              ? 'No quotations yet. Write one for work a client is asking about.'
              : 'No invoices yet. Raise one from a delivered shipment.'
        }
        emptyAction={
          canCreate && !isLoading ? (
            <Button size="sm" onClick={() => setCreating(view)}>
              <Plus className="mr-1.5 size-4" />
              New {view === 'proforma' ? 'quotation' : 'invoice'}
            </Button>
          ) : undefined
        }
      />
      <TablePager
        paged={paged}
        noun={view === 'proforma' ? 'quotations' : 'invoices'}
        summary={
          outstanding > 0 ? (
            <span className="tabular-nums">{fmtDjf(outstanding)} outstanding</span>
          ) : undefined
        }
      />

      <NewInvoiceDialog
        open={creating === 'invoice'}
        onOpenChange={(open) => setCreating(open ? 'invoice' : null)}
        onCreated={(id) => navigate(`/finance/invoices/${id}`)}
      />
      <NewQuotationDialog
        open={creating === 'proforma'}
        onOpenChange={(open) => setCreating(open ? 'proforma' : null)}
        onCreated={(id) => navigate(`/finance/invoices/${id}`)}
      />
    </div>
  );
}

/**
 * The client, with its mark at a size worth looking at.
 *
 * The registry's real logo first — this list names companies by legal name,
 * which is how the registry is keyed — with the demo fixture behind it for the
 * handful the API does not carry, and initials behind that. A directory that
 * shows some marks and some bare strings reads as two different kinds of
 * company.
 */
function ClientCell({ name }: { name: string }) {
  const registered = useCompanyLogo(name);
  return (
    <span className="flex min-w-0 items-center gap-2.5" title={name}>
      <CompanyAvatar
        size="md"
        src={registered ?? getEmptyReturnCompanyLogo(name)}
        name={name}
        fallback={companyInitials(name)}
        className="shrink-0"
      />
      <span className="truncate text-sm font-medium text-foreground">{name}</span>
    </span>
  );
}
