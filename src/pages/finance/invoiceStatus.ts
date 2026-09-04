import { Ban, CheckCircle, Clock, Send } from '@/design-system/icons';
import type { RecordStatusOption, RecordStatusTone } from '@/components/common';
import type { InvoiceRecord } from '@/features/finance';

/**
 * Where a document stands, in the same five-tone grammar the four directories
 * use — so a billing status reads the way a vehicle or partner status does.
 *
 *   Draft     — written, not sent      → **amber**, it is somebody's move
 *   Sent      — with the client        → **blue**, out in the world
 *   Paid      — money in               → **green**
 *   Overdue   — past its date, unpaid  → **red**, the loud one
 *   Cancelled — raised in error        → **grey**, settled, stop asking
 *
 * `Overdue` is DERIVED, never stored: it is `Sent` plus a date that has passed,
 * and storing it would mean a nightly job to flip rows and a window in which
 * the badge lies. Deriving it means the list is right the moment it renders.
 */
export type InvoiceStatusKey = 'Draft' | 'Sent' | 'Paid' | 'Overdue' | 'Cancelled';

export const INVOICE_STATUS_OPTIONS: ReadonlyArray<RecordStatusOption<InvoiceStatusKey>> = [
  /*
   * `Paid` carries an explicit glyph so the badge prints its WORD.
   *
   * `RecordStatusBadge` collapses an `ok` tone with no icon into the bare
   * verification tick — right for a shipper, where "verified" is the only
   * thing green can mean, and wrong here: a green tick alone in a money column
   * could as easily read as "approved" or "sent". A bill either says Paid or
   * it says nothing useful.
   */
  { value: 'Paid', label: 'Paid', tone: 'ok', icon: CheckCircle },
  { value: 'Overdue', label: 'Overdue', tone: 'stopped' },
  { value: 'Sent', label: 'Sent', tone: 'busy', icon: Send },
  { value: 'Draft', label: 'Draft', tone: 'waiting', icon: Clock },
  { value: 'Cancelled', label: 'Cancelled', tone: 'closed', icon: Ban },
];

export function invoiceStatusOption(key: InvoiceStatusKey): RecordStatusOption<InvoiceStatusKey> {
  return (
    INVOICE_STATUS_OPTIONS.find((option) => option.value === key) ?? {
      value: key,
      label: key,
      tone: 'waiting',
    }
  );
}

export function toneOf(key: InvoiceStatusKey): RecordStatusTone {
  return invoiceStatusOption(key).tone;
}

/**
 * A document's live status.
 *
 * A quotation is never overdue — it expires, which is not a debt — so the
 * lateness test only applies to invoices. Getting that wrong would paint a
 * stale quote red and put it at the top of a chasing list.
 */
export function statusOf(doc: InvoiceRecord, now = Date.now()): InvoiceStatusKey {
  if (doc.status === 'Cancelled') return 'Cancelled';
  if (doc.status === 'Paid') return 'Paid';
  if (doc.kind === 'invoice' && new Date(doc.contractDeadline).getTime() < now) return 'Overdue';
  return doc.sentAt ? 'Sent' : 'Draft';
}

/** The `CheckCircle` re-export keeps every billing glyph resolved from one file. */
export { CheckCircle };
