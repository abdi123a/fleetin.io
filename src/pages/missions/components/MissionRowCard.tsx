import React from 'react';
import type { Mission } from '@/types/mission';
import {
  Card,
  CornerBadge,
  Button,
  MARK_STACK_OVERLAP,
  Tooltip,
  rowCardActionClasses,
} from '@/design-system';
import { carriesContainer, containerStateOf } from '@/lib/containerState';
import { shipmentProgress, statusCornerIntentOf } from '@/lib/shipmentStatus';
import { formatKm, shipmentDistance } from '@/lib/shipmentDistance';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import { CrewStack } from '@/components/crew';
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

  /* The ribbon and the chip wear the ladder's phase — teal booked, green in
     transit, amber owing a return, slate closed — which is what the booking
     cards inside the shipment already wear. `containerState` still rides along
     for the chip's glyph and tooltip: what is in the box is a second fact, and
     it stopped being a colour here on 2026-08-30 because it was overruling the
     phase and painting an in-transit shipment the same teal as a booked one.
     A shipment's status is rolled up from its own bookings, so it only moves on
     when every box under it has. */
  /* Falls back to the creation-time snapshot only when the payload has no
     carrier list at all — see `ShipmentRecord.transporters`. */
  /* One booking per container, out and back — see `@/lib/shipmentDistance`. */
  const drive = shipmentDistance(mission.estimatedDistanceKm, mission.bookingId);

  const transporters =
    mission.transporters?.length
      ? mission.transporters
      : [{ id: mission.transporter.id, name: mission.transporter.company }];

  const hasContainer = carriesContainer(mission);
  const containerState = containerStateOf(mission.status, hasContainer);
  const progress = shipmentProgress(mission.status, hasContainer);

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
        <CornerBadge
          label={`Shipment# ${mission.id}`}
          intent={statusCornerIntentOf(mission.status)}
          position="top"
        />
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

          {/* One status, and how far along it is.
              This carried the status chip AND a FULL/RETURNED tag — "RETURNED
              Completed", "FULL Created" — the same fact twice in two
              vocabularies, which the user could not read at a glance. The chip
              names the stage; the rail answers "how far through is it". */}
          {/* The figure sits ABOVE the status, not beside it. A rail drawn next
              to the chip made the row's right edge a little chart nobody was
              reading — the number was the useful half all along. */}
          <div className="flex shrink-0 flex-col items-end gap-1">
            {progress && (
              <span
                className="text-lg font-extrabold leading-none tabular-nums text-foreground"
                title={`Step ${progress.step} of ${progress.of} — ${progress.percent}% complete`}
              >
                {progress.percent}%
              </span>
            )}
            <MissionStatusBadge status={mission.status} size="sm" containerState={containerState} />
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

        {/* ── LINE 3: Meta (cargo · transporter · distance) + actions ── */}
        <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-border/60">
          <div className="flex items-center gap-1.5 min-w-0 text-[11px] text-muted-foreground truncate">
            <span className="font-bold text-foreground">{mission.scheduledPickupTime}</span>
            <span>·</span>
            <span className="font-mono font-bold text-primary">
              {(mission.totalWeightKg / 1000).toFixed(0)}t {mission.cargoType}
            </span>
            {showPartnerInfo && transporters.length > 0 && (
              <>
                <span>·</span>
                {/* Every carrier on the job, as marks rather than words.
                    Two reasons this is not a name. The line has to hold a date,
                    a cargo description and a distance inside one truncating row,
                    and "Freight Secure Logistics & Services" ate all of it — and
                    a shipment split between two hauliers has two carriers, which
                    no single name can say. Operations recognise a carrier by the
                    logo on every booking long before they finish reading the
                    name, so the marks carry it and the names are one hover away.
                    `CompanyMark` falls back to initials for a carrier with no
                    logo on file, so a slot is never blank. */}
                <Tooltip
                  content={
                    transporters.length === 1
                      ? `Transporter · ${transporters[0]?.name}`
                      : `${transporters.length} transporters · ${transporters.map((t) => t.name).join(', ')}`
                  }
                >
                  <span className="inline-flex shrink-0 cursor-default items-center">
                    {transporters.map((transporter, index) => (
                      <CompanyMark
                        key={transporter.id}
                        id={transporter.id}
                        name={transporter.name}
                        size="sm"
                        /* Overlapped, so a second carrier costs a sliver of the
                           line rather than another full slot — but only just:
                           the shared scale keeps a mark's initials clear of the
                           mark in front of it. */
                        className={index > 0 ? MARK_STACK_OVERLAP.sm : undefined}
                      />
                    ))}
                    {/* The marks are the whole label here, so the names still
                        have to reach a screen reader — `alt` covers the image
                        case but not the initials fallback. */}
                    <span className="sr-only">
                      {transporters.length === 1 ? 'Transporter: ' : 'Transporters: '}
                      {transporters.map((t) => t.name).join(', ')}
                    </span>
                  </span>
                </Tooltip>
              </>
            )}
            <span>·</span>
            {/* The whole road, not one leg of it. `estimatedDistanceKm` is a
                single truck's run out; a five-container shipment sends five and
                gets five empties back, so the row used to read 25km for a job
                that drives 250. The breakdown is on the title so the figure can
                be checked rather than merely believed. */}
            <span
              className="shrink-0 font-mono font-bold text-foreground"
              title={`${drive.containers} container${drive.containers === 1 ? '' : 's'} × ${drive.legKm} km out and back`}
            >
              {formatKm(drive.totalKm)}
            </span>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Whose job it is, at the end of the row where the eye lands.
                Read-only here, deliberately: the whole card is a link to the
                shipment, so a popover inside it would be two click targets
                stacked on one another — you would open the wrong thing about
                half the time. Assigning happens on the shipment itself and in
                the create wizard. Unassigned rows draw nothing rather than a
                dashed circle two hundred times; the Unassigned filter is the
                honest way to ask that question. */}
            <CrewStack crew={mission.crew ?? []} size="xs" />

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
              className={`rounded-lg text-xs h-7 px-2.5 gap-1 ${rowCardActionClasses}`}
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
