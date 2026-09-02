import { ExpiryLabel, SheetHeading } from '@/components/common';
import React, { useState, useMemo, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ContainerIcon,
  Truck,
  CheckCircle2,
  ExternalLink,
  Plus,
  X,
  Route,
  MoreVertical,
  Pencil,
  FileText,
  Trash2,
} from '@/design-system/icons';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { RotateCcw, AlertTriangle, Building2 } from 'lucide-react';
import { DataTable, FilterBar,
  FilterMenu, PageHeader, TablePager, usePagedRows } from '@/components';
import {
  RecordStatusMenuSection,
  VEHICLE_STATUS_OPTIONS,
} from '@/components/common';
import { usePermissions } from '@/hooks';
import { PanelHeader } from '@/components/panels';
import { RecordRaise } from '@/features/workspace';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import { IconChip, Tooltip, useConfirm } from '@/design-system';
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
  Input,
  Select,
  StatisticCard,
  VerificationBadge,
} from '@/design-system';
import { ROUTES, buildPath } from '@/config/routes';
import type { EnrichedVehicle } from '@/data/partnerData';
import type { OperationalStatus, TruckType, PartnerVehicle } from '@/types/partner';
import { usePartners } from '@/features/partners/api/queries';
import {
  useCreateVehicle,
  useDeleteVehicle,
  useUpdateVehicle,
  useVehicles,
} from '@/features/vehicles/api/queries';
import { useDocuments, useUploadDocument, useDeleteDocument } from '@/features/documents/api/queries';
import { toDisplayDocument, type DisplayDocument } from '@/features/documents/api/documentsService';
import { DocumentChecklist } from '@/features/documents/components/DocumentChecklist';
import type { DocumentCapture } from '@/features/documents/components/DocumentCaptureDialog';
import type { DocumentTypeSpec } from '@/features/documents/catalog';
import { useStagedDocuments, uploadStagedDocuments } from '@/features/documents/stagedDocuments';
import { cn, isVehicleVerified } from '@/utils';

type StatusFilter = 'all' | 'available' | 'in-transit' | 'maintenance' | 'out-of-service';

/** The tabs, and the status each one selects. One list so the tab bar and the
    small-screen select can never offer different bands. */
const STATUS_TABS: { key: StatusFilter; label: string; tone?: string; status?: OperationalStatus }[] = [
  { key: 'all', label: 'All' },
  { key: 'available', label: 'Available', tone: 'text-success', status: 'Available' },
  { key: 'in-transit', label: 'In Transit', tone: 'text-info', status: 'In Transit' },
  { key: 'maintenance', label: 'Maintenance', tone: 'text-warning-subtle-foreground', status: 'Under Maintenance' },
  { key: 'out-of-service', label: 'Out of service', tone: 'text-destructive', status: 'Out of Service' },
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

export function VehiclesPage() {
  const navigate = useNavigate();
  const { data: vehiclesResponse } = useVehicles();
  const vehicles = useMemo(() => vehiclesResponse?.items ?? [], [vehiclesResponse]);
  const { data: partnersResponse } = usePartners();
  const partners = useMemo(() => partnersResponse?.items ?? [], [partnersResponse]);
  const createVehicle = useCreateVehicle();
  const updateVehicle = useUpdateVehicle();
  const [selectedVehicle, setSelectedVehicle] = useState<EnrichedVehicle | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

  // Add Vehicle Modal State
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [newVehicle, setNewVehicle] = useState({
    partnerId: '',
    plateNumber: '',
    truckType: '40ft Container' as TruckType,
  });
  const [addSuccessNotice, setAddSuccessNotice] = useState<string | null>(null);
  const [addError, setAddError] = useState<string | null>(null);

  /**
   * The truck's two papers, held until it has an id to file them against.
   *
   * The form used to ask for `insuranceStartDate` and `insuranceExpiry` as
   * bare date fields, and separately let somebody attach a certificate — two
   * answers to one question, with nothing keeping them honest. A vehicle
   * covered to March could be typed as covered to December, and every
   * verification check in the app read the typed answer.
   *
   * The certificate is the answer now. Its dates become the vehicle's, its
   * insurer becomes the vehicle's insurer (`syncVehicleComplianceDates` on the
   * backend), and the grey card's expiry becomes the registration's.
   */
  const newVehicleDocs = useStagedDocuments();

  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicle.plateNumber || !newVehicle.partnerId) return;

    const partner = partners.find((p) => p.id === newVehicle.partnerId);
    if (!partner) return;

    /* Both papers, before the truck exists. A vehicle with no registration and
       no cover is not a vehicle that can be dispatched, so it is not a vehicle
       worth registering — and the API needs both expiry dates anyway, which
       used to be met with two invented constants. */
    const greyCard = newVehicleDocs.captureFor('Grey Card');
    const insurance = newVehicleDocs.captureFor('Insurance');
    if (!greyCard || !insurance) {
      setAddError('Attach the grey card and the insurance certificate before registering the truck.');
      return;
    }

    setAddError(null);
    const created = await createVehicle.mutateAsync({
      partnerId: newVehicle.partnerId,
      payload: {
        plateNumber: newVehicle.plateNumber,
        truckType: newVehicle.truckType,
        containerCapacity: 'Standard Capacity',
        ownershipType: 'Owned',
        insuranceProvider: insurance.issuer,
        insuranceStartDate: insurance.issueDate,
        insuranceExpiry: insurance.expiryDate,
        registrationExpiry: greyCard.expiryDate,
        hasGPS: false,
        operationalStatus: 'Available',
      },
    });

    await uploadStagedDocuments('VEHICLE', created.id, newVehicleDocs.staged);

    setIsAddVehicleOpen(false);
    newVehicleDocs.reset();
    setNewVehicle({
      partnerId: '',
      plateNumber: '',
      truckType: '40ft Container',
    });

    setAddSuccessNotice(`Vehicle "${created.plateNumber}" registered to ${partner.companyLegalName}.`);
    setTimeout(() => setAddSuccessNotice(null), 5000);
  };

  // Drawer tabs: 'view' | 'edit' | 'docs'
  /* Two states, not three: editing is a corner toggle and the document list
     lives inside it, the same shape the Drivers panel uses. */
  const [drawerTab, setDrawerTab] = useState<'view' | 'edit'>('view');

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<EnrichedVehicle>>({});

  const [docNotice, setDocNotice] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DocumentToView | null>(null);

  const { data: selectedVehicleDocs = [] } = useDocuments('VEHICLE', selectedVehicle?.id);
  const uploadDoc = useUploadDocument('VEHICLE', selectedVehicle?.id);
  const deleteDoc = useDeleteDocument('VEHICLE', selectedVehicle?.id);
  const vehicleDocRows: DisplayDocument[] = useMemo(
    () => selectedVehicleDocs.map(toDisplayDocument),
    [selectedVehicleDocs],
  );

  const handleSelectVehicle = (vehicle: EnrichedVehicle) => {
    setSelectedVehicle(vehicle);
    setEditForm(vehicle);
    setDrawerTab('view');
    setDocNotice(null);
  };

  /* `?vehicle=<id|reference|plate>` opens straight into that vehicle's sheet —
     what a Workspace record chip links to. A chip that landed on this list
     instead was asking the reader to go and find the truck themselves, which
     on a fleet this size is a search, not a link.

     Matches three ways because three things call a vehicle by name: the uuid
     a task link carries, the `VEH-#####` reference, and the plate people
     actually say out loud. Mirrors `?driver=` on the drivers page. */
  const wantedVehicle = searchParams.get('vehicle');
  useEffect(() => {
    if (!wantedVehicle || vehicles.length === 0) return;
    const match = vehicles.find(
      (v) => v.id === wantedVehicle || v.reference === wantedVehicle || v.plateNumber === wantedVehicle,
    );
    if (match) handleSelectVehicle(match);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wantedVehicle, vehicles]);

  const closeVehicleDrawer = () => {
    setSelectedVehicle(null);
    if (wantedVehicle) {
      setSearchParams(
        (params) => {
          params.delete('vehicle');
          return params;
        },
        { replace: true },
      );
    }
  };

  const handleSaveEdit = async () => {
    if (!selectedVehicle) return;
    const updated = await updateVehicle.mutateAsync({
      id: selectedVehicle.id,
      payload: {
        plateNumber: editForm.plateNumber || selectedVehicle.plateNumber,
        truckType: (editForm.truckType as TruckType) || selectedVehicle.truckType,
        containerCapacity: editForm.containerCapacity || selectedVehicle.containerCapacity,
        make: editForm.make || selectedVehicle.make,
        model: editForm.model || selectedVehicle.model,
        year: editForm.year || selectedVehicle.year,
        insuranceExpiry: editForm.insuranceExpiry || selectedVehicle.insuranceExpiry,
        registrationExpiry: editForm.registrationExpiry || selectedVehicle.registrationExpiry,
        operationalStatus: editForm.operationalStatus || selectedVehicle.operationalStatus,
        gpsDeviceId: editForm.gpsDeviceId || selectedVehicle.gpsDeviceId,
        hasGPS: !!(editForm.gpsDeviceId || selectedVehicle.hasGPS),
      },
    });
    setSelectedVehicle(updated);
    setDrawerTab('view');
  };

  const handleUploadForType = (spec: DocumentTypeSpec, capture: DocumentCapture) => {
    if (!selectedVehicle) return;
    uploadDoc.mutate(
      {
        category: spec.label,
        file: capture.file,
        issueDate: capture.issueDate,
        expiryDate: capture.expiryDate,
        issuer: capture.issuer,
      },
      {
        onSuccess: (doc) => {
          setDocNotice(`Document "${doc.name}" filed.`);
          setTimeout(() => setDocNotice(null), 4000);
        },
      },
    );
  };

  const { confirm, confirmDialog } = useConfirm();

  const handleDeleteVehicleDoc = async (_vehicleId: string, docId: string) => {
    const ok = await confirm({
      title: 'Delete this document?',
      description: 'The file will be permanently removed from the vault.',
    });
    if (ok) deleteDoc.mutate(docId);
  };

  const handleDownloadVehicleDoc = (doc: DisplayDocument) => {
    void triggerDocumentDownload(doc.id, doc.name);
  };

  /*
   * What this account may actually do here — the same gate the Shippers and
   * Transporters lists use. A menu that offers what the server will refuse
   * (403) is worse than a short menu, so an action this role cannot perform is
   * not offered at all.
   */
  const { can } = usePermissions();
  const canEditVehicles = can('vehicles.update');
  const canDeleteVehicles = can('vehicles.delete');
  const canCreateVehicles = can('vehicles.create');
  const deleteVehicle = useDeleteVehicle();

  /**
   * Move a truck up or down its operational ladder from the row itself.
   *
   * The whole ladder every time, as a radio group — the house rule for a status
   * picker. `mutateAsync`, because a fire-and-forget notice announces a change
   * the server may have refused.
   */
  const handleStatusChange = async (vehicle: EnrichedVehicle, next: OperationalStatus) => {
    if (next === vehicle.operationalStatus) return;
    try {
      await updateVehicle.mutateAsync({ id: vehicle.id, payload: { operationalStatus: next } });
      if (selectedVehicle?.id === vehicle.id) {
        setSelectedVehicle({ ...selectedVehicle, operationalStatus: next });
      }
      setAddSuccessNotice(`${vehicle.plateNumber} is now ${next.toLowerCase()}.`);
      setTimeout(() => setAddSuccessNotice(null), 4500);
    } catch {
      setAddSuccessNotice(`Could not change ${vehicle.plateNumber} — your account cannot edit vehicles.`);
      setTimeout(() => setAddSuccessNotice(null), 4500);
    }
  };

  const handleDeleteVehicle = async (vehicle: EnrichedVehicle, e?: React.MouseEvent) => {
    e?.stopPropagation();
    const ok = await confirm({
      title: 'Remove this vehicle?',
      description: `${vehicle.plateNumber} will be removed from the fleet. Bookings already assigned to it keep their record.`,
      confirmLabel: 'Remove',
    });
    if (!ok) return;
    deleteVehicle.mutate(vehicle.id);
    if (selectedVehicle?.id === vehicle.id) setSelectedVehicle(null);
  };

  // Filters & Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<StatusFilter>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('plate-asc');

  // Analytics
  const totalVehicles = vehicles.length;
  const availableCount = vehicles.filter((v) => v.operationalStatus === 'Available').length;
  const inTransitCount = vehicles.filter((v) => v.operationalStatus === 'In Transit').length;
  const maintenanceCount = vehicles.filter((v) => v.operationalStatus === 'Under Maintenance').length;

  // Filtering
  const filteredVehicles = useMemo(() => {
    const list = vehicles.filter((v) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        v.plateNumber.toLowerCase().includes(q) ||
        v.partnerName.toLowerCase().includes(q) ||
        (v.make && v.make.toLowerCase().includes(q)) ||
        (v.model && v.model.toLowerCase().includes(q));

      /* Compared against the tab's own `status`, not a lowercased label: the
         two drifted the moment a band was called "Maintenance" and the status
         was "Under Maintenance". */
      const tabStatus = STATUS_TABS.find((tab) => tab.key === statusFilter)?.status;
      const matchesStatus = !tabStatus || v.operationalStatus === tabStatus;
      const matchesType = typeFilter === 'all' || v.truckType === typeFilter;

      /* No transporter select: the column shows every carrier's name outright
         now, and the search field already matches on it — a dropdown of the
         same ten names was a third control doing the second one's job. */
      return matchesSearch && matchesStatus && matchesType;
    });

    list.sort((a, b) => {
      if (sortBy === 'plate-asc') return a.plateNumber.localeCompare(b.plateNumber);
      if (sortBy === 'partner-asc') return a.partnerName.localeCompare(b.partnerName);
      if (sortBy === 'type-asc') return a.truckType.localeCompare(b.truckType);
      return 0;
    });

    return list;
  }, [vehicles, searchTerm, statusFilter, typeFilter, sortBy]);

  /** One page at a time — the row list and the card grid share the pager. */
  const [pageSize, setPageSize] = useState(12);
  const pagedVehicles = usePagedRows(filteredVehicles, {
    pageSize,
    resetKey: `${statusFilter}|${typeFilter}|${searchTerm}|${sortBy}`,
  });

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all' || typeFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
    setSortBy('plate-asc');
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
        title="Vehicles"
        actions={
          canCreateVehicles ? (
            <Button
              onClick={() => setIsAddVehicleOpen(true)}
              shape="pill"
              leadingIcon={<Plus className="h-4 w-4" />}
              className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs cursor-pointer"
            >
              Add vehicle
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

      {/* Add New Vehicle Drawer */}
      <Sheet open={isAddVehicleOpen} onOpenChange={setIsAddVehicleOpen}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
        >
          <SheetHeading
            titleComponent={SheetTitle}
            descriptionComponent={SheetDescription}
            title={
              <>
                <Truck className="h-5 w-5 text-primary" /> Register Vehicle
              </>
            }
            description="Registered to the selected transporter's fleet."
          />

          <form onSubmit={handleCreateVehicle} className="flex min-h-0 flex-1 flex-col">
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-6 py-5 sm:px-8">
          <div className="space-y-4">
            <div className="space-y-1.5 p-3.5 rounded-lg border border-primary/30 bg-primary/5">
              <label className="text-[11px] font-bold text-primary block uppercase tracking-wider">Transporter *</label>
              <Select
                value={newVehicle.partnerId}
                options={[
                  { value: '', label: 'Select a transporter…' },
                  ...partners.map((p) => ({
                    value: p.id,
                    label: `${p.companyLegalName} (${p.country})`,
                  })),
                ]}
                onChange={(e) => setNewVehicle((prev) => ({ ...prev, partnerId: e.target.value }))}
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">Plate Number *</label>
                <Input
                  required
                  value={newVehicle.plateNumber}
                  onChange={(e) => setNewVehicle((prev) => ({ ...prev, plateNumber: e.target.value }))}
                  placeholder="e.g. DJ-ABJ-9900"
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">Vehicle Type *</label>
                <Select
                  value={newVehicle.truckType}
                  options={[
                    { value: 'Flatbed', label: 'Flatbed' },
                    { value: '20ft Container', label: '20ft Container' },
                    { value: '40ft Container', label: '40ft Container' },
                    { value: 'Refrigerated', label: 'Refrigerated' },
                    { value: 'Tanker', label: 'Tanker' },
                    { value: 'Tipper', label: 'Tipper' },
                    { value: 'Box Truck', label: 'Box Truck' },
                  ]}
                  onChange={(e) => setNewVehicle((prev) => ({ ...prev, truckType: e.target.value as TruckType }))}
                />
              </div>
            </div>

            {/* The truck's papers, and the dates that come off them.
             *
             * The two date fields this replaced asked for the insurance
             * period as free text beside an optional certificate, which let
             * the record say one thing and the paper another. The certificate
             * is the record now: its dates become the vehicle's cover, the
             * grey card's expiry becomes its registration, and neither can be
             * typed into disagreement with the file behind it. */}
            <div className="space-y-3 border-t border-border/40 pt-3">
              <h4 className="type-h4 flex items-center gap-2 font-semibold text-foreground">
                <FileText className="h-4.5 w-4.5 text-primary" />
                Vehicle Documents
              </h4>

              <DocumentChecklist
                ownerType="VEHICLE"
                documents={newVehicleDocs.rows}
                subject={newVehicle.plateNumber || undefined}
                onUpload={newVehicleDocs.stage}
                onRemove={newVehicleDocs.remove}
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
                setIsAddVehicleOpen(false);
                newVehicleDocs.reset();
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
          title="Total Fleet"
          value={totalVehicles}
          variant="teal"
          trend="up"
          percentage="100%"
          icon={<Truck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Available"
          value={availableCount}
          variant="blue"
          trend="up"
          percentage={`${Math.round((availableCount / (totalVehicles || 1)) * 100)}%`}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatisticCard
          title="In Transit"
          value={inTransitCount}
          variant="peach"
          trend="up"
          percentage="+12%"
          icon={<Truck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Maintenance"
          value={maintenanceCount}
          variant="pink"
          trend={maintenanceCount > 0 ? 'down' : 'neutral'}
          percentage={`${maintenanceCount} vehicles`}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* One filter bar, the app's own. This was a hand-rolled "Control Bar":
          pill tabs in an `overflow-x-auto` strip, a search box with its own
          magnifier, and four selects — the exact arrangement `FilterBar` was
          built to replace on the Shippers and Transporters lists, where a
          filter you had to drag into view was a filter nobody knew they had. */}
      <FilterBar
        label="Filter vehicles by status"
        tabs={STATUS_TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          tone: tab.tone,
          count: tab.status
            ? vehicles.filter((v) => v.operationalStatus === tab.status).length
            : vehicles.length,
        }))}
        active={statusFilter}
        onSelect={setStatusFilter}
        search={{
          value: searchTerm,
          onChange: setSearchTerm,
          placeholder: 'Search vehicles…',
          matched: filteredVehicles.length,
          total: vehicles.length,
        }}
      >
        <FilterMenu
          groups={[
            {
              key: 'type',
              label: 'Vehicle type',
              value: typeFilter,
              onChange: setTypeFilter,
              options: [
                { value: 'all', label: 'All vehicle types' },
                { value: '40ft Container', label: '40ft Container' },
                { value: '20ft Container', label: '20ft Container' },
                { value: 'Flatbed', label: 'Flatbed' },
                { value: 'Refrigerated', label: 'Refrigerated' },
                { value: 'Tanker', label: 'Tanker' },
                { value: 'Box Truck', label: 'Box Truck' },
              ],
            },
            {
              key: 'sort',
              label: 'Sort by',
              value: sortBy,
              onChange: setSortBy,
              options: [
                { value: 'plate-asc', label: 'Plate no.' },
                { value: 'partner-asc', label: 'Transporter' },
                { value: 'type-asc', label: 'Vehicle type' },
              ],
            },
          ]}
        />
      </FilterBar>
      {/* Vehicle Drawer */}
      <Sheet open={Boolean(selectedVehicle)} onOpenChange={(open) => !open && closeVehicleDrawer()}>
        <SheetContent side="right" className="w-full sm:max-w-md overflow-y-auto p-6 bg-background border-l border-border space-y-6">
          <SheetTitle className="sr-only">Vehicle Details & Documents</SheetTitle>
          <SheetDescription className="sr-only">Vehicle specifications and documents.</SheetDescription>
          {selectedVehicle && (
            <div className="space-y-6">
              <PanelHeader
                media={<IconChip icon={Truck} />}
                title={<span className="font-mono tracking-wide">{selectedVehicle.plateNumber}</span>}
                subtitle={`${selectedVehicle.truckType}${selectedVehicle.make ? ` · ${selectedVehicle.make} ${selectedVehicle.model || ''}`.trimEnd() : ''}`}
                verified={isVehicleVerified(selectedVehicle)}
                status={<StatusPill status={selectedVehicle.operationalStatus} />}
                onEdit={() => setDrawerTab(drawerTab === 'edit' ? 'view' : 'edit')}
                editing={drawerTab === 'edit'}
              />

              <RecordRaise
                recordType="VEHICLE"
                recordId={selectedVehicle.id}
                recordRef={selectedVehicle.plateNumber}
                label={selectedVehicle.truckType}
                size="sm"
              />

              {/* Toast / Notice */}
              {docNotice && (
                <div className="p-3 rounded-lg border border-success/30 bg-success-subtle text-success-subtle-foreground text-xs font-medium flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4 text-success-subtle-foreground shrink-0" />
                  <span>{docNotice}</span>
                </div>
              )}

              {/* ── TAB 1: OVERVIEW ── */}
              {drawerTab === 'view' && (
                <div className="space-y-5">
                  <Card className="p-4 border border-primary/20 bg-primary/5 rounded-lg space-y-2">
                    <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider block">Transporter</span>
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Building2 className="h-4 w-4 text-primary shrink-0" />
                        <div>
                          <p className="font-bold text-foreground text-xs">{selectedVehicle.partnerName}</p>
                          <p className="text-[10px] text-muted-foreground">{selectedVehicle.partnerCountry} · {selectedVehicle.partnerReference}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        shape="pill"
                        onClick={(e) => handleGoToPartner(selectedVehicle.partnerReference, e)}
                        leadingIcon={<ExternalLink className="h-3 w-3" />}
                        className="text-xs font-semibold h-7 px-3 shrink-0"
                      >
                        Dossier
                      </Button>
                    </div>
                  </Card>

                  <div className="space-y-3">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Specifications & Capacity</h4>
                    <div className="grid grid-cols-2 gap-2 text-xs p-3.5 rounded-lg border border-border bg-card">
                      <div><span className="text-muted-foreground block text-[10px]">Capacity</span><strong className="text-foreground font-semibold">{selectedVehicle.containerCapacity || '—'}</strong></div>
                      <div><span className="text-muted-foreground block text-[10px]">Ownership</span><strong className="text-foreground font-semibold">{selectedVehicle.ownershipType}</strong></div>
                      <div><span className="text-muted-foreground block text-[10px]">Year / Make</span><strong className="text-foreground font-semibold">{selectedVehicle.year ? `${selectedVehicle.year} ${selectedVehicle.make || ''}` : '—'}</strong></div>
                      <div><span className="text-muted-foreground block text-[10px]">Trailer Info</span><strong className="text-foreground font-semibold">{selectedVehicle.trailerInfo || '—'}</strong></div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Registration & Insurance</h4>
                    <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg border border-border bg-card text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Insurance Expiry</span>
                        <ExpiryLabel date={selectedVehicle.insuranceExpiry} />
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Registration Expiry</span>
                        <ExpiryLabel date={selectedVehicle.registrationExpiry} />
                      </div>
                    </div>
                  </div>

                  {/* What this truck has done, where its standing driver used
                      to sit. A vehicle has no one driver — it has a history of
                      runs, each with the driver who made it, recorded on the
                      booking. */}
                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Work</h4>
                    <div className="p-3.5 rounded-lg border border-border bg-card flex items-center gap-3 text-xs">
                      <IconChip icon={Route} size={36} />
                      <div>
                        <p className="font-bold text-foreground">
                          {(selectedVehicle.trips ?? 0).toLocaleString()}{' '}
                          {(selectedVehicle.trips ?? 0) === 1 ? 'trip' : 'trips'}
                        </p>
                        <p className="text-[10px] text-muted-foreground">Container runs completed or under way</p>
                      </div>
                    </div>
                  </div>

                  <div className="pt-2">
                    <Button
                      onClick={() => setDrawerTab('edit')}
                      leadingIcon={<Pencil className="h-4 w-4" />}
                      className="w-full bg-primary text-primary-foreground font-semibold text-xs rounded-lg py-2.5"
                    >
                      Edit vehicle specs
                    </Button>
                  </div>
                </div>
              )}

              {/* ── TAB 2: EDIT SPECS ── */}
              {drawerTab === 'edit' && (
                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Plate Number</label>
                      <Input
                        value={editForm.plateNumber || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, plateNumber: e.target.value }))}
                        placeholder="DJ-ABJ-1234"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Vehicle Type</label>
                      <Select
                        value={editForm.truckType || '40ft Container'}
                        options={[
                          { value: 'Flatbed', label: 'Flatbed' },
                          { value: '20ft Container', label: '20ft Container' },
                          { value: '40ft Container', label: '40ft Container' },
                          { value: 'Refrigerated', label: 'Refrigerated' },
                          { value: 'Tanker', label: 'Tanker' },
                          { value: 'Tipper', label: 'Tipper' },
                          { value: 'Box Truck', label: 'Box Truck' },
                        ]}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, truckType: e.target.value as TruckType }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Container Capacity</label>
                      <Input
                        value={editForm.containerCapacity || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, containerCapacity: e.target.value }))}
                        placeholder="40ft / 28 tons"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Ownership Type</label>
                      <Select
                        value={editForm.ownershipType || 'Owned'}
                        options={[
                          { value: 'Owned', label: 'Owned' },
                          { value: 'Leased', label: 'Leased' },
                          { value: 'Rented', label: 'Rented' },
                        ]}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, ownershipType: e.target.value as PartnerVehicle['ownershipType'] }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Make</label>
                      <Input
                        value={editForm.make || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, make: e.target.value }))}
                        placeholder="Volvo"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Model</label>
                      <Input
                        value={editForm.model || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, model: e.target.value }))}
                        placeholder="FH16"
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Year</label>
                      <Input
                        type="number"
                        value={editForm.year || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, year: parseInt(e.target.value) || undefined }))}
                        placeholder="2021"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Insurance Expiry</label>
                      <Input
                        type="date"
                        value={editForm.insuranceExpiry || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, insuranceExpiry: e.target.value }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Registration Expiry</label>
                      <Input
                        type="date"
                        value={editForm.registrationExpiry || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, registrationExpiry: e.target.value }))}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">Operational Status</label>
                      <Select
                        value={editForm.operationalStatus || 'Available'}
                        options={[
                          { value: 'Available', label: 'Available' },
                          { value: 'In Transit', label: 'In Transit' },
                          { value: 'Under Maintenance', label: 'Under Maintenance' },
                          { value: 'Out of Service', label: 'Out of Service' },
                        ]}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, operationalStatus: e.target.value as OperationalStatus }))}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-[11px] font-bold text-foreground block">GPS Device ID</label>
                      <Input
                        value={editForm.gpsDeviceId || ''}
                        onChange={(e) => setEditForm((prev) => ({ ...prev, gpsDeviceId: e.target.value }))}
                        placeholder="GPS-4421"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                    <Button variant="outline" size="sm" onClick={() => setDrawerTab('view')}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleSaveEdit}>
                      Save changes
                    </Button>
                  </div>
                </div>
              )}

              {/* ── TAB 3: VEHICLE DOCUMENTS & UPLOAD ── */}
              {drawerTab === 'edit' && (
                <div className="space-y-5">
                  <h4 className="type-h4 flex items-center gap-2 font-semibold text-foreground">
                    <FileText className="h-4.5 w-4.5 text-primary" />
                    Vehicle Documents
                  </h4>

                  {/* Re-filing the insurance here moves the truck's cover with
                      it — the backend writes the certificate's dates and
                      insurer onto the vehicle, so a renewal is one upload
                      rather than an upload and three fields. */}
                  <DocumentChecklist
                    ownerType="VEHICLE"
                    documents={vehicleDocRows}
                    subject={selectedVehicle.plateNumber}
                    busy={uploadDoc.isPending}
                    onUpload={handleUploadForType}
                    onView={setViewingDoc}
                    onDownload={handleDownloadVehicleDoc}
                    onRemove={(docId) => handleDeleteVehicleDoc(selectedVehicle.id, docId)}
                  />
                </div>
              )}
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* ── Main View ── */}
      {/* One list surface, no view switcher. A directory is a comparison
          surface — "which of these is which, and which one do I want" is a
          question about columns lining up — and the grid answered it by putting
          every value at a different x. The card layout the switcher used to
          offer is still here: `DataTable` falls back to it below the width
          where the columns fit, which is where a grid was the better answer. */}
      <DataTable
        rows={pagedVehicles.rows}
        rowKey={(vehicle) => vehicle.id}
        onRowClick={(vehicle) => handleSelectVehicle(vehicle)}
        emptyCopy="No vehicle matches the current filters."
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
            key: 'plate',
            label: 'Plate & type',
            icon: ContainerIcon,
            width: 'w-[22%]',
            card: 'identity',
            cell: (vehicle) => (
              <div className="flex min-w-0 items-center gap-2.5">
                <IconChip icon={ContainerIcon} size={36} />
                <div className="min-w-0">
                  <div className="flex min-w-0 items-center gap-1.5">
                    <span className="truncate font-mono text-sm font-bold tracking-wider text-foreground">
                      {vehicle.plateNumber}
                    </span>
                    <VerificationBadge
                      state={isVehicleVerified(vehicle) ? 'verified' : 'unverified'}
                      size="sm"
                    />
                  </div>
                  <span className="block truncate text-[11px] text-muted-foreground">
                    {vehicle.truckType}
                    {vehicle.containerCapacity ? ` · ${vehicle.containerCapacity}` : ''}
                  </span>
                </div>
              </div>
            ),
          },
          {
            key: 'transporter',
            label: 'Transporter',
            icon: Building2,
            width: 'w-[23%]',
            /* Mark **and** name. The mark alone, with the name hidden in a
               tooltip, is the one place the app breaks its own rule that a
               named company always shows its logo beside the name — and in a
               column of near-identical circles it made the reader hover every
               row to find out who anybody was. */
            cell: (vehicle) => (
              <Tooltip
                content={`Transporter · ${vehicle.partnerName}${vehicle.partnerCountry ? ` · ${vehicle.partnerCountry}` : ''}`}
              >
                <button
                  type="button"
                  onClick={(e) => handleGoToPartner(vehicle.partnerReference, e)}
                  className="flex w-full min-w-0 items-center gap-2 rounded-full p-0.5 pr-2 text-left transition-colors hover:bg-muted"
                >
                  <CompanyMark id={vehicle.partnerId} name={vehicle.partnerName} size="sm" />
                  <span className="truncate text-xs font-semibold text-foreground">
                    {vehicle.partnerName}
                  </span>
                </button>
              </Tooltip>
            ),
          },
          {
            /* What this truck has actually done.
               It was "Assigned driver", a standing pairing set on this page —
               one name, for a truck that a dozen different drivers take out
               over its life. The driver is chosen per booking, on the
               shipment, so the pairing was a second answer nothing kept true.
               A trip count is a fact about the *vehicle*, which is what this
               directory is for: it separates the truck that works from the one
               parked at the yard, and it is the same unit the rest of the app
               counts in — one booking, one container run. */
            key: 'trips',
            label: 'Trips',
            icon: Route,
            width: 'w-[18%]',
            cardLabel: 'Trips',
            cell: (vehicle) => {
              const trips = vehicle.trips ?? 0;
              return (
                <span className="flex items-baseline gap-1.5">
                  {/* Monospaced and tabular so a column of counts lines up on
                      the digit; greyed at zero because a truck that has never
                      run is not news, it is a new truck. */}
                  <span
                    className={cn(
                      'font-mono text-sm font-bold tabular-nums',
                      trips > 0 ? 'text-foreground' : 'text-muted-foreground',
                    )}
                  >
                    {trips}
                  </span>
                  {/* The column is headed Trips, so the noun under the figure
                      is a trip. It said "run"/"runs", which is a second word
                      for the same thing one line below the first. */}
                  <span className="text-[11px] text-muted-foreground">
                    {trips === 1 ? 'trip' : 'trips'}
                  </span>
                </span>
              );
            },
          },
          {
            key: 'insurance',
            label: 'Insurance',
            icon: FileText,
            width: 'w-[14%]',
            cell: (vehicle) => <ExpiryLabel date={vehicle.insuranceExpiry} />,
          },
          {
            key: 'status',
            label: 'Status',
            icon: Truck,
            width: 'w-[13%]',
            card: 'trailing',
            cell: (vehicle) => <StatusPill status={vehicle.operationalStatus} />,
          },
          {
            key: 'actions',
            label: 'Actions',
            /* 10%, matching Shippers. At 8% the ⋮ button fitted and the word
               above it did not — the heading truncated to "ACTIO…". */
            width: 'w-[10%]',
            card: 'trailing',
            cell: (vehicle) => (
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
                      aria-label="Vehicle actions"
                      className="flex size-8 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                    >
                      <MoreVertical className="size-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-52">
                    <DropdownMenuItem
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSelectVehicle(vehicle);
                      }}
                      className="cursor-pointer gap-2 text-xs"
                    >
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>Open vehicle</span>
                    </DropdownMenuItem>
                    {canEditVehicles && (
                      <DropdownMenuItem
                        onClick={(e) => {
                          e.stopPropagation();
                          handleSelectVehicle(vehicle);
                          setDrawerTab('edit');
                        }}
                        className="cursor-pointer gap-2 text-xs"
                      >
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" />
                        <span>Edit vehicle</span>
                      </DropdownMenuItem>
                    )}
                    {canEditVehicles && (
                      <RecordStatusMenuSection
                        value={vehicle.operationalStatus}
                        options={VEHICLE_STATUS_OPTIONS}
                        onSelect={(next) => handleStatusChange(vehicle, next)}
                        busy={updateVehicle.isPending}
                      />
                    )}
                    {canDeleteVehicles && (
                      <>
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          onClick={(e) => handleDeleteVehicle(vehicle, e)}
                          className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          <span>Delete vehicle</span>
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

      {filteredVehicles.length > 0 && (
        <TablePager
          paged={pagedVehicles}
          noun="vehicles"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}

      {/* No "No Vehicles Found" panel here: `DataTable` prints its own empty
          row with the same escape, and the two together were the page saying
          it twice. */}

      <DocumentViewerModal open={Boolean(viewingDoc)} onOpenChange={(open) => !open && setViewingDoc(null)} document={viewingDoc} />
    </div>
  );
}

export default VehiclesPage;
