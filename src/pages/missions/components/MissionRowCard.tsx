import React from 'react';
import type { Mission } from '@/types/mission';
import { Card, CornerBadge, Button } from '@/design-system';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import { MissionStatusBadge } from './MissionStatusBadge';
import {
  ChevronRight,
  MapPin,
  ArrowRight,
} from '@/design-system/icons';
import { useNavigate } from 'react-router-dom';
import { ROUTES, buildPath } from '@/config/routes';

interface MissionRowCardProps {
  mission: Mission;
  onClick?: () => void;
  showPartnerInfo?: boolean;
  /**
   * The shipper's own logo, joined in by the list.
   *
   * A `Mission` carries the shipper's name but not their mark — the shipment
   * payload has no logo on it, and resolving one per row server-side would be
   * a storage lookup per shipment. The list already holds the shipper records,
   * so it passes the URL down and `CompanyMark` falls back to initials for a
   * shipper who has no logo on file.
   */
  shipperLogoUrl?: string;
}

export const MissionRowCard: React.FC<MissionRowCardProps> = ({
  mission,
  onClick,
  showPartnerInfo = true,
  shipperLogoUrl,
}) => {
  const navigate = useNavigate();

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
        {/* The shipment's own reference. This used to print `bookingId`, a
            field holding a `Date.now()`-derived `BKG-#####` that matched no
            booking anywhere — so the number on this card identified nothing. */}
        <CornerBadge label={`Shipment# ${mission.id}`} intent="teal" position="top" />
      </div>

      {/* ── CARD BODY — 3 lines: header, route, meta+actions ── */}
      <div className="pt-9 px-4 pb-3 space-y-2">

        {/* ── LINE 1: Shipper + DPCS + Status ── */}
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0 flex-1">
            <CompanyMark
              id={mission.customer.id}
              name={mission.customer.company}
              logoUrl={shipperLogoUrl}
              size="sm"
            />
            <span
              title={`By: ${mission.customer.name} · ${mission.dpcsReference}`}
              className="font-extrabold text-sm text-foreground leading-tight truncate"
            >
              {mission.customer.company}
            </span>
            {mission.source === 'dpcs' && (
              <span
                title={`Sourced from DPCS · ${mission.dpcsReference}`}
                className="inline-flex items-center gap-1 shrink-0 rounded-full border border-primary/25 bg-primary/10 pl-1 pr-1.5 py-0.5"
              >
                <img src="/logo/dpcs-icon.png" alt="DPCS" className="h-3 w-3 object-contain" />
                <span className="text-[9px] font-bold uppercase tracking-wide text-primary">DPCS</span>
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            <MissionStatusBadge status={mission.status} size="sm" />
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
            {/* No "Mark <next>" here anymore. A shipment's status is derived
                server-side from its own bookings, so advancing it from this
                card moved the label without moving a single container — which
                is how a shipment came to read "Pending" with everything
                delivered. Open the shipment and move the booking instead. */}
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
