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
  SlidersHorizontal,
  Pencil,
  FileText,
  Upload,
  Trash2,
  Eye,
  Download,
} from '@/design-system/icons';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { RotateCcw, AlertTriangle, Building2, Check } from 'lucide-react';
import { DataTable, FilterBar, PageHeader, TablePager, usePagedRows } from '@/components';
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
  Badge,
  Button,
  Card,
  Checkbox,
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
import { useDocuments, useCreateDocumentType, useDocumentTypes, useUploadDocument, useDeleteDocument } from '@/features/documents/api/queries';
import { toDisplayDocument, uploadDocument, type DocumentTypeRecord } from '@/features/documents/api/documentsService';
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

function isExpiredOrSoon(dateStr?: string): 'expired' | 'soon' | 'ok' {
  if (!dateStr) return 'ok';
  const d = new Date(dateStr);
  const now = new Date();
  if (d < now) return 'expired';
  const diff = (d.getTime() - now.getTime()) / (1000 * 60 * 60 * 24);
  if (diff <= 30) return 'soon';
  return 'ok';
}

function ExpiryLabel({ date, label }: { date?: string; label: string }) {
  if (!date) return null;
  const state = isExpiredOrSoon(date);
  const cls = state === 'expired' ? 'text-destructive-subtle-foreground font-semibold' : state === 'soon' ? 'text-warning-subtle-foreground font-semibold' : 'text-foreground';
  return (
    <div className="text-2xs">
      <span className="text-muted-foreground block text-[10px]">{label}</span>
      <span className={`flex items-center gap-1 ${cls}`}>
        {state !== 'ok' && <AlertTriangle className="h-3 w-3 shrink-0" />}
        {date}
      </span>
    </div>
  );
}

interface VehicleDocRow {
  id: string;
  name: string;
  category: string;
  fileSize: string;
}

/** Shared "one row per document type" list — same pattern as the New Transporter
 *  Onboarding compliance-documents step. Used both in the Add Vehicle popup
 *  (docs staged before the vehicle exists) and the vehicle drawer's Documents tab. */
function DocumentTypeList({
  types,
  docs,
  onUpload,
  onView,
  onDownload,
  onRemove,
}: {
  types: DocumentTypeRecord[];
  docs: VehicleDocRow[];
  onUpload: (type: DocumentTypeRecord, file: File) => void;
  onView: (doc: VehicleDocRow) => void;
  onDownload: (doc: VehicleDocRow) => void;
  onRemove: (docId: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      {types.map((type) => {
        const existing = docs.find((d) => d.category === type.label);
        return (
          <div
            key={type.id}
            className={cn(
              'flex items-center gap-3 rounded-lg border px-3.5 py-2.5 transition-colors',
              existing ? 'border-success/30 bg-success-subtle/40' : 'border-border/70 bg-card hover:border-primary/40'
            )}
          >
            <span
              className={cn(
                'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                existing ? 'border-success bg-success text-success-foreground' : 'border-border-strong text-transparent'
              )}
              aria-hidden
            >
              <Check className="h-3 w-3 stroke-[3]" />
            </span>

            <div className="min-w-0 flex-1 flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-foreground truncate">{type.label}</span>
              {existing ? (
                <span className="text-2xs text-muted-foreground truncate">
                  {existing.name} · {existing.fileSize}
                </span>
              ) : (
                <Badge intent={type.required ? 'warning' : 'default'} size="sm">
                  {type.required ? 'Required' : 'Optional'}
                </Badge>
              )}
            </div>

            <div className="flex items-center gap-1 shrink-0">
              {existing ? (
                <>
                  <button
                    type="button"
                    onClick={() => onView(existing)}
                    className="p-1 rounded-md text-muted-foreground hover:text-primary transition-colors"
                    title="View Document"
                  >
                    <Eye className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onDownload(existing)}
                    className="p-1 rounded-md text-muted-foreground hover:text-primary transition-colors"
                    title="Download Document"
                  >
                    <Download className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => onRemove(existing.id)}
                    className="p-1 rounded-md text-muted-foreground hover:text-destructive transition-colors shrink-0"
                    title="Remove document"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </>
              ) : (
                <label className="flex items-center gap-1.5 px-2.5 py-1 rounded-md border border-dashed border-primary/40 bg-primary/5 text-primary text-2xs font-semibold hover:bg-primary/10 transition-colors cursor-pointer shrink-0">
                  <input
                    type="file"
                    accept=".pdf,.png,.jpg,.jpeg"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      if (file) onUpload(type, file);
                    }}
                  />
                  <Upload className="h-3 w-3" />
                  <span>Upload</span>
                </label>
              )}
            </div>
          </div>
        );
      })}

      {types.length === 0 && (
        <div className="p-6 rounded-lg border border-dashed border-border/80 text-center text-xs text-muted-foreground">
          No document types yet.
        </div>
      )}
    </div>
  );
}

/** Shared "define a new document type" box — same pattern as New Transporter Onboarding. */
function AddDocumentTypeBox({
  labelValue,
  onLabelChange,
  required,
  onRequiredChange,
  onSave,
  placeholder,
}: {
  labelValue: string;
  onLabelChange: (value: string) => void;
  required: boolean;
  onRequiredChange: (value: boolean) => void;
  onSave: () => void;
  placeholder: string;
}) {
  return (
    <div className="p-4 rounded-lg border border-primary/30 bg-primary/5 space-y-3 animate-in fade-in">
      <h5 className="text-xs font-bold text-primary">New Document Type</h5>
      <div className="grid grid-cols-1 sm:grid-cols-[1fr_auto] gap-3 sm:items-center">
        <Input placeholder={placeholder} value={labelValue} onChange={(e) => onLabelChange(e.target.value)} />
        <Checkbox label="Required document" checked={required} onChange={(e) => onRequiredChange(e.target.checked)} />
      </div>
      <div className="flex justify-end pt-1">
        <Button
          type="button"
          size="sm"
          onClick={onSave}
          disabled={!labelValue.trim()}
          className="bg-primary text-primary-foreground font-semibold text-xs rounded-full px-4"
        >
          Save document type
        </Button>
      </div>
    </div>
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
    insuranceStartDate: '',
    insuranceExpiry: '2026-12-31',
  });
  const [addSuccessNotice, setAddSuccessNotice] = useState<string | null>(null);

  // Documents staged for the vehicle before it exists — uploaded to the
  // backend once the vehicle record is created and has a real id.
  const [newVehicleDocs, setNewVehicleDocs] = useState<VehicleDocRow[]>([]);
  const [newVehicleFiles, setNewVehicleFiles] = useState<Record<string, File>>({});

  const handleUploadForNewVehicleType = (type: DocumentTypeRecord, file: File) => {
    const newDoc: VehicleDocRow = {
      id: `staged-${Date.now()}`,
      name: file.name,
      category: type.label,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
    };
    setNewVehicleDocs((prev) => [...prev.filter((d) => d.category !== type.label), newDoc]);
    setNewVehicleFiles((prev) => ({ ...prev, [type.label]: file }));
  };

  const handleRemoveNewVehicleDoc = (docId: string) => {
    setNewVehicleDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  /** A staged (not-yet-persisted) upload has no backend document id — download the local File directly. */
  const handleDownloadNewVehicleDoc = (doc: VehicleDocRow) => {
    const file = newVehicleFiles[doc.category];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateVehicle = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newVehicle.plateNumber || !newVehicle.partnerId) return;

    const partner = partners.find((p) => p.id === newVehicle.partnerId);
    if (!partner) return;

    const created = await createVehicle.mutateAsync({
      partnerId: newVehicle.partnerId,
      payload: {
        plateNumber: newVehicle.plateNumber,
        truckType: newVehicle.truckType,
        containerCapacity: 'Standard Capacity',
        ownershipType: 'Owned',
        insuranceStartDate: newVehicle.insuranceStartDate || undefined,
        insuranceExpiry: newVehicle.insuranceExpiry || '2026-12-31',
        registrationExpiry: '2026-06-30',
        hasGPS: false,
        operationalStatus: 'Available',
      },
    });

    // Upload any documents staged during registration for the new vehicle.
    for (const [category, file] of Object.entries(newVehicleFiles)) {
      await uploadDocument({ ownerType: 'VEHICLE', ownerId: created.id, category, file });
    }

    setIsAddVehicleOpen(false);
    setNewVehicleDocs([]);
    setNewVehicleFiles({});
    setNewVehicle({
      partnerId: '',
      plateNumber: '',
      truckType: '40ft Container',
      insuranceExpiry: '2026-12-31',
      insuranceStartDate: '',
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

  // Document-type catalog — shared across every vehicle via the backend.
  const { data: vehicleDocTypes = [] } = useDocumentTypes('VEHICLE');
  const createDocType = useCreateDocumentType('VEHICLE');

  const [showAddDocType, setShowAddDocType] = useState(false);
  const [newDocTypeLabel, setNewDocTypeLabel] = useState('');
  const [newDocTypeRequired, setNewDocTypeRequired] = useState(true);

  const [docNotice, setDocNotice] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DocumentToView | null>(null);

  const { data: selectedVehicleDocs = [] } = useDocuments('VEHICLE', selectedVehicle?.id);
  const uploadDoc = useUploadDocument('VEHICLE', selectedVehicle?.id);
  const deleteDoc = useDeleteDocument('VEHICLE', selectedVehicle?.id);
  const vehicleDocRows: VehicleDocRow[] = useMemo(
    () => selectedVehicleDocs.map(toDisplayDocument),
    [selectedVehicleDocs],
  );

  const handleSelectVehicle = (vehicle: EnrichedVehicle) => {
    setSelectedVehicle(vehicle);
    setEditForm(vehicle);
    setDrawerTab('view');
    setDocNotice(null);
    setShowAddDocType(false);
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

  /** Defines a new document type — saved to the catalog, so it shows up as
   *  an upload slot for every vehicle after this one. */
  const handleAddDocumentType = () => {
    if (!newDocTypeLabel.trim()) return;
    createDocType.mutate({ label: newDocTypeLabel, required: newDocTypeRequired });
    setNewDocTypeLabel('');
    setNewDocTypeRequired(true);
    setShowAddDocType(false);
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

  const handleUploadForType = (type: DocumentTypeRecord, file: File) => {
    if (!selectedVehicle) return;
    uploadDoc.mutate(
      { category: type.label, file },
      {
        onSuccess: (doc) => {
          setDocNotice(`Document "${doc.name}" uploaded.`);
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

  const handleDownloadVehicleDoc = (doc: VehicleDocRow) => {
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
          <div className="shrink-0 space-y-1 border-b border-border/40 px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
            <SheetTitle className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-foreground">
              <Truck className="h-5 w-5 text-primary" /> Register Vehicle
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Registered to the selected transporter's fleet.
            </SheetDescription>
          </div>

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

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">Insurance Start Date</label>
                <Input
                  type="date"
                  value={newVehicle.insuranceStartDate}
                  onChange={(e) => setNewVehicle((prev) => ({ ...prev, insuranceStartDate: e.target.value }))}
                />
              </div>
              <div className="space-y-1.5">
                <label className="text-[11px] font-bold text-foreground block">Insurance Expiry Date</label>
                <Input
                  type="date"
                  value={newVehicle.insuranceExpiry}
                  onChange={(e) => setNewVehicle((prev) => ({ ...prev, insuranceExpiry: e.target.value }))}
                />
              </div>
            </div>

            <div className="space-y-3 pt-3 border-t border-border/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-primary" />
                    Vehicle Compliance Documents
                  </h4>
                  <p className="type-caption text-muted-foreground mt-0.5">
                    Optional; can be added later.
                  </p>
                </div>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setShowAddDocType((prev) => !prev)}
                  leadingIcon={<Plus className="h-3.5 w-3.5" />}
                  className="text-xs font-semibold rounded-full shrink-0"
                >
                  {showAddDocType ? 'Cancel' : 'Add document type'}
                </Button>
              </div>

              {showAddDocType && (
                <AddDocumentTypeBox
                  labelValue={newDocTypeLabel}
                  onLabelChange={setNewDocTypeLabel}
                  required={newDocTypeRequired}
                  onRequiredChange={setNewDocTypeRequired}
                  onSave={handleAddDocumentType}
                  placeholder="Document name (e.g. Weighbridge Certificate)"
                />
              )}

              <DocumentTypeList
                types={vehicleDocTypes}
                docs={newVehicleDocs}
                onUpload={handleUploadForNewVehicleType}
                onView={setViewingDoc}
                onDownload={handleDownloadNewVehicleDoc}
                onRemove={handleRemoveNewVehicleDoc}
              />
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
                setNewVehicleDocs([]);
                setShowAddDocType(false);
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
        <Select
          selectSize="sm"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          aria-label="Filter by vehicle type"
          leadingIcon={<ContainerIcon />}
          containerClassName="w-full @[26rem]/bar:w-auto"
          className="h-9 w-full min-w-[9rem] text-xs font-medium @[26rem]/bar:w-auto"
          options={[
            { value: 'all', label: 'All vehicle types' },
            { value: '40ft Container', label: '40ft Container' },
            { value: '20ft Container', label: '20ft Container' },
            { value: 'Flatbed', label: 'Flatbed' },
            { value: 'Refrigerated', label: 'Refrigerated' },
            { value: 'Tanker', label: 'Tanker' },
            { value: 'Box Truck', label: 'Box Truck' },
          ]}
        />
        <Select
          selectSize="sm"
          value={sortBy}
          onChange={(e) => setSortBy(e.target.value)}
          aria-label="Sort vehicles"
          leadingIcon={<SlidersHorizontal />}
          containerClassName="w-full @[26rem]/bar:w-auto"
          className="h-9 w-full min-w-[9.5rem] text-xs font-medium @[26rem]/bar:w-auto"
          options={[
            { value: 'plate-asc', label: 'Plate no.' },
            { value: 'partner-asc', label: 'Transporter' },
            { value: 'type-asc', label: 'Vehicle type' },
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
                        <ExpiryLabel date={selectedVehicle.insuranceExpiry} label="" />
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Registration Expiry</span>
                        <ExpiryLabel date={selectedVehicle.registrationExpiry} label="" />
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
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                        <FileText className="h-4.5 w-4.5 text-primary" />
                        Vehicle Compliance Documents
                      </h4>
                      <p className="type-caption text-muted-foreground mt-0.5">
                        New document types apply to every future vehicle.
                      </p>
                    </div>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setShowAddDocType((prev) => !prev)}
                      leadingIcon={<Plus className="h-3.5 w-3.5" />}
                      className="text-xs font-semibold rounded-full shrink-0"
                    >
                      {showAddDocType ? 'Cancel' : 'Add Document Type'}
                    </Button>
                  </div>

                  {/* Add document type box */}
                  {showAddDocType && (
                    <AddDocumentTypeBox
                      labelValue={newDocTypeLabel}
                      onLabelChange={setNewDocTypeLabel}
                      required={newDocTypeRequired}
                      onRequiredChange={setNewDocTypeRequired}
                      onSave={handleAddDocumentType}
                      placeholder="Document name (e.g. Weighbridge Certificate)"
                    />
                  )}

                  {/* Document Type List — one compact row per type */}
                  <DocumentTypeList
                    types={vehicleDocTypes}
                    docs={vehicleDocRows}
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
            cell: (vehicle) => <ExpiryLabel date={vehicle.insuranceExpiry} label="" />,
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
