import React from 'react';
import type { Mission } from '@/types/mission';
import { Card, Badge, CornerBadge } from '@/design-system';
import { formatKm, shipmentDistance } from '@/lib/shipmentDistance';
import {
  Building2,
  Truck,
  User,
  MapPin,
  ExternalLink,
  ShieldCheck,
  Phone,
  Mail,
  CheckCircle2,
} from '@/design-system/icons';
import { useNavigate } from 'react-router-dom';
import { ROUTES, buildPath } from '@/config/routes';

interface MissionDetailsViewProps {
  mission: Mission;
  onStatusChange?: (newStatus: Mission['status']) => void;
}

export const MissionDetailsView: React.FC<MissionDetailsViewProps> = ({
  mission,
}) => {
  const navigate = useNavigate();
  /* One booking per container, out and back — see `@/lib/shipmentDistance`. */
  const drive = shipmentDistance(mission.estimatedDistanceKm, mission.bookingId);

  return (
    <div className="space-y-6">
      {/* Primary Identifiers Banner */}
      <Card className="p-6 rounded-lg border border-border/80 bg-card shadow-2xs relative overflow-hidden">
        <CornerBadge label="Mission Specs" intent="teal" position="top" />

        <div className="grid grid-cols-2 md:grid-cols-4 gap-6 pt-2">
          <div className="space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Mission ID
            </span>
            <div className="text-xl font-black text-primary tracking-tight font-mono">
              {mission.id}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Booking ID
            </span>
            <div className="flex items-center gap-1.5">
              <span className="text-base font-bold text-foreground font-mono">
                {mission.bookingId}
              </span>
              <button
                type="button"
                onClick={() =>
                  navigate(buildPath(ROUTES.shipmentOverview, { id: mission.bookingId.replace('BKG-', '') }))
                }
                className="text-primary hover:underline cursor-pointer"
                title="View Shipment Overview"
              >
                <ExternalLink className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              Reference Number
            </span>
            <div className="text-base font-extrabold text-foreground font-mono">
              {mission.referenceNumber}
            </div>
          </div>

          <div className="space-y-1">
            <span className="text-[10px] font-bold text-muted-foreground uppercase tracking-wider">
              DPCS Reference
            </span>
            <div className="text-base font-extrabold text-foreground font-mono">
              {mission.dpcsReference}
            </div>
          </div>
        </div>
      </Card>

      {/* Grid Row 1: Stakeholders (Customer, Transporter, Driver & Truck) */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Customer Information Card */}
        <Card className="p-6 rounded-lg border border-border/80 bg-card shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <Building2 className="w-4 h-4 text-primary" />
              Customer Information (Shipper)
            </h4>
            <button
              type="button"
              onClick={() => navigate(buildPath(ROUTES.shipperDetail, { id: mission.customer.id }))}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              Profile Detail
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Company Name:</span>
              <span className="font-extrabold text-foreground">{mission.customer.company}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Contact Person:</span>
              <span className="font-bold text-foreground">{mission.customer.name}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Phone:</span>
              <span className="font-mono text-foreground flex items-center gap-1">
                <Phone className="w-3 h-3 text-muted-foreground" />
                {mission.customer.phone}
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Email:</span>
              <span className="font-mono text-foreground flex items-center gap-1">
                <Mail className="w-3 h-3 text-muted-foreground" />
                {mission.customer.email}
              </span>
            </div>
          </div>
        </Card>

        {/* Transporter (Partner) Information Card */}
        <Card className="p-6 rounded-lg border border-border/80 bg-card shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              Transporter (Partner)
            </h4>
            <button
              type="button"
              onClick={() => navigate(buildPath(ROUTES.partnerDetail, { id: mission.transporter.id }))}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              Partner Profile
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          <div className="space-y-2 text-xs">
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Transporter Company:</span>
              <span className="font-extrabold text-foreground">{mission.transporter.company}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Fleet Code:</span>
              <span className="font-mono font-bold text-foreground">{mission.transporter.fleetCode}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground font-semibold">Contact Phone:</span>
              <span className="font-mono text-foreground flex items-center gap-1">
                <Phone className="w-3 h-3 text-muted-foreground" />
                {mission.transporter.phone}
              </span>
            </div>
          </div>
        </Card>
      </div>

      {/* Grid Row 2: Driver & Assigned Truck */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Driver Card */}
        <Card className="p-6 rounded-lg border border-border/80 bg-card shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <User className="w-4 h-4 text-primary" />
              Assigned Driver
            </h4>
            <button
              type="button"
              onClick={() => navigate(ROUTES.drivers)}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              Drivers Directory
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {mission.driver ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Driver Name:</span>
                <span className="font-extrabold text-foreground flex items-center gap-1.5">
                  {mission.driver.name}
                  {mission.driver.isVerified && (
                    <Badge variant="subtle" intent="success" size="sm" className="px-1.5 py-0.5 text-[10px]">
                      <CheckCircle2 className="w-3 h-3" /> Verified
                    </Badge>
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">License Number:</span>
                <span className="font-mono font-bold text-foreground">{mission.driver.licenseNumber}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">Driver Phone:</span>
                <span className="font-mono text-foreground">{mission.driver.phone}</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-warning-subtle border border-warning/20 text-warning-subtle-foreground text-xs font-semibold">
              No driver assigned yet. Pending dispatch action.
            </div>
          )}
        </Card>

        {/* Truck Card */}
        <Card className="p-6 rounded-lg border border-border/80 bg-card shadow-2xs space-y-4">
          <div className="flex items-center justify-between border-b border-border/70 pb-3">
            <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2">
              <Truck className="w-4 h-4 text-primary" />
              Assigned Vehicle Truck
            </h4>
            <button
              type="button"
              onClick={() => navigate(ROUTES.vehicles)}
              className="text-xs font-bold text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              Fleet Directory
              <ExternalLink className="w-3.5 h-3.5" />
            </button>
          </div>

          {mission.assignedTruck ? (
            <div className="space-y-2 text-xs">
              <div className="flex justify-between items-center">
                <span className="text-muted-foreground font-semibold">Registration Number:</span>
                <span className="font-mono font-black text-foreground text-sm flex items-center gap-1.5">
                  {mission.assignedTruck.registrationNumber}
                  {mission.assignedTruck.isVerified && (
                    <ShieldCheck className="w-4 h-4 text-success-subtle-foreground" />
                  )}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">Vehicle Type:</span>
                <span className="font-bold text-foreground">{mission.assignedTruck.vehicleType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground font-semibold">Max Payload Capacity:</span>
                <span className="font-mono text-foreground">{mission.assignedTruck.capacity}</span>
              </div>
            </div>
          ) : (
            <div className="p-4 rounded-lg bg-warning-subtle border border-warning/20 text-warning-subtle-foreground text-xs font-semibold">
              No truck assigned yet. Awaiting vehicle allocation.
            </div>
          )}
        </Card>
      </div>

      {/* Grid Row 3: Pickup Location, Delivery Location & Route Specs */}
      <Card className="p-6 rounded-lg border border-border/80 bg-card shadow-2xs space-y-6">
        <h4 className="text-sm font-extrabold text-foreground flex items-center gap-2 border-b border-border/70 pb-3">
          <MapPin className="w-4 h-4 text-primary" />
          Route & Logistics Route Specifications
        </h4>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 relative">
          {/* Pickup Location */}
          <div className="space-y-2 bg-background/60 p-4 rounded-lg border border-border/70">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-success" />
              <span className="text-xs font-bold text-success-subtle-foreground uppercase tracking-wider">
                Pickup Origin Location
              </span>
            </div>
            <div className="font-extrabold text-sm text-foreground">{mission.pickupLocation.name}</div>
            <div className="text-xs text-muted-foreground">{mission.pickupLocation.address}</div>
            <div className="text-xs font-semibold text-foreground">{mission.pickupLocation.city}</div>
            {mission.pickupLocation.gateOrTerminal && (
              <div className="text-[11px] font-mono text-primary font-bold">
                {mission.pickupLocation.gateOrTerminal}
              </div>
            )}
          </div>

          {/* Delivery Location */}
          <div className="space-y-2 bg-background/60 p-4 rounded-lg border border-border/70">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-primary" />
              <span className="text-xs font-bold text-primary uppercase tracking-wider">
                Destination Delivery Location
              </span>
            </div>
            <div className="font-extrabold text-sm text-foreground">{mission.deliveryLocation.name}</div>
            <div className="text-xs text-muted-foreground">{mission.deliveryLocation.address}</div>
            <div className="text-xs font-semibold text-foreground">{mission.deliveryLocation.city}</div>
            {mission.deliveryLocation.gateOrTerminal && (
              <div className="text-[11px] font-mono text-primary font-bold">
                {mission.deliveryLocation.gateOrTerminal}
              </div>
            )}
          </div>
        </div>

        {/* Route Meta Bar: Distance, Duration, Cargo & Container */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 p-4 rounded-lg bg-muted/40 border border-border/70 text-xs">
          <div>
            <span className="text-muted-foreground font-semibold block text-[10px] uppercase">
              Estimated Distance
            </span>
            {/* The shipment's whole road — every container out and back — not
                the single leg it was quoted at. See `@/lib/shipmentDistance`. */}
            <span
              className="font-mono font-black text-foreground text-sm"
              title={`${drive.containers} container${drive.containers === 1 ? '' : 's'} × ${drive.legKm} km out and back`}
            >
              {formatKm(drive.totalKm)}
            </span>
          </div>

          <div>
            <span className="text-muted-foreground font-semibold block text-[10px] uppercase">
              Estimated Duration
            </span>
            <span className="font-mono font-black text-foreground text-sm">
              {mission.estimatedDurationHours}
            </span>
          </div>

          <div>
            <span className="text-muted-foreground font-semibold block text-[10px] uppercase">
              Cargo Specification
            </span>
            <span className="font-bold text-foreground">{mission.cargoType}</span>
          </div>

          <div>
            <span className="text-muted-foreground font-semibold block text-[10px] uppercase">
              Container #
            </span>
            <span className="font-mono font-bold text-primary">
              {mission.containerNumber || 'N/A'}
            </span>
          </div>
        </div>
      </Card>
    </div>
  );
};
