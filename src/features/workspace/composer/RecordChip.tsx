import { Link } from 'react-router-dom';

import {
  Building2, ContainerIcon, Link2, Package, PauseCircle, Receipt, Repeat, Truck, UserRound, Warehouse,
} from '@/design-system/icons';
import { cn } from '@/utils';

import { RECORD_TYPE_LABEL, type RecordType } from '../contracts';
import { recordStatusIntent, type RecordStatusIntent } from './recordStatus';
import { recordHref } from './tokens';

/**
 * One glyph per record type.
 *
 * The icon carries the *kind*, so hue does not have to. That matters here:
 * colour in this app is semantic — teal is the brand, green is fine, amber is
 * waiting, red is stopped — and spending a hue on "this is a vehicle" would
 * leave the status with nothing to say.
 */
const TYPE_ICON: Record<RecordType, typeof Package> = {
  SHIPMENT: Package,
  BOOKING: ContainerIcon,
  VEHICLE: Truck,
  DRIVER: UserRound,
  PARTNER: Building2,
  SHIPPER: Warehouse,
  INVOICE: Receipt,
  PAYOUT_HOLD: PauseCircle,
  EMPTY_RETURN_CYCLE: Repeat,
  EMPTY_RETURN_CHAIN: Link2,
};

/** The status pill's colours, from the same tokens `Badge` uses. */
const STATUS_TONE: Record<RecordStatusIntent, string> = {
  primary: 'bg-primary text-primary-foreground',
  success: 'bg-success text-success-foreground',
  warning: 'bg-warning text-warning-foreground',
  destructive: 'bg-destructive text-destructive-foreground',
  info: 'bg-info text-info-foreground',
  default: 'bg-secondary text-secondary-foreground',
};

export interface RecordChipProps {
  recordType: RecordType;
  reference: string;
  /** The second line — a shipper's name, a container number. */
  label?: string | null;
  /** The record's live status. Drives the chip's only splash of colour. */
  status?: string | null;
  /** A booking's shipment reference — what lets it open its own sheet. */
  parentRef?: string | null;
  /** The row's uuid, for `?openBooking=`. */
  recordId?: string | null;
  /** The record was deleted. Renders as text, never a link into a 404. */
  missing?: boolean;
  size?: 'sm' | 'md';
  /**
   * Draws the chip as plain text instead of a link.
   *
   * Required wherever the chip sits INSIDE something already clickable — a
   * task row that is itself a link. Nesting an anchor in an anchor is invalid
   * HTML, and it puts two click targets on one spot, which is the same reason
   * the crew stack renders read-only on row cards.
   */
  static?: boolean;
  className?: string;
}

/**
 * A reference to a real Fleetin row, wearing that row's current status.
 *
 * This is the whole argument for Workspace over a group chat. `609196` in a
 * WhatsApp message is six characters somebody has to go and look up; here it
 * says *Booking 609196, Delivered* in the green the booking wears on its own
 * card, and one click opens that booking's sheet on its shipment.
 */
export function RecordChip({
  recordType, reference, label, status, parentRef, recordId, missing = false,
  size = 'md', static: isStatic = false, className,
}: RecordChipProps) {
  const Icon = TYPE_ICON[recordType];
  const typeLabel = RECORD_TYPE_LABEL[recordType];
  const title = [
    `${typeLabel} · ${reference}`,
    label && label !== reference ? `— ${label}` : null,
    status ? `(${status})` : null,
    missing ? '— no longer exists' : null,
  ].filter(Boolean).join(' ');

  const small = size === 'sm';
  const asText = isStatic || missing;

  const shell = cn(
    'inline-flex max-w-full items-center gap-1.5 rounded-md border align-baseline font-medium',
    small ? 'px-1.5 py-0.5 text-[0.6875rem]' : 'px-2 py-1 text-xs',
    missing
      ? 'border-dashed border-border text-muted-foreground line-through'
      : 'border-border bg-surface-sunken text-foreground',
    !asText && [
      'transition-colors duration-fast',
      'hover:border-primary hover:bg-primary-subtle',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
    ],
    className,
  );

  const inner = (
    <>
      <Icon className={cn('shrink-0 text-muted-foreground', small ? 'size-3' : 'size-3.5')} aria-hidden />
      <span className="truncate font-mono">{reference}</span>
      {status ? (
        <span
          className={cn(
            'shrink-0 rounded-sm font-semibold uppercase tracking-wide',
            small ? 'px-1 py-px text-[0.5625rem]' : 'px-1.5 py-px text-[0.625rem]',
            STATUS_TONE[recordStatusIntent(recordType, status)],
          )}
        >
          {status}
        </span>
      ) : null}
    </>
  );

  if (asText) {
    return <span title={title} className={shell}>{inner}</span>;
  }

  return (
    <Link to={recordHref(recordType, reference, { parentRef, recordId })} title={title} className={shell}>
      {inner}
    </Link>
  );
}
