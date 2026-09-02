import React from 'react';
import type { Mission } from '@/types/mission';
import {
  Button,
  Card,
  CornerBadge,
  IconChip,
  MARK_STACK_OVERLAP,
  Tooltip,
  rowCardActionClasses,
} from '@/design-system';
import { carriesContainer, containerStateOf } from '@/lib/containerState';
import { shipmentProgress, statusCornerIntentOf } from '@/lib/shipmentStatus';
import { formatKm, shipmentDistance } from '@/lib/shipmentDistance';
import { co2Label, formatCo2 } from '@/lib/co2';
import { CompanyMark } from '@/features/transporter-bi/cards/CompanyLabel';
import { CrewStack } from '@/components/crew';
import { MissionStatusBadge } from './MissionStatusBadge';
import {
  ChevronRight,
  MapPin,
  ArrowRight,
  ContainerIcon,
  Leaf,
  Package,
  Wrench,
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
  /** Nobody has opened this one yet — see `@/features/shipments/seenShipments`. */
  isNew?: boolean;
}

/**
 * What kind of load this is, in one word.
 *
 * The category is the honest source — `cargoType` is a sentence written for the
 * booking ("Containerized (40ft HC Sugar)") and its first word is only
 * incidentally the type. Falls back to that first word for a shipment recorded
 * before the category existed, and to "Shipment" for one that has neither.
 */
type ShipmentType = { label: string; Icon: typeof ContainerIcon };

const SHIPMENT_TYPE: Record<string, ShipmentType> = {
  container_20: { label: 'Containerized', Icon: ContainerIcon },
  container_40: { label: 'Containerized', Icon: ContainerIcon },
  container_40hc: { label: 'Containerized', Icon: ContainerIcon },
  containerized: { label: 'Containerized', Icon: ContainerIcon },
  bulk: { label: 'Bulk', Icon: Package },
  bulky_goods: { label: 'Bulky goods', Icon: Package },
  machinery: { label: 'Machinery', Icon: Wrench },
  special: { label: 'Special', Icon: Package },
};

function shipmentType(mission: Mission): ShipmentType {
  const fromCategory = mission.shipmentCategory && SHIPMENT_TYPE[mission.shipmentCategory];
  if (fromCategory) return fromCategory;
  const firstWord = mission.cargoType?.trim().split(/[\s(]/)[0];
  return { label: firstWord || 'Shipment', Icon: Package };
}

export const MissionRowCard: React.FC<MissionRowCardProps> = ({
  mission,
  onClick,
  showPartnerInfo = true,
  shipperLogoUrl,
  isNew = false,
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

  const cargo = shipmentType(mission);
  const hasContainer = carriesContainer(mission);
  const containerState = containerStateOf(mission.status, hasContainer);
  const progress = shipmentProgress(mission.status, hasContainer);

  /* The job's carbon so far. Null — not zero — until a container under it has
     actually been driven, so the corner stays quiet on a shipment that has
     not moved. See `Mission.co2EmissionsKg`. */
  const co2Kg = mission.co2EmissionsKg ?? null;
  const co2 = formatCo2(co2Kg);

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
      {/* A column, not a row: the reference on top and the type beneath it. */}
      <div className="absolute top-0 left-0 z-10 flex select-none flex-col items-start gap-1">
        <div className="flex items-center gap-1.5">
        {/* The reference, and nothing else.
         *
         * This has been five shapes, and the last one stacked the cargo type
         * under the reference inside the tab. Two unlike facts in one block: a
         * reference is the key you look a row up by, a cargo type is a facet
         * you scan and filter by, and pairing them cost both. The type ended up
         * at 9.5px and 85% opacity — the smallest, faintest text on the page —
         * inside the card's heaviest element, and the second line pushed the
         * whole body down 44px to clear it.
         *
         * So the tab holds the identifier at the size and caps it always had,
         * and the type moved to the meta row, where the rest of the load's
         * facts already live and where it is full-size and full-strength.
         *
         * This used to print `bookingId`, a `Date.now()`-derived `BKG-#####`
         * that matched no booking anywhere — so the number identified nothing.
         */}
          <CornerBadge
            label={`Shipment# ${mission.id}`}
            /* `'shipment'` — this card IS a shipment, so its tab wears the
               four-state rollup, not a container's seven-step rung. */
            intent={statusCornerIntentOf(mission.status, 'shipment')}
            position="top"
          />

          {isNew && (
            <span
              title="Nobody has opened this shipment yet"
              className="shrink-0 rounded-full bg-success px-1.5 py-0.5 text-[9px] font-extrabold uppercase tracking-widest text-success-foreground"
            >
              New
            </span>
          )}
        </div>

        {/* What kind of load, as its own object.
         *
         * It sat inside the tab as a 9.5px dimmed sub-line and read as an
         * afterthought stuck to the reference. It belongs at the top — it is
         * the fact that decides what the rest of the row means, since a
         * containerized job owes an empty back and a bulk one is finished at
         * the drop-off — but it is a facet, not an identifier, so it gets its
         * own shape under the tab rather than a second line inside it.
         *
         * `ml-4` puts its left edge on the card's content column, so it lines
         * up with the shipper's mark, the route bar and the meta row below it
         * rather than hanging off the card's own edge the way the tab does.
         *
         * Neutral fill, brand glyph. The tab and the status chip already carry
         * the ladder's colour on this card, so a third coloured thing would be
         * read as a third status; the icon and the pill's own edge are what
         * make it carry, not a hue. The glyph is `primary-bold` rather than
         * `primary` — the brand teal lands at 2.97:1 on this fill, just under
         * the 3:1 a non-text graphic needs, and the brand colour itself never
         * moves down the ramp to solve contrast. */}
        <span className="ml-4 inline-flex shrink-0 items-center gap-1 rounded-full border border-border-strong bg-secondary px-2 py-0.5 shadow-2xs">
          <cargo.Icon className="size-3 shrink-0 text-primary-bold" />
          <span className="text-[10px] font-bold uppercase tracking-wide text-foreground">
            {cargo.label}
          </span>
        </span>

      </div>

      {/* ── CARBON MARK ──
          The card's other corner, opposite the reference tab. It sits on the
          frame rather than in the header row because it is a property of the
          whole job, not of the line it would otherwise share — and in the
          header it pushed the completion figure and the status badge down a
          row on every card in the list.

          The mark only. The figure is at the end of the meta line beside the
          kilometres it was computed from; distance and emissions are one fact
          told twice, and reading them a card apart meant doing the arithmetic
          in your head.

          Absent, not zero, until something has actually been driven — so its
          presence is itself the news. */}
      {co2Kg !== null && (
        <span className="absolute right-3 top-3 z-10" title={co2Label(co2Kg)}>
          <IconChip icon={Leaf} size={36} className="bg-success text-success-foreground shadow-2xs" />
          <span className="sr-only">{co2Label(co2Kg)}</span>
        </span>
      )}

      {/* ── CARD BODY — 3 lines: header, route, meta+actions ── */}
      {/* `pt-15`: a 27px tab, a 4px gap and a 21px chip stacked under it — 52px
          — plus the ~8px of air the card has always kept between the corner
          block and the shipper's row. */}
      <div className="pt-15 px-4 pb-3 space-y-2">

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
              /* The figure says what it is.
               *
               * A bare "0%" in the corner of a card is a number with no unit:
               * 0% of what — the route, the paperwork, the money? The word was
               * only in the `title`, which you have to already suspect is there
               * to go looking for. It is inline rather than a caption under the
               * number, so naming the figure costs no extra row on the card. */
              <span
                className="flex items-baseline gap-1"
                title={`Step ${progress.step} of ${progress.of} — ${progress.percent}% complete`}
              >
                <span className="text-lg font-extrabold leading-none tabular-nums text-foreground">
                  {progress.percent}%
                </span>
                <span className="text-[10px] font-medium leading-none text-muted-foreground">
                  complete
                </span>
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

        {/* ── LINE 3: Meta (date · transporter · distance) + actions ── */}
        <div className="flex items-center justify-between gap-3 pt-1.5 border-t border-border/60">
          {/* Wraps rather than truncates. Every item on this line is a fact
              with no shorter form — a date, a count, the carriers, the
              kilometres, the carbon — so cutting the row silently drops whole
              figures off the end rather than shortening one. At 375px the km
              and the CO₂ were both gone and nothing said so. `gap-y` keeps the
              second line legible when it happens; on a desk it never does. */}
          <div className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1 text-[11px] text-muted-foreground">
            <span className="font-bold text-foreground" title="Created">
              {mission.createdAt}
            </span>
            <span>·</span>
            {/* How many trucks this shipment puts on the road. One booking per
                container is what the wizard mints, so this is also the box
                count — and it is the number that makes the kilometres at the
                end of the row make sense. */}
            <span className="shrink-0 font-bold text-foreground">
              {drive.containers} {drive.containers === 1 ? 'booking' : 'bookings'}
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
            {co2Kg !== null && (
              <>
                <span>·</span>
                {/* Next to the distance it came from. No leaf here — the corner
                    already carries the mark, and "kg CO₂" names itself. */}
                <span
                  className="shrink-0 font-mono font-bold text-foreground"
                  title={`${co2Label(co2Kg)} across ${formatKm(mission.co2DistanceKm ?? 0)} driven`}
                >
                  {co2.value} {co2.unit}
                </span>
              </>
            )}
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
