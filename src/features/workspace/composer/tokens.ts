import { buildPath, ROUTES } from '@/config/routes';

import type { RecordType } from '../contracts';

/**
 * The one token grammar a Workspace message body uses.
 *
 *   @[user:9f3c…|Ahmed Farah]
 *   @[shipment:260701]
 *   @[vehicle:MO-2022-DJ|VEH-00067]
 *
 * Bodies are STORED with tokens intact and rendered at read time. Storing
 * rendered HTML instead would make every change to how a chip looks a data
 * migration, and would hand the database an escaping problem it does not need.
 *
 * The `|label` half is a courtesy to anyone reading raw text and is never
 * trusted — a name changes, the id resolves. `tokens.util.ts` on the backend
 * parses the same grammar to raise mentions on write.
 */

const TOKEN = /@\[([a-z_]+):([^\]|]+)(?:\|([^\]]*))?\]/gi;

/**
 * Separator between a reference and its parent inside a token:
 * `@[booking:609196~816996|MSCU5421350]`.
 *
 * A booking has no page of its own — it opens as a sheet on its shipment — so
 * a booking token has to carry the shipment reference or the chip has nowhere
 * real to point. `~` because it appears in no Fleetin reference, no plate and
 * no ISO 6346 container number.
 */
const PARENT_SEP = '~';

/** Token kind → the record type it names. `user` is handled separately. */
const RECORD_KIND: Record<string, RecordType> = {
  shipment: 'SHIPMENT',
  booking: 'BOOKING',
  vehicle: 'VEHICLE',
  driver: 'DRIVER',
  partner: 'PARTNER',
  transporter: 'PARTNER',
  shipper: 'SHIPPER',
  invoice: 'INVOICE',
  hold: 'PAYOUT_HOLD',
  cycle: 'EMPTY_RETURN_CYCLE',
  chain: 'EMPTY_RETURN_CHAIN',
};

const KIND_OF_RECORD: Record<RecordType, string> = {
  SHIPMENT: 'shipment',
  BOOKING: 'booking',
  VEHICLE: 'vehicle',
  DRIVER: 'driver',
  PARTNER: 'partner',
  SHIPPER: 'shipper',
  INVOICE: 'invoice',
  PAYOUT_HOLD: 'hold',
  EMPTY_RETURN_CYCLE: 'cycle',
  EMPTY_RETURN_CHAIN: 'chain',
};

export type BodySegment =
  | { kind: 'text'; text: string }
  | { kind: 'user'; userId: string; label: string }
  | { kind: 'record'; recordType: RecordType; reference: string; parentRef: string | null; label: string };

/** Split a stored body into what a renderer draws. Order is preserved. */
export function parseBody(body: string): BodySegment[] {
  const segments: BodySegment[] = [];
  let cursor = 0;

  for (const match of body.matchAll(TOKEN)) {
    const start = match.index ?? 0;
    if (start > cursor) segments.push({ kind: 'text', text: body.slice(cursor, start) });

    const rawKind = (match[1] ?? '').toLowerCase();
    const value = (match[2] ?? '').trim();
    const label = (match[3] ?? '').trim();

    const recordType = RECORD_KIND[rawKind];
    if (rawKind === 'user') {
      segments.push({ kind: 'user', userId: value, label: label || 'Someone' });
    } else if (recordType) {
      const [reference = value, parentRef] = value.split(PARENT_SEP);
      segments.push({ kind: 'record', recordType, reference, parentRef: parentRef ?? null, label: label || reference });
    } else {
      /* An unknown kind renders as the text it already is, rather than
         vanishing. A body should never lose words to a parser. */
      segments.push({ kind: 'text', text: match[0] });
    }
    cursor = start + match[0].length;
  }

  if (cursor < body.length) segments.push({ kind: 'text', text: body.slice(cursor) });
  return segments;
}

export function serializeUser(userId: string, fullName: string): string {
  return `@[user:${userId}|${fullName}]`;
}

export function serializeRecord(
  recordType: RecordType,
  reference: string,
  label?: string | null,
  parentRef?: string | null,
): string {
  const kind = KIND_OF_RECORD[recordType];
  const value = parentRef ? `${reference}${PARENT_SEP}${parentRef}` : reference;
  return label ? `@[${kind}:${value}|${label}]` : `@[${kind}:${value}]`;
}

/** Rebuild a body from segments — the other half of the round trip. */
export function serializeBody(segments: BodySegment[]): string {
  return segments
    .map((s) => {
      if (s.kind === 'text') return s.text;
      if (s.kind === 'user') return serializeUser(s.userId, s.label);
      return serializeRecord(s.recordType, s.reference, s.label === s.reference ? null : s.label, s.parentRef);
    })
    .join('');
}

/** The user ids named in a body, de-duplicated. */
export function mentionedUserIds(body: string): string[] {
  return [...new Set(parseBody(body).filter((s) => s.kind === 'user').map((s) => (s as { userId: string }).userId))];
}

export interface RecordHrefOptions {
  /** A booking's shipment reference. Without it a booking chip has no home. */
  parentRef?: string | null;
  /** The row's uuid — what `?openBooking=` matches on. */
  recordId?: string | null;
}

/**
 * Where a record chip points.
 *
 * **Bookings are the interesting case.** A booking has no page: it opens as a
 * sheet on its shipment, keyed by `?openBooking=<uuid>` — the mechanism
 * `ShipmentOverviewPage` already has. Sending somebody to the shipment without
 * that parameter would leave them scanning twenty container cards for the one
 * the task is about, and `/bookings/:id` — which this file used to build — is a
 * route nothing else in the app links to, rendering the shipment page against a
 * booking reference it can never resolve. It always 404'd.
 *
 * Only some types have a page at all. Vehicles and drivers open in a sheet on
 * their list page with no deep link, and empty returns live in a module dialog;
 * for those the list page is the honest destination. Returning `null` would
 * render a chip that looks clickable and is not, which is worse.
 */
export function recordHref(
  recordType: RecordType,
  reference: string,
  options: RecordHrefOptions = {},
): string {
  const { parentRef, recordId } = options;

  switch (recordType) {
    case 'SHIPMENT':
      return buildPath(ROUTES.shipmentOverview, { id: reference });
    case 'BOOKING': {
      if (!parentRef) return ROUTES.shipmentsList;
      const path = buildPath(ROUTES.shipmentOverview, { id: parentRef });
      return recordId ? `${path}?openBooking=${encodeURIComponent(recordId)}` : path;
    }
    case 'PARTNER':
      return buildPath(ROUTES.partnerDetail, { id: reference });
    case 'SHIPPER':
      return buildPath(ROUTES.shipperDetail, { id: reference });
    case 'INVOICE':
      return buildPath(ROUTES.financeInvoiceDetail, { invoiceId: reference });
    case 'VEHICLE':
      return ROUTES.vehicles;
    case 'DRIVER':
      return ROUTES.drivers;
    case 'PAYOUT_HOLD':
      return parentRef ? buildPath(ROUTES.financeShipmentDetail, { shipmentId: parentRef }) : ROUTES.finance;
    case 'EMPTY_RETURN_CYCLE':
    case 'EMPTY_RETURN_CHAIN':
      return ROUTES.emptyReturnsCycles;
    default:
      return ROUTES.workspace;
  }
}
