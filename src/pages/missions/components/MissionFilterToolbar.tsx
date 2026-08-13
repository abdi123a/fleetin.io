import React, { useState } from 'react';
import type { MissionFilterState } from '@/types/mission';
import { Input, Badge, Select } from '@/design-system';
import {
  Search,
  SlidersHorizontal,
  X,
  Calendar,
  Building2,
  Truck,
  User,
  MapPin,
  FileText,
  DollarSign,
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

const CARGO_TYPES = [
  'All Cargo Types',
  'Container 20ft',
  'Container 40ft',
  'Bulk Cargo',
  'Machinery',
  'Containerized',
  'Dry Bulk',
  'Refrigerated',
  'Steel Construction Beams',
  'General Cargo',
  'Heavy Machinery',
];

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
  customerOptions = [
    { id: 'SHP-101', name: 'Transit Marill' },
    { id: 'SHP-102', name: 'Red Sea Cargo Inc' },
    { id: 'SHP-103', name: 'Horn Trade Group' },
    { id: 'SHP-104', name: 'EA Express Cargo' },
  ],
  transporterOptions = [
    { id: 'PTR-501', name: 'Fleetin Express Ltd' },
    { id: 'PTR-502', name: 'Gulf Transporter Group' },
    { id: 'PTR-503', name: 'Red Sea Transports' },
  ],
  driverOptions = [
    { id: 'DRV-00301', name: 'Abdo Driver' },
    { id: 'DRV-00302', name: 'Osman Farah' },
    { id: 'DRV-00303', name: 'Ibrahim Ali' },
  ],
  vehicleOptions = [
    { id: 'VEH-00201', registrationNumber: '340D103' },
    { id: 'VEH-00202', registrationNumber: '298D405' },
    { id: 'VEH-00203', registrationNumber: '512D109' },
  ],
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
  ].filter(Boolean).length;

  const currentStatusTab = (filters.status || 'all').toLowerCase();

  const statusTabs = [
    { id: 'all', label: 'All', count: counts.all ?? 6 },
    { id: 'available', label: 'Pending Dispatch', count: counts.available ?? 3 },
    { id: 'in transit', label: 'In Transit', count: counts.inTransit ?? 2 },
    { id: 'completed', label: 'Completed', count: counts.completed ?? (counts.maintenance ?? 1) },
  ];

  return (
    <div className="space-y-3">
      {/* Control Bar matching Partner and Shipper page design */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-2.5 sm:gap-3 rounded-lg border border-border bg-card p-2.5 sm:px-4 shadow-2xs">
        {/* Left: Search & Inline Status Filter Tabs */}
        <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-3 min-w-0 flex-1 w-full md:w-auto">
          {/* Search Input */}
          <div className="relative w-full sm:w-auto sm:min-w-[180px] md:max-w-[240px]">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search shipments..."
              value={filters.searchKeyword}
              onChange={(e) => onFilterChange({ searchKeyword: e.target.value })}
              className="pl-8 pr-7 py-1 text-xs font-medium rounded-md border-border bg-background h-8 w-full"
            />
            {filters.searchKeyword && (
              <button
                type="button"
                onClick={() => onFilterChange({ searchKeyword: '' })}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground cursor-pointer"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>

          {/* Inline Status Filter Tabs */}
          <div className="flex items-center gap-1 overflow-x-auto py-0.5 scrollbar-none w-full sm:w-auto">
            {statusTabs.map((tab) => {
              const isActive =
                tab.id === 'all'
                  ? !filters.status || filters.status === 'all'
                  : currentStatusTab === tab.id ||
                    (tab.id === 'available' && (currentStatusTab === 'assigned' || currentStatusTab === 'pending')) ||
                    (tab.id === 'in transit' && (currentStatusTab === 'en route' || currentStatusTab === 'arrived')) ||
                    (tab.id === 'completed' && (currentStatusTab === 'completed' || currentStatusTab === 'pod submitted'));

              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => onFilterChange({ status: tab.id === 'all' ? '' : tab.id })}
                  className={`flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-medium transition-all whitespace-nowrap cursor-pointer ${
                    isActive
                      ? 'bg-primary text-primary-foreground shadow-2xs'
                      : 'bg-muted/40 text-muted-foreground hover:bg-muted hover:text-foreground'
                  }`}
                >
                  <span>{tab.label}</span>
                  <span
                    className={`px-1 py-0.2 rounded-sm text-[10px] font-semibold ${
                      isActive
                        ? 'bg-primary-foreground/20 text-primary-foreground'
                        : 'bg-background/80 text-muted-foreground border border-border/40'
                    }`}
                  >
                    {tab.count}
                  </span>
                </button>
              );
            })}
          </div>

          {activeFilterCount > 0 && (
            <button
              type="button"
              onClick={onResetFilters}
              className="flex items-center gap-1 text-2xs font-medium text-muted-foreground hover:text-primary transition-colors shrink-0 cursor-pointer"
            >
              <RotateCcw className="h-3 w-3" />
              <span>Reset</span>
            </button>
          )}
        </div>

        {/* Right: Selects & View Switcher */}
        <div className="flex items-center gap-1.5 sm:gap-2 w-full md:w-auto overflow-x-auto py-0.5 shrink-0 justify-between sm:justify-end">
          <Select
            selectSize="sm"
            containerClassName="flex-1 sm:flex-initial sm:w-32 lg:w-36"
            value={filters.transporterId || 'all'}
            onChange={(e) => onFilterChange({ transporterId: e.target.value === 'all' ? '' : e.target.value })}
            options={[
              { value: 'all', label: 'All Partners' },
              ...transporterOptions.map((t) => ({ value: t.id, label: t.name })),
            ]}
            className="text-2xs py-1 rounded-md"
          />

          <Select
            selectSize="sm"
            containerClassName="flex-1 sm:flex-initial sm:w-32 lg:w-36"
            value={filters.cargoType || 'all'}
            onChange={(e) => onFilterChange({ cargoType: e.target.value === 'all' ? '' : e.target.value })}
            options={CARGO_TYPES.map((ct) => ({ value: ct === 'All Truck Types' ? 'all' : ct, label: ct }))}
            className="text-2xs py-1 rounded-md"
          />

          <Select
            selectSize="sm"
            containerClassName="flex-1 sm:flex-initial sm:w-32 lg:w-36"
            value={filters.sortBy || 'plate-asc'}
            onChange={(e) => onFilterChange({ sortBy: e.target.value })}
            options={[
              { value: 'plate-asc', label: 'Sort: Plate No' },
              { value: 'booking-asc', label: 'Sort: Booking No' },
              { value: 'date-desc', label: 'Sort: Date (Newest)' },
              { value: 'customer-asc', label: 'Sort: Customer' },
            ]}
            className="text-2xs py-1 rounded-md"
          />

          {onViewModeChange && (
            <div className="flex items-center rounded-md border border-border bg-muted/40 p-0.5 shrink-0">
              <button
                type="button"
                onClick={() => onViewModeChange('rows')}
                title="List View"
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer ${
                  viewMode === 'rows' || viewMode === 'list'
                    ? 'bg-background text-primary shadow-2xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <List className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => onViewModeChange('cards')}
                title="Grid View"
                className={`flex h-7 w-7 items-center justify-center rounded-md transition-colors cursor-pointer ${
                  viewMode === 'cards' || viewMode === 'grid'
                    ? 'bg-background text-primary shadow-2xs font-bold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <LayoutGrid className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Advanced Filters Toggle */}
          <button
            type="button"
            onClick={() => setIsExpanded(!isExpanded)}
            className={`p-1.5 rounded-md text-xs font-medium transition-all flex items-center gap-1 border border-border h-8 cursor-pointer shrink-0 ${
              isExpanded || activeFilterCount > 0
                ? 'bg-primary/10 text-primary border-primary/30'
                : 'bg-background text-muted-foreground hover:text-foreground'
            }`}
            title="Advanced Filters"
          >
            <SlidersHorizontal className="w-3.5 h-3.5" />
            {activeFilterCount > 0 && (
              <Badge variant="solid" intent="primary" size="sm" className="ml-0.5 rounded-full px-1.5 py-0 text-[9px]">
                {activeFilterCount}
              </Badge>
            )}
          </button>
        </div>
      </div>

      {/* Expanded Multi-Filter Grid */}
      {isExpanded && (
        <div className="p-4 rounded-lg border border-border/80 bg-card shadow-2xs pt-3 border-t border-border/70 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5 text-xs">
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
              Customer (Shipper)
            </label>
            <select
              value={filters.customerId}
              onChange={(e) => onFilterChange({ customerId: e.target.value })}
              className="w-full h-9 rounded-lg border border-border bg-background px-3 font-medium text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            >
              <option value="">All Customers</option>
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
              Vehicle Truck
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
