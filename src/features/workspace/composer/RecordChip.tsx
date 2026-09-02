import { useState } from 'react';
import { Link } from 'react-router-dom';

import { RecordPeekDialog } from '@/components/records/RecordPeekDialog';
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
  'success-deep': 'bg-success-deep text-success-deep-foreground',
  warning: 'bg-warning text-warning-foreground',
  'warning-deep': 'bg-warning-deep text-warning-deep-foreground',
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
   * Needed only where the chip sits inside a real `<a>` — the Inbox rows,
   * which are `<Link>`s. Nesting an anchor in an anchor is invalid HTML.
   *
   * NOT needed inside a row that merely has an `onClick`: the chip stops
   * propagation, so the row's handler does not also fire. That distinction
   * matters — a chip that opens the actual truck is worth clicking, and making
   * every chip in a list inert to avoid one conflict took that away.
   */
  static?: boolean;
  /**
   * The chip is sitting on a filled brand surface — your own message bubble.
   *
   * Its normal shell is a sunken grey plate, which on teal reads as a hole.
   * Inverted, it becomes a white plate with teal ink: the same pair `IconChip`'s
   * `on-teal` variant and the shipment masthead's actions already use.
   */
  inverted?: boolean;
  /** The message this chip sits in, quoted inside the peek. */
  context?: { author?: string | null; text: string; at?: string | null } | null;
  className?: string;
}

/**
 * A reference to a real Fleetin row, wearing that row's current status.
 *
 * This is the whole argument for Workspace over a group chat. `609196` in a
 * WhatsApp message is six characters somebody has to go and look up; here it
 * says *Booking 609196, Delivered* in the green the booking wears on its own
 * card, and one click opens that booking's sheet on its shipment.
 *
 * **Every chip peeks first.** A reference in a message used to be a one-way
 * door: click it and you have your answer and no longer have the conversation
 * that asked the question. So a chip opens `RecordPeekDialog` over whatever you
 * are reading — the record, its status and the handful of facts that say which
 * one it is — and `View` inside that panel is the trip, taken on purpose.
 *
 * It is still an `<a>` underneath for the types that have a page, so
 * middle-click and "open in new tab" keep working and the status bar still
 * shows where it goes; the click is intercepted, not the link.
 */
export function RecordChip({
  recordType, reference, label, status, parentRef, recordId, missing = false,
  size = 'md', static: isStatic = false, inverted = false, context, className,
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
  const [peeking, setPeeking] = useState(false);

  const shell = cn(
    'inline-flex max-w-full items-center gap-1.5 rounded-md border align-baseline font-medium',
    small ? 'px-1.5 py-0.5 text-[0.6875rem]' : 'px-2 py-1 text-xs',
    missing
      ? 'border-dashed border-border text-muted-foreground line-through'
      : inverted
        ? 'border-transparent bg-white text-primary-bold'
        : 'border-border bg-surface-sunken text-foreground',
    !asText && [
      'transition-colors duration-fast',
      inverted ? 'hover:bg-white/90' : 'hover:border-primary hover:bg-primary-subtle',
      'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
    ],
    className,
  );

  const inner = (
    <>
      <Icon
        className={cn('shrink-0', inverted ? 'text-primary' : 'text-muted-foreground', small ? 'size-3' : 'size-3.5')}
        aria-hidden
      />
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
    <>
      <Link
        to={recordHref(recordType, reference, { parentRef, recordId })}
        title={title}
        className={shell}
        onClick={(event) => {
          /* The row around this often has its own `onClick`. Without this,
             clicking the chip fires twice — once here and once to wherever the
             row goes, and the row wins. */
          event.stopPropagation();
          /* A plain click peeks instead of navigating. Modified clicks are left
             alone on purpose: cmd/ctrl/middle-click and "open in new tab" are
             how somebody deliberately asks for the page in a second tab, and
             swallowing those would take a working browser affordance away. */
          if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
          event.preventDefault();
          setPeeking(true);
        }}
      >
        {inner}
      </Link>
      {peeking ? (
        <RecordPeekDialog
          recordType={recordType}
          reference={reference}
          label={label}
          status={status}
          parentRef={parentRef}
          recordId={recordId}
          context={context}
          onClose={() => setPeeking(false)}
        />
      ) : null}
    </>
  );
}
