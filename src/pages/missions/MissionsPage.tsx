import { useState, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, Button, Badge, ShipmentCard, StatisticCard } from '@/design-system';
import { Compass, Plus, Truck, Repeat } from '@/design-system/icons';
import { BadgeCheck } from 'lucide-react';
import { PageHeader } from '@/components';
import type { Mission, MissionFilterState } from '@/types/mission';
import { MissionFilterToolbar } from './components/MissionFilterToolbar';
import { MissionRowCard } from './components/MissionRowCard';
import { ROUTES, buildPath } from '@/config/routes';
import { useShipmentStore } from '@/stores/shipment.store';
import { useEmptyReturnStore } from '@/stores/emptyReturn.store';


export function MissionsPage() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const initialStatusParam = searchParams.get('status') || '';

  const missions = useShipmentStore((s) => s.missions);
  const openCreateModal = useShipmentStore((s) => s.openCreateModal);
  const emptyReturnRecords = useEmptyReturnStore((s) => s.records);

  // State for view mode: 'rows' (long view) vs 'cards' (grid cards)
  const [viewMode, setViewMode] = useState<'rows' | 'cards'>('rows');

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
    sortBy: 'plate-asc',
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
      sortBy: 'plate-asc',
    });
  };

  // Status counts for KPI cards and pill badges
  const counts = useMemo(() => {
    const total = missions.length;
    const available = missions.filter(
      (m) => m.status === 'Pending' || m.status === 'Assigned' || m.status === 'Driver Assigned'
    ).length;
    const inTransit = missions.filter(
      (m) => m.status === 'En Route' || m.status === 'Arrived' || m.status === 'Loading'
    ).length;
    // Started = the box has begun moving and is not yet completed (En Route,
    // Arrived, Loading or Unloading) — broader than `inTransit` on purpose.
    const started = missions.filter(
      (m) =>
        m.status === 'En Route' ||
        m.status === 'Arrived' ||
        m.status === 'Loading' ||
        m.status === 'Unloading'
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

  // Empties still out: anything in the return pipeline that has not been
  // returned yet. Excludes boxes still `unloading` (not empties yet) and
  // `completed` (already back). Live from the Empty Return store.
  const waitingEmptyReturn = useMemo(
    () =>
      emptyReturnRecords.filter(
        (r) => r.status !== 'completed' && r.status !== 'unloading'
      ).length,
    [emptyReturnRecords]
  );

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

  const handleRowClick = (mission: Mission) => {
    navigate(buildPath(ROUTES.shipmentOverview, { id: mission.id }));
  };

  return (
    <div className="space-y-5 pb-12">
      {/* Page Header */}
      <PageHeader
        title="Shipments"
        description="Real-time tracking, timeline auditing, and operational lifecycle control across all active and past shipments."
        actions={
          <Button
            onClick={() => openCreateModal()}
            shape="pill"
            leadingIcon={<Plus className="h-4 w-4" />}
            className="bg-primary hover:bg-primary-hover text-primary-foreground font-semibold px-4 py-2 text-xs shadow-xs"
          >
            Add Shipment
          </Button>
        }
      />

      {/* KPI Stat Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
        <StatisticCard
          title="Total Shipments"
          value={counts.all}
          subtitle="Operational Loads"
          variant="teal"
          trend="up"
          percentage="100%"
          icon={<Compass className="h-5 w-5" />}
        />
        <StatisticCard
          title="Started Shipments"
          value={counts.started}
          subtitle="Underway"
          variant="blue"
          trend="up"
          percentage={`${Math.round((counts.started / (counts.all || 1)) * 100)}%`}
          icon={<Truck className="h-5 w-5" />}
        />
        <StatisticCard
          title="Waiting Empty Return"
          value={waitingEmptyReturn}
          subtitle="Empties to Return"
          variant="peach"
          trend={waitingEmptyReturn > 0 ? 'down' : 'neutral'}
          percentage={waitingEmptyReturn > 0 ? `${waitingEmptyReturn} pending` : '0'}
          icon={<Repeat className="h-5 w-5" />}
        />
        <StatisticCard
          title="Completed Shipments"
          value={counts.completed}
          subtitle="Delivered & Verified"
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
            {filteredMissions.map((mission) => (
              <MissionRowCard
                key={mission.id}
                mission={mission}
                onClick={() => handleRowClick(mission)}
              />
            ))}

            {filteredMissions.length === 0 && (
              <Card className="p-12 text-center text-muted-foreground rounded-lg border border-border/80">
                No shipments match your search or filter parameters.
              </Card>
            )}
          </div>
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
            {filteredMissions.map((mission) => (
              <ShipmentCard
                key={mission.id}
                shipmentNumber={mission.id}
                bookingNumber={mission.bookingId.replace('BKG-', '')}
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
                status={mission.status}
                statusIntent={
                  mission.status === 'Completed'
                    ? 'green'
                    : mission.status === 'En Route' || mission.status === 'Arrived'
                      ? 'blue'
                      : mission.status === 'Cancelled' || mission.status === 'Failed'
                        ? 'slate'
                        : 'orange'
                }
                clickable
                onClick={() => handleRowClick(mission)}
              />
            ))}

            {filteredMissions.length === 0 && (
              <Card className="col-span-2 p-12 text-center text-muted-foreground rounded-lg border border-border/80">
                No shipments match your search or filter parameters.
              </Card>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

