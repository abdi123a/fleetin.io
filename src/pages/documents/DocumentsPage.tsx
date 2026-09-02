import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Badge, Button, StatisticCard } from '@/design-system';
import {
  Building2,
  CalendarDays,
  FileText,
  RotateCcw,
  ShieldCheck,
  Truck,
  User,
} from '@/design-system/icons';
import { DataTable, FilterBar, FilterMenu, PageHeader, TablePager, usePagedRows } from '@/components';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import { ROUTES } from '@/config/routes';
import { useDocumentBook } from '@/features/documents/api/queries';
import { toDisplayDocument, type DocumentOwnerType } from '@/features/documents/api/documentsService';
import { daysUntilExpiry, documentCatalogFor, documentValidity } from '@/features/documents/catalog';
import { useDrivers } from '@/features/drivers/api/queries';
import { usePartners } from '@/features/partners/api/queries';
import { useShippers } from '@/features/shippers/api/queries';
import { useVehicles } from '@/features/vehicles/api/queries';
import { cn } from '@/utils';

/**
 * The register — every compliance paper Fleetin holds, and when it stops
 * counting.
 *
 * The individual dossiers answer "is this truck papered?"; nothing answered
 * "what lapses this month", which is the only version of the question anybody
 * acts on. A licence expires quietly: no screen changes, no alert fires, and
 * the first anyone hears of it is a truck stopped at a gate.
 *
 * ## Missing is a row, not an absence
 *
 * A record that owes a paper and has never filed one is listed alongside the
 * expired ones, because operationally they are the same fault — the truck
 * cannot prove it is insured — and a page that only lists what exists can
 * never show you what does not. The rows come from the closed catalog
 * (`documentCatalogFor`), so "missing" means "missing something we actually
 * ask for" rather than "missing something somebody once invented".
 *
 * ## Bookings are not here
 *
 * A proof of delivery is a job's evidence, not a counterparty's compliance: it
 * never expires, and one row per container moved would bury the four papers
 * that do need watching. They live on the shipment, where the job is.
 */

type OwnerFilter = 'all' | DocumentOwnerType;
type StateFilter = 'all' | 'expired' | 'expiring' | 'missing' | 'valid';

interface RegisterRow {
  key: string;
  /** The backend document, when one exists. Absent on a missing row. */
  documentId?: string;
  fileName?: string;
  category: string;
  ownerType: Exclude<DocumentOwnerType, 'BOOKING'>;
  ownerId: string;
  /** "Truck DJ-4471", "Ahmed Robleh", "Sahil Transport" — what holds the paper. */
  ownerName: string;
  /** The transporter behind a truck or a driver; the company itself otherwise. */
  ownerContext?: string;
  issuer?: string;
  issueDate?: string;
  expiryDate?: string;
  /** Negative once it has lapsed; `null` when there is no paper or no date. */
  daysLeft: number | null;
  state: 'valid' | 'expiring' | 'expired' | 'missing' | 'undated';
}

const OWNER_LABEL: Record<Exclude<DocumentOwnerType, 'BOOKING'>, string> = {
  SHIPPER: 'Shipper',
  PARTNER: 'Transporter',
  VEHICLE: 'Vehicle',
  DRIVER: 'Driver',
};

const OWNER_ICON = {
  SHIPPER: Building2,
  PARTNER: Building2,
  VEHICLE: Truck,
  DRIVER: User,
} as const;

/* Worst first. The register is read top-down by somebody deciding what to
   chase this morning, so the order is the order of the work. */
const STATE_RANK: Record<RegisterRow['state'], number> = {
  missing: 0,
  expired: 1,
  undated: 2,
  expiring: 3,
  valid: 4,
};

export function DocumentsPage() {
  const navigate = useNavigate();

  const { data: documents = [] } = useDocumentBook();
  const { data: shippersPage } = useShippers();
  const { data: partnersPage } = usePartners();
  const { data: vehiclesPage } = useVehicles();
  const { data: driversPage } = useDrivers();

  const [ownerFilter, setOwnerFilter] = useState<OwnerFilter>('all');
  const [stateFilter, setStateFilter] = useState<StateFilter>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [pageSize, setPageSize] = useState(24);
  const [viewingDoc, setViewingDoc] = useState<DocumentToView | null>(null);

  /**
   * One row per paper the book *should* contain, filled in by what it does.
   *
   * Built from the records rather than from the documents: a document list can
   * only ever describe what was uploaded, and the interesting half of
   * compliance is what was not.
   */
  const rows: RegisterRow[] = useMemo(() => {
    const shippers = shippersPage?.items ?? [];
    const partners = partnersPage?.items ?? [];
    const vehicles = vehiclesPage?.items ?? [];
    const drivers = driversPage?.items ?? [];

    const byOwner = new Map<string, ReturnType<typeof toDisplayDocument>[]>();
    for (const raw of documents) {
      const key = `${raw.ownerType}:${raw.ownerId}`;
      const held = byOwner.get(key) ?? [];
      held.push(toDisplayDocument(raw));
      byOwner.set(key, held);
    }

    const built: RegisterRow[] = [];

    const walk = (
      ownerType: Exclude<DocumentOwnerType, 'BOOKING'>,
      owners: { id: string; name: string; context?: string }[],
    ) => {
      for (const owner of owners) {
        const held = byOwner.get(`${ownerType}:${owner.id}`) ?? [];
        for (const spec of documentCatalogFor(ownerType)) {
          const document = held.find((doc) => doc.category === spec.label);
          const validity = document ? documentValidity(document.expiryDate) : 'undated';
          built.push({
            key: `${ownerType}:${owner.id}:${spec.label}`,
            documentId: document?.id,
            fileName: document?.name,
            category: spec.label,
            ownerType,
            ownerId: owner.id,
            ownerName: owner.name,
            ownerContext: owner.context,
            issuer: document?.issuer,
            issueDate: document?.issueDate,
            expiryDate: document?.expiryDate,
            daysLeft: document?.expiryDate ? daysUntilExpiry(document.expiryDate) : null,
            state: document ? validity : 'missing',
          });
        }
      }
    };

    walk(
      'SHIPPER',
      shippers.map((shipper) => ({ id: shipper.id, name: shipper.companyLegalName })),
    );
    walk(
      'PARTNER',
      partners.map((partner) => ({ id: partner.id, name: partner.companyLegalName })),
    );
    walk(
      'VEHICLE',
      vehicles.map((vehicle) => ({
        id: vehicle.id,
        name: vehicle.plateNumber,
        context: vehicle.partnerName,
      })),
    );
    walk(
      'DRIVER',
      drivers.map((driver) => ({
        id: driver.id,
        name: driver.fullName,
        context: driver.partnerName,
      })),
    );

    return built.sort((a, b) => {
      const rank = STATE_RANK[a.state] - STATE_RANK[b.state];
      if (rank !== 0) return rank;
      return (a.daysLeft ?? 0) - (b.daysLeft ?? 0);
    });
  }, [documents, shippersPage, partnersPage, vehiclesPage, driversPage]);

  const counts = useMemo(
    () => ({
      total: rows.length,
      missing: rows.filter((row) => row.state === 'missing').length,
      expired: rows.filter((row) => row.state === 'expired').length,
      expiring: rows.filter((row) => row.state === 'expiring').length,
      onFile: rows.filter((row) => row.state === 'valid').length,
    }),
    [rows],
  );

  const filtered = useMemo(() => {
    const needle = searchTerm.trim().toLowerCase();
    return rows.filter((row) => {
      if (ownerFilter !== 'all' && row.ownerType !== ownerFilter) return false;
      if (stateFilter === 'expiring' && row.state !== 'expiring') return false;
      if (stateFilter === 'expired' && row.state !== 'expired') return false;
      if (stateFilter === 'missing' && row.state !== 'missing') return false;
      if (stateFilter === 'valid' && row.state !== 'valid') return false;
      if (!needle) return true;
      return [row.ownerName, row.ownerContext, row.category, row.issuer, row.fileName]
        .filter(Boolean)
        .some((value) => (value as string).toLowerCase().includes(needle));
    });
  }, [rows, ownerFilter, stateFilter, searchTerm]);

  const paged = usePagedRows(filtered, {
    pageSize,
    resetKey: `${ownerFilter}|${stateFilter}|${searchTerm}`,
  });

  const hasActiveFilters = ownerFilter !== 'all' || stateFilter !== 'all' || searchTerm.trim() !== '';
  const clearFilters = () => {
    setOwnerFilter('all');
    setStateFilter('all');
    setSearchTerm('');
  };

  /** Straight to the record that owes the paper — chasing it happens there. */
  const openOwner = (row: RegisterRow) => {
    if (row.ownerType === 'VEHICLE') return navigate(`${ROUTES.vehicles}?vehicle=${row.ownerId}`);
    if (row.ownerType === 'DRIVER') return navigate(`${ROUTES.drivers}?driver=${row.ownerId}`);
    if (row.ownerType === 'PARTNER') return navigate(ROUTES.partnerDetail.replace(':id', row.ownerId));
    return navigate(ROUTES.shipperDetail.replace(':id', row.ownerId));
  };

  return (
    <div className="w-full min-w-0 space-y-5 @container/list">
      <PageHeader title="Documents" />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatisticCard
          title="Missing"
          value={counts.missing}
          variant={counts.missing > 0 ? 'peach' : 'default'}
          icon={<FileText className="h-5 w-5" />}
          onClick={() => setStateFilter(stateFilter === 'missing' ? 'all' : 'missing')}
        />
        <StatisticCard
          title="Expired"
          value={counts.expired}
          variant={counts.expired > 0 ? 'pink' : 'default'}
          icon={<CalendarDays className="h-5 w-5" />}
          onClick={() => setStateFilter(stateFilter === 'expired' ? 'all' : 'expired')}
        />
        <StatisticCard
          title="Expiring"
          value={counts.expiring}
          variant="blue"
          icon={<CalendarDays className="h-5 w-5" />}
          onClick={() => setStateFilter(stateFilter === 'expiring' ? 'all' : 'expiring')}
        />
        <StatisticCard
          title="In Force"
          value={counts.onFile}
          variant="teal"
          icon={<ShieldCheck className="h-5 w-5" />}
          onClick={() => setStateFilter(stateFilter === 'valid' ? 'all' : 'valid')}
        />
      </div>

      <FilterBar
        label="Filter documents by what holds them"
        tabs={[
          { key: 'all', label: 'Everything', count: rows.length },
          {
            key: 'PARTNER',
            label: 'Transporters',
            count: rows.filter((row) => row.ownerType === 'PARTNER').length,
          },
          {
            key: 'VEHICLE',
            label: 'Vehicles',
            count: rows.filter((row) => row.ownerType === 'VEHICLE').length,
          },
          {
            key: 'DRIVER',
            label: 'Drivers',
            count: rows.filter((row) => row.ownerType === 'DRIVER').length,
          },
          {
            key: 'SHIPPER',
            label: 'Shippers',
            count: rows.filter((row) => row.ownerType === 'SHIPPER').length,
          },
        ]}
        active={ownerFilter}
        onSelect={(key) => setOwnerFilter(key as OwnerFilter)}
        search={{
          value: searchTerm,
          onChange: setSearchTerm,
          placeholder: 'Search by truck, driver, company…',
          matched: filtered.length,
          total: rows.length,
        }}
      >
        <FilterMenu
          groups={[
            {
              key: 'state',
              label: 'State',
              value: stateFilter,
              onChange: (value: string) => setStateFilter(value as StateFilter),
              options: [
                { value: 'all', label: 'Any state' },
                { value: 'missing', label: 'Never filed' },
                { value: 'expired', label: 'Expired' },
                { value: 'expiring', label: 'Expiring soon' },
                { value: 'valid', label: 'In force' },
              ],
            },
          ]}
          onReset={clearFilters}
        />
      </FilterBar>

      <DataTable
        rows={paged.rows}
        rowKey={(row) => row.key}
        onRowClick={openOwner}
        breakpoint="56rem"
        emptyCopy="No document matches the current filters."
        emptyAction={
          hasActiveFilters ? (
            <Button
              variant="outline"
              size="sm"
              onClick={clearFilters}
              leadingIcon={<RotateCcw className="size-3.5" />}
              className="text-xs"
            >
              Clear filters
            </Button>
          ) : undefined
        }
        columns={[
          {
            key: 'owner',
            label: 'Held by',
            icon: Building2,
            width: 'w-[28%]',
            card: 'identity',
            cell: (row) => {
              const Icon = OWNER_ICON[row.ownerType];
              return (
                <div className="flex min-w-0 items-center gap-2.5">
                  <span className="flex size-9 shrink-0 items-center justify-center rounded-lg border border-border/60 bg-muted">
                    <Icon className="size-4 text-muted-foreground" />
                  </span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-bold text-foreground">
                      {row.ownerName}
                    </span>
                    <span className="block truncate text-[11px] text-muted-foreground">
                      {row.ownerContext ?? OWNER_LABEL[row.ownerType]}
                    </span>
                  </span>
                </div>
              );
            },
          },
          {
            key: 'paper',
            label: 'Document',
            icon: FileText,
            width: 'w-[24%]',
            cell: (row) => (
              <span className="min-w-0">
                <span className="block truncate text-xs font-bold text-foreground">{row.category}</span>
                <span className="block truncate text-[11px] text-muted-foreground">
                  {row.issuer ?? row.fileName ?? 'Never filed'}
                </span>
              </span>
            ),
          },
          {
            key: 'registered',
            label: 'Registered',
            width: 'w-[14%]',
            cell: (row) => (
              <span className="text-xs tabular-nums text-muted-foreground">{row.issueDate ?? '—'}</span>
            ),
          },
          {
            key: 'expires',
            label: 'Expires',
            width: 'w-[14%]',
            cell: (row) => (
              <span
                className={cn(
                  'text-xs tabular-nums',
                  row.state === 'expired'
                    ? 'font-bold text-destructive'
                    : row.state === 'expiring'
                      ? 'font-bold text-warning-subtle-foreground'
                      : 'text-muted-foreground',
                )}
              >
                {row.expiryDate ?? '—'}
              </span>
            ),
          },
          {
            key: 'state',
            label: 'State',
            width: 'w-[20%]',
            card: 'trailing',
            cell: (row) => <StateBadge row={row} />,
          },
        ]}
      />

      {filtered.length > 0 && (
        <TablePager
          paged={paged}
          noun="documents"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}

      <DocumentViewerModal
        open={Boolean(viewingDoc)}
        onOpenChange={(open) => !open && setViewingDoc(null)}
        document={viewingDoc}
      />
    </div>
  );
}

/** The one thing the row is read for. */
function StateBadge({ row }: { row: RegisterRow }) {
  if (row.state === 'missing') {
    return (
      <Badge intent="destructive" variant="subtle" size="sm">
        Never filed
      </Badge>
    );
  }
  if (row.state === 'expired') {
    return (
      <Badge intent="destructive" size="sm">
        Expired {row.daysLeft !== null ? `${Math.abs(row.daysLeft)}d ago` : ''}
      </Badge>
    );
  }
  if (row.state === 'undated') {
    return (
      <Badge intent="warning" variant="subtle" size="sm">
        No expiry
      </Badge>
    );
  }
  if (row.state === 'expiring') {
    return (
      <Badge intent="warning" size="sm">
        {row.daysLeft} days left
      </Badge>
    );
  }
  return (
    <Badge intent="success" variant="subtle" size="sm">
      In force
    </Badge>
  );
}

export default DocumentsPage;
