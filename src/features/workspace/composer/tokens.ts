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

/**
 * A stored body as a person reads it — for anywhere the message is quoted
 * rather than rendered: a peek panel's "what was said", a notification, a
 * tooltip. Tokens become the words they stand for, so `@[user:u-1|Hodan]` is
 * `@Hodan` and `@[shipment:853220]` is `853220`, and nothing turns into
 * bracket soup in a context that cannot draw chips.
 */
export function plainBody(body: string): string {
  return parseBody(body)
    .map((segment) => {
      if (segment.kind === 'text') return segment.text;
      if (segment.kind === 'user') return `@${segment.label}`;
      return segment.label || segment.reference;
    })
    .join('')
    .replace(/\s+/g, ' ')
    .trim();
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
 * **Nothing here settles for a list page.** Several of these records have no
 * page of their own — a vehicle, a driver and an empty container each open as
 * a sheet or a dialog on a list — and the first version of this function sent
 * people to that list to go and find the row themselves. On a fleet of two
 * hundred trucks that is not a link, it is a search request. Each of them now
 * carries the parameter that opens the right one.
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
      /* The REFERENCE, not the uuid. The shipment page matches on either
         (`b.id === openBooking || b.bookingNumber === openBooking`), and the
         uuid was winning whenever a task link carried one — which put
         `?openBooking=7ffe05db-bd88-43b5-84b7-3196567fd6b9` in the address bar
         of a link somebody is expected to read, recognise and paste to a
         colleague. `?openBooking=609196` is the same click and the number is
         the one printed on the chip they just pressed. */
      const key = reference || recordId;
      return key ? `${path}?openBooking=${encodeURIComponent(key)}` : path;
    }
    case 'PARTNER':
      return buildPath(ROUTES.partnerDetail, { id: reference });
    case 'SHIPPER':
      return buildPath(ROUTES.shipperDetail, { id: reference });
    case 'INVOICE':
      return buildPath(ROUTES.financeInvoiceDetail, { invoiceId: reference });
    /* `?vehicle=` and `?driver=` open that row's sheet on the list page and
       match on id, reference or plate. The drivers one already existed — the
       transporter roster links to it. Reference first, uuid only as a fallback,
       for the same reason as the booking above: `?vehicle=298D405` is a
       readable link, `?vehicle=<uuid>` is 36 characters of noise. */
    case 'VEHICLE':
      return `${ROUTES.vehicles}?vehicle=${encodeURIComponent(reference || recordId || '')}`;
    case 'DRIVER':
      return `${ROUTES.drivers}?driver=${encodeURIComponent(reference || recordId || '')}`;
    case 'PAYOUT_HOLD':
      return parentRef ? buildPath(ROUTES.financeShipmentDetail, { shipmentId: parentRef }) : ROUTES.finance;
    /* The Empty Container module keys its dialog by REFERENCE, not uuid — see
       `mappers.ts`, where every record's `id` is `booking.reference` or
       `cycle.reference`. So this passes the reference deliberately. */
    case 'EMPTY_RETURN_CYCLE':
    case 'EMPTY_RETURN_CHAIN':
      return `${ROUTES.emptyReturnsCycles}?container=${encodeURIComponent(reference)}`;
    default:
      return ROUTES.workspace;
  }
}


/* ── What the writer sees, versus what gets stored ──────────────────────────
 *
 * The tokens above are STORAGE. Putting one in a textarea means somebody
 * composing a message stares at
 *
 *     @[user:d700356e-a0a4-48bf-b878-cbd4239bc1a5|Souad Mohamed]
 *
 * which is a uuid where a name should be. So the composer inserts a short
 * DISPLAY form — `@Souad Mohamed`, `#609196` — remembers which display stands
 * for which token, and swaps them back on send.
 *
 * A plain `<textarea>` is what makes this the right trade. It cannot render a
 * chip inline, and the alternatives are worse: a mirrored highlight layer
 * needs the visible and stored text to be the same width, which they are not,
 * and a `contenteditable` hands you a caret and undo stack you have to rebuild
 * by hand. This keeps native editing and shows a readable name.
 *
 * What it costs: a display typed by hand rather than picked resolves to
 * nothing and stays plain text. That degrades to exactly what it looks like,
 * which is the right failure.
 */

export function displayUser(fullName: string): string {
  return `@${fullName}`;
}

export function displayRecord(reference: string): string {
  return `#${reference}`;
}

/**
 * Swap every remembered display back to its token, longest first.
 *
 * Longest first because one name can be a prefix of another — replacing
 * "@Ali" before "@Ali Hassan" would leave a stray "Hassan" outside the token.
 */
export function materializeBody(text: string, tokensByDisplay: Map<string, string>): string {
  const displays = [...tokensByDisplay.keys()].sort((a, b) => b.length - a.length);
  let out = text;
  for (const display of displays) {
    const token = tokensByDisplay.get(display);
    if (token) out = out.split(display).join(token);
  }
  return out;
}
