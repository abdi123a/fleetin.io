import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Truck,
  Search,
  CheckCircle2,
  ExternalLink,
  Plus,
  X,
  User,
  Pencil,
  FileText,
  Upload,
  Trash2,
  Eye,
  Download,
} from '@/design-system/icons';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { Grid, List, RotateCcw, AlertTriangle, Navigation, Building2, Check } from 'lucide-react';
import { PageHeader, TablePager, usePagedRows } from '@/components';
import { IconChip, useConfirm } from '@/design-system';
import {
  Badge,
  Button,
  Card,
  Checkbox,
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
import { useAssignDriver, useCreateVehicle, useUpdateVehicle, useVehicles } from '@/features/vehicles/api/queries';
import { useDrivers } from '@/features/drivers/api/queries';
import { useDocuments, useCreateDocumentType, useDocumentTypes, useUploadDocument, useDeleteDocument } from '@/features/documents/api/queries';
import { toDisplayDocument, uploadDocument, type DocumentTypeRecord } from '@/features/documents/api/documentsService';
import { cn, isVehicleVerified } from '@/utils';

function StatusPill({ status }: { status: OperationalStatus }) {
  switch (status) {
    case 'Available':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-success-subtle text-success-subtle-foreground border border-success/20"><span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />Available</span>;
    case 'In Transit':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-info-subtle text-info-subtle-foreground border border-info/20"><span className="h-1.5 w-1.5 rounded-full bg-info shrink-0" />In Transit</span>;
    case 'Under Maintenance':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-warning-subtle text-warning-subtle-foreground border border-warning/20"><span className="h-1.5 w-1.5 rounded-full bg-warning shrink-0" />Maintenance</span>;
    case 'Out of Service':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-destructive-subtle text-destructive-subtle-foreground border border-destructive/20"><span className="h-1.5 w-1.5 rounded-full bg-destructive shrink-0" />Out of Service</span>;
  }
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
  const assignDriver = useAssignDriver();
  const [selectedVehicle, setSelectedVehicle] = useState<EnrichedVehicle | null>(null);
  const { data: partnerDriversResponse } = useDrivers({ partnerId: selectedVehicle?.partnerId });
  const partnerDrivers = useMemo(() => partnerDriversResponse?.items ?? [], [partnerDriversResponse]);

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
  const [drawerTab, setDrawerTab] = useState<'view' | 'edit' | 'docs'>('view');

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

  const handleAssignDriver = (driverId: string) => {
    if (!selectedVehicle) return;
    assignDriver.mutate(
      { vehicleId: selectedVehicle.id, driverId: driverId || null },
      { onSuccess: (updated) => setSelectedVehicle(updated) },
    );
  };

  // Filters & Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('plate-asc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Analytics
  const totalVehicles = vehicles.length;
  const availableCount = vehicles.filter((v) => v.operationalStatus === 'Available').length;
  const inTransitCount = vehicles.filter((v) => v.operationalStatus === 'In Transit').length;
  const maintenanceCount = vehicles.filter((v) => v.operationalStatus === 'Under Maintenance').length;

  // Partner options
  const partnerOptions = useMemo(() => {
    const unique = Array.from(new Set(vehicles.map((v) => v.partnerName)));
    return [
      { value: 'all', label: 'All transporters' },
      ...unique.map((name) => ({ value: name, label: name })),
    ];
  }, [vehicles]);

  // Filtering
  const filteredVehicles = useMemo(() => {
    const list = vehicles.filter((v) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        v.plateNumber.toLowerCase().includes(q) ||
        v.partnerName.toLowerCase().includes(q) ||
        (v.make && v.make.toLowerCase().includes(q)) ||
        (v.model && v.model.toLowerCase().includes(q)) ||
        (v.assignedDriverName && v.assignedDriverName.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' || v.operationalStatus.toLowerCase() === statusFilter.toLowerCase();
      const matchesType = typeFilter === 'all' || v.truckType === typeFilter;
      const matchesPartner = partnerFilter === 'all' || v.partnerName === partnerFilter;

      return matchesSearch && matchesStatus && matchesType && matchesPartner;
    });

    list.sort((a, b) => {
      if (sortBy === 'plate-asc') return a.plateNumber.localeCompare(b.plateNumber);
      if (sortBy === 'partner-asc') return a.partnerName.localeCompare(b.partnerName);
      if (sortBy === 'type-asc') return a.truckType.localeCompare(b.truckType);
      return 0;
    });

    return list;
  }, [vehicles, searchTerm, statusFilter, typeFilter, partnerFilter, sortBy]);

  /** One page at a time — the row list and the card grid share the pager. */
  const [pageSize, setPageSize] = useState(12);
  const pagedVehicles = usePagedRows(filteredVehicles, {
    pageSize,
    resetKey: `${statusFilter}|${typeFilter}|${partnerFilter}|${searchTerm}|${sortBy}`,
  });

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all' || typeFilter !== 'all' || partnerFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setTypeFilter('all');
    setPartnerFilter('all');
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
        description="Vehicle records, capacity and compliance."
        actions={
          <Button
            onClick={() => setIsAddVehicleOpen(true)}
            shape="pill"
            leadingIcon={<Plus className="h-4 w-4" />}
            className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs cursor-pointer"
          >
            Add vehicle
          </Button>
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatisticCard
          title="Total Fleet"
          value={totalVehicles}
          subtitle="Registered vehicles"
          variant="teal"
          trend="up"
          percentage="100%"
          icon={<Truck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Available"
          value={availableCount}
          subtitle="Ready for dispatch"
          variant="blue"
          trend="up"
          percentage={`${Math.round((availableCount / (totalVehicles || 1)) * 100)}%`}
          icon={<CheckCircle2 className="h-5 w-5" />}
        />
        <StatisticCard
          title="In Transit"
          value={inTransitCount}
          subtitle="On active bookings"
          variant="peach"
          trend="up"
          percentage="+12%"
          icon={<Truck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Maintenance"
          value={maintenanceCount}
          subtitle="Requires attention"
          variant="pink"
          trend={maintenanceCount > 0 ? 'down' : 'neutral'}
          percentage={`${maintenanceCount} vehicles`}
          icon={<AlertTriangle className="h-5 w-5" />}
        />
      </div>

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3 rounded-lg border border-border bg-card p-2.5 sm:px-4 shadow-2xs">
        {/* Search & Status Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative w-full sm:w-auto sm:min-w-[180px] md:max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search vehicles..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-7 py-1 text-xs font-medium rounded-md border-border bg-background h-8 w-full"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Inline Status Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none w-full sm:w-auto">
            {[
              { id: 'all', label: 'All', count: vehicles.length },
              { id: 'available', label: 'Available', count: vehicles.filter((v) => v.operationalStatus === 'Available').length },
              { id: 'in transit', label: 'In Transit', count: vehicles.filter((v) => v.operationalStatus === 'In Transit').length },
              { id: 'under maintenance', label: 'Maintenance', count: vehicles.filter((v) => v.operationalStatus === 'Under Maintenance').length },
            ].map((tab) => (
              <button
                key={tab.id}
                onClick={() => setStatusFilter(tab.id)}
                className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap ${
                  statusFilter === tab.id
                    ? 'bg-primary text-primary-foreground shadow-2xs'
                    : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                }`}
              >
                <span>{tab.label}</span>
                <span
                  className={`px-1 py-0.2 rounded-sm text-[10px] font-semibold ${
                    statusFilter === tab.id ? 'bg-primary-foreground/20 text-primary-foreground' : 'bg-background/80 text-muted-foreground border border-border/40'
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            ))}
          </div>

          {hasActiveFilters && (
            <button
              type="button"
              onClick={clearFilters}
              className="flex items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-primary transition-colors shrink-0"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Selects & View Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full md:w-auto overflow-x-auto py-0.5 shrink-0 justify-between sm:justify-end">
          <Select
            selectSize="sm"
            containerClassName="flex-1 sm:flex-initial sm:w-32 lg:w-36"
            value={partnerFilter}
            onChange={(e) => setPartnerFilter(e.target.value)}
            options={partnerOptions}
            className="text-2xs py-1 rounded-md"
          />

          <Select
            selectSize="sm"
            containerClassName="flex-1 sm:flex-initial sm:w-32 lg:w-36"
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Vehicle Types' },
              { value: '40ft Container', label: '40ft Container' },
              { value: '20ft Container', label: '20ft Container' },
              { value: 'Flatbed', label: 'Flatbed' },
              { value: 'Refrigerated', label: 'Refrigerated' },
              { value: 'Tanker', label: 'Tanker' },
              { value: 'Box Truck', label: 'Box Truck' },
            ]}
            className="text-2xs py-1 rounded-md"
          />

          <Select
            selectSize="sm"
            containerClassName="flex-1 sm:flex-initial sm:w-32 lg:w-36"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            options={[
              { value: 'plate-asc', label: 'Sort: Plate No' },
              { value: 'partner-asc', label: 'Sort: Transporter' },
              { value: 'type-asc', label: 'Sort: Vehicle Type' },
            ]}
            className="text-2xs py-1 rounded-md"
          />

          <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5 shrink-0">
            <button
              type="button"
              onClick={() => setViewMode('list')}
              title="List View"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                viewMode === 'list' ? 'bg-background text-primary shadow-2xs font-bold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <List className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grid')}
              title="Grid View"
              className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors ${
                viewMode === 'grid' ? 'bg-background text-primary shadow-2xs font-bold' : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <Grid className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      </div>

      {/* Vehicle Drawer */}
      <Sheet open={Boolean(selectedVehicle)} onOpenChange={(open) => !open && setSelectedVehicle(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-6 bg-background border-l border-border space-y-6">
          <SheetTitle className="sr-only">Vehicle Details & Documents</SheetTitle>
          <SheetDescription className="sr-only">Vehicle specifications and documents.</SheetDescription>
          {selectedVehicle && (
            <div className="space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <IconChip icon={Truck} />
                  <div className="space-y-1">
                    <h3 className="text-xl font-black font-mono text-foreground tracking-wide flex items-center gap-2">
                      {selectedVehicle.plateNumber}
                      <VerificationBadge state={isVehicleVerified(selectedVehicle) ? 'verified' : 'unverified'} size="lg" />
                    </h3>
                    <p className="text-xs text-muted-foreground font-medium">{selectedVehicle.truckType} {selectedVehicle.make ? `· ${selectedVehicle.make} ${selectedVehicle.model || ''}` : ''}</p>
                    <div className="pt-1"><StatusPill status={selectedVehicle.operationalStatus} /></div>
                  </div>
                </div>
              </div>

              {/* Drawer Tabs */}
              <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted/40 border border-border">
                {(
                  [
                    { id: 'view', label: 'Overview' },
                    { id: 'edit', label: 'Edit Specs' },
                    { id: 'docs', label: `Documents (${vehicleDocRows.length})` },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setDrawerTab(tab.id)}
                    className={`flex-1 py-1.5 px-3 rounded-md text-xs font-bold transition-all text-center ${
                      drawerTab === tab.id
                        ? 'bg-primary text-primary-foreground shadow-2xs'
                        : 'text-muted-foreground hover:text-foreground hover:bg-muted/60'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

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
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Telematics & GPS</h4>
                    <div className="p-3.5 rounded-lg border border-border bg-card flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2">
                        <Navigation className={`h-4 w-4 ${selectedVehicle.hasGPS ? 'text-success-subtle-foreground' : 'text-muted-foreground'}`} />
                        <div>
                          <span className="font-bold text-foreground block">{selectedVehicle.hasGPS ? 'GPS Tracking Active' : 'No GPS Unit'}</span>
                          {selectedVehicle.gpsDeviceId && <span className="text-[10px] text-muted-foreground font-mono">Device: {selectedVehicle.gpsDeviceId}</span>}
                        </div>
                      </div>
                      {selectedVehicle.hasGPS && <Badge intent="success" size="sm">Online</Badge>}
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

                  {selectedVehicle.assignedDriverName && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Assigned Driver</h4>
                      <div className="p-3.5 rounded-lg border border-border bg-card flex items-center gap-3 text-xs">
                        <IconChip icon={User} size={36} />
                        <div>
                          <p className="font-bold text-foreground">{selectedVehicle.assignedDriverName}</p>
                        </div>
                      </div>
                    </div>
                  )}

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

                  <div className="space-y-1.5 pt-3 border-t border-border/60">
                    <label className="text-[11px] font-bold text-foreground block">Assigned Driver</label>
                    <Select
                      value={selectedVehicle.assignedDriverId || ''}
                      options={[
                        { value: '', label: 'Unassigned' },
                        ...partnerDrivers.map((d) => ({ value: d.id, label: d.fullName })),
                      ]}
                      onChange={(e) => handleAssignDriver(e.target.value)}
                    />
                    <p className="text-[10px] text-muted-foreground">
                      Only drivers from this transporter.
                    </p>
                  </div>

                  <div className="flex items-center justify-end gap-2 pt-3 border-t border-border">
                    <Button variant="outline" size="sm" onClick={() => setDrawerTab('view')}>
                      Cancel
                    </Button>
                    <Button variant="primary" size="sm" onClick={handleSaveEdit}>
                      Save
                    </Button>
                  </div>
                </div>
              )}

              {/* ── TAB 3: VEHICLE DOCUMENTS & UPLOAD ── */}
              {drawerTab === 'docs' && (
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
      {viewMode === 'list' ? (
        <div className="space-y-2 pt-1">
          <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-3">Plate & Vehicle Type</div>
            <div className="col-span-3">Transporter</div>
            <div className="col-span-3">Assigned Driver & GPS</div>
            <div className="col-span-2">Expiries</div>
            <div className="col-span-1 text-right">Status</div>
          </div>

          {pagedVehicles.rows.map((vehicle) => (
            <div
              key={vehicle.id}
              onClick={() => handleSelectVehicle(vehicle)}
              className="group relative flex flex-col lg:grid lg:grid-cols-12 items-start lg:items-center gap-3 lg:gap-4 rounded-lg border border-border/80 bg-card hover:bg-muted/30 p-3.5 sm:px-5 cursor-pointer transition duration-150 hover:border-primary/40 hover:shadow-2xs"
            >
              <div className="col-span-3 flex items-center gap-3 min-w-0 w-full">
                <IconChip icon={Truck} size={36} />
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-black font-mono tracking-wider text-foreground group-hover:text-primary transition-colors flex items-center gap-1">
                    {vehicle.plateNumber}
                    <VerificationBadge state={isVehicleVerified(vehicle) ? 'verified' : 'unverified'} size="sm" />
                  </span>
                  <span className="text-2xs text-muted-foreground truncate">
                    {vehicle.truckType} {vehicle.containerCapacity ? `(${vehicle.containerCapacity})` : ''}
                  </span>
                </div>
              </div>

              <div className="w-full lg:contents grid grid-cols-2 gap-2.5 p-2.5 rounded-md bg-muted/20 border border-border/40 text-xs lg:p-0 lg:bg-transparent lg:border-0">
                <div className="lg:col-span-3 flex flex-col justify-center min-w-0">
                  <span className="text-[10px] text-muted-foreground font-medium block lg:hidden">Transporter</span>
                  <button
                    type="button"
                    onClick={(e) => handleGoToPartner(vehicle.partnerReference, e)}
                    className="text-xs font-bold text-foreground hover:text-primary transition-colors text-left truncate flex items-center gap-1.5"
                  >
                    <Building2 className="h-3 w-3 text-primary shrink-0" />
                    <span className="truncate">{vehicle.partnerName}</span>
                  </button>
                  <span className="text-2xs text-muted-foreground truncate">{vehicle.partnerCountry}</span>
                </div>

                <div className="lg:col-span-3 flex flex-col justify-center min-w-0">
                  <span className="text-[10px] text-muted-foreground font-medium block lg:hidden">Driver & GPS</span>
                  <span className="text-xs font-semibold text-foreground truncate">
                    {vehicle.assignedDriverName || <span className="text-muted-foreground font-normal">Unassigned</span>}
                  </span>
                  {vehicle.hasGPS && (
                    <span className="inline-flex items-center gap-1 text-[10px] text-success-subtle-foreground font-medium">
                      <Navigation className="h-2.5 w-2.5 shrink-0" />GPS Enabled
                    </span>
                  )}
                </div>

                <div className="lg:col-span-2 flex flex-col justify-center gap-0.5">
                  <span className="text-[10px] text-muted-foreground font-medium block lg:hidden">Expiries</span>
                  <ExpiryLabel date={vehicle.insuranceExpiry} label="Insurance" />
                </div>
              </div>

              <div className="col-span-1 flex items-center justify-end w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-border/40">
                <StatusPill status={vehicle.operationalStatus} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {pagedVehicles.rows.map((vehicle) => (
            <Card
              key={vehicle.id}
              onClick={() => handleSelectVehicle(vehicle)}
              className="group relative flex flex-col justify-between h-full p-4 border border-border bg-card hover:bg-muted/20 rounded-lg cursor-pointer transition duration-150 hover:border-primary/40 hover:shadow-2xs space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <IconChip icon={Truck} size={36} />
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-base font-black font-mono tracking-wider text-foreground group-hover:text-primary transition-colors truncate flex items-center gap-1">
                      {vehicle.plateNumber}
                      <VerificationBadge state={isVehicleVerified(vehicle) ? 'verified' : 'unverified'} size="sm" />
                    </h3>
                    <span className="text-2xs text-muted-foreground">{vehicle.truckType}</span>
                  </div>
                </div>
                <StatusPill status={vehicle.operationalStatus} />
              </div>

              <button
                type="button"
                onClick={(e) => handleGoToPartner(vehicle.partnerReference, e)}
                className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs w-full text-left hover:bg-primary/10 transition-colors"
              >
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-bold text-foreground truncate flex-1">{vehicle.partnerName}</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>

              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/40 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">Driver</span>
                  <span className="font-semibold text-foreground truncate block">{vehicle.assignedDriverName || 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">Capacity</span>
                  <span className="font-semibold text-foreground truncate block">{vehicle.containerCapacity || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">Insurance Exp.</span>
                  <ExpiryLabel date={vehicle.insuranceExpiry} label="" />
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">GPS</span>
                  <span className={`font-semibold ${vehicle.hasGPS ? 'text-success-subtle-foreground' : 'text-muted-foreground'}`}>
                    {vehicle.hasGPS ? 'Active' : 'No GPS'}
                  </span>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {filteredVehicles.length > 0 && (
        <TablePager
          paged={pagedVehicles}
          noun="vehicles"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}

      {/* Empty State */}
      {filteredVehicles.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-border bg-card">
          <IconChip icon={Truck} tint="neutral" className="mb-3" />
          <h3 className="text-base font-bold text-foreground">No Vehicles Found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            No vehicle matched the current filters.
          </p>
          {hasActiveFilters && (
            <Button
              variant="outline"
              onClick={clearFilters}
              leadingIcon={<RotateCcw className="h-3.5 w-3.5" />}
              className="mt-4 rounded-full text-xs font-medium"
            >
              Clear filters
            </Button>
          )}
        </div>
      )}

      <DocumentViewerModal open={Boolean(viewingDoc)} onOpenChange={(open) => !open && setViewingDoc(null)} document={viewingDoc} />
    </div>
  );
}

export default VehiclesPage;
