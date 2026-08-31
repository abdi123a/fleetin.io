import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  FileText,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  User,
  Clock,
  Calendar,
  Truck,
  X,
  XCircle,
} from '@/design-system/icons';
import { BadgeCheck, RotateCcw } from 'lucide-react';
import {
  CountryFlag,
  DataTable,
  FilterBar,
  FilterMenu,
  PageHeader,
  TablePager,
  usePagedRows,
} from '@/components';
import {
  RecordStatusBadge,
  RecordStatusMark,
  RecordStatusMenuSection,
  SHIPPER_STATUS_OPTIONS,
  type DataColumn,
  type RecordStatusOption,
} from '@/components/common';
import { cn } from '@/utils';
import { PanelHeader } from '@/components/panels';
import { RecordRaise } from '@/features/workspace';
import { useConfirm } from '@/design-system';
import {
  Button,
  Card,
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
import { AddShipperForm, type ShipperFormData } from './AddShipperForm';
import { useShippers, useCreateShipper, useUpdateShipper, useDeleteShipper, useUploadShipperLogo } from '@/features/shippers/api/queries';
import { useAllInvoices } from '@/features/finance';
import { compactDjf } from '@/lib/finance/format';
import { countryCode } from '@/lib/countryFlag';
import { uploadDocument } from '@/features/documents/api/documentsService';
import type { ShipperRecord, ApprovalStatus } from '@/types/shipper';

export type { ShipperRecord };

/**
 * "today", "3d", "5w", "7mo" — the shortest true thing at that distance.
 *
 * A directory column is read down, not across: exact dates in a stack all look
 * the same and the reader has to subtract to find the stale one. A magnitude
 * sorts by eye. The exact date is one hover away.
 */
function relativeDays(days: number): string {
  if (days <= 0) return 'Today';
  if (days === 1) return 'Yesterday';
  if (days < 14) return `${days}d ago`;
  if (days < 60) return `${Math.floor(days / 7)}w ago`;
  if (days < 365) return `${Math.floor(days / 30)}mo ago`;
  return `${Math.floor(days / 365)}y ago`;
}

type StatusFilter = 'all' | 'verified' | 'pending' | 'suspended' | 'canceled';

/** The tabs, and the status each one selects. One list so the tab bar and the
    small-screen select can never offer different bands. */
const STATUS_TABS: { key: StatusFilter; label: string; tone?: string; status?: ApprovalStatus }[] = [
  { key: 'all', label: 'All' },
  { key: 'verified', label: 'Verified', tone: 'text-primary', status: 'Verified' },
  { key: 'pending', label: 'Pending', tone: 'text-warning-subtle-foreground', status: 'Pending' },
  { key: 'suspended', label: 'Suspended', tone: 'text-destructive', status: 'Suspended' },
  /* No tone: a closed account is settled, so its count stays ink like `All`. */
  { key: 'canceled', label: 'Canceled', status: 'Canceled' },
];

type DrawerState =
  | { mode: 'closed' }
  | { mode: 'create' }
  | { mode: 'profile'; shipper: ShipperRecord }
  | { mode: 'edit'; shipper: ShipperRecord };

function ShipperLogo({
  logoUrl,
  companyName,
  className = 'h-10 w-10',
}: {
  logoUrl?: string;
  companyName: string;
  className?: string;
}) {
  const [hasError, setHasError] = useState(false);

  const getInitials = (name: string) => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    const first = parts[0];
    const second = parts[1];
    if (first && second) {
      return (first.charAt(0) + second.charAt(0)).toUpperCase();
    }
    return (name.trim().slice(0, 2) || 'SH').toUpperCase();
  };

  if (!logoUrl || hasError) {
    const initials = getInitials(companyName);
    return (
      <div
        className={`flex items-center justify-center rounded-lg bg-primary/10 text-primary font-bold text-xs shrink-0 border border-primary/20 ${className}`}
      >
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

export function ShippersPage() {
  const navigate = useNavigate();
  const { data: shippersResponse, isLoading } = useShippers();
  const shippers = useMemo(() => shippersResponse?.items ?? [], [shippersResponse]);
  // activeShipments/pastShipments arrive already computed server-side (never
  // stored, joined against real Shipment rows per request) — no local
  // recomputation against a Shipments store needed here anymore.
  const shippersWithLiveCounts = shippers;
  const { can } = usePermissions();

  /*
   * A shipper's own numbers.
   *
   * Containers-out and returned-on-time were here first and were the wrong
   * half of the trip: driving an empty back to the depot is the carrier's job,
   * so a column of it rates the carrier on the shipper's row. What a shipper
   * alone answers for is the account — what they still owe — so that is what
   * this map is for.
   *
   * It used to carry `lastBilledAt` too, for a "Last billed" column that
   * answered "is this client still trading?" through their invoices. That
   * question is worth a column and the money was only ever a proxy for it, so
   * it is now `lastShipmentAt` — the same question asked of the traffic
   * itself, computed server-side beside the shipment counts and visible to
   * every role rather than only to finance.
   *
   * Open and overdue follow the dashboard's receivables rule exactly (unpaid
   * with a balance left; past the contract deadline by any part of a day), so
   * the column and the Receivables card cannot drift apart.
   */
  const canSeeMoney = can('finance.view');
  const { data: invoices = [] } = useAllInvoices({}, { enabled: canSeeMoney });
  const moneyByShipper = useMemo(() => {
    const now = Date.now();
    const DAY_MS = 86_400_000;
    const byShipper = new Map<string, { outstanding: number; overdue: number }>();
    for (const invoice of invoices) {
      if (!invoice.shipperId) continue;
      const bucket = byShipper.get(invoice.shipperId) ?? { outstanding: 0, overdue: 0 };
      const remaining = Number(invoice.remainingMinorUnits);
      if (invoice.status !== 'Paid' && remaining > 0) {
        bucket.outstanding += remaining;
        /* Ceil, not floor: past the deadline at all is day one late. */
        const daysPast = Math.ceil(
          (now - new Date(invoice.contractDeadline).getTime()) / DAY_MS,
        );
        if (daysPast > 0) bucket.overdue += 1;
      }
      byShipper.set(invoice.shipperId, bucket);
    }
    return byShipper;
  }, [invoices]);

  const createShipper = useCreateShipper();
  const updateShipper = useUpdateShipper();
  const deleteShipper = useDeleteShipper();
  const { confirm, confirmDialog } = useConfirm();
  /*
   * What this account may actually do here.
   *
   * Presentation gates only — the server checks every request — but a menu that
   * offers what the server will refuse is worse than a short menu. The
   * read-only `EMTYMANAGER` role holds `shippers.view` and nothing else, and it
   * was being shown Edit, Delete and a status ladder, all of which came back
   * 403. An action this account cannot perform is not offered; the same rule
   * the dashboard follows for the panels a role cannot open.
   */
  const canEditShippers = can('shippers.update');
  const canDeleteShippers = can('shippers.delete');
  const canCreateShippers = can('shippers.create');
  const uploadLogo = useUploadShipperLogo();

  const [drawerState, setDrawerState] = useState<DrawerState>({ mode: 'closed' });
  const [successNotice, setSuccessNotice] = useState<string | null>(null);
  /** A refused write has to read as refused — the banner was success-green whatever happened. */
  const [noticeTone, setNoticeTone] = useState<'success' | 'error'>('success');

  const showNotice = (message: string, tone: 'success' | 'error' = 'success') => {
    setNoticeTone(tone);
    setSuccessNotice(message);
    setTimeout(() => setSuccessNotice(null), 5000);
  };

  // Filters & Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name-asc');

  const handleFormSuccess = async (formData: ShipperFormData) => {
    const payload = {
      companyLegalName: formData.companyLegalName,
      registrationNumber: formData.registrationNumber || '',
      industry: formData.industry || 'Logistics & Freight',
      companySize: formData.companySize,
      approvalStatus: formData.approvalStatus,
      country: formData.country,
      address: formData.address,
      primaryContact: {
        name: formData.primaryContactName || 'Lead Contact',
        title: formData.primaryContactTitle || 'Logistics Manager',
        email: formData.primaryContactEmail || 'contact@company.com',
        phone: formData.primaryContactPhone || '+253 77 00 00 00',
      },
    };

    if (drawerState.mode === 'edit' && 'shipper' in drawerState) {
      const shipperId = drawerState.shipper.id;
      const updated = await updateShipper.mutateAsync({ id: shipperId, payload });
      if (formData.logo) {
        await uploadLogo.mutateAsync({ id: shipperId, file: formData.logo });
      }
      for (const [category, file] of Object.entries(formData.stagedFiles)) {
        await uploadDocument({ ownerType: 'SHIPPER', ownerId: shipperId, category, file });
      }
      setDrawerState({ mode: 'profile', shipper: updated });
      setSuccessNotice(`Shipper "${formData.companyLegalName}" updated successfully!`);
    } else {
      const created = await createShipper.mutateAsync(payload);
      if (formData.logo) {
        await uploadLogo.mutateAsync({ id: created.id, file: formData.logo });
      }
      for (const [category, file] of Object.entries(formData.stagedFiles)) {
        await uploadDocument({ ownerType: 'SHIPPER', ownerId: created.id, category, file });
      }
      setDrawerState({ mode: 'closed' });
      setSuccessNotice(`Shipper "${formData.companyLegalName}" created successfully!`);
    }
    setTimeout(() => setSuccessNotice(null), 5000);
  };

  /**
   * Move an account up or down the ladder from the row itself.
   *
   * The list used to offer View / Edit / Delete and nothing else, so the only
   * way to change a status was the edit sheet — which had no status control
   * either. A `Pending` shipper was therefore stuck: nothing on the page could
   * clear it, and taking a company out of circulation meant deleting it.
   */
  const handleStatusChange = async (shipper: ShipperRecord, next: ApprovalStatus) => {
    if (next === shipper.approvalStatus) return;
    try {
      /* `mutateAsync`, not `mutate`. Fire-and-forget announced "now suspended"
         the instant it was clicked — including for an account whose role holds
         only `shippers.view`, where the PATCH comes back 403 and nothing at all
         changed. The notice has to wait for the server. */
      await updateShipper.mutateAsync({ id: shipper.id, payload: { approvalStatus: next } });
      /* The open drawer is fed from `drawerState`, not the query, so it would go
         on printing the old badge behind the menu until it was reopened. */
      if (drawerState.mode !== 'closed' && 'shipper' in drawerState && drawerState.shipper.id === shipper.id) {
        setDrawerState({ ...drawerState, shipper: { ...drawerState.shipper, approvalStatus: next } });
      }
      showNotice(`"${shipper.companyLegalName}" is now ${next.toLowerCase()}.`);
    } catch {
      showNotice(`Could not change "${shipper.companyLegalName}" — your account cannot edit shippers.`, 'error');
    }
  };

  const handleDelete = async (id: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await confirm({
      title: 'Remove this shipper?',
      description: 'The account will be removed. Shipments already booked under it keep their record.',
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    deleteShipper.mutate(id);
    if (drawerState.mode !== 'closed' && 'shipper' in drawerState && drawerState.shipper.id === id) {
      setDrawerState({ mode: 'closed' });
    }
  };

  const handleViewDetail = (shipperId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDrawerState({ mode: 'closed' });
    navigate(buildPath(ROUTES.shipperDetail, { id: shipperId }));
  };

  /**
   * The glyph and the pill both come from `@/components/common` now — the
   * transporter list carried a line-for-line copy of each, and a state added to
   * one party (`Suspended`, 2026-08-30) went undrawn on the other. See
   * `RecordStatus.tsx` for why the mark is a tone rather than a status word.
   */
  const optionFor = (status: ApprovalStatus): RecordStatusOption<ApprovalStatus> =>
    SHIPPER_STATUS_OPTIONS.find((entry) => entry.value === status) ??
    /* A word the backend has but this build does not — drawn as an unfinished
       state rather than dropped, so it can still be seen and changed. */
    { value: status, label: status, tone: 'waiting' };

  const ApprovalMark = ({ status }: { status: ApprovalStatus }) => {
    const option = optionFor(status);
    return <RecordStatusMark tone={option.tone} label={option.label} />;
  };

  const renderApprovalBadge = (status: ApprovalStatus) => (
    <RecordStatusBadge option={optionFor(status)} />
  );

  // Filter & Search Calculations
  const filteredShippers = useMemo(() => {
    return shippersWithLiveCounts
      .filter((s) => {
        if (statusFilter !== 'all' && s.approvalStatus.toLowerCase() !== statusFilter) {
          return false;
        }
        if (industryFilter !== 'all' && s.industry !== industryFilter) {
          return false;
        }
        if (searchTerm.trim() !== '') {
          const q = searchTerm.toLowerCase();
          const matchName = s.companyLegalName.toLowerCase().includes(q);
          const matchReg = s.registrationNumber?.toLowerCase().includes(q);
          /* Optional: a shipper created without one has no primary contact, and
             an unguarded read here takes the whole page down with the error
             boundary rather than showing a row with a blank contact.
             `registrationNumber` on the line above was already guarded. */
          const matchContact =
            s.primaryContact?.name?.toLowerCase().includes(q) ||
            s.primaryContact?.email?.toLowerCase().includes(q);
          const matchCountry = s.country.toLowerCase().includes(q) || s.address.toLowerCase().includes(q);
          return matchName || matchReg || matchContact || matchCountry;
        }
        return true;
      })
      .sort((a, b) => {
        if (sortBy === 'name-asc') return a.companyLegalName.localeCompare(b.companyLegalName);
        if (sortBy === 'name-desc') return b.companyLegalName.localeCompare(a.companyLegalName);
        if (sortBy === 'shipments-desc') return b.activeShipments - a.activeShipments;
        if (sortBy === 'date-desc') return (b.registrationDate || '').localeCompare(a.registrationDate || '');
        return 0;
      });
  }, [shippersWithLiveCounts, statusFilter, industryFilter, searchTerm, sortBy]);

  /**
   * One page at a time. The list mode and the card grid share the pager, so a
   * reader who switches views keeps the same page and the same page size.
   * `resetKey` is every input that changes what the list contains — a narrowed
   * list must start at page 1, since page 4 of the old one addresses nothing.
   */
  const [pageSize, setPageSize] = useState(12);
  const pagedShippers = usePagedRows(filteredShippers, {
    pageSize,
    resetKey: `${statusFilter}|${industryFilter}|${searchTerm}|${sortBy}`,
  });

  const uniqueIndustries = Array.from(new Set(shippers.map((s) => s.industry)));

  // KPI Calculations
  const totalShippersCount = shippers.length;
  const verifiedCount = shippers.filter((s) => s.approvalStatus === 'Verified').length;
  const totalActiveShipments = shippersWithLiveCounts.reduce(
    (acc, s) => acc + (s.activeShipments || 0),
    0,
  );
  const pendingReviewCount = shippers.filter((s) => s.approvalStatus === 'Pending').length;

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all' || industryFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setIndustryFilter('all');
    setSortBy('name-asc');
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
            className="rounded-md p-1 transition-colors hover:bg-background/40"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <PageHeader
        title="Shippers"
        actions={
          canCreateShippers ? (
            <Button
              onClick={() => setDrawerState({ mode: 'create' })}
              shape="pill"
              leadingIcon={<Plus className="h-4 w-4" />}
              className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs"
            >
              Add shipper
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
          title="Total Shippers"
          value={totalShippersCount}
          variant="teal"
          trend="up"
          percentage="100%"
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatisticCard
          title="Verified Shippers"
          value={verifiedCount}
          variant="blue"
          trend="up"
          percentage={`${Math.round((verifiedCount / (totalShippersCount || 1)) * 100)}%`}
          icon={<BadgeCheck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Active Shipments"
          value={totalActiveShipments}
          variant="peach"
          trend="up"
          percentage="+14%"
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

      {/* The app's one filter bar — the same tabs, search and sort the Empty
          Container Control Tower uses. This was a bordered card holding filled
          primary pills in one horizontal scroller and three selects in another,
          so on a phone half the filters were off the right edge and had to be
          dragged into view. Nothing here scrolls: the tabs become a select
          below `sm`, and the tab labels sit on the page's own left margin so
          they line up with the table headings underneath. */}
      <FilterBar
        label="Filter shippers by status"
        tabs={STATUS_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          tone: tab.tone,
          count:
            tab.key === 'all'
              ? shippers.length
              : shippers.filter((s) => s.approvalStatus === tab.status).length,
        }))}
        active={statusFilter}
        onSelect={setStatusFilter}
        search={{
          value: searchTerm,
          onChange: setSearchTerm,
          placeholder: 'Search shippers…',
          matched: filteredShippers.length,
          total: shippers.length,
        }}
      >
        <FilterMenu
          groups={[
            {
              key: 'industry',
              label: 'Industry',
              value: industryFilter,
              onChange: setIndustryFilter,
              options: [
                { value: 'all', label: 'All industries' },
                ...uniqueIndustries.map((ind) => ({ value: ind, label: ind })),
              ],
            },
            {
              key: 'sort',
              label: 'Sort by',
              value: sortBy,
              onChange: setSortBy,
              options: [
                { value: 'name-asc', label: 'Name (A–Z)' },
                { value: 'name-desc', label: 'Name (Z–A)' },
                { value: 'shipments-desc', label: 'Most active' },
                { value: 'date-desc', label: 'Newest first' },
              ],
            },
          ]}
          onReset={clearFilters}
          resetActive={hasActiveFilters}
        />
      </FilterBar>

      {/* Slide-over Drawer for Create / Edit / Profile Quick View */}
      <Sheet open={drawerState.mode !== 'closed'} onOpenChange={(open) => !open && setDrawerState({ mode: 'closed' })}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
        >
          <SheetTitle className="sr-only">
            {drawerState.mode === 'create'
              ? 'Create Shipper'
              : drawerState.mode === 'edit'
                ? 'Edit Shipper'
                : 'Shipper Profile Details'}
          </SheetTitle>
          <SheetDescription className="sr-only">
            {drawerState.mode === 'create'
              ? 'Form to add a new shipper profile'
              : drawerState.mode === 'edit'
                ? 'Form to edit an existing shipper company profile'
                : 'Summary profile view for selected shipper'}
          </SheetDescription>

          {drawerState.mode === 'create' && (
            <AddShipperForm
              onSuccess={handleFormSuccess}
              onCancel={() => setDrawerState({ mode: 'closed' })}
            />
          )}

          {drawerState.mode === 'edit' && (
            <AddShipperForm
              initialData={{
                companyLegalName: drawerState.shipper.companyLegalName,
                registrationNumber: drawerState.shipper.registrationNumber,
                industry: drawerState.shipper.industry,
                companySize: drawerState.shipper.companySize,
                approvalStatus: drawerState.shipper.approvalStatus,
                country: drawerState.shipper.country,
                address: drawerState.shipper.address,
                primaryContactName: drawerState.shipper.primaryContact?.name ?? '',
                primaryContactTitle: drawerState.shipper.primaryContact?.title ?? '',
                primaryContactEmail: drawerState.shipper.primaryContact?.email ?? '',
                primaryContactPhone: drawerState.shipper.primaryContact?.phone ?? '',
                uploadedDocuments: drawerState.shipper.uploadedDocuments,
                logoUrl: drawerState.shipper.logoUrl,
              }}
              isEdit={true}
              onSuccess={handleFormSuccess}
              onCancel={() => setDrawerState({ mode: 'profile', shipper: drawerState.shipper })}
            />
          )}

          {drawerState.mode === 'profile' && (
            <div className="flex h-full min-h-0 flex-col">
              {/* Sticky Drawer Profile Header */}
              <div className="shrink-0 border-b border-border/40 bg-background px-6 pt-6 pb-4 sm:px-8 sm:pt-8">
                <PanelHeader
                  media={
                    <ShipperLogo
                      logoUrl={drawerState.shipper.logoUrl}
                      companyName={drawerState.shipper.companyLegalName}
                      className="h-14 w-14"
                    />
                  }
                  title={drawerState.shipper.companyLegalName}
                  subtitle={
                    <>
                      <span className="font-mono font-medium">
                        {drawerState.shipper.reference ?? drawerState.shipper.id}
                      </span>
                      {' · '}
                      {drawerState.shipper.industry}
                      {' · '}
                      {drawerState.shipper.country}
                    </>
                  }
                  badge={renderApprovalBadge(drawerState.shipper.approvalStatus)}
                  onEdit={
                    canEditShippers
                      ? () => setDrawerState({ mode: 'edit', shipper: drawerState.shipper })
                      : undefined
                  }
                />

                <RecordRaise
                  recordType="SHIPPER"
                  recordId={drawerState.shipper.id}
                  recordRef={drawerState.shipper.reference ?? drawerState.shipper.id}
                  label={drawerState.shipper.companyLegalName}
                  size="sm"
                  className="mt-3"
                />
              </div>

              {/* Scrollable Profile Body */}
              <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8 space-y-4">
              {/* Profile Details Cards */}
              <Card className="p-4 border border-border shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground pb-2 border-b border-border/40">
                  <Building2 className="h-4 w-4 text-primary" />
                  <span>Company Identifiers & Location</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground font-medium block">Reg Number</span>
                    <span className="font-mono font-bold text-foreground">{drawerState.shipper.registrationNumber || '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Industry</span>
                    <span className="font-medium text-foreground">{drawerState.shipper.industry}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Company Size</span>
                    <span className="font-medium text-foreground">{drawerState.shipper.companySize}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Country</span>
                    <span className="font-bold text-foreground">{drawerState.shipper.country}</span>
                  </div>
                  <div className="col-span-2">
                    <span className="text-muted-foreground font-medium block">Physical Address</span>
                    <span className="font-medium text-foreground">{drawerState.shipper.address || '—'}</span>
                  </div>
                </div>
              </Card>

              <Card className="p-4 border border-border shadow-2xs space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-foreground pb-2 border-b border-border/40">
                  <User className="h-4 w-4 text-primary" />
                  <span>Executive Contact</span>
                </div>
                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-muted-foreground font-medium block">Name</span>
                    <span className="font-bold text-foreground">{drawerState.shipper.primaryContact?.name ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Title</span>
                    <span className="font-medium text-foreground">{drawerState.shipper.primaryContact?.title ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Email</span>
                    <span className="font-medium text-foreground truncate block">{drawerState.shipper.primaryContact?.email ?? '—'}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Phone</span>
                    <span className="font-mono font-medium text-foreground">{drawerState.shipper.primaryContact?.phone ?? '—'}</span>
                  </div>
                </div>
              </Card>
              </div>

              {/* Sticky Footer */}
              <div className="shrink-0 border-t border-border/40 bg-background px-6 py-4 sm:px-8">
                <Button
                  shape="pill"
                  onClick={() => handleViewDetail(drawerState.shipper.reference)}
                  leadingIcon={<ExternalLink className="h-4 w-4" />}
                  className="w-full bg-primary hover:bg-primary-hover text-primary-foreground py-3 font-semibold text-xs rounded-full shadow-xs"
                >
                  Open full profile
                </Button>
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* One list surface, no view switcher. A directory is a comparison
          surface — "which of these is which, and which one do I want" is a
          question about columns lining up — and the grid answered it by putting
          every value at a different x. The card layout it used to offer is
          still here: `DataTable` falls back to it below the width where the
          columns fit, which is where a grid was actually the better answer. */}
      <DataTable
        rows={pagedShippers.rows}
        rowKey={(shipper) => shipper.id}
        onRowClick={(shipper) => setDrawerState({ mode: 'profile', shipper })}
        emptyCopy="No shipper matches the current filters."
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
            key: 'shipper',
            label: 'Shipper',
            icon: Building2,
            width: canSeeMoney ? 'w-[30%]' : 'w-[38%]',
            card: 'identity',
            cell: (shipper) => (
              <div className="flex min-w-0 items-center gap-2.5">
                <ShipperLogo
                  logoUrl={shipper.logoUrl}
                  companyName={shipper.companyLegalName}
                  className="h-8 w-8 shrink-0"
                />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-foreground">
                      {shipper.companyLegalName}
                    </span>
                    <ApprovalMark status={shipper.approvalStatus} />
                  </div>
                  {/* Reference and country on one meta line. Country had a
                      13% column of its own for a value that is "Djibouti" on
                      almost every row — it identifies the company, it does not
                      compare them, so it belongs beside the name. As a flag:
                      it is read at a glance and costs two characters instead
                      of a word. The name survives as the tooltip, and as the
                      rendering itself wherever the country has no flag. */}
                  <span className="flex min-w-0 items-center gap-1.5 text-[11px] text-muted-foreground">
                    <span className="truncate font-mono">{shipper.reference ?? shipper.id}</span>
                    {shipper.country && (
                      <>
                        <span aria-hidden>·</span>
                        {/* Artwork, not a flag emoji — see `CountryFlag`.
                            `?? country` keeps the old contract: a name that is
                            not a country prints as itself rather than
                            vanishing. */}
                        <CountryFlag country={shipper.country} />
                        {!countryCode(shipper.country) && (
                          <span className="truncate">{shipper.country}</span>
                        )}
                      </>
                    )}
                  </span>
                </div>
              </div>
            ),
          },
          {
            key: 'registration',
            label: 'Reg no',
            icon: FileText,
            width: canSeeMoney ? 'w-[17%]' : 'w-[20%]',
            cell: (shipper) => (
              <span className="block truncate font-mono text-xs font-semibold text-foreground">
                {shipper.registrationNumber || '—'}
              </span>
            ),
          },
          /* When this client last actually moved something.
             Not gated: this is traffic, not money, so it is one of the two
             data columns a role without `finance.view` can still read — and
             it is the one that answers what that role opens this page for.
             It replaced "Last billed", which asked the same question through
             the invoices and so could only be shown to finance. */
          {
            key: 'lastShipment',
            label: 'Last shipment',
            icon: Calendar,
            width: 'w-[18%]',
            cardLabel: 'Last shipment',
            cell: (shipper) => {
              const raw = shipper.lastShipmentAt;
              const at = raw ? new Date(raw).getTime() : NaN;
              /* Never shipped is not the same as gone quiet, and must not be
                 dressed as a stale date. */
              if (!Number.isFinite(at)) {
                return <span className="text-xs text-muted-foreground">Never</span>;
              }
              const days = Math.floor((Date.now() - at) / 86_400_000);
              /* Quiet for four months is the thing worth seeing, so it is the
                 only state that takes a colour. Same threshold the billing
                 version used — a client silent for a third of a year is a
                 conversation to have, whichever way you measure the silence. */
              const stale = days > 120;
              return (
                <span className="block min-w-0" title={new Date(at).toLocaleDateString()}>
                  <span
                    className={cn(
                      'block truncate text-sm font-bold',
                      stale ? 'text-warning-subtle-foreground' : 'text-foreground',
                    )}
                  >
                    {relativeDays(days)}
                  </span>
                </span>
              );
            },
          },
          /* Gated on the permission the API itself enforces. A role
             without `finance.view` is refused `/invoices` outright, and a
             column of dashes it can never fill is worse than no column:
             it reads as "this client owes nothing". The page already
             follows this rule for the row menu — a thing this account
             cannot have is not offered — so the columns follow it too. */
          ...(canSeeMoney
            ? ([
            {
              key: 'outstanding',
              label: 'Outstanding',
              icon: Clock,
              width: 'w-[15%]',
              cardLabel: 'Outstanding',
              cell: (shipper) => {
                const money = moneyByShipper.get(shipper.id);
                const outstanding = money?.outstanding ?? 0;
                const overdue = money?.overdue ?? 0;
                /* Settled up is a dash, not "0 DJF". Nothing owed is the absence
                   of a debt, and printing a zero puts every paid-up client in
                   the same visual weight as one that owes. */
                if (outstanding <= 0) {
                  return <span className="text-xs text-muted-foreground">—</span>;
                }
                return (
                  <span className="block min-w-0">
                    <span
                      className={cn(
                        'block truncate font-mono text-sm font-bold tabular-nums',
                        overdue > 0 ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {compactDjf(outstanding)}
                    </span>
                    {/* Only when there is something to say. A row reading
                        "0 overdue" spends a line on nothing happening. */}
                    {overdue > 0 && (
                      <span className="block truncate text-[11px] font-bold text-destructive">
                        {overdue} overdue
                      </span>
                    )}
                  </span>
                );
              },
            },
              ] satisfies DataColumn<ShipperRecord>[])
            : []),
          {
            key: 'shipments',
            label: 'Active',
            icon: Truck,
            width: canSeeMoney ? 'w-[10%]' : 'w-[12%]',
            cardLabel: 'Active shipments',
            /* A count reads as a count: monospaced and tabular so a column of
               them lines up on the digit, and greyed at zero because a shipper
               with nothing running is not news. */
            cell: (shipper) => (
              <span
                className={cn(
                  'font-mono text-sm font-bold tabular-nums',
                  shipper.activeShipments > 0 ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {shipper.activeShipments}
              </span>
            ),
          },
          {
            key: 'actions',
            label: 'Actions',
            width: canSeeMoney ? 'w-[10%]' : 'w-[12%]',
            card: 'trailing',
            /* The menu only. A "Profile" button beside it opened the same drawer
               the row itself opens and the menu's own first item opens — three
               ways to do one thing, two of them spending a column of width. */
            cell: (shipper) => (
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
                      aria-label="Shipper actions"
                      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem
                      onClick={(e) => handleViewDetail(shipper.reference, e)}
                      className="cursor-pointer gap-2 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>View profile</span>
                    </DropdownMenuItem>
                    {canEditShippers && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          setDrawerState({ mode: 'edit', shipper });
                        }}
                        className="cursor-pointer gap-2 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Edit profile</span>
                      </DropdownMenuItem>
                    )}
                    {canEditShippers && (
                      <RecordStatusMenuSection
                        value={shipper.approvalStatus}
                        options={SHIPPER_STATUS_OPTIONS}
                        onSelect={(next) => handleStatusChange(shipper, next)}
                        busy={updateShipper.isPending}
                      />
                    )}
                    {canDeleteShippers && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => handleDelete(shipper.id, e)}
                          className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete shipper</span>
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

      {filteredShippers.length > 0 && (
        <TablePager
          paged={pagedShippers}
          noun="shippers"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}

      {/* Loading only. The "No Shippers Found" panel that used to sit here
          printed the table's own empty row a second time, one above the other,
          in two different sizes — the list owns its emptiness now. */}
      {isLoading && filteredShippers.length === 0 && (
        <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-border bg-card py-12 text-center">
          <p className="text-xs text-muted-foreground">Loading shippers…</p>
        </div>
      )}
    </div>
  );
}

export default ShippersPage;
