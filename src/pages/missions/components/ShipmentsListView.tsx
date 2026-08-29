import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Badge, ShipmentCard, StatisticCard } from '@/design-system';
import { Compass, Plus, Truck, Repeat } from '@/design-system/icons';
import { BadgeCheck } from 'lucide-react';
import { PageHeader, TablePager, usePagedRows } from '@/components';
import type { Mission, MissionFilterState } from '@/types/mission';
import { MissionFilterToolbar } from './MissionFilterToolbar';
import { MissionRowCard } from './MissionRowCard';
import { displayShipmentStatus, shipmentProgress, statusIntentOf } from '@/lib/shipmentStatus';
import {
  CONTAINER_STATE_CORNER_INTENT,
  carriesContainer,
  containerStateOf,
} from '@/lib/containerState';
import { ROUTES, buildPath } from '@/config/routes';
import { EmptyReturnCalendarPage } from '@/pages/empty-returns';
import { cn } from '@/utils';
import { useShipmentStore } from '@/stores/shipment.store';
import { useAvailableEmpties, useCycles } from '@/features/empty-returns/api/queries';
import { useShippers } from '@/features/shippers/api/queries';

export interface ShipmentsListViewProps {
  /** Already scoped to whatever this view should show — the whole book for
   *  Admin, one company's rows for an embedded, per-account view. */
  missions: Mission[];
  /** Hide the "New shipment" action — shipper/transporter accounts can view
   *  but not create (BR-10.5 grants neither role `shipments.create`). */
  canCreateShipment?: boolean;
}

/**
 * The Admin Shipments page body: KPI strip, filter toolbar, row/grid views
 * and pagination.
 *
 * Split out of `MissionsPage` so an account's own shipments (e.g. the
 * Shipper detail page's Shipments tab) render through the exact same
 * component instead of a second, drifting implementation — only the
 * `missions` array passed in differs.
 */
/** Two readings of one book: the list decides, the calendar looks ahead. */
const SHIPMENT_TABS = [
  { key: 'list', label: 'Shipments' },
  { key: 'calendar', label: 'Calendar' },
] as const;

export function ShipmentsListView({ missions, canCreateShipment = true }: ShipmentsListViewProps) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialStatusParam = searchParams.get('status') || '';

  const openCreateModal = useShipmentStore((s) => s.openCreateModal);
  const { data: availableEmpties } = useAvailableEmpties();
  const { data: emptyReturnCycles } = useCycles();

  /* The shipper's mark, joined here rather than on the shipment payload: the
     shipment carries the company's NAME, and resolving a logo per shipment
     server-side would be one storage lookup per row. The shipper list is
     fourteen records and already cached, so one join covers the whole page. */
  const { data: shippersResponse } = useShippers();
  const shipperLogoById = useMemo(
    () => new Map((shippersResponse?.items ?? []).map((sh) => [sh.id, sh.logoUrl])),
    [shippersResponse],
  );

  // State for view mode: 'rows' (long view) vs 'cards' (grid cards)
  const [viewMode, setViewMode] = useState<'rows' | 'cards'>('rows');
  /* Shipments and the empty-container calendar are two readings of one book:
     the list is every job dispatch-to-delivery, the calendar is the same work
     laid on dates. Moved here from the Empty Container module on 2026-08-29 —
     a planning view belongs beside the thing it plans, not two modules away. */
  const [tab, setTab] = useState<'list' | 'calendar'>('list');

  // Filter state
  const [filters, setFilters] = useState<MissionFilterState>({
    searchKeyword: '',
    datePreset: 'all',
    customerId: '',
    transporterId: '',
    driverId: '',
    vehicleId: '',
    cargoType: '',
    route: '',
    containerNumber: '',
    status: initialStatusParam,
    paymentStatus: '',
    sortBy: 'date-desc',
  });

  const handleFilterChange = (updated: Partial<MissionFilterState>) => {
    setFilters((prev) => ({ ...prev, ...updated }));
  };

  const handleResetFilters = () => {
    setFilters({
      searchKeyword: '',
      datePreset: 'all',
      customerId: '',
      transporterId: '',
      driverId: '',
      vehicleId: '',
      cargoType: '',
      route: '',
      containerNumber: '',
      status: '',
      paymentStatus: '',
      sortBy: 'date-desc',
    });
  };

  // Status counts for KPI cards and pill badges
  const counts = useMemo(() => {
    const total = missions.length;
    const available = missions.filter(
      (m) => m.status === 'Pending' || m.status === 'Assigned' || m.status === 'Driver Assigned'
    ).length;
    const MOVING: readonly string[] = ['Heading to Pickup', 'At Pickup', 'Loading', 'Loaded', 'En Route', 'Arrived'];
    const inTransit = missions.filter((m) => MOVING.includes(m.status)).length;
    // Started = the box has begun moving and is not yet completed — broader
    // than `inTransit` on purpose, it also counts the unloading tail.
    const started = missions.filter(
      (m) => MOVING.includes(m.status) || m.status === 'Unloading'
    ).length;
    const completed = missions.filter(
      (m) => m.status === 'Completed' || m.status === 'POD Submitted'
    ).length;

    return {
      all: total,
      available,
      inTransit,
      started,
      completed,
    };
  }, [missions]);

  // Empties still out: every delivered, unmatched booking plus every matched
  // cycle that hasn't completed yet. Live from the real Booking/EmptyReturnCycle
  // endpoints, not a local store.
  const waitingEmptyReturn =
    (availableEmpties?.length ?? 0) +
    (emptyReturnCycles?.filter((c) => c.status !== 'completed').length ?? 0);

  // Filtered and sorted dataset calculation
  const filteredMissions = useMemo(() => {
    let result = missions.filter((m) => {
      // Keyword search
      if (filters.searchKeyword) {
        const kw = filters.searchKeyword.toLowerCase();
        const matchesKw =
          m.id.toLowerCase().includes(kw) ||
          m.bookingId.toLowerCase().includes(kw) ||
          m.referenceNumber.toLowerCase().includes(kw) ||
          m.dpcsReference.toLowerCase().includes(kw) ||
          m.customer.name.toLowerCase().includes(kw) ||
          m.customer.company.toLowerCase().includes(kw) ||
          (m.assignedTruck?.registrationNumber &&
            m.assignedTruck.registrationNumber.toLowerCase().includes(kw)) ||
          (m.containerNumber && m.containerNumber.toLowerCase().includes(kw));
        if (!matchesKw) return false;
      }

      // Customer
      if (filters.customerId && m.customer.id !== filters.customerId) return false;

      // Transporter
      if (filters.transporterId && m.transporter.id !== filters.transporterId) return false;

      // Driver
      if (filters.driverId && m.driver?.id !== filters.driverId) return false;

      // Vehicle
      if (filters.vehicleId && m.assignedTruck?.id !== filters.vehicleId) return false;

      // Cargo Type
      if (
        filters.cargoType &&
        !m.cargoType.toLowerCase().includes(filters.cargoType.toLowerCase())
      )
        return false;

      // Container Number
      if (
        filters.containerNumber &&
        (!m.containerNumber ||
          !m.containerNumber.toLowerCase().includes(filters.containerNumber.toLowerCase()))
      )
        return false;

      // Status pill tab filtering
      if (filters.status) {
        const st = filters.status.toLowerCase();
        if (st === 'available') {
          if (m.status !== 'Pending' && m.status !== 'Assigned' && m.status !== 'Driver Assigned')
            return false;
        } else if (st === 'in transit') {
          if (m.status !== 'En Route' && m.status !== 'Arrived' && m.status !== 'Loading')
            return false;
        } else if (st === 'maintenance') {
          if (m.status !== 'Completed' && m.status !== 'POD Submitted' && m.status !== 'Cancelled')
            return false;
        } else if (m.status.toLowerCase() !== st) {
          return false;
        }
      }

      // Payment Status
      if (filters.paymentStatus && m.paymentStatus !== filters.paymentStatus) return false;

      return true;
    });

    if (filters.sortBy) {
      result = [...result].sort((a, b) => {
        if (filters.sortBy === 'plate-asc') {
          const plateA = a.assignedTruck?.registrationNumber || a.bookingId;
          const plateB = b.assignedTruck?.registrationNumber || b.bookingId;
          return plateA.localeCompare(plateB);
        }
        if (filters.sortBy === 'booking-asc') {
          return a.bookingId.localeCompare(b.bookingId);
        }
        if (filters.sortBy === 'date-desc') {
          return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
        }
        if (filters.sortBy === 'customer-asc') {
          return a.customer.company.localeCompare(b.customer.company);
        }
        return 0;
      });
    }

    return result;
  }, [filters, missions]);

  /** One page at a time — the row list and the card grid share the pager. */
  const [pageSize, setPageSize] = useState(12);
  const pagedMissions = usePagedRows(filteredMissions, {
    pageSize,
    resetKey: JSON.stringify(filters),
  });

  const handleRowClick = (mission: Mission) => {
    navigate(buildPath(ROUTES.shipmentOverview, { id: mission.id }));
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Page Header */}
      <PageHeader
        title="Shipments"
        actions={
          canCreateShipment ? (
            <Button
              onClick={() => openCreateModal()}
              shape="pill"
              leadingIcon={<Plus className="h-4 w-4" />}
              className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs"
            >
              New shipment
            </Button>
          ) : undefined
        }
      />

      {/* The same segmented control the Control Tower and the planning calendar
          use, so every switch in the app reads as one control language. */}
      <div
        className="inline-flex w-fit items-center gap-0.5 rounded-md border border-border bg-surface-sunken p-0.5"
        role="group"
        aria-label="Shipments view"
      >
        {SHIPMENT_TABS.map((option) => (
          <button
            key={option.key}
            type="button"
            aria-pressed={tab === option.key}
            onClick={() => setTab(option.key)}
            className={cn(
              'h-7 cursor-pointer rounded-sm px-3.5 text-xs font-semibold transition-colors',
              tab === option.key
                ? 'bg-primary text-primary-foreground shadow-2xs'
                : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>

      {tab === 'calendar' ? (
        <EmptyReturnCalendarPage />
      ) : (
        <>

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatisticCard
          title="Total Shipments"
          value={counts.all}
          variant="teal"
          trend="up"
          percentage="100%"
          icon={<Compass className="h-5 w-5" />}
        />
        <StatisticCard
          title="Started Shipments"
          value={counts.started}
          variant="blue"
          trend="up"
          percentage={`${Math.round((counts.started / (counts.all || 1)) * 100)}%`}
          icon={<Truck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Waiting Empty Return"
          value={waitingEmptyReturn}
          variant="peach"
          trend={waitingEmptyReturn > 0 ? 'down' : 'neutral'}
          percentage={waitingEmptyReturn > 0 ? `${waitingEmptyReturn} pending` : '0'}
          icon={<Repeat className="h-5 w-5" />}
        />
        <StatisticCard
          title="Completed Shipments"
          value={counts.completed}
          variant="pink"
          trend="up"
          percentage={`${Math.round((counts.completed / (counts.all || 1)) * 100)}%`}
          icon={<BadgeCheck className="h-5 w-5" />}
        />
      </div>

      {/* Sleek Shipments Filter Toolbar */}
      <MissionFilterToolbar
        filters={filters}
        onFilterChange={handleFilterChange}
        onResetFilters={handleResetFilters}
        viewMode={viewMode}
        onViewModeChange={setViewMode}
        counts={counts}
      />

      {/* 3. Shipments Display: Long View Row Cards vs Grid Cards */}
      {viewMode === 'rows' ? (
        /* Long View Row Cards Layout */
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
              Shipments Directory
              <Badge variant="subtle" intent="primary" size="md" className="px-2.5 py-0.5 font-bold">
                {filteredMissions.length} Shipment{filteredMissions.length !== 1 ? 's' : ''}
              </Badge>
            </h2>
          </div>

          <div className="space-y-3.5">
            {pagedMissions.rows.map((mission) => (
              <MissionRowCard
                key={mission.id}
                mission={mission}
                shipperLogoUrl={shipperLogoById.get(mission.customer.id)}
                onClick={() => handleRowClick(mission)}
              />
            ))}

            {filteredMissions.length === 0 && (
              <Card className="p-12 text-center text-muted-foreground rounded-lg border border-border/80">
                No shipments match these filters.
              </Card>
            )}
          </div>

          {filteredMissions.length > 0 && (
            <TablePager
              paged={pagedMissions}
              noun="shipments"
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[12, 24, 48, 96]}
            />
          )}
        </div>
      ) : (
        /* Grid Cards View */
        <div className="space-y-4">
          <div className="flex items-center justify-between px-1">
            <h2 className="text-base font-extrabold text-foreground flex items-center gap-2">
              Grid Cards View
              <Badge variant="subtle" intent="primary" size="md" className="px-2.5 py-0.5 font-bold">
                {filteredMissions.length} Shipment{filteredMissions.length !== 1 ? 's' : ''}
              </Badge>
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {pagedMissions.rows.map((mission) => {
              /* Same container scale as the list rows and the shipment page:
                 teal while the boxes are full, brand yellow while one is out
                 empty, grey once they are all home. A bulk load has no box and
                 keeps the ladder colours. */
              const hasContainer = carriesContainer(mission);
              const containerState = containerStateOf(mission.status, hasContainer);
              const progress = shipmentProgress(mission.status, hasContainer);
              return (
              <ShipmentCard
                key={mission.id}
                shipmentNumber={mission.id}
                origin={mission.pickupLocation.name}
                destination={mission.deliveryLocation.name}
                organization={mission.customer.company}
                createdBy={mission.customer.name}
                dpcsReference={mission.dpcsReference}
                date={mission.scheduledPickupTime}
                goodsType={mission.goodsDescription}
                goodsWeight={`${(mission.totalWeightKg / 1000).toFixed(0)}t · ${mission.cargoType}`}
                vehicleType={mission.transporter.company}
                vehicleSpecs={mission.transporter.fleetCode}
                driverName={mission.driver?.name}
                truckPlate={mission.assignedTruck?.registrationNumber}
                distance={`${mission.estimatedDistanceKm} km`}
                duration={mission.estimatedDurationHours}
                paymentStatus={mission.paymentStatus}
                /* Through the shared vocabulary, like every other surface. This
                   card was printing the raw rung and colouring it with a rule of
                   its own, so the grid said "Unloading / orange" for the row the
                   list called "Depotage / blue". */
                status={displayShipmentStatus(mission.status, 'shipment')}
                statusIntent={
                  containerState
                    ? (`container-${containerState}` as const)
                    : statusIntentOf(mission.status)
                }
                cornerIntent={containerState ? CONTAINER_STATE_CORNER_INTENT[containerState] : 'teal'}
                progressPercent={progress?.percent}
                clickable
                onClick={() => handleRowClick(mission)}
              />
              );
            })}

            {filteredMissions.length === 0 && (
              <Card className="col-span-2 p-12 text-center text-muted-foreground rounded-lg border border-border/80">
                No shipments match these filters.
              </Card>
            )}
          </div>

          {filteredMissions.length > 0 && (
            <TablePager
              paged={pagedMissions}
              noun="shipments"
              pageSize={pageSize}
              onPageSizeChange={setPageSize}
              pageSizeOptions={[12, 24, 48, 96]}
            />
          )}
        </div>
      )}
        </>
      )}
    </div>
  );
}
