import { Package } from '@/design-system/icons';
import { Badge, Card } from '@/design-system';
import { formatDate } from '@/utils';
import type { SpotlightShipment } from '../../contracts';
import { CardHeading } from '../../charts';

/**
 * The most recent shipment still in play.
 *
 * The progress bar runs the whole lifecycle, not the road: a shipment sitting
 * at "delivered" is around four fifths done, because the empty container still
 * has to come back. That is the distinction the empty-return section exists to
 * chase, and the bar should not contradict it by showing 100%.
 */

export interface LatestShipmentCardProps {
  shipment?: SpotlightShipment;
  onSeeAll?: () => void;
  onOpen?: (shipment: SpotlightShipment) => void;
}

export function LatestShipmentCard({ shipment, onSeeAll, onOpen }: LatestShipmentCardProps) {
  return (
    <Card variant="default" padding="lg" className="gap-5">
      <CardHeading
        title="Latest shipment"
        icon={<Package className="size-4" />}
        actions={
          onSeeAll ? (
            <button
              type="button"
              onClick={onSeeAll}
              className="rounded-sm text-[13px] font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
            >
              See all
            </button>
          ) : null
        }
      />

      {!shipment ? (
        <p className="py-4 text-xs text-muted-foreground">
          Nothing is currently open for this shipper in the selected period.
        </p>
      ) : (
        <div className="flex items-start gap-4">
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={onOpen ? () => onOpen(shipment) : undefined}
                disabled={!onOpen}
                className="rounded-sm text-lg font-semibold leading-none tracking-tight text-foreground transition-colors enabled:hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary disabled:cursor-default"
              >
                {shipment.reference}
              </button>
              <Badge intent={shipment.isLate ? 'destructive' : 'primary'} size="sm">
                {shipment.isLate ? 'Delayed' : shipment.stageLabel}
              </Badge>
            </div>

            <p className="truncate text-[13px] text-muted-foreground">
              {shipment.destinationName}
            </p>

            <ProgressTrack progress={shipment.progress} />

            <p className="text-xs text-muted-foreground">
              {shipment.etaAt
                ? `ETA ${formatDate(shipment.etaAt, 'dateTime')}`
                : 'No prediction yet'}
            </p>
          </div>

          <DestinationThumb shipment={shipment} />
        </div>
      )}
    </Card>
  );
}

/**
 * The lifecycle bar, with the head of the fill drawn as a chevron.
 *
 * A plain rounded fill reads as a level — how full something is. The arrow
 * head says the value is travelling, which is what a shipment's progress
 * actually is, and it marks the exact position more precisely than the end of
 * a rounded bar can.
 */
function ProgressTrack({ progress }: { progress: number }) {
  const pct = Math.round(progress * 100);

  return (
    <div className="flex items-center gap-2.5">
      <div
        className="relative h-1.5 flex-1 rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={pct}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label="Shipment lifecycle progress"
      >
        <div
          className="h-full rounded-full bg-primary transition-[width] duration-700 ease-out motion-reduce:transition-none"
          style={{ width: `${pct}%` }}
        />
        <span
          className="absolute top-1/2 flex size-4 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-surface text-primary transition-[left] duration-700 ease-out motion-reduce:transition-none"
          style={{ left: `${pct}%` }}
          aria-hidden
        >
          <svg viewBox="0 0 12 12" className="size-3" fill="currentColor">
            <path d="M3.5 1.5 9 6l-5.5 4.5V1.5Z" />
          </svg>
        </span>
      </div>
      <span className="shrink-0 text-xs font-semibold tabular-nums text-muted-foreground">
        {pct}%
      </span>
    </div>
  );
}

/**
 * A schematic of where the shipment is headed.
 *
 * Not a second live map: a full tile renderer for a 112px thumbnail is a lot of
 * weight for a decoration, and the hero map above already carries the real
 * geography. This is a marker on an abstract street grid — a locator, and
 * honest about being one.
 *
 * Inverted against the page so it reads as a map rather than an empty panel,
 * the same inversion the card icons use.
 */
function DestinationThumb({ shipment }: { shipment: SpotlightShipment }) {
  return (
    <div
      className="relative size-28 shrink-0 overflow-hidden rounded-lg bg-foreground"
      role="img"
      aria-label={`Destination: ${shipment.destinationName}`}
    >
      <svg viewBox="0 0 112 112" className="size-full text-background" aria-hidden>
        <g stroke="currentColor" strokeWidth="1.5" opacity="0.22">
          <path d="M-4 30h120M-4 74h120M26 -4v120M76 -4v120" />
          <path d="M-4 104 54 46l62 30" strokeWidth="2.5" />
        </g>
      </svg>
      <span className="absolute left-1/2 top-1/2 flex size-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-sm">
        <svg viewBox="0 0 24 24" className="size-4" fill="none" aria-hidden>
          <path
            d="M12 21s7-5.5 7-11a7 7 0 1 0-14 0c0 5.5 7 11 7 11Z"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinejoin="round"
          />
          <circle cx="12" cy="10" r="2.4" fill="currentColor" />
        </svg>
      </span>
    </div>
  );
}
