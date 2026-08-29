import React, { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Building2,
  CheckCircle2,
  ExternalLink,
  MapPin,
  MoreVertical,
  Pencil,
  Plus,
  Trash2,
  Clock,
  Search,
  Truck,
  X,
  Phone,
  Mail,
} from '@/design-system/icons';
import { Grid, List, RotateCcw, BadgeCheck } from 'lucide-react';
import { PageHeader, TablePager, usePagedRows } from '@/components';
import { IconChip, useConfirm } from '@/design-system';
import {
  Button,
  Card,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
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
import { AddPartnerForm, type PartnerFormData } from './AddPartnerForm';
import type { PartnerRecord, PartnerStatus } from '@/types/partner';
import { computeComplianceScore } from '@/types/partner';
import { useCreatePartner, useDeletePartner, usePartners, useUpdatePartner } from '@/features/partners/api/queries';
import { uploadDocument } from '@/features/documents/api/documentsService';

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

function renderStatusBadge(status: PartnerStatus) {
  switch (status) {
    case 'Active':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-success-subtle text-success-subtle-foreground border border-success/20"><span className="h-1.5 w-1.5 rounded-full bg-success shrink-0" />Active</span>;
    case 'Pending':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-warning-subtle text-warning-subtle-foreground border border-warning/20"><Clock className="h-3 w-3" />Pending</span>;
    case 'Suspended':
      return <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-destructive-subtle text-destructive-subtle-foreground border border-destructive/20"><X className="h-3 w-3" />Suspended</span>;
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
  const { confirm, confirmDialog } = useConfirm();
  const [drawerState, setDrawerState] = useState<DrawerState>({ mode: 'closed' });
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Filters & Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [countryFilter, setCountryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name-asc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

  const showSuccess = (msg: string) => {
    setSuccessNotice(msg);
    setTimeout(() => setSuccessNotice(null), 4500);
  };

  // Analytics
  const totalPartnersCount = partners.length;
  const activeCount = partners.filter((p) => p.partnerStatus === 'Active').length;
  const totalFleetCount = partners.reduce((acc, p) => acc + (p.vehicles?.length || p.fleetSize || 0), 0);
  const pendingReviewCount = partners.filter((p) => p.partnerStatus === 'Pending').length;

  const uniqueCountries = useMemo(() => {
    return Array.from(new Set(partners.map((p) => p.country))).filter(Boolean);
  }, [partners]);

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

  const handleAddSuccess = async (formData: PartnerFormData, editingPartnerId?: string) => {
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

    const partner = editingPartnerId
      ? await updatePartner.mutateAsync({ id: editingPartnerId, payload })
      : await createPartner.mutateAsync(payload);

    for (const [category, file] of Object.entries(formData.stagedFiles)) {
      await uploadDocument({ ownerType: 'PARTNER', ownerId: partner.id, category, file });
    }
    setDrawerState({ mode: 'closed' });
    showSuccess(`Transporter "${partner.companyLegalName}" ${editingPartnerId ? 'updated' : 'created'}.`);
  };

  return (
    <div className="space-y-5 pb-12">
      {confirmDialog}
      {/* Toast Notification Banner */}
      {successNotice && (
        <div className="flex items-center justify-between rounded-lg border border-success/30 bg-success-subtle p-3.5 text-success-subtle-foreground shadow-2xs animate-in fade-in">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-4 w-4 shrink-0 text-success-subtle-foreground" />
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
          <Button
            onClick={() => setDrawerState({ mode: 'create' })}
            shape="pill"
            leadingIcon={<Plus className="h-4 w-4" />}
            className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs"
          >
            Add transporter
          </Button>
        }
      />

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
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

      {/* Control Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3 rounded-lg border border-border bg-card p-2.5 sm:px-4 shadow-2xs">
        {/* Search & Status Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative w-full sm:w-auto sm:min-w-[180px] md:max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search transporters..."
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
              { id: 'all', label: 'All', count: partners.length },
              { id: 'active', label: 'Active', count: partners.filter((p) => p.partnerStatus === 'Active').length },
              { id: 'pending', label: 'Pending', count: partners.filter((p) => p.partnerStatus === 'Pending').length },
              { id: 'suspended', label: 'Suspended', count: partners.filter((p) => p.partnerStatus === 'Suspended').length },
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
            value={countryFilter}
            onChange={(e) => setCountryFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Countries' },
              ...uniqueCountries.map((c) => ({ value: c, label: c })),
            ]}
            className="text-2xs py-1 rounded-md"
          />

          <Select
            selectSize="sm"
            containerClassName="flex-1 sm:flex-initial sm:w-32 lg:w-36"
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value)}
            options={[
              { value: 'name-asc', label: 'Sort: Name (A-Z)' },
              { value: 'name-desc', label: 'Sort: Name (Z-A)' },
              { value: 'fleet-desc', label: 'Sort: Fleet Size' },
              { value: 'score-desc', label: 'Sort: Compliance' },
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
                    uploadedDocuments: drawerState.partner.uploadedDocuments,
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
        <SheetContent side="right" className="w-full sm:max-w-sm overflow-y-auto p-5 bg-background border-l border-border">
          <SheetTitle className="sr-only">Transporter Quick View</SheetTitle>
          <SheetDescription className="sr-only">Transporter profile preview</SheetDescription>
          {drawerState.mode === 'profile' && drawerState.partner && (
            <div className="space-y-5">
              <div className="flex items-center gap-3">
                <PartnerLogo logoUrl={drawerState.partner.logoUrl} companyName={drawerState.partner.companyLegalName} className="h-12 w-12 shrink-0" />
                <div className="min-w-0">
                  <h3 className="font-extrabold text-foreground text-sm truncate flex items-center gap-1">
                    {drawerState.partner.companyLegalName}
                    <VerificationBadge state={drawerState.partner.partnerStatus === 'Active' ? 'verified' : 'unverified'} size="sm" />
                  </h3>
                  {/* The short reference, not the raw internal id. */}
                  <p className="text-[11px] text-muted-foreground font-mono">{drawerState.partner.reference}</p>
                  <div className="mt-1">{renderStatusBadge(drawerState.partner.partnerStatus)}</div>
                </div>
              </div>

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

      {/* ── Main List / Grid View ── */}
      {viewMode === 'list' ? (
        <div className="space-y-2 pt-1">
          <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-4">Transporter & Status</div>
            <div className="col-span-2">Fleet / Drivers</div>
            <div className="col-span-3">Operating Regions</div>
            <div className="col-span-1">Compliance</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {pagedPartners.rows.map((partner) => {
            const score = computeComplianceScore(partner);
            const scoreColor = score >= 80 ? 'text-success-subtle-foreground' : score >= 50 ? 'text-warning-subtle-foreground' : 'text-destructive-subtle-foreground';
            return (
              <div
                key={partner.id}
                onClick={() => setDrawerState({ mode: 'profile', partner })}
                className="group relative flex flex-col lg:grid lg:grid-cols-12 items-start lg:items-center gap-3 lg:gap-4 rounded-lg border border-border/80 bg-card hover:bg-muted/30 p-3.5 sm:px-5 cursor-pointer transition duration-150 hover:border-primary/40 hover:shadow-2xs"
              >
                <div className="col-span-4 flex items-center gap-3 min-w-0 w-full">
                  <PartnerLogo logoUrl={partner.logoUrl} companyName={partner.companyLegalName} className="h-10 w-10 shrink-0" />
                  <div className="flex flex-col min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">{partner.companyLegalName}</span>
                      <VerificationBadge state={partner.partnerStatus === 'Active' ? 'verified' : 'unverified'} size="sm" />
                      {renderStatusBadge(partner.partnerStatus)}
                    </div>
                    <div className="flex items-center gap-1.5 text-2xs text-muted-foreground truncate">
                      {/* The short reference, not the raw internal id — that used
                          to print here as a 36-character UUID. */}
                      <span className="font-mono font-medium text-foreground/70">{partner.reference}</span>
                      <span>•</span>
                      <span className="flex items-center gap-0.5"><MapPin className="h-2.5 w-2.5 shrink-0" />{partner.country}</span>
                    </div>
                  </div>
                </div>

                <div className="w-full lg:contents grid grid-cols-2 gap-2.5 p-2.5 rounded-md bg-muted/20 border border-border/40 text-xs lg:p-0 lg:bg-transparent lg:border-0">
                  <div className="lg:col-span-2 flex flex-col justify-center">
                    <span className="text-[10px] text-muted-foreground font-medium block lg:hidden">Fleet</span>
                    <span className="text-xs font-bold text-foreground">{partner.vehicles?.length || partner.fleetSize} <span className="font-normal text-muted-foreground">vehicles</span></span>
                    <span className="text-2xs text-muted-foreground">{partner.drivers?.length || 0} drivers</span>
                  </div>

                  <div className="lg:col-span-3 flex flex-col justify-center min-w-0">
                    <span className="text-[10px] text-muted-foreground font-medium block lg:hidden">Regions</span>
                    <div className="flex flex-wrap gap-1">
                      {partner.operatingRegions.slice(0, 2).map((r) => (
                        <span key={r} className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/60 bg-muted/40 text-muted-foreground font-medium">{r}</span>
                      ))}
                      {partner.operatingRegions.length > 2 && (
                        <span className="text-[10px] px-1.5 py-0.5 rounded-full border border-border/60 bg-muted/40 text-muted-foreground font-medium">+{partner.operatingRegions.length - 2}</span>
                      )}
                    </div>
                  </div>

                  <div className="lg:col-span-1 flex flex-col justify-center">
                    <span className="text-[10px] text-muted-foreground font-medium block lg:hidden">Compliance</span>
                    <span className={`text-xs font-black ${scoreColor}`}>{score}%</span>
                    <div className="w-12 bg-muted/60 h-1 rounded-full overflow-hidden mt-0.5">
                      <div className={`h-full rounded-full ${score >= 80 ? 'bg-success' : score >= 50 ? 'bg-warning' : 'bg-destructive'}`} style={{ width: `${score}%` }} />
                    </div>
                  </div>
                </div>

                <div className="col-span-2 flex items-center justify-end gap-2 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-border/40">
                  <Button
                    size="sm"
                    variant="outline"
                    shape="pill"
                    onClick={(e) => handleViewDetail(partner.reference, e)}
                    leadingIcon={<ExternalLink className="h-3 w-3" />}
                    className="text-xs font-medium h-7 px-3 flex-1 lg:flex-initial justify-center"
                  >
                    Dossier
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        onClick={(e) => e.stopPropagation()}
                        aria-label="Partner actions"
                        className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                      >
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={(e) => handleViewDetail(partner.reference, e)} className="cursor-pointer gap-2 text-xs">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /><span>View Dossier</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDrawerState({ mode: 'edit', partner }); }} className="cursor-pointer gap-2 text-xs">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" /><span>Edit Profile</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => handleDelete(partner.id, e)} className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive">
                        <Trash2 className="h-3.5 w-3.5" /><span>Delete transporter</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {pagedPartners.rows.map((partner) => {
            const score = computeComplianceScore(partner);
            const scoreColor = score >= 80 ? 'text-success-subtle-foreground' : score >= 50 ? 'text-warning-subtle-foreground' : 'text-destructive-subtle-foreground';
            return (
              <Card
                key={partner.id}
                onClick={() => setDrawerState({ mode: 'profile', partner })}
                className="group relative flex flex-col justify-between h-full p-4 border border-border bg-card hover:bg-muted/20 rounded-lg cursor-pointer transition duration-150 hover:border-primary/40 hover:shadow-2xs space-y-3"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <PartnerLogo logoUrl={partner.logoUrl} companyName={partner.companyLegalName} className="h-10 w-10 shrink-0" />
                    <div className="flex flex-col min-w-0">
                      <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate flex items-center gap-1">
                        {partner.companyLegalName}
                        <VerificationBadge state={partner.partnerStatus === 'Active' ? 'verified' : 'unverified'} size="sm" />
                      </h3>
                      <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                        <span className="font-mono font-medium text-foreground/70">{partner.reference}</span>
                        <span>•</span>
                        <span className="truncate">{partner.country}</span>
                      </div>
                    </div>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button type="button" onClick={(e) => e.stopPropagation()} className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted">
                        <MoreVertical className="h-3.5 w-3.5" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-48">
                      <DropdownMenuItem onClick={(e) => handleViewDetail(partner.reference, e)} className="cursor-pointer gap-2 text-xs">
                        <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" /><span>View Dossier</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setDrawerState({ mode: 'edit', partner }); }} className="cursor-pointer gap-2 text-xs">
                        <Pencil className="h-3.5 w-3.5 text-muted-foreground" /><span>Edit Profile</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>

                <div>{renderStatusBadge(partner.partnerStatus)}</div>

                <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/40 text-xs">
                  <div>
                    <span className="text-[10px] text-muted-foreground font-medium block">Fleet Size</span>
                    <span className="font-bold text-foreground">{partner.vehicles?.length || partner.fleetSize} vehicles</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-medium block">Compliance</span>
                    <span className={`font-black ${scoreColor}`}>{score}%</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-medium block">Dispatcher</span>
                    <span className="font-medium text-foreground truncate block">{partner.primaryDispatcher.name}</span>
                  </div>
                  <div>
                    <span className="text-[10px] text-muted-foreground font-medium block">Regions</span>
                    <span className="font-semibold text-foreground">{partner.operatingRegions.length} regions</span>
                  </div>
                </div>

                <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                  <span className="flex items-center gap-1 text-muted-foreground text-2xs font-medium truncate">
                    <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                    {partner.address || partner.country}
                  </span>
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={(e) => handleViewDetail(partner.reference, e)}
                    leadingIcon={<ExternalLink className="h-3 w-3" />}
                    className="text-xs font-medium text-primary hover:text-primary-hover p-0 h-auto"
                  >
                    Dossier
                  </Button>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {filteredPartners.length > 0 && (
        <TablePager
          paged={pagedPartners}
          noun="transporters"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}

      {/* Empty / Loading State */}
      {isLoading && filteredPartners.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-border bg-card">
          <p className="text-xs text-muted-foreground">Loading transporters…</p>
        </div>
      )}
      {!isLoading && filteredPartners.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-border bg-card">
          <IconChip icon={Building2} tint="neutral" className="mb-3" />
          <h3 className="text-base font-bold text-foreground">No Transporters Found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            No transporter matched the current filters.
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
    </div>
  );
}

export default PartnersPage;
