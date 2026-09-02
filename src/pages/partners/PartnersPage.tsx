import React, { useState, useMemo } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  MoreVertical,
  Package,
  Pencil,
  Plus,
  Trash2,
  Clock,
  Truck,
  X,
  XCircle,
  PauseCircle,
  Phone,
  Mail,
} from '@/design-system/icons';
import { BadgeCheck, RotateCcw, Star } from 'lucide-react';
import { DataTable, FilterBar,
  FilterMenu, PageHeader, TablePager, usePagedRows } from '@/components';
import {
  RecordStatusMark,
  RecordStatusMenuSection,
  PARTNER_STATUS_OPTIONS,
  type RecordStatusOption,
} from '@/components/common';
import { PanelHeader } from '@/components/panels';
import { RecordRaise } from '@/features/workspace';
import { StarRating } from '@/components/performance';
import { useBookings } from '@/features/bookings/api/queries';
import { useDocumentBook } from '@/features/documents/api/queries';
import {
  ComplianceCell,
  complianceFindings,
  tallyFindings,
  type ComplianceOwner,
} from '@/features/documents';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import { UNRATED, summariseFleet } from '@/lib/rating';
import { cn } from '@/utils';
import { useConfirm } from '@/design-system';
import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  StatisticCard,
} from '@/design-system';
import { usePermissions } from '@/hooks';
import { ROUTES, buildPath } from '@/config/routes';
import { AddPartnerForm, type PartnerFormData } from './AddPartnerForm';
import type { PartnerDocument, PartnerRecord, PartnerStatus } from '@/types/partner';

type StatusFilter = 'all' | 'active' | 'pending' | 'suspended' | 'inactive';

/** The tabs, and the status each one selects. One list so the tab bar and the
    small-screen select can never offer different bands. */
const STATUS_TABS: { key: StatusFilter; label: string; tone?: string; status?: PartnerStatus }[] = [
  { key: 'all', label: 'All' },
  { key: 'active', label: 'Active', tone: 'text-primary', status: 'Active' },
  { key: 'pending', label: 'Pending', tone: 'text-warning-subtle-foreground', status: 'Pending' },
  { key: 'suspended', label: 'Suspended', tone: 'text-destructive', status: 'Suspended' },
  { key: 'inactive', label: 'Inactive', status: 'Inactive' },
];
import { computeComplianceScore } from '@/types/partner';
import {
  useCreatePartner,
  useDeletePartner,
  usePartners,
  useUpdatePartner,
  useUploadPartnerLogo,
} from '@/features/partners/api/queries';
import { toDisplayDocument, uploadDocument } from '@/features/documents/api/documentsService';
import { documentQueryKeys, useDocuments } from '@/features/documents/api/queries';

function PartnerLogo({ logoUrl, companyName, className = 'h-10 w-10' }: { logoUrl?: string; companyName: string; className?: string }) {
  const [hasError, setHasError] = useState(false);
  const initials = companyName
    .split(' ')
    .slice(0, 2)
    .map((w) => w[0])
    .join('')
    .toUpperCase();

  if (!logoUrl || hasError) {
    return (
      <div className={`flex items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs shrink-0 border border-primary/20 ${className}`}>
        {initials}
      </div>
    );
  }
  return (
    <img
      src={logoUrl}
      alt={companyName}
      onError={() => setHasError(true)}
      className={`object-cover rounded-lg border border-border/60 shrink-0 ${className}`}
    />
  );
}

/**
 * One glyph for the whole partner-status story — see the shipper list's
 * `ApprovalMark`, which this mirrors deliberately: the two directories say the
 * same thing about a company and must not say it two different ways.
 *
 * It replaced a `Status` column carrying a pill, next to a name that already
 * wore a green tick — the same fact printed twice, one of them spending 12% of
 * the table. A tick, a clock and a cross say active, waiting and suspended in
 * the width of a character, beside the name they are about.
 */
/** A count and what it counts — one treatment, so a stack of them lines up on
    the digit and reads as one comparable pair. */
function FleetCount({ value, noun }: { value: number; noun: string }) {
  return (
    <span className="flex items-baseline gap-1">
      <span className="font-mono text-sm font-bold tabular-nums text-foreground">{value}</span>
      <span className="text-[11px] text-muted-foreground">{noun}</span>
    </span>
  );
}

/** The shipper list drew a line-for-line copy of this; both now read the one
    tone table in `@/components/common/AccountStatus`. */
const partnerOptionFor = (status: PartnerStatus): RecordStatusOption<PartnerStatus> =>
  PARTNER_STATUS_OPTIONS.find((entry) => entry.value === status) ?? {
    value: status,
    label: status,
    tone: 'waiting',
  };

function PartnerMark({ status }: { status: PartnerStatus }) {
  const option = partnerOptionFor(status);
  return <RecordStatusMark tone={option.tone} label={option.label} />;
}

function renderStatusBadge(status: PartnerStatus) {
  switch (status) {
    case 'Active':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-success-subtle text-success-subtle-foreground border border-success/20"><span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />Active</span>;
    case 'Pending':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-warning-subtle text-warning-subtle-foreground border border-warning/20"><Clock className="h-3 w-3" />Pending</span>;
    /* Red, and a pause rather than a cross. Suspended is the loud state —
       somebody stopped this account and somebody has to decide what next —
       while `Inactive` below is settled and drops back to ink. */
    case 'Suspended':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-destructive-subtle text-destructive-subtle-foreground border border-destructive/20"><PauseCircle className="h-3 w-3" />Suspended</span>;
    case 'Inactive':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-muted/60 text-muted-foreground border border-border/60">Inactive</span>;
  }
}

type DrawerState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'profile'; partner: PartnerRecord }
  | { mode: 'edit'; partner: PartnerRecord };

export function PartnersPage() {
  const navigate = useNavigate();
  const { data: partnersResponse, isLoading } = usePartners();
  const partners = useMemo(() => partnersResponse?.items ?? [], [partnersResponse]);
  const createPartner = useCreatePartner();
  const updatePartner = useUpdatePartner();
  const deletePartner = useDeletePartner();
  const queryClient = useQueryClient();
  const uploadLogo = useUploadPartnerLogo();


  const { confirm, confirmDialog } = useConfirm();
  /*
   * What this account may actually do here.
   *
   * Presentation gates only — the server checks every request — but a menu that
   * offers what the server will refuse is worse than a short menu. The
   * read-only `EMTYMANAGER` role holds `partners.view` and nothing else, and it
   * was being shown Edit, Delete and a status ladder, all of which came back
   * 403. An action this account cannot perform is not offered; the same rule
   * the dashboard follows for the panels a role cannot open.
   */
  const { can } = usePermissions();
  const canEditPartners = can('partners.update');
  const canDeletePartners = can('partners.delete');
  const canCreatePartners = can('partners.create');
  const [drawerState, setDrawerState] = useState<DrawerState>({ mode: 'closed' });
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  /**
   * The documents of whichever transporter the drawer is editing.
   *
   * `/partners` does not return them — `uploadedDocuments` is absent from every
   * row and the mapper falls back to `[]` — so the edit form opened with every
   * required type showing as missing, however many had actually been uploaded.
   * Nothing was being deleted: the form simply never knew. Fetched here the way
   * the transporter dossier fetches them, so both read the same list.
   */
  const editingPartnerId =
    drawerState.mode === 'edit' ? drawerState.partner.id : undefined;
  const { data: rawEditDocuments = [] } = useDocuments('PARTNER', editingPartnerId);
  const editDocuments = useMemo(
    () => rawEditDocuments.map(toDisplayDocument) as PartnerDocument[],
    [rawEditDocuments],
  );

  /**
   * Every carrier's star — their drivers' marks, off the booking book.
   *
   * A carrier is never rated directly. What people rate is the driver who
   * turned up, so `summariseFleet` builds the star out of those marks alone
   * while still counting every mission the carrier ran toward the figures.
   *
   * There is no aggregate endpoint, so the rating has to be derived from the
   * bookings themselves — and the whole book is a few megabytes. It is
   * therefore fetched **beside** the table rather than in front of it: the
   * partners query paints the rows immediately, and the stars arrive when they
   * arrive. A carrier list that waits on 700 booking rows before showing a
   * single name would be a bad trade for one column.
   *
   * The limit is deliberately above the book's size. Paging it would silently
   * under-count — a carrier whose later missions fell off the page would show a
   * rating built from half their record, which is worse than showing none.
   */
  const { data: bookingBook } = useBookings({ limit: 2000 });
  const performanceByPartner = useMemo(() => {
    const byPartner = new Map<string, BookingRecord[]>();
    for (const booking of bookingBook?.items ?? []) {
      if (!booking.partnerId) continue;
      const bucket = byPartner.get(booking.partnerId);
      if (bucket) bucket.push(booking);
      else byPartner.set(booking.partnerId, [booking]);
    }
    return new Map([...byPartner].map(([id, rows]) => [id, summariseFleet(rows)]));
  }, [bookingBook]);

  /**
   * What each carrier is holding right now, and how much of it is late.
   *
   * The three things tried in this column before — compliance, rate, equipment
   * — were all static facts *about* a carrier. None of them change between one
   * visit and the next, which is why none of them earned a place in a list
   * somebody opens to decide what to do today. This is live state: how many
   * containers are out with them, and how many are past their return deadline.
   *
   * Overdue is the number that matters. A box past its deadline is detention
   * being charged, and the carrier holding eight of them is a different
   * proposition from the one holding none — a distinction their star cannot
   * make, because a rating is a record and this is a situation.
   *
   * Free: the same booking rows the rating already needed.
   */
  /**
   * Every carrier's paperwork, in one pass over the whole document book.
   *
   * A transporter's compliance is not its own row in a table — it is its
   * licence plus two papers for every truck it owns and one for every driver,
   * which is why this could not be a field on the partner and why the column
   * was left out the first two times the list was designed. Read per row it
   * would be one request per truck; read from the book it is one join.
   *
   * The user asked for it here on 2026-09-01 — "how many docs are missing from
   * this transporter's vehicles and drivers, in one screen" — which is the
   * question a dispatcher actually opens this list with, and the earlier note
   * that compliance is "a dossier detail" was answering a different one.
   */
  const { data: documentBook } = useDocumentBook();
  const complianceByPartner = useMemo(() => {
    const docs = documentBook ?? [];
    const now = Date.now();
    const byPartner = new Map<string, ReturnType<typeof tallyFindings>>();
    for (const partner of partners) {
      const owners: ComplianceOwner[] = [
        { ownerType: 'PARTNER', ownerId: partner.id, ownerLabel: partner.companyLegalName },
        ...(partner.vehicles ?? []).map((vehicle) => ({
          ownerType: 'VEHICLE' as const,
          ownerId: vehicle.id,
          ownerLabel: vehicle.plateNumber,
        })),
        ...(partner.drivers ?? []).map((driver) => ({
          ownerType: 'DRIVER' as const,
          ownerId: driver.id,
          ownerLabel: driver.fullName,
        })),
      ];
      byPartner.set(partner.id, tallyFindings(complianceFindings(owners, docs, now)));
    }
    return byPartner;
  }, [partners, documentBook]);

  const workloadByPartner = useMemo(() => {
    const now = Date.now();
    const byPartner = new Map<string, { running: number; overdue: number }>();
    for (const booking of bookingBook?.items ?? []) {
      if (!booking.partnerId) continue;
      if (['Completed', 'Cancelled', 'Failed'].includes(booking.status)) continue;
      const bucket = byPartner.get(booking.partnerId) ?? { running: 0, overdue: 0 };
      bucket.running += 1;
      const deadline = booking.containerReturnDeadline
        ? Date.parse(booking.containerReturnDeadline)
        : null;
      if (deadline !== null && deadline < now) bucket.overdue += 1;
      byPartner.set(booking.partnerId, bucket);
    }
    return byPartner;
  }, [bookingBook]);

  // Filters & Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name-asc');

  /** A refused write has to read as refused — the banner was success-green whatever happened. */
  const [noticeTone, setNoticeTone] = useState<'success' | 'error'>('success');

  const showSuccess = (msg: string, tone: 'success' | 'error' = 'success') => {
    setNoticeTone(tone);
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 4500);
  };

  // Analytics
  const totalPartnersCount = partners.length;
  const activeCount = partners.filter((p) => p.partnerStatus === 'Active').length;
  const totalFleetCount = partners.reduce((acc, p) => acc + (p.vehicles?.length || p.fleetSize || 0), 0);
  const pendingReviewCount = partners.filter((p) => p.partnerStatus === 'Pending').length;

  // Filtered & Sorted
  const filteredPartners = useMemo(() => {
    const list = partners.filter((p) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        p.companyLegalName.toLowerCase().includes(q) ||
        p.id.toLowerCase().includes(q) ||
        p.country.toLowerCase().includes(q) ||
        p.primaryDispatcher.name.toLowerCase().includes(q) ||
        p.operatingRegions.some((r) => r.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' || p.partnerStatus.toLowerCase() === statusFilter.toLowerCase();
      const matchesCountry = countryFilter === 'all' || p.country === countryFilter;

      return matchesSearch && matchesStatus && matchesCountry;
    });

    list.sort((a, b) => {
      if (sortBy === 'name-asc') return a.companyLegalName.localeCompare(b.companyLegalName);
      if (sortBy === 'name-desc') return b.companyLegalName.localeCompare(a.companyLegalName);
      if (sortBy === 'fleet-desc') return (b.vehicles?.length || b.fleetSize) - (a.vehicles?.length || a.fleetSize);
      if (sortBy === 'score-desc') return computeComplianceScore(b) - computeComplianceScore(a);
      return 0;
    });

    return list;
  }, [partners, searchTerm, statusFilter, countryFilter, sortBy]);

  /** One page at a time — the row list and the card grid share the pager. */
  const [pageSize, setPageSize] = useState(12);
  const pagedPartners = usePagedRows(filteredPartners, {
    pageSize,
    resetKey: `${statusFilter}|${countryFilter}|${searchTerm}|${sortBy}`,
  });

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all' || countryFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setCountryFilter('all');
    setSortBy('name-asc');
  };

  const handleViewDetail = (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigate(buildPath(ROUTES.partnerDetail, { id }));
  };

  /**
   * Move a transporter up or down the ladder from the row itself.
   *
   * `Suspended` was already a real state here — it had a tab and a badge — but
   * nothing on the page could *set* it, so the list showed a band that could
   * never be reached. Same story as `Pending`, which had no way out either.
   */
  const handleStatusChange = async (partner: PartnerRecord, next: PartnerStatus) => {
    if (next === partner.partnerStatus) return;
    try {
      /* `mutateAsync`, not `mutate`. Fire-and-forget announced the new status
         the instant it was clicked — including for a role that may only read
         transporters, where the PATCH comes back 403 and nothing changed. */
      await updatePartner.mutateAsync({ id: partner.id, payload: { partnerStatus: next } });
      /* The open drawer is fed from `drawerState`, not the query, so it would go
         on printing the old badge until it was reopened. */
      if (drawerState.mode !== 'closed' && 'partner' in drawerState && drawerState.partner.id === partner.id) {
        setDrawerState({ ...drawerState, partner: { ...drawerState.partner, partnerStatus: next } });
      }
      showSuccess(`${partner.companyLegalName} is now ${next.toLowerCase()}.`);
    } catch {
      showSuccess(`Could not change ${partner.companyLegalName} — your account cannot edit transporters.`, 'error');
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const partner = partners.find((row) => row.id === id);
    const ok = await confirm({
      title: 'Remove this transporter?',
      description: `${partner?.companyLegalName ?? 'This transporter'} will be removed, along with their price list. Bookings already assigned to them keep their record.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    deletePartner.mutate(id);
    setDrawerState({ mode: 'closed' });
    showSuccess('Transporter removed.');
  };

  const handleAddSuccess = async (formData: PartnerFormData, editingId?: string) => {
    const payload = {
      companyLegalName: formData.companyLegalName,
      registrationNumber: formData.registrationNumber,
      businessLicenseNumber: formData.businessLicenseNumber,
      country: formData.country,
      address: formData.address,
      operatingRegions: formData.operatingRegions.split(',').map((s) => s.trim()).filter(Boolean),
      serviceCategories: formData.serviceCategories.split(',').map((s) => s.trim()).filter(Boolean),
      fleetSize: parseInt(formData.fleetSize) || 0,
      vehicleTypes: formData.vehicleTypes.split(',').map((s) => s.trim()).filter(Boolean),
      insuranceProvider: formData.insuranceProvider,
      insurancePolicyNumber: formData.insurancePolicyNumber,
      insuranceExpiry: formData.insuranceExpiry,
      partnerStatus: formData.partnerStatus,
      primaryDispatcher: {
        name: formData.primaryDispatcherName,
        title: formData.primaryDispatcherTitle,
        phone: formData.primaryDispatcherPhone,
        email: formData.primaryDispatcherEmail,
      },
    };

    const partner = editingId
      ? await updatePartner.mutateAsync({ id: editingId, payload })
      : await createPartner.mutateAsync(payload);

    /* After the record exists, because the route is `/partners/:id/logo` — a
       new transporter has no id to upload against until `create` returns. */
    if (formData.logo) {
      await uploadLogo.mutateAsync({ id: partner.id, file: formData.logo });
    }

    /* Reported, not swallowed. A rejected upload used to abort this handler
       before the drawer closed and before any message was shown, so a refused
       document looked exactly like a successful save that had quietly dropped
       it. The profile is already saved by this point, so a failure here is
       partial, and the message says which part. */
    const failed: string[] = [];
    for (const staged of formData.stagedDocuments) {
      try {
        await uploadDocument({
          ownerType: 'PARTNER',
          ownerId: partner.id,
          category: staged.category,
          file: staged.capture.file,
          issueDate: staged.capture.issueDate,
          expiryDate: staged.capture.expiryDate,
          issuer: staged.capture.issuer,
        });
      } catch {
        failed.push(staged.category);
      }
    }
    await queryClient.invalidateQueries({
      queryKey: documentQueryKeys.list('PARTNER', partner.id),
    });

    setDrawerState({ mode: 'closed' });
    if (failed.length > 0) {
      showSuccess(
        `Transporter saved, but ${failed.length} document${failed.length === 1 ? '' : 's'} could not be uploaded (${failed.join(', ')}).`,
        'error',
      );
      return;
    }
    showSuccess(`Transporter "${partner.companyLegalName}" ${editingId ? 'updated' : 'created'}.`);
  };

  return (
    <div className="space-y-5 pb-12">
      {confirmDialog}
      {/* Toast Notification Banner */}
      {successNotice && (
        <div
          className={cn(
            'flex items-center justify-between rounded-lg p-3.5 shadow-2xs animate-in fade-in',
            noticeTone === 'error'
              ? 'border border-destructive/30 bg-destructive-subtle text-destructive-subtle-foreground'
              : 'border border-success/30 bg-success-subtle text-success-subtle-foreground',
          )}
        >
          <div className="flex items-center gap-2.5">
            {noticeTone === 'error' ? (
              <XCircle className="h-4 w-4 shrink-0" />
            ) : (
              <CheckCircle2 className="h-4 w-4 shrink-0" />
            )}
            <span className="text-xs font-medium">{successNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessNotice(null)}
            className="p-1 rounded-md hover:bg-success-subtle transition-colors"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Partners"
        actions={
          canCreatePartners ? (
            <Button
              onClick={() => setDrawerState({ mode: 'create' })}
              shape="pill"
              leadingIcon={<Plus className="h-4 w-4" />}
              className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs"
            >
              Add transporter
            </Button>
          ) : undefined
        }
      />

      {/* KPI Stat Cards */}
      {/* Two-up on a phone, not four stacked. One tile per row put four
          full-width blocks between the page title and the list they summarise,
          so the first screen was entirely header and the actual work started
          below the fold. */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
        <StatisticCard
          title="Total Transporters"
          value={totalPartnersCount}
          variant="teal"
          trend="up"
          percentage="100%"
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatisticCard
          title="Active Transporters"
          value={activeCount}
          variant="blue"
          trend="up"
          percentage={`${Math.round((activeCount / (totalPartnersCount || 1)) * 100)}%`}
          icon={<BadgeCheck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Fleet Vehicles"
          value={totalFleetCount}
          variant="peach"
          trend="up"
          percentage="+18%"
          icon={<Truck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Pending Review"
          value={pendingReviewCount}
          variant="pink"
          trend={pendingReviewCount > 0 ? 'down' : 'neutral'}
          percentage={pendingReviewCount > 0 ? `${pendingReviewCount} pending` : '0'}
          icon={<Clock className="h-5 w-5" />}
        />
      </div>

      {/* The app's one filter bar — the same tabs, search and sort every other
          list uses. This was a bordered card holding filled primary pills in
          one horizontal scroller and three selects in another, so on a phone
          half the filters ran off the right edge and had to be dragged into
          view. Nothing here scrolls. */}
      <FilterBar
        label="Filter transporters by status"
        tabs={STATUS_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          tone: tab.tone,
          count:
            tab.key === 'all'
              ? partners.length
              : partners.filter((p) => p.partnerStatus === tab.status).length,
        }))}
        active={statusFilter}
        onSelect={setStatusFilter}
        search={{
          value: searchTerm,
          onChange: setSearchTerm,
          placeholder: 'Search transporters…',
          matched: filteredPartners.length,
          total: partners.length,
        }}
      >
        <FilterMenu
          groups={[
            {
              key: 'sort',
              label: 'Sort by',
              value: sortBy,
              onChange: setSortBy,
              options: [
                { value: 'name-asc', label: 'Name (A–Z)' },
                { value: 'name-desc', label: 'Name (Z–A)' },
                { value: 'fleet-desc', label: 'Largest fleet' },
              ],
            },
          ]}
          onReset={clearFilters}
          resetActive={hasActiveFilters}
        />
      </FilterBar>

      {/* ── Add / Edit Sheet Drawer ── */}
      <Sheet open={drawerState.mode === 'create' || drawerState.mode === 'edit'} onOpenChange={(open) => !open && setDrawerState({ mode: 'closed' })}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
        >
          <SheetTitle className="sr-only">{drawerState.mode === 'edit' ? 'Edit Transporter' : 'Add Transporter'}</SheetTitle>
          <SheetDescription className="sr-only">Transporter profile form</SheetDescription>
          <AddPartnerForm
            isEdit={drawerState.mode === 'edit'}
            initialData={
              drawerState.mode === 'edit'
                ? {
                    companyLegalName: drawerState.partner.companyLegalName,
                    country: drawerState.partner.country,
                    address: drawerState.partner.address,
                    operatingRegions: drawerState.partner.operatingRegions.join(', '),
                    serviceCategories: drawerState.partner.serviceCategories.join(', '),
                    fleetSize: String(drawerState.partner.fleetSize),
                    vehicleTypes: drawerState.partner.vehicleTypes.join(', '),
                    partnerStatus: drawerState.partner.partnerStatus,
                    primaryDispatcherName: drawerState.partner.primaryDispatcher.name,
                    primaryDispatcherTitle: drawerState.partner.primaryDispatcher.title,
                    primaryDispatcherPhone: drawerState.partner.primaryDispatcher.phone,
                    primaryDispatcherEmail: drawerState.partner.primaryDispatcher.email,
                    uploadedDocuments: editDocuments,
                    registrationNumber: drawerState.partner.registrationNumber,
                    businessLicenseNumber: drawerState.partner.businessLicenseNumber,
                    insuranceProvider: drawerState.partner.insuranceProvider,
                    insurancePolicyNumber: drawerState.partner.insurancePolicyNumber,
                    insuranceExpiry: drawerState.partner.insuranceExpiry,
                  }
                : undefined
            }
            onSuccess={(formData) => handleAddSuccess(formData, drawerState.mode === 'edit' ? drawerState.partner.id : undefined)}
            onCancel={() => setDrawerState({ mode: 'closed' })}
          />
        </SheetContent>
      </Sheet>

      {/* ── Profile Quick View Sheet ── */}
      <Sheet open={drawerState.mode === 'profile'} onOpenChange={(open) => !open && setDrawerState({ mode: 'closed' })}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-5 bg-background border-l border-border">
          <SheetTitle className="sr-only">Transporter Quick View</SheetTitle>
          <SheetDescription className="sr-only">Transporter profile preview</SheetDescription>
          {drawerState.mode === 'profile' && drawerState.partner && (
            <div className="space-y-5">
              {/* This panel had no way to edit at all — the only transporter
                  surface that did not. It opens the same form the list's Edit
                  action does, rather than inventing a second one. */}
              <PanelHeader
                media={
                  <PartnerLogo
                    logoUrl={drawerState.partner.logoUrl}
                    companyName={drawerState.partner.companyLegalName}
                    className="h-14 w-14 shrink-0"
                  />
                }
                title={drawerState.partner.companyLegalName}
                subtitle={<span className="font-mono">{drawerState.partner.reference}</span>}
                verified={drawerState.partner.partnerStatus === 'Active'}
                status={renderStatusBadge(drawerState.partner.partnerStatus)}
                onEdit={
                  canEditPartners
                    ? () => setDrawerState({ mode: 'edit', partner: drawerState.partner })
                    : undefined
                }
              />

              <RecordRaise
                recordType="PARTNER"
                recordId={drawerState.partner.id}
                recordRef={drawerState.partner.reference}
                label={drawerState.partner.companyLegalName}
                size="sm"
              />

              <div className="grid grid-cols-3 gap-2 text-center">
                <div className="p-2 rounded-lg bg-muted/30 border border-border/60">
                  <p className="text-lg font-black text-foreground">{drawerState.partner.fleetSize}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Fleet</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30 border border-border/60">
                  <p className="text-lg font-black text-foreground">{drawerState.partner.drivers?.length || 0}</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Drivers</p>
                </div>
                <div className="p-2 rounded-lg bg-muted/30 border border-border/60">
                  <p className="text-lg font-black text-primary">{computeComplianceScore(drawerState.partner)}%</p>
                  <p className="text-[10px] text-muted-foreground font-medium">Compliance</p>
                </div>
              </div>

              <div className="space-y-1.5">
                <h4 className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">Primary Dispatcher</h4>
                <div className="p-3 rounded-lg border border-border/60 bg-card space-y-1.5 text-xs">
                  <p className="font-bold text-foreground">{drawerState.partner.primaryDispatcher.name}</p>
                  <p className="text-muted-foreground">{drawerState.partner.primaryDispatcher.title}</p>
                  <div className="flex items-center gap-2 pt-1">
                    <Phone className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-semibold">{drawerState.partner.primaryDispatcher.phone}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Mail className="h-3.5 w-3.5 text-primary shrink-0" />
                    <span className="font-semibold truncate">{drawerState.partner.primaryDispatcher.email}</span>
                  </div>
                </div>
              </div>

              <Button
                onClick={() => handleViewDetail(drawerState.partner.reference)}
                shape="pill"
                leadingIcon={<ExternalLink className="h-4 w-4" />}
                className="w-full bg-primary hover:bg-primary-hover text-primary-foreground py-3 font-semibold text-xs shadow-xs"
              >
                Open transporter dossier
              </Button>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* One list surface, no view switcher. A directory is a comparison
          surface, and the grid answered "which of these is which" by putting
          every value at a different x. The card layout is still here — the
          table falls back to it below the width where its columns fit. */}
      <DataTable
        rows={pagedPartners.rows}
        rowKey={(partner) => partner.id}
        onRowClick={(partner) => setDrawerState({ mode: 'profile', partner })}
        emptyCopy="No transporter matches the current filters."
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
        breakpoint="48rem"
        columns={[
          {
            key: 'transporter',
            label: 'Transporter',
            icon: Building2,
            width: 'w-[30%]',
            card: 'identity',
            cell: (partner) => (
              <div className="flex min-w-0 items-center gap-2.5">
                <PartnerLogo
                  logoUrl={partner.logoUrl}
                  companyName={partner.companyLegalName}
                  className="h-8 w-8 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-foreground">
                      {partner.companyLegalName}
                    </span>
                    <PartnerMark status={partner.partnerStatus} />
                  </div>
                  <span className="flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
                    <span className="font-mono">{partner.reference}</span>
                    <span aria-hidden>·</span>
                    <span className="truncate">{partner.country}</span>
                  </span>
                </div>
              </div>
            ),
          },
          {
            key: 'fleet',
            label: 'Fleet',
            icon: Truck,
            width: 'w-[12%]',
            cardLabel: 'Fleet / drivers',
            /* Two counts of the same kind, set the same way. The vehicles
               figure was mono and bold while the drivers figure was plain 11px
               inside its own sentence, so one line read as a number and the
               other as a caption — and the digits did not line up to be
               compared, which is the only reason to stack them. */
            cell: (partner) => (
              <div className="min-w-0 space-y-0.5">
                <FleetCount
                  value={partner.vehicles?.length || partner.fleetSize}
                  noun="vehicles"
                />
                <FleetCount value={partner.drivers?.length || 0} noun="drivers" />
              </div>
            ),
          },
          {
            /* Was "Operating regions", which repeated what the identity cell
               already says: the line under every name reads `PTR-203 · Ethiopia`,
               and for these carriers the country is the first of their regions.
               Two columns, one fact.

               Rate and rating replaced it because those are the two questions
               actually asked of a carrier list — what do they charge, and how
               do they perform. Compliance was neither: it is a dossier detail
               that matters once you are already looking at one transporter. */
            /* Third attempt, and the first that is not a static attribute.
               "Compliance", "Rate" and "Equipment" were each a fact about the
               carrier rather than about the work — none of them change between
               one visit and the next. (Rate could not have worked regardless:
               the partners *list* endpoint does not return `pricingGrid`, only
               `GET /partners/:id` does, so every row read "Not priced" by
               construction.)

               A carrier list is opened to decide what to do today, so it shows
               what is happening today. */
            key: 'active',
            label: 'Active load',
            icon: Package,
            width: 'w-[16%]',
            cardLabel: 'Active load',
            cell: (partner) => {
              const load = workloadByPartner.get(partner.id);
              if (!load || load.running === 0) {
                return <span className="text-xs text-muted-foreground">Nothing out</span>;
              }
              return (
                <div className="min-w-0 space-y-0.5">
                  <FleetCount value={load.running} noun="containers" />
                  {load.overdue > 0 ? (
                    /* The only red on this table, and it is the one number that
                       is costing money while it is read. */
                    <span className="flex items-baseline gap-1">
                      <span className="font-mono text-sm font-bold tabular-nums text-destructive">
                        {load.overdue}
                      </span>
                      <span className="text-[11px] font-semibold text-destructive">overdue</span>
                    </span>
                  ) : (
                    <span className="text-[11px] text-muted-foreground">none overdue</span>
                  )}
                </div>
              );
            },
          },
          {
            key: 'documents',
            label: 'Documents',
            icon: FileText,
            width: 'w-[18%]',
            cardLabel: 'Documents',
            cell: (partner) => (
              <ComplianceCell
                tally={
                  complianceByPartner.get(partner.id) ?? {
                    required: 0,
                    valid: 0,
                    expiring: 0,
                    expired: 0,
                    missing: 0,
                    attention: 0,
                  }
                }
                vehicles={partner.vehicles?.length ?? 0}
                drivers={partner.drivers?.length ?? 0}
              />
            ),
          },
          {
            key: 'rating',
            label: 'Rating',
            icon: Star,
            width: 'w-[14%]',
            cardLabel: 'Rating',
            cell: (partner) => {
              const summary = performanceByPartner.get(partner.id) ?? UNRATED;
              if (!summary.rated) {
                return <span className="text-xs text-muted-foreground">Not yet rated</span>;
              }
              return (
                <div className="min-w-0">
                  <StarRating value={summary.overall} size="sm" />
                  {/* Set like the Fleet counts beside it — mono bold figure,
                      muted noun. At 10px muted this was the quietest thing in
                      the row, when it is the weight behind the star: 4.4 over
                      six debriefs and 4.4 over ninety are not the same claim. */}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2">
                    <FleetCount value={summary.ratedMissions} noun="rated" />
                  </span>
                </div>
              );
            },
          },
          {
            key: 'actions',
            label: 'Actions',
            width: 'w-[10%]',
            card: 'trailing',
            /* The menu only. A "Dossier" button beside it opened the same drawer
               the row itself opens and the menu's own first item opens — three
               ways to do one thing, two of them spending a column of width. */
            cell: (partner) => (
              /* Centred in its column. The button is a 32px square in a 10%
                 column, so left-aligned it sat against the rule with a hand's
                 width of nothing after it — the last column read as empty with
                 something stuck to its edge. */
              <div className="flex items-center justify-center">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Transporter actions"
                      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={(e) => handleViewDetail(partner.reference, e)}
                      className="cursor-pointer gap-2 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>View dossier</span>
                    </DropdownMenuItem>
                    {canEditPartners && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawerState({ mode: 'edit', partner });
                        }}
                        className="cursor-pointer gap-2 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Edit profile</span>
                      </DropdownMenuItem>
                    )}
                    {canEditPartners && (
                      <RecordStatusMenuSection
                        value={partner.partnerStatus}
                        options={PARTNER_STATUS_OPTIONS}
                        onSelect={(next) => handleStatusChange(partner, next)}
                        busy={updatePartner.isPending}
                      />
                    )}
                    {canDeletePartners && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => handleDelete(partner.id, e)}
                          className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete transporter</span>
                        </DropdownMenuItem>
                      </>
                    )}
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            ),
          },
        ]}
      />

      {filteredPartners.length > 0 && (
        <TablePager
          paged={pagedPartners}
          noun="transporters"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}

      {/* Loading only. The "No Transporters Found" panel that used to sit here
          printed the table's own empty row a second time, one above the other,
          in two different sizes — the list owns its emptiness now. */}
      {isLoading && filteredPartners.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-12 text-center">
          <p className="text-xs text-muted-foreground">Loading transporters…</p>
        </div>
      )}
    </div>
  );
}

export default PartnersPage;
