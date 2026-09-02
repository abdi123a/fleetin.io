import { ExpiryLabel, expiryBandOf, SheetHeading } from '@/components/common';
import React, { useEffect, useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  User,
  MoreVertical,
  ExternalLink,
  Star,
  Truck,
  Plus,
  X,
  CheckCircle2,
  Pencil,
  FileText,
  Trash2,
} from '@/design-system/icons';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import { RecordRaise } from '@/features/workspace';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { RotateCcw, AlertTriangle, Building2, UserCheck } from 'lucide-react';
import { DataTable, FilterBar,
  FilterMenu, PageHeader, TablePager, usePagedRows } from '@/components';
import {
  RecordStatusMenuSection,
  DRIVER_STATUS_OPTIONS,
} from '@/components/common';
import { usePermissions } from '@/hooks';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import { Tooltip, useConfirm } from '@/design-system';
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
  Input,
  Select,
  StatisticCard,
  VerificationBadge,
} from '@/design-system';
import { ROUTES, buildPath } from '@/config/routes';
import type { EnrichedDriver } from '@/data/partnerData';
import type { OperationalStatus } from '@/types/partner';
import { DriverProfileHeader, DriverProfileOverview } from '@/components/drivers';
import { useBookings } from '@/features/bookings/api/queries';
import { UNRATED, summarisePerformance } from '@/lib/rating';
import { StarRating } from '@/components/performance';
import type { BookingRecord } from '@/features/bookings/api/bookingsService';
import { usePartners } from '@/features/partners/api/queries';
import {
  useCreateDriver,
  useDeleteDriver,
  useDrivers,
  useUpdateDriver,
} from '@/features/drivers/api/queries';
import { useDocuments, useUploadDocument, useDeleteDocument } from '@/features/documents/api/queries';
import { toDisplayDocument, type DisplayDocument } from '@/features/documents/api/documentsService';
import { DocumentChecklist } from '@/features/documents/components/DocumentChecklist';
import type { DocumentCapture } from '@/features/documents/components/DocumentCaptureDialog';
import type { DocumentTypeSpec } from '@/features/documents/catalog';
import { useStagedDocuments, uploadStagedDocuments } from '@/features/documents/stagedDocuments';
import { isDriverVerified } from '@/utils';

type StatusFilter = 'all' | 'available' | 'on-the-road' | 'on-leave' | 'unavailable';

/**
 * The tabs, and the status each one selects.
 *
 * A driver shares the fleet's `OperationalStatus` column, so the values are a
 * truck's — but "Under Maintenance" is nonsense about a person. The words
 * change here and in `DRIVER_STATUS_OPTIONS`; the stored value does not.
 */
const STATUS_TABS: { key: StatusFilter; label: string; tone?: string; status?: OperationalStatus }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available', tone: 'text-success', status: 'Available' },
  { key: 'on-the-road', label: 'On the road', tone: 'text-info', status: 'In Transit' },
  { key: 'on-leave', label: 'On leave', tone: 'text-warning-subtle-foreground', status: 'Under Maintenance' },
  { key: 'unavailable', label: 'Unavailable', tone: 'text-destructive', status: 'Out of Service' },
];

function StatusPill({ status }: { status: OperationalStatus }) {
  /**
   * A dot and a word — no pill, no border, no tinted plate.
   *
   * The old badge stacked four devices on one word (fill, border, dot, colour)
   * and still came out low-contrast, because the label sat in a pale
   * `*-subtle-foreground` on a pale `*-subtle` ground. It also sized itself to
   * its text, so "Out of Service" was half again as wide as "Available" and the
   * status column had a ragged edge down the page.
   *
   * The dot carries the state, the label reads in full foreground, and the row
   * is fixed-width so the column lines up. This is the pattern every serious
   * status column uses, for these reasons.
   */
  const meta: Record<OperationalStatus, { dot: string; label: string }> = {
    Available: { dot: 'bg-success', label: 'Available' },
    'In Transit': { dot: 'bg-info', label: 'In Transit' },
    'Under Maintenance': { dot: 'bg-warning', label: 'Maintenance' },
    'Out of Service': { dot: 'bg-destructive', label: 'Out of service' },
  };
  const { dot, label } = meta[status];
  return (
    <span className="inline-flex items-center gap-2 whitespace-nowrap text-xs font-semibold text-foreground">
      <span className={`size-2 shrink-0 rounded-full ${dot}`} aria-hidden />
      {label}
    </span>
  );
}

export function DriversPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const { data: driversResponse } = useDrivers();
  const drivers = useMemo(() => driversResponse?.items ?? [], [driversResponse]);
  const { data: partnersResponse } = usePartners();
  const partners = useMemo(() => partnersResponse?.items ?? [], [partnersResponse]);

  /**
   * Every driver's record, for the Rating column.
   *
   * The whole booking book in one read, bucketed by driver — the same trade
   * the Transporters list makes for its own rating column, and deliberately
   * the same request shape (`{ limit: 2000 }`), so the two pages share one
   * cached response instead of each fetching the book.
   *
   * Unawaited on purpose: the list paints as soon as the drivers arrive and
   * the stars fill in behind them. A roster that waited on 700 booking rows
   * before showing a single name would be a bad trade for one column.
   *
   * The limit sits above the book's size rather than paging, because paging
   * would silently under-count: a driver whose earlier missions fell off the
   * page would wear a star built from half their record, which is worse than
   * wearing none.
   */
  const { data: bookingBook } = useBookings({ limit: 2000 });
  const performanceByDriver = useMemo(() => {
    const byDriver = new Map<string, BookingRecord[]>();
    for (const booking of bookingBook?.items ?? []) {
      if (!booking.driverId) continue;
      const bucket = byDriver.get(booking.driverId);
      if (bucket) bucket.push(booking);
      else byDriver.set(booking.driverId, [booking]);
    }
    return new Map([...byDriver].map(([id, rows]) => [id, summarisePerformance(rows)]));
  }, [bookingBook]);
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const [selectedDriver, setSelectedDriver] = useState<EnrichedDriver | null>(null);

  // Add Driver Modal State
  const [isAddDriverOpen, setIsAddDriverOpen] = useState(false);
  const [newDriver, setNewDriver] = useState({
    partnerId: '',
    fullName: '',
    phone: '',
  });
  const [addSuccessNotice, setAddSuccessNotice] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  /**
   * The licence, held until the driver has an id to file it against.
   *
   * `licenseExpiry` used to be a date field defaulting to 2027 — a driver
   * registered without a thought was licensed for another eighteen months
   * because the form said so. The licence itself sets it now.
   */
  const newDriverDocs = useStagedDocuments();

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriver.fullName || !newDriver.partnerId) return;

    const partner = partners.find((p) => p.id === newDriver.partnerId);
    if (!partner) return;

    const licence = newDriverDocs.captureFor('Driver License');
    if (!licence) {
      setAddError("Attach the driver's licence before registering them.");
      return;
    }

    setAddError(null);
    const created = await createDriver.mutateAsync({
      partnerId: newDriver.partnerId,
      payload: {
        fullName: newDriver.fullName,
        phone: newDriver.phone || '+253 77 00 00 00',
        nationalId: `DJ-NID-${Math.floor(100000 + Math.random() * 900000)}`,
        drivingLicenseNumber: `DL-DJ-${Math.floor(10000 + Math.random() * 90000)}`,
        licenseExpiry: licence.expiryDate,
        status: 'Available',
        joinDate: new Date().toISOString().slice(0, 10),
      },
    });

    await uploadStagedDocuments('DRIVER', created.id, newDriverDocs.staged);

    setIsAddDriverOpen(false);
    newDriverDocs.reset();
    setNewDriver({
      partnerId: '',
      fullName: '',
      phone: '',
    });

    setAddSuccessNotice(`Driver "${created.fullName}" registered to ${partner.companyLegalName}.`);
    setTimeout(() => setAddSuccessNotice(null), 5000);
  };

  /**
   * The drawer has two modes, not three tabs.
   *
   * Reading a driver and editing one are different jobs; documents are part of
   * *maintaining* the record, not of reading it, so they live inside edit
   * rather than behind a third tab of their own. A tab bar advertising three
   * equal destinations made "Edit Details" look like something to browse.
   */
  const [drawerTab, setDrawerTab] = useState<'view' | 'edit'>('view');

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<EnrichedDriver>>({});

  /**
   * The document panel's one line of feedback.
   *
   * It used to be success-only, so a rejected write said nothing at all: the
   * "Save document type" button and the upload both 403'd on a role missing
   * `documents.upload` and the panel simply sat there, which reads as a dead
   * control rather than a refused one. A failure is the message the operator
   * most needs — it is the one they cannot work out for themselves.
   */
  const [docNotice, setDocNotice] = useState<{ tone: 'ok' | 'error'; text: string } | null>(null);
  const say = (tone: 'ok' | 'error', text: string) => {
    setDocNotice({ tone, text });
    /* Errors stay until the next action; a success can fade. */
    if (tone === 'ok') setTimeout(() => setDocNotice(null), 4000);
  };
  const explain = (error: unknown) =>
    error instanceof Error && /permission|forbidden|403/i.test(error.message)
      ? 'Your role cannot add or upload documents. Ask an administrator for the "documents.upload" permission.'
      : error instanceof Error
        ? error.message
        : 'Something went wrong.';
  const [viewingDoc, setViewingDoc] = useState<DocumentToView | null>(null);

  /* This driver's own record, from the bookings actually assigned to them.
     Scoped to their transporter rather than the whole book — a driver only
     ever runs their own carrier's work, and that keeps the request bounded. */
  const { data: driverBookingPage } = useBookings(
    { partnerId: selectedDriver?.partnerId },
    { enabled: Boolean(selectedDriver?.partnerId) },
  );
  const driverPerformance = useMemo(
    () =>
      summarisePerformance(
        (driverBookingPage?.items ?? []).filter((b) => b.driverId === selectedDriver?.id),
      ),
    [driverBookingPage, selectedDriver],
  );

  const { data: selectedDriverDocs = [] } = useDocuments('DRIVER', selectedDriver?.id);
  const uploadDoc = useUploadDocument('DRIVER', selectedDriver?.id);
  const deleteDoc = useDeleteDocument('DRIVER', selectedDriver?.id);
  const driverDocRows: DisplayDocument[] = useMemo(
    () => selectedDriverDocs.map(toDisplayDocument),
    [selectedDriverDocs],
  );

  // When driver is selected
  const handleSelectDriver = (driver: EnrichedDriver) => {
    setSelectedDriver(driver);
    setEditForm(driver);
    setDrawerTab('view');
    setDocNotice(null);
  };

  const handleSaveEdit = async () => {
    if (!selectedDriver) return;
    const updated = await updateDriver.mutateAsync({
      id: selectedDriver.id,
      payload: {
        fullName: editForm.fullName || selectedDriver.fullName,
        phone: editForm.phone || selectedDriver.phone,
        drivingLicenseNumber: editForm.drivingLicenseNumber || selectedDriver.drivingLicenseNumber,
        licenseExpiry: editForm.licenseExpiry || selectedDriver.licenseExpiry,
        nationalId: editForm.nationalId || selectedDriver.nationalId,
        status: editForm.status || selectedDriver.status,
      },
    });
    setSelectedDriver(updated);
    setDrawerTab('view');
  };

  const handleUploadForType = (spec: DocumentTypeSpec, capture: DocumentCapture) => {
    if (!selectedDriver) return;
    uploadDoc.mutate(
      {
        category: spec.label,
        file: capture.file,
        issueDate: capture.issueDate,
        expiryDate: capture.expiryDate,
        issuer: capture.issuer,
      },
      {
        onSuccess: (doc) => say('ok', `Document "${doc.name}" filed.`),
        onError: (error) => say('error', explain(error)),
      },
    );
  };

  const { confirm, confirmDialog } = useConfirm();

  const handleDeleteDriverDoc = async (_driverId: string, docId: string) => {
    const ok = await confirm({
      title: 'Delete this document?',
      description: 'The file will be permanently removed from the vault.',
    });
    if (ok) deleteDoc.mutate(docId);
  };

  const handleDownloadDriverDoc = (doc: DisplayDocument) => {
    void triggerDocumentDownload(doc.id, doc.name);
  };

  /*
   * What this account may actually do here — the same gate the Shippers,
   * Transporters and Vehicles lists use. An action this role cannot perform is
   * not offered; the server refuses it anyway with a 403.
   */
  const { can } = usePermissions();
  const canEditDrivers = can('drivers.update');
  const canDeleteDrivers = can('drivers.delete');
  const canCreateDrivers = can('drivers.create');
  const deleteDriver = useDeleteDriver();

  /** Move a driver along the ladder from the row itself — whole ladder, awaited. */
  const handleStatusChange = async (driver: EnrichedDriver, next: OperationalStatus) => {
    if (next === driver.status) return;
    const label = DRIVER_STATUS_OPTIONS.find((option) => option.value === next)?.label ?? next;
    try {
      await updateDriver.mutateAsync({ id: driver.id, payload: { status: next } });
      if (selectedDriver?.id === driver.id) {
        setSelectedDriver({ ...selectedDriver, status: next });
      }
      setAddSuccessNotice(`${driver.fullName} is now ${label.toLowerCase()}.`);
      setTimeout(() => setAddSuccessNotice(null), 4500);
    } catch {
      setAddSuccessNotice(`Could not change ${driver.fullName} — your account cannot edit drivers.`);
      setTimeout(() => setAddSuccessNotice(null), 4500);
    }
  };

  const handleDeleteDriver = async (driver: EnrichedDriver, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await confirm({
      title: 'Remove this driver?',
      description: `${driver.fullName} will be removed from the roster. Bookings already assigned to them keep their record.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    deleteDriver.mutate(driver.id);
    if (selectedDriver?.id === driver.id) setSelectedDriver(null);
  };

  // Filters & Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [sortBy, setSortBy] = useState<string>('name-asc');

  // Analytics
  const totalDrivers = drivers.length;
  const availableCount = drivers.filter((d) => d.status === 'Available').length;
  const inTransitCount = drivers.filter((d) => d.status === 'In Transit').length;
  /* An ALERT is a licence that needs acting on — gone, or gone within a
     fortnight. Those are exactly the two bands `ExpiryLabel` puts a plate
     around, so the tile counts the rows a reader can see are marked. The old
     rule counted anything inside 30 days, which folded the run-up in with the
     emergencies and left the number high enough to stop meaning anything. */
  const licenseAlerts = drivers.filter((d) =>
    ['expired', 'critical'].includes(expiryBandOf(d.licenseExpiry)),
  ).length;

  // Filtering & Sorting
  const filteredDrivers = useMemo(() => {
    const list = drivers.filter((d) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        d.fullName.toLowerCase().includes(q) ||
        d.partnerName.toLowerCase().includes(q) ||
        d.drivingLicenseNumber.toLowerCase().includes(q) ||
        d.nationalId.toLowerCase().includes(q);

      /* Compared against the tab's own `status`, not a lowercased label — a
         driver's bands are re-worded ("On leave" for `Under Maintenance`) and
         the two would never have matched. */
      const tabStatus = STATUS_TABS.find((tab) => tab.key === statusFilter)?.status;
      const matchesStatus = !tabStatus || d.status === tabStatus;

      /* No transporter select: the column shows every carrier's name outright
         now, and the search field already matches on it — a dropdown of the
         same ten names was a third control doing the second one's job. */
      return matchesSearch && matchesStatus;
    });

    list.sort((a, b) => {
      if (sortBy === 'name-asc') return a.fullName.localeCompare(b.fullName);
      if (sortBy === 'partner-asc') return a.partnerName.localeCompare(b.partnerName);
      if (sortBy === 'license-asc') return a.drivingLicenseNumber.localeCompare(b.drivingLicenseNumber);
      return 0;
    });

    return list;
  }, [drivers, searchTerm, statusFilter, sortBy]);

  /** One page at a time — the row list and the card grid share the pager. */
  const [pageSize, setPageSize] = useState(12);
  const pagedDrivers = usePagedRows(filteredDrivers, {
    pageSize,
    resetKey: `${statusFilter}|${searchTerm}|${sortBy}`,
  });

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setSortBy('name-asc');
  };

  /* `?driver=<id>` opens straight into that driver's profile — what a row on
     the transporter's roster links to. The parameter stays in the URL while
     the drawer is up (so the address describes what is open, and the link is
     shareable) and is cleared on close by `closeDriverDrawer`. */
  const wantedDriver = searchParams.get('driver');
  useEffect(() => {
    if (!wantedDriver || drivers.length === 0) return;
    const match = drivers.find((d) => d.id === wantedDriver || d.reference === wantedDriver);
    if (match) handleSelectDriver(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedDriver, drivers]);

  const closeDriverDrawer = () => {
    setSelectedDriver(null);
    if (wantedDriver) {
      setSearchParams(
        (params) => {
          params.delete('driver');
          return params;
        },
        { replace: true },
      );
    }
  };

  const handleGoToPartner = (partnerId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
    navigate(buildPath(ROUTES.partnerDetail, { id: partnerId }));
  };

  return (
    <div className="space-y-5 pb-12">
      {confirmDialog}
      {/* Page Header */}
      <PageHeader
        title="Drivers"
        actions={
          canCreateDrivers ? (
            <Button
              onClick={() => setIsAddDriverOpen(true)}
              shape="pill"
              leadingIcon={<Plus className="h-4 w-4" />}
              className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs cursor-pointer"
            >
              Add driver
            </Button>
          ) : undefined
        }
      />

      {/* Success Notification */}
      {addSuccessNotice && (
        <div className="p-3.5 rounded-lg border border-success/30 bg-success-subtle text-success-subtle-foreground text-xs font-semibold flex items-center justify-between shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-success-subtle-foreground shrink-0" />
            <span>{addSuccessNotice}</span>
          </div>
          <button type="button" onClick={() => setAddSuccessNotice(null)} className="text-muted-foreground hover:text-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Add New Driver Drawer */}
      <Sheet open={isAddDriverOpen} onOpenChange={setIsAddDriverOpen}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
        >
          <SheetHeading
            titleComponent={SheetTitle}
            descriptionComponent={SheetDescription}
            title={
              <>
                <User className="h-5 w-5 text-primary" /> Register New Driver
              </>
            }
            description="Added to the selected transporter's driver roster."
          />

          <form onSubmit={handleCreateDriver} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
          <div className="space-y-4">
            <div className="space-y-1.5 p-3.5 rounded-lg border border-primary/30 bg-primary/5">
              <label className="text-[11px] font-bold text-primary block uppercase tracking-wider">Transporter *</label>
              <Select
                value={newDriver.partnerId}
                options={[
                  { value: '', label: 'Select a transporter…' },
                  ...partners.map((p) => ({
                    value: p.id,
                    label: `${p.companyLegalName} (${p.country})`,
                  })),
                ]}
                onChange={(e) => setNewDriver((prev) => ({ ...prev, partnerId: e.target.value }))}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-foreground block">Full Name *</label>
              <Input
                required
                value={newDriver.fullName}
                onChange={(e) => setNewDriver((prev) => ({ ...prev, fullName: e.target.value }))}
                placeholder="e.g. Abdi Yusuf Mohamed"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-foreground block">Phone Number</label>
              <Input
                value={newDriver.phone}
                onChange={(e) => setNewDriver((prev) => ({ ...prev, phone: e.target.value }))}
                placeholder="+253 77 12 34 56"
              />
            </div>

            {/* The licence sets the expiry — there is no field for it.
             *
             * A date typed beside an optional upload is a second answer to a
             * question the paper already answers, and the one somebody typed
             * was the one every alert read. */}
            <div className="space-y-3 border-t border-border/40 pt-3">
              <h4 className="type-h4 flex items-center gap-2 font-semibold text-foreground">
                <FileText className="h-4.5 w-4.5 text-primary" />
                Driver Documents
              </h4>

              <DocumentChecklist
                ownerType="DRIVER"
                documents={newDriverDocs.rows}
                subject={newDriver.fullName || undefined}
                onUpload={newDriverDocs.stage}
                onRemove={newDriverDocs.remove}
              />

              {addError && <p className="text-[11px] font-medium text-destructive">{addError}</p>}
            </div>

          </div>
          </div>

          <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border/40 bg-background px-6 py-4 sm:px-8">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="rounded-lg"
              onClick={() => {
                setIsAddDriverOpen(false);
                newDriverDocs.reset();
                setAddError(null);
              }}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" className="rounded-lg bg-primary px-5 font-semibold text-primary-foreground">
              Register
            </Button>
          </div>
          </form>
        </SheetContent>
      </Sheet>

      {/* KPI Stat Cards */}
      {/* Two-up on a phone, not four stacked. One tile per row put four
          full-width blocks between the page title and the list they summarise,
          so the first screen was entirely header and the actual work started
          below the fold. */}
      <div className="grid grid-cols-2 gap-2.5 sm:gap-3.5 lg:grid-cols-4">
        <StatisticCard
          title="Total Drivers"
          value={totalDrivers}
          variant="teal"
          trend="up"
          percentage="100%"
          icon={<User className="h-5 w-5" />}
        />
        <StatisticCard
          title="Available"
          value={availableCount}
          variant="blue"
          trend="up"
          percentage={`${Math.round((availableCount / (totalDrivers || 1)) * 100)}%`}
          icon={<UserCheck className="h-5 w-5" />}
        />
        <StatisticCard
          title="In Transit"
          value={inTransitCount}
          variant="peach"
          trend="up"
          percentage="+15%"
          icon={<Truck className="h-5 w-5" />}
        />
        <StatisticCard
          title="License Alerts"
          value={licenseAlerts}
          variant="pink"
          trend={licenseAlerts > 0 ? 'down' : 'neutral'}
          percentage={`${licenseAlerts} alerts`}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* One filter bar, the app's own — see the Vehicles list for why the
          hand-rolled "Control Bar" (scrolling pill tabs, its own search box,
          a view switcher) went. */}
      <FilterBar
        label="Filter drivers by status"
        tabs={STATUS_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          tone: tab.tone,
          count: tab.status
            ? drivers.filter((d) => d.status === tab.status).length
            : drivers.length,
        }))}
        active={statusFilter}
        onSelect={setStatusFilter}
        search={{
          value: searchTerm,
          onChange: setSearchTerm,
          placeholder: 'Search drivers…',
          matched: filteredDrivers.length,
          total: drivers.length,
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
                { value: 'name-asc', label: 'Driver name' },
                { value: 'partner-asc', label: 'Transporter' },
                { value: 'license-asc', label: 'License no.' },
              ],
            },
          ]}
        />
      </FilterBar>
      {/* Driver Drawer */}
      <Sheet open={Boolean(selectedDriver)} onOpenChange={(open) => !open && closeDriverDrawer()}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6 bg-background border-l border-border space-y-6">
          <SheetTitle className="sr-only">Driver Profile Details & Documents</SheetTitle>
          <SheetDescription className="sr-only">Driver details and documents.</SheetDescription>
          {selectedDriver && (
            <div className="space-y-6">
              <DriverProfileHeader
                driver={selectedDriver}
                onEdit={() => setDrawerTab(drawerTab === 'edit' ? 'view' : 'edit')}
                editing={drawerTab === 'edit'}
              />

              <RecordRaise
                recordType="DRIVER"
                recordId={selectedDriver.id}
                recordRef={selectedDriver.reference ?? selectedDriver.id}
                label={selectedDriver.fullName}
                size="sm"
              />

              {/* Toast / Notice */}
              {docNotice && (
                <div
                  className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                    docNotice.tone === 'ok'
                      ? 'border-success/30 bg-success-subtle text-success-subtle-foreground'
                      : 'border-destructive/30 bg-destructive-subtle text-destructive-subtle-foreground'
                  }`}
                  role={docNotice.tone === 'error' ? 'alert' : 'status'}
                >
                  {docNotice.tone === 'ok' ? (
                    <CheckCircle2 className="h-4 w-4 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                  )}
                  <span>{docNotice.text}</span>
                </div>
              )}

              {/* ── TAB 1: OVERVIEW ── */}
              {drawerTab === 'view' && (
                <DriverProfileOverview
                  driver={selectedDriver}
                  summary={driverPerformance}
                  transporter={{
                    name: selectedDriver.partnerName,
                    country: selectedDriver.partnerCountry,
                    reference: selectedDriver.partnerReference,
                    onOpen: () => handleGoToPartner(selectedDriver.partnerReference),
                  }}
                  footer={
                    <div className="pt-2">
                      <Button
                        onClick={() => setDrawerTab('edit')}
                        leadingIcon={<Pencil className="h-4 w-4" />}
                        className="w-full rounded-lg bg-primary py-2.5 text-xs font-semibold text-primary-foreground"
                      >
                        Edit driver &amp; documents
                      </Button>
                    </div>
                  }
                />
              )}

              {/* ── TAB 2: EDIT DETAILS ── */}
              {drawerTab === 'edit' && (
                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-foreground block">Full Name</label>
                    <Input
                      value={editForm.fullName || ''}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, fullName: e.target.value }))}
                      placeholder="Driver Full Name"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Phone Number</label>
                      <Input
                        value={editForm.phone || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, phone: e.target.value }))}
                        placeholder="+253 77 12 34 56"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">National ID</label>
                      <Input
                        value={editForm.nationalId || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, nationalId: e.target.value }))}
                        placeholder="DJ-NID-12345"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Driving License No.</label>
                      <Input
                        value={editForm.drivingLicenseNumber || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, drivingLicenseNumber: e.target.value }))}
                        placeholder="DL-DJ-44821"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">License Expiry Date</label>
                      <Input
                        type="date"
                        value={editForm.licenseExpiry || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, licenseExpiry: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-[11px] font-bold text-foreground block">Operational Status</label>
                    <Select
                      value={editForm.status || 'Available'}
                      options={[
                        { value: 'Available', label: 'Available' },
                        { value: 'In Transit', label: 'In Transit' },
                        { value: 'Under Maintenance', label: 'Under Maintenance' },
                        { value: 'Out of Service', label: 'Out of Service' },
                      ]}
                      onChange={(e) => setEditForm((prev) => ({ ...prev, status: e.target.value as EnrichedDriver['status'] }))}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Vehicle assignment is managed on the Vehicles page.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                    <Button variant="outline" size="sm" onClick={() => setDrawerTab('view')} className="rounded-lg">
                      Cancel
                    </Button>
                    <Button size="sm" onClick={handleSaveEdit} className="bg-primary text-primary-foreground font-semibold rounded-lg px-4">
                      Save changes
                    </Button>
                  </div>
                </div>
              )}

              {/* ── DOCUMENTS — part of editing, not a third destination ── */}
              {drawerTab === 'edit' && (
                <div className="space-y-5 border-t border-border pt-5">
                  <h4 className="type-h4 flex items-center gap-2 font-semibold text-foreground">
                    <FileText className="h-4.5 w-4.5 text-primary" />
                    Driver Documents
                  </h4>

                  <DocumentChecklist
                    ownerType="DRIVER"
                    documents={driverDocRows}
                    subject={selectedDriver.fullName}
                    busy={uploadDoc.isPending}
                    onUpload={handleUploadForType}
                    onView={setViewingDoc}
                    onDownload={handleDownloadDriverDoc}
                    onRemove={(docId) => handleDeleteDriverDoc(selectedDriver.id, docId)}
                  />
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Main View ── */}
      {/* One list surface, no view switcher — see the Vehicles list. The card
          layout the switcher used to offer is still here: `DataTable` falls
          back to it below the width where the columns fit. */}
      <DataTable
        rows={pagedDrivers.rows}
        rowKey={(driver) => driver.id}
        onRowClick={(driver) => handleSelectDriver(driver)}
        emptyCopy="No driver matches the current filters."
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
        /* 48rem, the same width Shippers and Transporters switch at. It was
           56rem, so on a normal laptop this list was still drawing stacked
           cards while the two directories beside it — same six columns, same
           chrome — had already become a table. The four directories are one
           idiom; they should not disagree about when they are a table. */
        breakpoint="48rem"
        columns={[
          {
            key: 'driver',
            label: 'Driver',
            icon: User,
            width: 'w-[23%]',
            card: 'identity',
            cell: (driver) => (
              <div className="flex min-w-0 items-center gap-2.5">
                <div className="flex size-9 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-border/60 bg-muted">
                  {driver.profilePictureUrl ? (
                    <img
                      src={driver.profilePictureUrl}
                      alt={driver.fullName}
                      className="h-full w-full object-cover"
                    />
                  ) : (
                    <User className="size-4 text-muted-foreground" />
                  )}
                </div>
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate text-sm font-bold text-foreground">
                      {driver.fullName}
                    </span>
                    <VerificationBadge
                      state={isDriverVerified(driver) ? 'verified' : 'unverified'}
                      size="sm"
                    />
                  </div>
                  <span className="block truncate font-mono text-[11px] text-muted-foreground">
                    {driver.reference}
                  </span>
                </div>
              </div>
            ),
          },
          {
            key: 'transporter',
            label: 'Transporter',
            icon: Building2,
            width: 'w-[20%]',
            /* Mark **and** name. The mark alone, with the name hidden in a
               tooltip, is the one place the app breaks its own rule that a
               named company always shows its logo beside the name — and in a
               column of near-identical circles it made the reader hover every
               row to find out who anybody was. */
            cell: (driver) => (
              <Tooltip
                content={`Transporter · ${driver.partnerName}${driver.partnerCountry ? ` · ${driver.partnerCountry}` : ''}`}
              >
                <button
                  type="button"
                  onClick={(e) => handleGoToPartner(driver.partnerReference, e)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-full p-0.5 pr-2 text-left transition-colors hover:bg-muted"
                >
                  <CompanyMark id={driver.partnerId} name={driver.partnerName} size="sm" />
                  <span className="truncate text-xs font-semibold text-foreground">
                    {driver.partnerName}
                  </span>
                </button>
              </Tooltip>
            ),
          },
          {
            key: 'license',
            label: 'License',
            icon: FileText,
            width: 'w-[16%]',
            cell: (driver) => (
              <div className="min-w-0">
                <span className="block truncate font-mono text-xs font-semibold text-foreground">
                  {driver.drivingLicenseNumber}
                </span>
                <ExpiryLabel date={driver.licenseExpiry} />
              </div>
            ),
          },
          {
            /* The driver's mark, where the assigned truck used to be.
               The plate was a static fact that repeated the Vehicles page and
               told a reader nothing about the person whose row it was on. This
               is the one column on the roster that says how somebody actually
               works — and it is the same column, drawn the same way, as the
               Transporters list already carries, so a star means one thing
               across the app. Every star here is one an operator gave in a
               delivery debrief; nothing in this app scores anybody. */
            key: 'rating',
            label: 'Rating',
            icon: Star,
            width: 'w-[17%]',
            cardLabel: 'Rating',
            cell: (driver) => {
              const summary = performanceByDriver.get(driver.id) ?? UNRATED;
              /* No closed mission, no star. "Not yet rated" is the truthful
                 answer, and an empty 0.0 beside somebody's name is not. Their
                 mission figures still show in the columns beside this one — an
                 unrated driver with thirty missions run is not an unknown
                 quantity, only an unrated one. */
              if (!summary.rated) {
                return <span className="text-xs text-muted-foreground">Not yet rated</span>;
              }
              return (
                <div className="min-w-0">
                  <StarRating value={summary.overall} size="sm" />
                  {/* The weight behind the star: 4.4 over three debriefs and
                      4.4 over forty are not the same claim. */}
                  <span className="mt-1 flex flex-wrap items-center gap-x-2">
                    <span className="flex items-baseline gap-1">
                      <span className="font-mono text-sm font-bold tabular-nums text-foreground">
                        {summary.ratedMissions}
                      </span>
                      <span className="text-[11px] text-muted-foreground">
                        rated of {summary.missions}
                      </span>
                    </span>
                  </span>
                </div>
              );
            },
          },
          {
            key: 'status',
            label: 'Status',
            icon: UserCheck,
            width: 'w-[14%]',
            card: 'trailing',
            cell: (driver) => <StatusPill status={driver.status} />,
          },
          {
            key: 'actions',
            label: 'Actions',
            /* 10%, matching Shippers. At 8% the ⋮ button fitted and the word
               above it did not — the heading truncated to "ACTIO…". */
            width: 'w-[10%]',
            card: 'trailing',
            cell: (driver) => (
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
                      aria-label="Driver actions"
                      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectDriver(driver);
                      }}
                      className="cursor-pointer gap-2 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Open driver</span>
                    </DropdownMenuItem>
                    {canEditDrivers && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectDriver(driver);
                          setDrawerTab('edit');
                        }}
                        className="cursor-pointer gap-2 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Edit driver</span>
                      </DropdownMenuItem>
                    )}
                    {canEditDrivers && (
                      <RecordStatusMenuSection
                        value={driver.status}
                        options={DRIVER_STATUS_OPTIONS}
                        onSelect={(next) => handleStatusChange(driver, next)}
                        busy={updateDriver.isPending}
                      />
                    )}
                    {canDeleteDrivers && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => handleDeleteDriver(driver, e)}
                          className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete driver</span>
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

      {filteredDrivers.length > 0 && (
        <TablePager
          paged={pagedDrivers}
          noun="drivers"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}

      {/* No "No Drivers Found" panel here: `DataTable` prints its own empty row
          with the same escape, and the two together were the page saying it
          twice. */}

      <DocumentViewerModal open={Boolean(viewingDoc)} onOpenChange={(open) => !open && setViewingDoc(null)} document={viewingDoc} />
    </div>
  );
}

export default DriversPage;
