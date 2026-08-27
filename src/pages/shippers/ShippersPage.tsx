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
  User,
  Clock,
  Search,
  Truck,
  X,
  XCircle,
} from '@/design-system/icons';
import { Grid, List, RotateCcw, BadgeCheck } from 'lucide-react';
import { PageHeader, TablePager, usePagedRows } from '@/components';
import { IconChip, VerificationBadge, useConfirm } from '@/design-system';
import {
  Badge,
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
} from '@/design-system';

import { ROUTES, buildPath } from '@/config/routes';
import { AddShipperForm, type ShipperFormData } from './AddShipperForm';
import { useShippers, useCreateShipper, useUpdateShipper, useDeleteShipper, useUploadShipperLogo } from '@/features/shippers/api/queries';
import { uploadDocument } from '@/features/documents/api/documentsService';
import type { ShipperRecord, ApprovalStatus } from '@/types/shipper';

export type { ShipperRecord };

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
  const createShipper = useCreateShipper();
  const updateShipper = useUpdateShipper();
  const deleteShipper = useDeleteShipper();
  const { confirm, confirmDialog } = useConfirm();
  const uploadLogo = useUploadShipperLogo();

  const [drawerState, setDrawerState] = useState<DrawerState>({ mode: 'closed' });
  const [successNotice, setSuccessNotice] = useState<string | null>(null);

  // Filters & Search State
  const [searchTerm, setSearchTerm] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [industryFilter, setIndustryFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<string>('name-asc');
  const [viewMode, setViewMode] = useState<'list' | 'grid'>('list');

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

  const renderApprovalBadge = (status: ApprovalStatus) => {
    switch (status) {
      // The same bare tick every other verified record gets — see
      // `VerificationBadge`. This used to be its own pill reading "Verified,"
      // a different visual style from every other verified mark in the app.
      case 'Verified':
        return <VerificationBadge state="verified" size="sm" />;
      case 'Pending':
        return (
          <Badge intent="warning" variant="subtle" size="sm" className="font-medium gap-1 text-[11px] py-0.5 px-2 shrink-0">
            <Clock className="h-3 w-3 text-warning-subtle-foreground" />
            <span>Pending</span>
          </Badge>
        );
      case 'Canceled':
        return (
          <Badge intent="destructive" variant="subtle" size="sm" className="font-medium gap-1 text-[11px] py-0.5 px-2 shrink-0">
            <XCircle className="h-3 w-3" />
            <span>Canceled</span>
          </Badge>
        );
      default:
        return null;
    }
  };

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
          const matchContact = s.primaryContact.name.toLowerCase().includes(q) || s.primaryContact.email.toLowerCase().includes(q);
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
        title="Shippers"
        description="Profiles, contacts and compliance documents."
        actions={
          <Button
            onClick={() => setDrawerState({ mode: 'create' })}
            shape="pill"
            leadingIcon={<Plus className="h-4 w-4" />}
            className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs"
          >
            Add shipper
          </Button>
        }
      />

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatisticCard
          title="Total Shippers"
          value={totalShippersCount}
          subtitle="Corporate accounts"
          variant="teal"
          trend="up"
          percentage="100%"
          icon={<Building2 className="h-5 w-5" />}
        />
        <StatisticCard
          title="Verified Shippers"
          value={verifiedCount}
          subtitle="Compliance approved"
          variant="blue"
          trend="up"
          percentage={`${Math.round((verifiedCount / (totalShippersCount || 1)) * 100)}%`}
          icon={<BadgeCheck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Active Shipments"
          value={totalActiveShipments}
          subtitle="In transit now"
          variant="peach"
          trend="up"
          percentage="+14%"
          icon={<Truck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Pending Review"
          value={pendingReviewCount}
          subtitle="Requires action"
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
              placeholder="Search shippers..."
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
              { id: 'all', label: 'All', count: shippers.length },
              { id: 'verified', label: 'Verified', count: shippers.filter((s) => s.approvalStatus === 'Verified').length },
              { id: 'pending', label: 'Pending', count: shippers.filter((s) => s.approvalStatus === 'Pending').length },
              { id: 'canceled', label: 'Canceled', count: shippers.filter((s) => s.approvalStatus === 'Canceled').length },
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
            value={industryFilter}
            onChange={(e) => setIndustryFilter(e.target.value)}
            options={[
              { value: 'all', label: 'All Industries' },
              ...uniqueIndustries.map((ind) => ({ value: ind, label: ind })),
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
              { value: 'shipments-desc', label: 'Sort: Active Shipments' },
              { value: 'date-desc', label: 'Sort: Reg Date' },
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
                primaryContactName: drawerState.shipper.primaryContact.name,
                primaryContactTitle: drawerState.shipper.primaryContact.title,
                primaryContactEmail: drawerState.shipper.primaryContact.email,
                primaryContactPhone: drawerState.shipper.primaryContact.phone,
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
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                  <div className="flex items-center gap-3.5">
                    <ShipperLogo
                      logoUrl={drawerState.shipper.logoUrl}
                      companyName={drawerState.shipper.companyLegalName}
                      className="h-14 w-14"
                    />
                    <div className="flex flex-col gap-1">
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg font-bold tracking-tight text-foreground">
                          {drawerState.shipper.companyLegalName}
                        </h2>
                        {renderApprovalBadge(drawerState.shipper.approvalStatus)}
                      </div>
                      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
                        <span className="font-mono font-medium">{drawerState.shipper.reference ?? drawerState.shipper.id}</span>
                        <span>•</span>
                        <span>{drawerState.shipper.industry}</span>
                        <span>•</span>
                        <span>{drawerState.shipper.country}</span>
                      </div>
                    </div>
                  </div>

                  <Button
                    shape="pill"
                    onClick={() => setDrawerState({ mode: 'edit', shipper: drawerState.shipper })}
                    leadingIcon={<Pencil className="h-3.5 w-3.5" />}
                    className="bg-primary hover:bg-primary-hover text-primary-foreground px-4 py-2 text-xs font-semibold rounded-full shrink-0"
                  >
                    Edit profile
                  </Button>
                </div>
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
                    <span className="font-bold text-foreground">{drawerState.shipper.primaryContact.name}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Title</span>
                    <span className="font-medium text-foreground">{drawerState.shipper.primaryContact.title}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Email</span>
                    <span className="font-medium text-foreground truncate block">{drawerState.shipper.primaryContact.email}</span>
                  </div>
                  <div>
                    <span className="text-muted-foreground font-medium block">Phone</span>
                    <span className="font-mono font-medium text-foreground">{drawerState.shipper.primaryContact.phone}</span>
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

      {/* Main Content Area */}
      {viewMode === 'list' ? (
        <div className="space-y-2 pt-1">
          {/* No contact column. The list answers "which shipper", and a name and
              a phone number for a person nobody is calling from a directory made
              every row two lines taller for information that belongs on the
              profile — which is one click away on the same row. */}
          <div className="hidden lg:grid grid-cols-12 gap-4 px-5 py-2 text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            <div className="col-span-6">Shipper & Status</div>
            <div className="col-span-4">Commercial Reg No</div>
            <div className="col-span-2 text-right">Actions</div>
          </div>

          {pagedShippers.rows.map((shipper) => (
            <div
              key={shipper.id}
              onClick={() => setDrawerState({ mode: 'profile', shipper })}
              className="group relative flex flex-col lg:grid lg:grid-cols-12 items-start lg:items-center gap-3 lg:gap-4 rounded-lg border border-border/80 bg-card hover:bg-muted/30 p-3.5 sm:px-5 cursor-pointer transition duration-150 hover:border-primary/40 hover:shadow-2xs"
            >
              <div className="col-span-6 flex items-center gap-3 min-w-0 w-full">
                <ShipperLogo
                  logoUrl={shipper.logoUrl}
                  companyName={shipper.companyLegalName}
                  className="h-10 w-10 shrink-0"
                />
                <div className="flex flex-col min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-sm font-bold text-foreground truncate group-hover:text-primary transition-colors">
                      {shipper.companyLegalName}
                    </span>
                    {renderApprovalBadge(shipper.approvalStatus)}
                  </div>
                  <div className="flex items-center gap-1.5 text-2xs text-muted-foreground truncate">
                    <span className="font-mono font-medium text-foreground/70">{shipper.reference ?? shipper.id}</span>
                    <span>•</span>
                    <span>{shipper.industry}</span>
                    <span>•</span>
                    <span>{shipper.country}</span>
                  </div>
                </div>
              </div>

              <div className="w-full lg:contents">
                <div className="lg:col-span-4 flex flex-col justify-center min-w-0">
                  <span className="text-[10px] text-muted-foreground font-medium block lg:hidden">Registration No</span>
                  <span className="text-xs font-mono font-semibold text-foreground truncate">
                    {shipper.registrationNumber || '—'}
                  </span>
                </div>
              </div>

              <div className="col-span-2 flex items-center justify-end gap-2 w-full lg:w-auto pt-2 lg:pt-0 border-t lg:border-t-0 border-border/40">
                <Button
                  size="sm"
                  variant="outline"
                  shape="pill"
                  onClick={(e) => handleViewDetail(shipper.reference, e)}
                  leadingIcon={<ExternalLink className="h-3 w-3" />}
                  className="text-xs font-medium h-7 px-3 flex-1 lg:flex-initial justify-center"
                >
                  Profile
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      aria-label="Shipper actions"
                      className="flex h-7 w-7 items-center justify-center rounded-md border border-border/60 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors shrink-0"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={(e) => handleViewDetail(shipper.reference, e)} className="cursor-pointer gap-2 text-xs">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>View profile</span>
                    </DropdownMenuItem>
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
                    <DropdownMenuItem
                      onClick={(e) => handleDelete(shipper.id, e)}
                      className="cursor-pointer gap-2 text-xs text-destructive focus:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete shipper</span>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 pt-1">
          {pagedShippers.rows.map((shipper) => (
            <Card
              key={shipper.id}
              onClick={() => setDrawerState({ mode: 'profile', shipper })}
              className="group relative flex flex-col justify-between h-full p-4 border border-border bg-card hover:bg-muted/20 rounded-lg cursor-pointer transition duration-150 hover:border-primary/40 hover:shadow-2xs space-y-3"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3 min-w-0">
                  <ShipperLogo
                    logoUrl={shipper.logoUrl}
                    companyName={shipper.companyLegalName}
                    className="h-10 w-10 shrink-0"
                  />
                  <div className="flex flex-col min-w-0">
                    <h3 className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">
                      {shipper.companyLegalName}
                    </h3>
                    <div className="flex items-center gap-1.5 text-2xs text-muted-foreground">
                      <span className="font-mono font-medium text-foreground/70">{shipper.reference ?? shipper.id}</span>
                      <span>•</span>
                      <span className="truncate">{shipper.industry}</span>
                    </div>
                  </div>
                </div>

                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <button
                      type="button"
                      onClick={(e) => e.stopPropagation()}
                      className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-muted"
                    >
                      <MoreVertical className="h-3.5 w-3.5" />
                    </button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuItem onClick={(e) => handleViewDetail(shipper.reference, e)} className="cursor-pointer gap-2 text-xs">
                      <ExternalLink className="h-3.5 w-3.5 text-muted-foreground" />
                      <span>View profile</span>
                    </DropdownMenuItem>
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
                  </DropdownMenuContent>
                </DropdownMenu>
              </div>

              <div>{renderApprovalBadge(shipper.approvalStatus)}</div>

              <div className="grid grid-cols-2 gap-2 p-2.5 rounded-lg bg-muted/30 border border-border/40 text-xs">
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">Reg Number</span>
                  <span className="font-mono font-semibold text-foreground truncate block">{shipper.registrationNumber || '—'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">Country</span>
                  <span className="font-semibold text-foreground">{shipper.country}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">Contact</span>
                  <span className="font-medium text-foreground truncate block">{shipper.primaryContact.name}</span>
                </div>
                <div>
                  <span className="text-[10px] text-muted-foreground font-medium block">Active Shipments</span>
                  <span className="font-semibold text-foreground">{shipper.activeShipments} active</span>
                </div>
              </div>

              <div className="flex items-center justify-between pt-2 border-t border-border/40 text-xs">
                <span className="flex items-center gap-1 text-muted-foreground text-2xs font-medium truncate">
                  <MapPin className="h-3 w-3 text-muted-foreground shrink-0" />
                  {shipper.address || shipper.country}
                </span>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={(e) => handleViewDetail(shipper.reference, e)}
                  leadingIcon={<ExternalLink className="h-3 w-3" />}
                  className="text-xs font-medium text-primary hover:text-primary-hover p-0 h-auto"
                >
                  Profile
                </Button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {filteredShippers.length > 0 && (
        <TablePager
          paged={pagedShippers}
          noun="shippers"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[12, 24, 48, 96]}
        />
      )}

      {/* Empty / Loading State */}
      {isLoading && filteredShippers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-border bg-card">
          <p className="text-xs text-muted-foreground">Loading shippers…</p>
        </div>
      )}
      {!isLoading && filteredShippers.length === 0 && (
        <div className="flex flex-col items-center justify-center py-12 text-center rounded-lg border border-dashed border-border bg-card">
          <IconChip icon={Building2} tint="neutral" className="mb-3" />
          <h3 className="text-base font-bold text-foreground">No Shippers Found</h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-sm">
            No shipper matches the current filters.
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

export default ShippersPage;
