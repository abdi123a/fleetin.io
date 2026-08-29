import { forwardRef, type HTMLAttributes } from 'react';
import {
  ChevronRight,
  DollarSign,
  MapPin,
  ArrowRight,
  MoreVertical,
} from '@/design-system/icons';

import { Card } from './Card';
import { CornerBadge, type CornerBadgeProps } from './CornerBadge';
import { Avatar } from '../Avatar/Avatar';
import { CompanyAvatar } from '../Display/Identity/Identity';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '../DropdownMenu/DropdownMenu';
import { cn } from '@/utils';

export interface ShipmentCardProps extends HTMLAttributes<HTMLDivElement> {
  /** Shipment / Booking ID (e.g. "1174") */
  shipmentNumber: string;
  /** Booking number alias — kept for back-compat, unused in new layout */
  bookingNumber?: string;
  /** Origin / pickup location */
  origin: string;
  /** Destination / dropoff location */
  destination: string;
  /** Shipper company name */
  organization: string;
  /** Customer / contact name (shown as "By: …") */
  createdBy: string;
  /** DPCS reference code */
  dpcsReference?: string;
  /** Pickup date + time string */
  date: string;
  /** Cargo goods description */
  goodsType: string;
  /** Weight + cargo type summary (e.g. "22t · Refrigerated") */
  goodsWeight: string;
  /** Transporter company name */
  vehicleType: string;
  /** Transporter company logo URL — one logo per carrier across the product */
  transporterLogoUrl?: string;
  /** Transporter fleet code (e.g. "GLF-TRK-09") */
  vehicleSpecs?: string;
  /** Assigned driver name */
  driverName?: string;
  /** Truck plate (e.g. "298D405") */
  truckPlate?: string;
  /** Estimated distance (e.g. "215 km") */
  distance?: string;
  /** Estimated duration (e.g. "4h 10m") */
  duration?: string;
  /** Payment status label */
  paymentStatus?: string;
  /** Primary status badge label */
  status?: string;
  /**
   * Primary status badge color intent.
   *
   * `container-*` is the app-wide container scale (teal while the box is loaded,
   * brand yellow once it is stripped, grey once it is home) — see
   * `@/lib/containerState`. A card showing a containerized shipment should use
   * it rather than the ladder colours, so the same box reads the same here as
   * it does on the booking cards inside the shipment.
   */
  statusIntent?:
    | 'orange'
    | 'green'
    | 'blue'
    | 'slate'
    | 'red'
    | 'container-full'
    | 'container-empty'
    | 'container-returned';
  /**
   * 0–100, how far through its job this shipment is.
   *
   * Given, the card prints the figure under the status chip: the chip names the
   * stage once and this says how far along it is, instead of a second chip
   * repeating the same fact in a different vocabulary.
   */
  progressPercent?: number;
  /** Corner tab colour — teal for an ordinary card, e.g. `orange` to flag one card as the standout in a list. */
  cornerIntent?: CornerBadgeProps['intent'];
  /** Optional cancel callback */
  onCancel?: () => void;
  /** Make entire card clickable */
  clickable?: boolean;
  /**
   * `comfortable` — default card proportions.
   * `compact` — same design, slightly shorter.
   * `thin` — same design language in a single short strip for split lists.
   */
  density?: 'comfortable' | 'compact' | 'thin';

  // --- legacy props kept for back-compat (ignored in new layout) ---
  layout?: 'stack' | 'row';
  time?: string;
  editableGoods?: boolean;
  totalBids?: string | number;
  shipmentType?: string;
  createdByInitials?: string;
  hideFromAdda?: boolean;
  onHideFromAddaChange?: (checked: boolean) => void;
  biddingClosed?: boolean;
  uninvoiced?: boolean;
  verified?: boolean;
}

export const ShipmentCard = forwardRef<HTMLDivElement, ShipmentCardProps>(
  function ShipmentCard(
    {
      shipmentNumber,
      bookingNumber,
      origin,
      destination,
      organization,
      createdBy,
      dpcsReference,
      date,
      goodsType,
      goodsWeight,
      vehicleType,
      transporterLogoUrl,
      vehicleSpecs,
      driverName,
      truckPlate,
      distance,
      duration,
      paymentStatus,
      status = 'Created',
      statusIntent = 'orange',
      progressPercent,
      cornerIntent = 'teal',
      onCancel,
      clickable = false,
      density = 'comfortable',
      className,
      onClick,
      ...props
    },
    ref,
  ) {
    const statusBgClasses = {
      orange: 'bg-warning text-white',
      green: 'bg-success text-white',
      blue: 'bg-info text-white',
      slate: 'bg-secondary text-secondary-foreground',
      red: 'bg-destructive text-destructive-foreground',
      'container-full': 'bg-container-full text-container-full-foreground',
      'container-empty': 'bg-container-empty text-container-empty-foreground',
      'container-returned': 'bg-container-returned text-container-returned-foreground',
    };

    const compact = density === 'compact';
    const thin = density === 'thin';

    if (thin) {
      return (
        <Card
          ref={ref}
          onClick={onClick}
          className={cn(
            'relative overflow-hidden rounded-lg border border-border/80 bg-card text-foreground shadow-2xs transition duration-200 hover:shadow-md group/card',
            clickable && 'cursor-pointer hover:border-primary/40',
            className,
          )}
          {...props}
        >
          <div className="absolute top-0 left-0 z-10 select-none">
            <CornerBadge
              label={`#${bookingNumber || shipmentNumber}`}
              intent={cornerIntent}
              position="top"
              size="sm"
            />
          </div>

          <div className="flex flex-col gap-2 px-3 pb-2.5 pt-7">
            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-2">
                <Avatar
                  fallback={organization.substring(0, 2).toUpperCase()}
                  size="xs"
                  className="shrink-0 border border-primary/20 bg-primary/10 font-black text-primary"
                />
                <div className="min-w-0">
                  <div className="truncate text-xs font-extrabold leading-tight text-foreground">
                    {organization}
                  </div>
                  <div className="truncate text-[10px] text-muted-foreground">By: {createdBy}</div>
                </div>
              </div>
              {status ? (
                <span
                  className={cn(
                    'shrink-0 select-none rounded-full px-2 py-0.5 text-[9px] font-extrabold uppercase tracking-wider',
                    statusBgClasses[statusIntent],
                  )}
                >
                  {status}
                </span>
              ) : null}
            </div>

            <div className="flex items-center gap-1.5 rounded-md border border-border/50 bg-secondary/40 px-2.5 py-1.5 text-[11px]">
              <MapPin className="h-3 w-3 shrink-0 text-primary" />
              <span className="min-w-0 truncate font-semibold text-foreground">{origin}</span>
              <ArrowRight className="h-3 w-3 shrink-0 text-muted-foreground" />
              <MapPin className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="min-w-0 truncate font-semibold text-foreground">{destination}</span>
            </div>

            <div className="flex items-center justify-between gap-2">
              <div className="flex min-w-0 items-center gap-1.5 truncate text-[10px] text-muted-foreground">
                <span className="font-semibold text-foreground">{goodsType}</span>
                <span className="mx-0.5">·</span>
                <CompanyAvatar
                  src={transporterLogoUrl}
                  name={vehicleType}
                  fallback={vehicleType.substring(0, 2).toUpperCase()}
                  size="xs"
                  shape="circle"
                  className="shrink-0"
                />
                <span className="truncate font-medium text-foreground">{vehicleType}</span>
                {truckPlate ? (
                  <>
                    <span className="mx-0.5">·</span>
                    <span className="font-mono">{truckPlate}</span>
                  </>
                ) : null}
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick?.(e as never);
                }}
                className="h-7 shrink-0 cursor-pointer gap-0.5 rounded-md border-border/80 px-2 text-[10px] transition group-hover/card:border-primary/40 group-hover/card:bg-primary group-hover/card:text-primary-foreground"
              >
                <span>View</span>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </Card>
      );
    }

    return (
      <Card
        ref={ref}
        onClick={onClick}
        className={cn(
          'relative overflow-hidden rounded-lg border border-border/80 bg-card text-foreground shadow-2xs hover:shadow-md transition duration-200 group/card',
          clickable && 'cursor-pointer hover:border-primary/40',
          className,
        )}
        {...props}
      >
        {/* ── CORNER BADGE ── */}
        <div className="absolute top-0 left-0 z-10 select-none">
          {/* Says which kind of reference it is. It read "Shipment# " over
              whichever of the two was set, so a list of bookings announced
              each container as a shipment. */}
          <CornerBadge
            label={bookingNumber ? `Booking# ${bookingNumber}` : `Shipment# ${shipmentNumber}`}
            intent={cornerIntent}
            position="top"
          />
        </div>

        {/* ── CARD BODY ── */}
        <div
          className={cn(
            compact ? 'space-y-2.5 px-4 pb-3 pt-9' : 'space-y-3 px-4 pb-4 pt-10',
          )}
        >
          {/* ROW 1: Shipper + Status */}
          <div className="flex items-start justify-between gap-3">
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <Avatar
                fallback={organization.substring(0, 2).toUpperCase()}
                size="sm"
                className="shrink-0 border border-primary/20 bg-primary/10 font-black text-primary"
              />
              <div className="min-w-0">
                <div className="truncate text-sm font-extrabold leading-tight text-foreground">
                  {organization}
                </div>
                <div className="truncate text-[11px] text-muted-foreground">
                  By: {createdBy}
                  {dpcsReference && (
                    <>
                      <span className="mx-1 text-border">·</span>
                      <span className="font-mono font-semibold text-primary">{dpcsReference}</span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-1">
              {status && (
                <span
                  className={cn(
                    'select-none rounded-full px-2.5 py-0.5 text-[10px] font-extrabold uppercase tracking-wider',
                    statusBgClasses[statusIntent],
                  )}
                >
                  {status}
                </span>
              )}
              {progressPercent !== undefined && (
                <span
                  className="text-sm font-extrabold leading-none tabular-nums text-foreground"
                  title={`${Math.round(progressPercent)}% complete`}
                >
                  {Math.round(progressPercent)}%
                </span>
              )}
              {paymentStatus && (
                <Badge
                  variant="subtle"
                  intent="info"
                  size="sm"
                  className="px-2 py-0.5 font-mono text-[10px]"
                >
                  <DollarSign className="h-2.5 w-2.5" />
                  {paymentStatus}
                </Badge>
              )}
            </div>
          </div>

          {/* ROW 2: Route */}
          <div
            className={cn(
              'rounded-lg border border-border/50 bg-secondary/40',
              compact ? 'space-y-1 px-3 py-2' : 'space-y-1.5 px-3 py-2.5',
            )}
          >
            <div className="flex items-center gap-2 text-xs">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
              <span className="truncate font-semibold text-foreground">{origin}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">(Pickup)</span>
            </div>
            <div className="pl-1">
              <div
                className={cn(
                  'ml-1 w-0 border-l-2 border-dashed border-border/60',
                  compact ? 'h-1.5' : 'h-2.5',
                )}
              />
            </div>
            <div className="flex items-center gap-2 text-xs">
              <MapPin className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
              <span className="truncate font-semibold text-foreground">{destination}</span>
              <span className="shrink-0 text-[10px] text-muted-foreground">(Dropoff)</span>
            </div>
          </div>

          {/* ROW 3: Data grid — 4 columns when compact/long, 2 when tall */}
          <div
            className={cn(
              'gap-x-4 gap-y-2 border-t border-border/60 pt-2.5 text-xs',
              compact ? 'grid grid-cols-2 sm:grid-cols-4' : 'grid grid-cols-2 gap-y-3 pt-3',
            )}
          >
            <div className="min-w-0 space-y-0.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Pickup
              </span>
              <div className="text-[11px] font-bold text-foreground">{date}</div>
            </div>

            <div className="min-w-0 space-y-0.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Cargo
              </span>
              <div className="truncate text-[11px] font-bold text-foreground">{goodsType}</div>
              <div className="font-mono text-[10px] font-bold text-primary">{goodsWeight}</div>
            </div>

            <div className="min-w-0 space-y-0.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Transporter
              </span>
              <div className="flex min-w-0 items-center gap-1.5">
                <CompanyAvatar
                  src={transporterLogoUrl}
                  name={vehicleType}
                  fallback={vehicleType.substring(0, 2).toUpperCase()}
                  size="xs"
                  shape="circle"
                  className="shrink-0"
                />
                <div className="min-w-0 truncate text-[11px] font-bold text-foreground">
                  {vehicleType}
                </div>
              </div>
              {vehicleSpecs && (
                <div className="font-mono text-[10px] text-muted-foreground">{vehicleSpecs}</div>
              )}
            </div>

            <div className="min-w-0 space-y-0.5">
              <span className="block text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                Driver & Truck
              </span>
              <div className="truncate text-[11px] font-bold text-foreground">
                {driverName ?? <span className="italic text-warning-subtle-foreground">Unassigned</span>}
              </div>
              {truckPlate && (
                <div className="font-mono text-[10px] text-muted-foreground">{truckPlate}</div>
              )}
            </div>
          </div>

          {/* ROW 4: Distance + View button */}
          <div className="flex items-center justify-between border-t border-border/60 pt-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <ArrowRight className="h-3.5 w-3.5 shrink-0" />
              {distance && <span className="font-mono font-bold text-foreground">{distance}</span>}
              {duration && (
                <>
                  <span>·</span>
                  <span>{duration}</span>
                </>
              )}
            </div>

            <div className="flex items-center gap-1.5">
              {onCancel && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={(e) => {
                    e.stopPropagation();
                    onCancel();
                  }}
                  className="h-8 rounded-lg border-warning/40 px-3 text-xs text-warning-subtle-foreground hover:bg-warning-subtle"
                >
                  Cancel
                </Button>
              )}

              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={(e) => e.stopPropagation()}
                    className="h-8 w-8 shrink-0 rounded-md p-1.5 text-muted-foreground hover:text-foreground"
                  >
                    <MoreVertical className="h-4 w-4" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
                  <DropdownMenuItem>View details</DropdownMenuItem>
                  <DropdownMenuItem>Edit shipment</DropdownMenuItem>
                  {onCancel && (
                    <DropdownMenuItem variant="destructive" onClick={onCancel}>
                      Cancel shipment
                    </DropdownMenuItem>
                  )}
                </DropdownMenuContent>
              </DropdownMenu>

              <Button
                variant="outline"
                size="sm"
                onClick={(e) => {
                  e.stopPropagation();
                  onClick?.(e as never);
                }}
                className="h-8 shrink-0 cursor-pointer gap-1 rounded-lg border-border/80 px-3 text-xs transition group-hover/card:border-primary/40 group-hover/card:bg-primary group-hover/card:text-primary-foreground"
              >
                <span>View</span>
                <ChevronRight className="h-3 w-3" />
              </Button>
            </div>
          </div>
        </div>
      </Card>
    );
  },
);
