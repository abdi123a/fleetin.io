import React, { useState } from 'react';
import type { MissionFilterState } from '@/types/mission';
import { Input } from '@/design-system';
import { FilterTrigger } from '@/components/common';
import { useTeam } from '@/features/team';
import { useAuthStore } from '@/stores';
import { cn } from '@/utils';
import {
  ChevronsUpDown,
  ListChecks,
  Package,
  Search,
  X,
  Calendar,
  Building2,
  Truck,
  User,
  MapPin,
  FileText,
  DollarSign,
  UsersRound,
} from '@/design-system/icons';
import { List, LayoutGrid, RotateCcw } from 'lucide-react';

interface MissionFilterToolbarProps {
  filters: MissionFilterState;
  onFilterChange: (updatedFilters: Partial<MissionFilterState>) => void;
  onResetFilters: () => void;
  customerOptions?: { id: string; name: string }[];
  transporterOptions?: { id: string; name: string }[];
  driverOptions?: { id: string; name: string }[];
  vehicleOptions?: { id: string; registrationNumber: string }[];
  /** Cargo types actually present in the book, from the host. */
  cargoTypeOptions?: string[];
  viewMode?: 'rows' | 'cards' | 'list' | 'grid';
  onViewModeChange?: (mode: 'rows' | 'cards') => void;
  counts?: {
    all: number;
    available?: number;
    inTransit?: number;
    maintenance?: number;
    completed?: number;
  };
}

const ROUTES_LIST = [
  'All Routes',
  'Doraleh Port -> DIFTZ Free Trade Zone',
  'Port of Djibouti -> Nagad Depot',
  'DMP Berth 3 -> Ali Sabieh Hub',
  'Djibouti City -> Galafi Border Post',
  'Doraleh -> Tadjoura Port',
];

export const MissionFilterToolbar: React.FC<MissionFilterToolbarProps> = ({
  filters,
  onFilterChange,
  onResetFilters,
  /* Empty, not invented. These carried placeholder rows — "Fleetin Express
     Ltd", "Red Sea Cargo Inc", plate "340D103" — and the one page that renders
     this toolbar passed nothing, so the defaults were what every operator
     actually saw: a filter offering four shippers and three transporters that
     do not exist, where picking any of them returned an empty list. An option
     nothing can match is worse than no option, because it reads as a working
     control. The host derives the real ones and passes them in. */
  customerOptions = [],
  transporterOptions = [],
  driverOptions = [],
  vehicleOptions = [],
  cargoTypeOptions = [],
  viewMode = 'rows',
  onViewModeChange,
  counts = {
    all: 6,
    available: 3,
    inTransit: 2,
    completed: 1,
  },
}) => {
  const [isExpanded, setIsExpanded] = useState(false);

  /* Whose work. The "Mine" toggle that used to sit on the bar is gone — it was
     a second way to write the same `assigneeId` the Assigned-to select below
     writes, and that select already marks your own row "(me)". */
  const { data: team } = useTeam();
  const currentUserId = useAuthStore((state) => state.user?.id);

  const activeFilterCount = [
    filters.searchKeyword,
    filters.datePreset !== 'all',
    filters.customerId,
    filters.transporterId,
    filters.driverId,
    filters.vehicleId,
    filters.cargoType,
    filters.route,
    filters.containerNumber,
    filters.status,
    filters.paymentStatus,
    filters.assigneeId,
  ].filter(Boolean).length;


  const statusTabs = [
    { id: 'all', label: 'All', count: counts.all ?? 6 },
    { id: 'available', label: 'Pending Dispatch', count: counts.available ?? 3 },
    { id: 'in transit', label: 'In Transit', count: counts.inTransit ?? 2 },
    { id: 'completed', label: 'Completed', count: counts.completed ?? (counts.maintenance ?? 1) },
  ];

  return (
    <div className="space-y-3">
      {/*
       * ONE line, and one button.
       *
       * This carried seven groups of controls side by side: search, four
       * status chips, a Reset, a "Mine" toggle, a three-select filter pill, a
       * view switcher and an advanced-filters toggle. Three of them were also
       * duplicated in the panel below — Transporter, Cargo and Sort appeared
       * twice, and "Mine" was a second way to say Assigned To → me.
       *
       * Now: the search, the view switcher, and a single **Filters** button
       * carrying a count of what is on. Everything else lives in the one panel
       * it opens, including the status bands — whose figures were the one real
       * loss, and are not lost: the four KPI tiles directly above this bar
       * already print Total, Started, Waiting and Completed.
       */}
      <div className="flex flex-col gap-2.5 rounded-lg border border-border bg-card p-2.5 shadow-2xs sm:flex-row sm:items-center sm:gap-3 sm:px-3">
        {/* `leadingIcon`, not an absolutely-positioned sibling. The DS `Input`
            wraps itself in its own relative div, so an icon placed beside it
            was painted over by the field's opaque background — visible in the
            markup, invisible on screen. The component has a slot for it. */}
        <div className="relative min-w-0 flex-1 sm:max-w-xs">
          <Input
            type="text"
            placeholder="Search shipments…"
            value={filters.searchKeyword}
            leadingIcon={<Search className="size-3.5" />}
            onChange={(e) => onFilterChange({ searchKeyword: e.target.value })}
            className={cn(
              'h-9 w-full rounded-md border-border bg-background text-xs font-medium',
              filters.searchKeyword ? 'pr-8' : 'pr-3',
            )}
          />
          {filters.searchKeyword && (
            <button
              type="button"
              aria-label="Clear search"
              onClick={() => onFilterChange({ searchKeyword: '' })}
              className="absolute right-2 top-1/2 z-10 -translate-y-1/2 cursor-pointer text-muted-foreground hover:text-foreground"
            >
              <X className="h-3 w-3" />
            </button>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2 sm:ml-auto">
          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onResetFilters}
              className="flex shrink-0 cursor-pointer items-center gap-1 text-2xs font-medium text-muted-foreground transition-colors hover:text-primary"
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </button>
          )}

          {/* The one button — the same component every other list uses. */}
          <FilterTrigger
            count={activeFilterCount}
            open={isExpanded}
            onClick={() => setIsExpanded(!isExpanded)}
            aria-expanded={isExpanded}
          />

          {/* A display preference, not a filter — so it stays out. */}
          {onViewModeChange && (
            <div className="flex shrink-0 items-center rounded-md border border-border bg-muted/40 p-0.5">
              <button
                type="button"
                onClick={() => onViewModeChange('rows')}
                title="List view"
                aria-pressed={viewMode === 'rows' || viewMode === 'list'}
                className={cn(
                  'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors',
                  viewMode === 'rows' || viewMode === 'list'
                    ? 'bg-background font-bold text-primary shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('cards')}
                title="Grid view"
                aria-pressed={viewMode === 'cards' || viewMode === 'grid'}
                className={cn(
                  'flex h-7 w-7 cursor-pointer items-center justify-center rounded-md transition-colors',
                  viewMode === 'cards' || viewMode === 'grid'
                    ? 'bg-background font-bold text-primary shadow-2xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
        </div>
      </div>

      {/* Expanded Multi-Filter Grid */}
      {isExpanded && (
        <div className="p-4 rounded-lg border border-border/80 bg-card shadow-2xs pt-3 border-t border-border/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
          {/* Status — the four bands that used to sit inline as chips.
                 A select, not chips, because in here it is one field among ten
                 and a row of coloured pills would be the loudest thing in a
                 panel of quiet ones. The counts come along so the choice still
                 tells you what it will leave you with. */}
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <ListChecks className="h-3.5 w-3.5 text-primary" />
              Status
            </label>
            <select
              value={filters.status || ''}
              onChange={(e) => onFilterChange({ status: e.target.value })}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {statusTabs.map((tab) => (
                <option key={tab.id} value={tab.id === 'all' ? '' : tab.id}>
                  {tab.label} ({tab.count})
                </option>
              ))}
            </select>
          </div>

          {/* Cargo type and Sort came off the inline `FilterMenu` pill, which
                 duplicated three fields this panel already had. */}
          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <Package className="h-3.5 w-3.5 text-primary" />
              Cargo type
            </label>
            <select
              value={filters.cargoType}
              onChange={(e) => onFilterChange({ cargoType: e.target.value })}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All cargo types</option>
              {cargoTypeOptions.map((ct) => (
                <option key={ct} value={ct}>{ct}</option>
              ))}
            </select>
          </div>

          <div className="space-y-1">
            <label className="flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
              <ChevronsUpDown className="h-3.5 w-3.5 text-primary" />
              Sort by
            </label>
            <select
              value={filters.sortBy || 'date-desc'}
              onChange={(e) => onFilterChange({ sortBy: e.target.value })}
              className="h-9 w-full rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="date-desc">Date (newest)</option>
              <option value="booking-asc">Booking no.</option>
              <option value="plate-asc">Plate no.</option>
              <option value="customer-asc">Shipper</option>
            </select>
          </div>

          {/* 0. Assigned to — whose work.
                 `unassigned` is the value that earns this control a place:
                 "which jobs has nobody picked up" is a question the operation
                 asks every morning and previously had no way to ask at all. */}
          <div className="space-y-1">
            <label className="font-bold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <UsersRound className="w-3.5 h-3.5 text-primary" />
              Assigned To
            </label>
            <select
              value={filters.assigneeId}
              onChange={(e) => onFilterChange({ assigneeId: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">Anyone</option>
              <option value="unassigned">Unassigned</option>
              {(team ?? []).map((member) => (
                <option key={member.id} value={member.id}>
                  {member.id === currentUserId ? `${member.fullName} (me)` : member.fullName}
                </option>
              ))}
            </select>
          </div>

          {/* 1. Date Filter */}
          <div className="space-y-1">
            <label className="font-bold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Calendar className="w-3.5 h-3.5 text-primary" />
              Date Filter
            </label>
            <select
              value={filters.datePreset}
              onChange={(e) => onFilterChange({ datePreset: e.target.value as MissionFilterState['datePreset'] })}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="week">This Week</option>
              <option value="month">This Month</option>
            </select>
          </div>

          {/* 2. Customer (Shipper) */}
          <div className="space-y-1">
            <label className="font-bold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Building2 className="w-3.5 h-3.5 text-primary" />
              Shipper
            </label>
            <select
              value={filters.customerId}
              onChange={(e) => onFilterChange({ customerId: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Shippers</option>
              {customerOptions.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>

          {/* 3. Transporter (Partner) */}
          <div className="space-y-1">
            <label className="font-bold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Truck className="w-3.5 h-3.5 text-primary" />
              Transporter
            </label>
            <select
              value={filters.transporterId}
              onChange={(e) => onFilterChange({ transporterId: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Transporters</option>
              {transporterOptions.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </select>
          </div>

          {/* 4. Driver */}
          <div className="space-y-1">
            <label className="font-bold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <User className="w-3.5 h-3.5 text-primary" />
              Driver
            </label>
            <select
              value={filters.driverId}
              onChange={(e) => onFilterChange({ driverId: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Drivers</option>
              {driverOptions.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </select>
          </div>

          {/* 5. Vehicle */}
          <div className="space-y-1">
            <label className="font-bold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <Truck className="w-3.5 h-3.5 text-primary" />
              Vehicle
            </label>
            <select
              value={filters.vehicleId}
              onChange={(e) => onFilterChange({ vehicleId: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Vehicles</option>
              {vehicleOptions.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.registrationNumber}
                </option>
              ))}
            </select>
          </div>

          {/* 6. Route */}
          <div className="space-y-1">
            <label className="font-bold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <MapPin className="w-3.5 h-3.5 text-primary" />
              Route
            </label>
            <select
              value={filters.route}
              onChange={(e) => onFilterChange({ route: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              {ROUTES_LIST.map((r) => (
                <option key={r} value={r === 'All Routes' ? '' : r}>
                  {r}
                </option>
              ))}
            </select>
          </div>

          {/* 7. Container Number Input */}
          <div className="space-y-1">
            <label className="font-bold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <FileText className="w-3.5 h-3.5 text-primary" />
              Container Number
            </label>
            <Input
              value={filters.containerNumber}
              onChange={(e) => onFilterChange({ containerNumber: e.target.value })}
              placeholder="e.g. MSKU-882194-0"
              className="h-9 rounded-lg text-xs bg-background"
            />
          </div>

          {/* 8. Payment Status */}
          <div className="space-y-1">
            <label className="font-bold text-muted-foreground flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
              <DollarSign className="w-3.5 h-3.5 text-primary" />
              Payment Status
            </label>
            <select
              value={filters.paymentStatus}
              onChange={(e) => onFilterChange({ paymentStatus: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Payment Statuses</option>
              <option value="Paid">Paid</option>
              <option value="Pending">Pending</option>
              <option value="Overdue">Overdue</option>
              <option value="Partially Paid">Partially Paid</option>
            </select>
          </div>
        </div>
      )}
    </div>
  );
};
