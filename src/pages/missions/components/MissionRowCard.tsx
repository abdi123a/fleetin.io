import React from 'react';
import type { Mission, MissionStatus } from '@/types/mission';
import { Card, Badge, CornerBadge, Avatar, Button } from '@/design-system';
import { MissionStatusBadge } from './MissionStatusBadge';
import {
  ChevronRight,
  DollarSign,
  MapPin,
  ArrowRight,
} from '@/design-system/icons';
import { useNavigate } from 'react-router-dom';
import { ROUTES, buildPath } from '@/config/routes';
import { useShipmentStore } from '@/stores/shipment.store';
import { useUpdateShipmentStatus } from '@/features/shipments/api/queries';

/**
 * The operational lifecycle, one step at a time. Advancing through it is what
 * feeds the other modules: leaving `Pending` withdraws the shipment from the
 * Empty Return Matching pool, and reaching `Arrived` registers its container
 * as an empty return. Terminal and cancelled states advance nowhere.
 */
const NEXT_STATUS: Partial<Record<MissionStatus, MissionStatus>> = {
  Pending: 'Assigned',
  Assigned: 'Driver Assigned',
  'Driver Assigned': 'En Route',
  'En Route': 'Arrived',
  Arrived: 'Unloading',
  Unloading: 'POD Submitted',
  'POD Submitted': 'Completed',
};

interface MissionRowCardProps {
  mission: Mission;
  onClick?: () => void;
  showPartnerInfo?: boolean;
}

export const MissionRowCard: React.FC<MissionRowCardProps> = ({
  mission,
  onClick,
  showPartnerInfo = true,
}) => {
  const navigate = useNavigate();
  const updateMissionStatus = useShipmentStore((s) => s.updateMissionStatus);
  const updateStatusMutation = useUpdateShipmentStatus();
  const nextStatus = NEXT_STATUS[mission.status];

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(buildPath(ROUTES.shipmentOverview, { id: mission.id }));
    }
  };

  return (
    <Card
      onClick={handleCardClick}
      className="relative overflow-hidden rounded-lg border border-border/80 bg-card text-foreground shadow-2xs hover:shadow-md hover:border-primary/40 transition duration-200 cursor-pointer group"
    >
      {/* ── CORNER BADGE ── */}
      <div className="absolute top-0 left-0 z-10 select-none">
        <CornerBadge label={`Shipment# ${mission.bookingId.replace('BKG-', '')}`} intent="teal" position="top" />
      </div>

      {/* ── CARD BODY — 3 lines: header, route, meta+actions ── */}
      <div className="pt-9 px-4 pb-3 space-y-2">

        {/* ── LINE 1: Shipper + DPCS + Status + Payment ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <Avatar
              fallback={mission.customer.company.substring(0, 2).toUpperCase()}
              size="sm"
              className="bg-primary/10 text-primary font-black border border-primary/20 shrink-0"
            />
            <span
              title={`By: ${mission.customer.name} · ${mission.dpcsReference}`}
              className="font-extrabold text-sm text-foreground leading-tight truncate"
            >
              {mission.customer.company}
            </span>
            {mission.dpcsReference && (
              <span
                title={`Sourced from DPCS · ${mission.dpcsReference}`}
                className="inline-flex items-center gap-1 shrink-0 rounded-full border border-primary/25 bg-primary/10 pl-1 pr-1.5 py-0.5"
              >
                <img src="/logo/dpcs-logo.png" alt="DPCS" className="h-2.5 w-2.5 object-contain rounded-sm" />
                <span className="text-[9px] font-bold uppercase tracking-wide text-primary">DPCS</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <MissionStatusBadge status={mission.status} size="sm" />
            <Badge variant="subtle" intent="info" size="sm" className="px-2 py-0.5 font-mono text-[10px]">
              <DollarSign className="w-2.5 h-2.5" />
              {mission.paymentStatus}
            </Badge>
          </div>
        </div>

        {/* ── LINE 2: Route, single line ── */}
        <div className="flex items-center gap-2 bg-secondary/40 rounded-lg px-3 py-1.5 border border-border/50 text-xs">
          <MapPin className="w-3.5 h-3.5 text-primary shrink-0" />
          <span className="font-semibold text-foreground truncate">{mission.pickupLocation.name}</span>
          <ArrowRight className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <MapPin className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
          <span className="font-semibold text-foreground truncate">{mission.deliveryLocation.name}</span>
        </div>

        {/* ── LINE 3: Meta (cargo · transporter · driver · distance) + actions ── */}
        <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-border/60">
          <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground truncate">
            <span className="font-bold text-foreground">{mission.scheduledPickupTime}</span>
            <span>·</span>
            <span className="font-mono font-bold text-primary">
              {(mission.totalWeightKg / 1000).toFixed(0)}t {mission.cargoType}
            </span>
            {showPartnerInfo && (
              <>
                <span>·</span>
                <span className="font-semibold text-foreground truncate">{mission.transporter.company}</span>
              </>
            )}
            <span>·</span>
            {mission.driver
              ? <span className="font-semibold text-foreground truncate">{mission.driver.name}</span>
              : <span className="text-warning-subtle-foreground italic">Unassigned</span>}
            <span>·</span>
            <span className="font-mono font-bold text-foreground shrink-0">{mission.estimatedDistanceKm} km</span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {nextStatus && (
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  updateStatusMutation.mutate(
                    { id: mission.id, status: nextStatus },
                    { onSuccess: () => updateMissionStatus(mission.id, nextStatus) },
                  );
                }}
                disabled={updateStatusMutation.isPending}
                className="rounded-lg text-xs h-7 px-2.5 gap-1 border-primary/40 text-primary hover:bg-primary hover:text-primary-foreground transition cursor-pointer"
              >
                <span>Mark {nextStatus}</span>
                <ArrowRight className="w-3 h-3" />
              </Button>
            )}
            <Button
              variant="outline"
              size="sm"
              onClick={(e) => {
                e.stopPropagation();
                handleCardClick();
              }}
              className="rounded-lg text-xs h-7 px-2.5 gap-1 border-border/80 group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground transition shrink-0 cursor-pointer"
            >
              <span>View</span>
              <ChevronRight className="w-3 h-3" />
            </Button>
          </div>
        </div>

      </div>
    </Card>
  );
};
