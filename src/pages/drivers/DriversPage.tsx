import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Search,
  ExternalLink,
  Phone,
  Truck,
  Plus,
  X,
  CheckCircle2,
  Pencil,
  Upload,
  FileText,
  Trash2,
  Eye,
  Download,
} from '@/design-system/icons';
import { DocumentViewerModal, type DocumentToView } from '@/components/DocumentViewerModal';
import { triggerDocumentDownload } from '@/components/documentDownload';
import { Grid, List, RotateCcw, AlertTriangle, Building2, IdCard, UserCheck, Check } from 'lucide-react';
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
import type { EnrichedDriver } from '@/data/partnerData';
import type { OperationalStatus } from '@/types/partner';
import { usePartners } from '@/features/partners/api/queries';
import { useCreateDriver, useDrivers, useUpdateDriver } from '@/features/drivers/api/queries';
import { useDocuments, useCreateDocumentType, useDocumentTypes, useUploadDocument, useDeleteDocument } from '@/features/documents/api/queries';
import { toDisplayDocument, uploadDocument, type DocumentTypeRecord } from '@/features/documents/api/documentsService';
import { cn, isDriverVerified } from '@/utils';

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

interface DriverDocRow {
  id: string;
  name: string;
  category: string;
  fileSize: string;
}

/** Shared "one row per document type" list — same pattern as the New Transporter
 *  Onboarding compliance-documents step. Used both in the Add Driver popup
 *  (docs staged before the driver exists) and the driver drawer's Documents tab. */
function DocumentTypeList({
  types,
  docs,
  onUpload,
  onView,
  onDownload,
  onRemove,
}: {
  types: DocumentTypeRecord[];
  docs: DriverDocRow[];
  onUpload: (type: DocumentTypeRecord, file: File) => void;
  onView: (doc: DriverDocRow) => void;
  onDownload: (doc: DriverDocRow) => void;
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

export function DriversPage() {
  const navigate = useNavigate();
  const { data: driversResponse } = useDrivers();
  const drivers = useMemo(() => driversResponse?.items ?? [], [driversResponse]);
  const { data: partnersResponse } = usePartners();
  const partners = useMemo(() => partnersResponse?.items ?? [], [partnersResponse]);
  const createDriver = useCreateDriver();
  const updateDriver = useUpdateDriver();
  const [selectedDriver, setSelectedDriver] = useState<EnrichedDriver | null>(null);

  // Add Driver Modal State
  const [isAddDriverOpen, setIsAddDriverOpen] = useState(false);
  const [newDriver, setNewDriver] = useState({
    partnerId: '',
    fullName: '',
    phone: '',
    licenseExpiry: '2027-12-31',
  });
  const [addSuccessNotice, setAddSuccessNotice] = useState<string | null>(null);

  // Documents staged for the driver before it exists — uploaded to the
  // backend once the driver record is created and has a real id.
  const [newDriverDocs, setNewDriverDocs] = useState<DriverDocRow[]>([]);
  const [newDriverFiles, setNewDriverFiles] = useState<Record<string, File>>({});

  const handleUploadForNewDriverType = (type: DocumentTypeRecord, file: File) => {
    const newDoc: DriverDocRow = {
      id: `staged-${Date.now()}`,
      name: file.name,
      category: type.label,
      fileSize: `${(file.size / (1024 * 1024)).toFixed(1)} MB`,
    };
    setNewDriverDocs((prev) => [...prev.filter((d) => d.category !== type.label), newDoc]);
    setNewDriverFiles((prev) => ({ ...prev, [type.label]: file }));
  };

  const handleRemoveNewDriverDoc = (docId: string) => {
    setNewDriverDocs((prev) => prev.filter((d) => d.id !== docId));
  };

  /** A staged (not-yet-persisted) upload has no backend document id — download the local File directly. */
  const handleDownloadNewDriverDoc = (doc: DriverDocRow) => {
    const file = newDriverFiles[doc.category];
    if (!file) return;
    const url = URL.createObjectURL(file);
    const link = document.createElement('a');
    link.href = url;
    link.download = doc.name;
    link.click();
    URL.revokeObjectURL(url);
  };

  const handleCreateDriver = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newDriver.fullName || !newDriver.partnerId) return;

    const partner = partners.find((p) => p.id === newDriver.partnerId);
    if (!partner) return;

    const created = await createDriver.mutateAsync({
      partnerId: newDriver.partnerId,
      payload: {
        fullName: newDriver.fullName,
        phone: newDriver.phone || '+253 77 00 00 00',
        nationalId: `DJ-NID-${Math.floor(100000 + Math.random() * 900000)}`,
        drivingLicenseNumber: `DL-DJ-${Math.floor(10000 + Math.random() * 90000)}`,
        licenseExpiry: newDriver.licenseExpiry || '2027-12-31',
        status: 'Available',
        joinDate: new Date().toISOString().slice(0, 10),
      },
    });

    // Upload any documents staged during registration for the new driver.
    for (const [category, file] of Object.entries(newDriverFiles)) {
      await uploadDocument({ ownerType: 'DRIVER', ownerId: created.id, category, file });
    }

    setIsAddDriverOpen(false);
    setNewDriverDocs([]);
    setNewDriverFiles({});
    setNewDriver({
      partnerId: '',
      fullName: '',
      phone: '',
      licenseExpiry: '2027-12-31',
    });

    setAddSuccessNotice(`Driver "${created.fullName}" registered to ${partner.companyLegalName}.`);
    setTimeout(() => setAddSuccessNotice(null), 5000);
  };

  // Drawer tabs: 'view' | 'edit' | 'docs'
  const [drawerTab, setDrawerTab] = useState<'view' | 'edit' | 'docs'>('view');

  // Edit form state
  const [editForm, setEditForm] = useState<Partial<EnrichedDriver>>({});

  // Document-type catalog — shared across every driver via the backend.
  const { data: driverDocTypes = [] } = useDocumentTypes('DRIVER');
  const createDocType = useCreateDocumentType('DRIVER');

  const [showAddDocType, setShowAddDocType] = useState(false);
  const [newDocTypeLabel, setNewDocTypeLabel] = useState('');
  const [newDocTypeRequired, setNewDocTypeRequired] = useState(true);

  const [docNotice, setDocNotice] = useState<string | null>(null);
  const [viewingDoc, setViewingDoc] = useState<DocumentToView | null>(null);

  const { data: selectedDriverDocs = [] } = useDocuments('DRIVER', selectedDriver?.id);
  const uploadDoc = useUploadDocument('DRIVER', selectedDriver?.id);
  const deleteDoc = useDeleteDocument('DRIVER', selectedDriver?.id);
  const driverDocRows: DriverDocRow[] = useMemo(
    () => selectedDriverDocs.map(toDisplayDocument),
    [selectedDriverDocs],
  );

  // When driver is selected
  const handleSelectDriver = (driver: EnrichedDriver) => {
    setSelectedDriver(driver);
    setEditForm(driver);
    setDrawerTab('view');
    setDocNotice(null);
    setShowAddDocType(false);
  };

  /** Defines a new document type — saved to the catalog, so it shows up as
   *  an upload slot for every driver after this one. */
  const handleAddDocumentType = () => {
    if (!newDocTypeLabel.trim()) return;
    createDocType.mutate({ label: newDocTypeLabel, required: newDocTypeRequired });
    setNewDocTypeLabel('');
    setNewDocTypeRequired(true);
    setShowAddDocType(false);
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

  const handleUploadForType = (type: DocumentTypeRecord, file: File) => {
    if (!selectedDriver) return;
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

  const handleDeleteDriverDoc = async (_driverId: string, docId: string) => {
    const ok = await confirm({
      title: 'Delete this document?',
      description: 'The file will be permanently removed from the vault.',
    });
    if (ok) deleteDoc.mutate(docId);
  };

  const handleDownloadDriverDoc = (doc: DriverDocRow) => {
    void triggerDocumentDownload(doc.id, doc.name);
  };

  // Filters & Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [partnerFilter, setPartnerFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name-asc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  // Analytics
  const totalDrivers = drivers.length;
  const availableCount = drivers.filter((d) => d.status === 'Available').length;
  const inTransitCount = drivers.filter((d) => d.status === 'In Transit').length;
  const licenseAlerts = drivers.filter((d) => isExpiredOrSoon(d.licenseExpiry) !== 'ok').length;

  // Partner options
  const partnerOptions = useMemo(() => {
    const unique = Array.from(new Set(drivers.map((d) => d.partnerName)));
    return [
      { value: 'all', label: 'All transporters' },
      ...unique.map((name) => ({ value: name, label: name })),
    ];
  }, [drivers]);

  // Filtering & Sorting
  const filteredDrivers = useMemo(() => {
    const list = drivers.filter((d) => {
      const q = searchTerm.toLowerCase();
      const matchesSearch =
        !q ||
        d.fullName.toLowerCase().includes(q) ||
        d.partnerName.toLowerCase().includes(q) ||
        d.drivingLicenseNumber.toLowerCase().includes(q) ||
        d.nationalId.toLowerCase().includes(q) ||
        (d.assignedVehiclePlate && d.assignedVehiclePlate.toLowerCase().includes(q));

      const matchesStatus = statusFilter === 'all' || d.status.toLowerCase() === statusFilter.toLowerCase();
      const matchesPartner = partnerFilter === 'all' || d.partnerName === partnerFilter;

      return matchesSearch && matchesStatus && matchesPartner;
    });

    list.sort((a, b) => {
      if (sortBy === 'name-asc') return a.fullName.localeCompare(b.fullName);
      if (sortBy === 'partner-asc') return a.partnerName.localeCompare(b.partnerName);
      if (sortBy === 'license-asc') return a.drivingLicenseNumber.localeCompare(b.drivingLicenseNumber);
      return 0;
    });

    return list;
  }, [drivers, searchTerm, statusFilter, partnerFilter, sortBy]);

  /** One page at a time — the row list and the card grid share the pager. */
  const [pageSize, setPageSize] = useState(12);
  const pagedDrivers = usePagedRows(filteredDrivers, {
    pageSize,
    resetKey: `${statusFilter}|${partnerFilter}|${searchTerm}|${sortBy}`,
  });

  const hasActiveFilters = searchTerm !== '' || statusFilter !== 'all' || partnerFilter !== 'all';

  const clearFilters = () => {
    setSearchTerm('');
    setStatusFilter('all');
    setPartnerFilter('all');
    setSortBy('name-asc');
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
          <Button
            onClick={() => setIsAddDriverOpen(true)}
            shape="pill"
            leadingIcon={<Plus className="h-4 w-4" />}
            className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs cursor-pointer"
          >
            Add driver
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

      {/* Add New Driver Drawer */}
      <Sheet open={isAddDriverOpen} onOpenChange={setIsAddDriverOpen}>
        <SheetContent
          side="right"
          className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-md"
        >
          <div className="shrink-0 space-y-1 border-b border-border/40 px-6 pb-4 pt-6 sm:px-8 sm:pt-8">
            <SheetTitle className="flex items-center gap-2 text-xl font-extrabold tracking-tight text-foreground">
              <User className="h-5 w-5 text-primary" /> Register New Driver
            </SheetTitle>
            <SheetDescription className="text-xs text-muted-foreground">
              Added to the selected transporter's driver roster.
            </SheetDescription>
          </div>

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

            <div className="space-y-1.5">
              <label className="text-[11px] font-bold text-foreground block">License Expiry Date</label>
              <Input
                type="date"
                value={newDriver.licenseExpiry}
                onChange={(e) => setNewDriver((prev) => ({ ...prev, licenseExpiry: e.target.value }))}
              />
            </div>

            <div className="space-y-3 pt-3 border-t border-border/40">
              <div className="flex items-center justify-between flex-wrap gap-2">
                <div>
                  <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                    <FileText className="h-4.5 w-4.5 text-primary" />
                    Driver Compliance Documents
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
                  placeholder="Document name (e.g. Medical Clearance)"
                />
              )}

              <DocumentTypeList
                types={driverDocTypes}
                docs={newDriverDocs}
                onUpload={handleUploadForNewDriverType}
                onView={setViewingDoc}
                onDownload={handleDownloadNewDriverDoc}
                onRemove={handleRemoveNewDriverDoc}
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
                setIsAddDriverOpen(false);
                setNewDriverDocs([]);
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

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3 rounded-lg border border-border bg-card p-2.5 sm:px-4 shadow-2xs">
        {/* Search & Status Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative w-full sm:w-auto sm:min-w-[180px] md:max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search drivers..."
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
              { id: 'all', label: 'All', count: drivers.length },
              { id: 'available', label: 'Available', count: drivers.filter((d) => d.status === 'Available').length },
              { id: 'in transit', label: 'In Transit', count: drivers.filter((d) => d.status === 'In Transit').length },
              { id: 'under maintenance', label: 'Maintenance', count: drivers.filter((d) => d.status === 'Under Maintenance').length },
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
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            options={[
              { value: 'name-asc', label: 'Sort: Driver Name' },
              { value: 'partner-asc', label: 'Sort: Transporter' },
              { value: 'license-asc', label: 'Sort: License No' },
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

      {/* Driver Drawer */}
      <Sheet open={Boolean(selectedDriver)} onOpenChange={(open) => !open && setSelectedDriver(null)}>
        <SheetContent side="right" className="w-full sm:max-w-lg overflow-y-auto p-6 bg-background border-l border-border space-y-6">
          <SheetTitle className="sr-only">Driver Profile Details & Documents</SheetTitle>
          <SheetDescription className="sr-only">Driver details and documents.</SheetDescription>
          {selectedDriver && (
            <div className="space-y-6">
              {/* Profile Header */}
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="h-16 w-16 rounded-lg border border-border/80 bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {selectedDriver.profilePictureUrl ? (
                      <img src={selectedDriver.profilePictureUrl} alt={selectedDriver.fullName} className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-xl font-extrabold text-foreground tracking-tight flex items-center gap-2">
                      {selectedDriver.fullName}
                      <VerificationBadge state={isDriverVerified(selectedDriver) ? 'verified' : 'unverified'} size="lg" />
                    </h3>
                    <p className="text-xs text-muted-foreground font-mono">{selectedDriver.reference}</p>
                    <div className="pt-1"><StatusPill status={selectedDriver.status} /></div>
                  </div>
                </div>
              </div>

              {/* Drawer Tabs Bar */}
              <div className="flex items-center gap-1.5 p-1 rounded-lg bg-muted/40 border border-border">
                {(
                  [
                    { id: 'view', label: 'Overview' },
                    { id: 'edit', label: 'Edit Details' },
                    { id: 'docs', label: `Documents (${driverDocRows.length})` },
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
                          <p className="font-bold text-foreground text-xs">{selectedDriver.partnerName}</p>
                          <p className="text-[10px] text-muted-foreground">{selectedDriver.partnerCountry} · {selectedDriver.partnerReference}</p>
                        </div>
                      </div>
                      <Button
                        size="sm"
                        variant="outline"
                        shape="pill"
                        onClick={(e) => handleGoToPartner(selectedDriver.partnerReference, e)}
                        leadingIcon={<ExternalLink className="h-3 w-3" />}
                        className="text-xs font-semibold h-7 px-3 shrink-0"
                      >
                        Dossier
                      </Button>
                    </div>
                  </Card>

                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Contact & Identification</h4>
                    <div className="grid grid-cols-2 gap-3 p-3.5 rounded-lg border border-border bg-card text-xs">
                      <div>
                        <span className="text-muted-foreground block text-[10px]">Phone</span>
                        <span className="font-semibold text-foreground flex items-center gap-1">
                          <Phone className="h-3 w-3 text-primary shrink-0" />
                          {selectedDriver.phone || '—'}
                        </span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">National ID</span>
                        <span className="font-mono font-semibold text-foreground">{selectedDriver.nationalId || '—'}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">License Number</span>
                        <span className="font-mono font-semibold text-foreground">{selectedDriver.drivingLicenseNumber}</span>
                      </div>
                      <div>
                        <span className="text-muted-foreground block text-[10px]">License Expiry</span>
                        <ExpiryLabel date={selectedDriver.licenseExpiry} label="" />
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Assigned Vehicle</h4>
                    <div className="p-3.5 rounded-lg border border-border bg-card flex items-center gap-3 text-xs">
                      <IconChip icon={Truck} size={36} />
                      <div>
                        <p className="font-mono font-black text-foreground text-sm tracking-wide">
                          {selectedDriver.assignedVehiclePlate || 'No vehicle assigned'}
                        </p>
                      </div>
                    </div>
                  </div>

                  {selectedDriver.accessCards && selectedDriver.accessCards.length > 0 && (
                    <div className="space-y-2">
                      <h4 className="text-[11px] font-bold text-muted-foreground uppercase tracking-wider">Port & Zone Access Cards</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedDriver.accessCards.map((card) => (
                          <span key={card} className="inline-flex items-center gap-1 text-xs px-2.5 py-1 rounded-full bg-primary/10 text-primary font-bold border border-primary/20">
                            <IdCard className="h-3 w-3 shrink-0" />{card}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="pt-2">
                    <Button
                      onClick={() => setDrawerTab('edit')}
                      leadingIcon={<Pencil className="h-4 w-4" />}
                      className="w-full bg-primary text-primary-foreground font-semibold text-xs rounded-lg py-2.5"
                    >
                      Edit driver details
                    </Button>
                  </div>
                </div>
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

              {/* ── TAB 3: DRIVER DOCUMENTS & UPLOAD ── */}
              {drawerTab === 'docs' && (
                <div className="space-y-5">
                  <div className="flex items-center justify-between flex-wrap gap-2">
                    <div>
                      <h4 className="type-h4 font-semibold text-foreground flex items-center gap-2">
                        <FileText className="h-4.5 w-4.5 text-primary" />
                        Driver Compliance Documents
                      </h4>
                      <p className="type-caption text-muted-foreground mt-0.5">
                        New document types apply to every future driver.
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
                      placeholder="Document name (e.g. Medical Clearance)"
                    />
                  )}

                  {/* Document Type List — one compact row per type */}
                  <DocumentTypeList
                    types={driverDocTypes}
                    docs={driverDocRows}
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
      {viewMode === 'list' ? (
        <div className="space-y-2 pt-1">
          <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-3">Driver Name & ID</div>
            <div className="col-span-3">Transporter</div>
            <div className="col-span-3">License & Phone</div>
            <div className="col-span-2">Assigned Vehicle</div>
            <div className="col-span-1 text-right">Status</div>
          </div>

          {pagedDrivers.rows.map((driver) => (
            <div
              key={driver.id}
              onClick={() => handleSelectDriver(driver)}
              className="group relative flex flex-col lg:grid lg:grid-cols-12 items-start lg:items-center gap-3 lg:gap-4 rounded-lg border border-border/80 bg-card hover:bg-muted/30 p-3.5 sm:px-5 cursor-pointer transition duration-150 hover:border-primary/40 hover:shadow-2xs"
            >
              <div className="col-span-3 flex items-center gap-3 min-w-0 w-full">
                <div className="h-10 w-10 rounded-lg border border-border/60 bg-muted overflow-hidden flex items-center justify-center shrink-0">
                  {driver.profilePictureUrl ? (
                    <img src={driver.profilePictureUrl} alt={driver.fullName} className="h-full w-full object-cover" />
                  ) : (
                    <User className="h-5 w-5 text-muted-foreground" />
                  )}
                </div>
                <div className="flex flex-col min-w-0">
                  <span className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate flex items-center gap-1">
                    {driver.fullName}
                    <VerificationBadge state={isDriverVerified(driver) ? 'verified' : 'unverified'} size="sm" />
                  </span>
                  <span className="text-2xs font-mono text-muted-foreground">{driver.reference}</span>
                </div>
              </div>

              <div className="w-full lg:contents grid grid-cols-2 gap-2.5 p-2.5 rounded-md bg-muted/20 border border-border/40 text-xs lg:p-0 lg:bg-transparent lg:border-0">
                <div className="lg:col-span-3 flex flex-col justify-center min-w-0">
                  <span className="text-[10px] text-muted-foreground font-medium block lg:hidden">Transporter</span>
                  <button
                    type="button"
                    onClick={(e) => handleGoToPartner(driver.partnerReference, e)}
                    className="text-xs font-bold text-foreground hover:text-primary transition-colors text-left truncate flex items-center gap-1.5"
                  >
                    <Building2 className="h-3 w-3 text-primary shrink-0" />
                    <span className="truncate">{driver.partnerName}</span>
                  </button>
                  <span className="text-2xs text-muted-foreground truncate">{driver.partnerCountry}</span>
                </div>

                <div className="lg:col-span-3 flex flex-col justify-center min-w-0">
                  <span className="text-[10px] text-muted-foreground font-medium block lg:hidden">License</span>
                  <span className="text-xs font-mono font-semibold text-foreground truncate">{driver.drivingLicenseNumber}</span>
                  <ExpiryLabel date={driver.licenseExpiry} label="" />
                </div>

                <div className="lg:col-span-2 flex flex-col justify-center min-w-0">
                  <span className="text-[10px] text-muted-foreground font-medium block lg:hidden">Vehicle</span>
                  {driver.assignedVehiclePlate ? (
                    <span className="text-xs font-mono font-bold text-foreground flex items-center gap-1">
                      <Truck className="h-3 w-3 text-primary shrink-0" />
                      {driver.assignedVehiclePlate}
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground italic">Unassigned</span>
                  )}
                </div>
              </div>

              <div className="col-span-1 flex items-center justify-end w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-border/40">
                <StatusPill status={driver.status} />
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {pagedDrivers.rows.map((driver) => (
            <Card
              key={driver.id}
              onClick={() => handleSelectDriver(driver)}
              className="group relative flex flex-col justify-between h-full p-4 border border-border bg-card hover:bg-muted/20 rounded-lg cursor-pointer transition duration-150 hover:border-primary/40 hover:shadow-2xs space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg border border-border/60 bg-muted overflow-hidden flex items-center justify-center shrink-0">
                    {driver.profilePictureUrl ? (
                      <img src={driver.profilePictureUrl} alt={driver.fullName} className="h-full w-full object-cover" />
                    ) : (
                      <User className="h-5 w-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate flex items-center gap-1">
                      {driver.fullName}
                      <VerificationBadge state={isDriverVerified(driver) ? 'verified' : 'unverified'} size="sm" />
                    </h3>
                    <span className="text-2xs font-mono text-muted-foreground">{driver.reference}</span>
                  </div>
                </div>
                <StatusPill status={driver.status} />
              </div>

              <button
                type="button"
                onClick={(e) => handleGoToPartner(driver.partnerReference, e)}
                className="flex items-center gap-2 p-2 rounded-lg bg-primary/5 border border-primary/20 text-xs w-full text-left hover:bg-primary/10 transition-colors"
              >
                <Building2 className="h-3.5 w-3.5 text-primary shrink-0" />
                <span className="font-bold text-foreground truncate flex-1">{driver.partnerName}</span>
                <ExternalLink className="h-3 w-3 text-muted-foreground shrink-0" />
              </button>

              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/40 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">Phone</span>
                  <span className="font-semibold text-foreground truncate block">{driver.phone || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">Assigned Vehicle</span>
                  <span className="font-mono font-bold text-foreground truncate block">{driver.assignedVehiclePlate || 'Unassigned'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">License No.</span>
                  <span className="font-mono font-semibold text-foreground truncate block">{driver.drivingLicenseNumber}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">License Exp.</span>
                  <ExpiryLabel date={driver.licenseExpiry} label="" />
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {filteredDrivers.length > 0 && (
        <TablePager
          paged={pagedDrivers}
          noun="drivers"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}

      {/* Empty State */}
      {filteredDrivers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-border bg-card">
          <IconChip icon={User} tint="neutral" className="mb-3" />
          <h3 className="text-base font-bold text-foreground">No Drivers Found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            No driver matched the current filters.
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

export default DriversPage;
