import { useNavigate, useParams } from 'react-router-dom';

import { ArrowLeft, Printer } from '@/design-system/icons';
import { Button, Card, Skeleton } from '@/design-system';
import { RecordRaise } from '@/features/workspace';
import { useSystemSettings } from '@/features/settings';
import { amountInWords, fmtDjfPlain, fmtDocDate, fromMinorUnits } from '@/lib/finance';
import {
  useCancelInvoice,
  useInvoice,
  useMarkInvoicePaid,
  useMarkInvoiceSent,
  type InvoiceRecord,
} from '@/features/finance';
import { useShipmentRaw } from '@/features/shipments/api/queries';

import {
  DocumentFooter,
  DocumentLetterhead,
  DocumentSignatureBlock,
  DocumentStampWatermark,
  useRemittanceAccount,
} from './components/documentChrome';

/**
 * THE CLIENT'S DOCUMENT — one sheet, two faces.
 *
 * A **proforma** shows the client what the job will be and what it will cost,
 * before it runs. An **invoice** is the same shipment once the work is real.
 * They print on the same paper because they describe the same thing, and a
 * client who compares them should see the figures agree at a glance.
 *
 * The differences are exactly three, and all of them are about whether money
 * is owed: the title, the closing line, and whether the bank block appears at
 * all. A proforma that shows "Amount due" and account details is a proforma
 * somebody will pay against, and then the real invoice arrives and is paid
 * twice.
 *
 * Every figure here is read from the stored document, never recomputed. A
 * container added to the shipment tomorrow, or a renegotiated percentage, must
 * not silently restate a sheet the client is already holding.
 */
export function InvoiceDocumentPage() {
  const { invoiceId = '' } = useParams();
  const navigate = useNavigate();

  const { data: invoice, isLoading } = useInvoice(invoiceId);
  const { data: shipment } = useShipmentRaw(invoice?.shipmentId ?? undefined);
  const markSent = useMarkInvoiceSent();
  const markPaid = useMarkInvoicePaid();
  const cancel = useCancelInvoice();

  if (isLoading) {
    return (
      <div className="flex flex-col gap-4">
        <Skeleton className="h-9 w-40" />
        <Skeleton className="h-[260mm] w-full max-w-[210mm] rounded-lg" />
      </div>
    );
  }

  if (!invoice) {
    return <Card className="p-8 text-center text-sm text-muted-foreground">Document not found.</Card>;
  }

  const isProforma = invoice.kind === 'proforma';
  const settled = invoice.status === 'Paid';
  const withdrawn = invoice.status === 'Cancelled';

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {/* Screen-only chrome. `print:hidden` throughout — the sheet below is
          the whole of what comes out of the printer. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <button
          type="button"
          onClick={() => navigate('/finance/invoices')}
          className="flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="size-4" />
          All documents
        </button>

        <div className="flex flex-wrap items-center gap-2">
          <RecordRaise recordType="INVOICE" recordId={invoice.id} recordRef={invoice.number} size="sm" />

          {!withdrawn && !invoice.sentAt ? (
            <Button variant="outline" size="sm" disabled={markSent.isPending} onClick={() => markSent.mutate(invoice.id)}>
              Mark sent
            </Button>
          ) : null}

          {/* Only a bill can be settled. The button is absent on a proforma
              rather than disabled: there is nothing owed to pay. */}
          {!isProforma && !settled && !withdrawn ? (
            <Button size="sm" disabled={markPaid.isPending} onClick={() => markPaid.mutate(invoice.id)}>
              Mark paid
            </Button>
          ) : null}

          {!settled && !withdrawn ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ id: invoice.id, reason: 'Withdrawn by Finance' })}
            >
              Withdraw
            </Button>
          ) : null}

          <Button variant="outline" size="sm" onClick={() => window.print()}>
            <Printer className="mr-1.5 size-4" />
            Print
          </Button>
        </div>
      </div>

      {cancel.isError || markPaid.isError ? (
        <p className="rounded-lg border border-destructive/25 bg-destructive/10 px-3 py-2 text-sm text-destructive print:hidden">
          {((cancel.error ?? markPaid.error) as Error).message}
        </p>
      ) : null}

      <InvoiceSheet invoice={invoice} shipmentReference={shipment?.reference} />
    </div>
  );
}

export function InvoiceSheet({
  invoice,
  shipmentReference,
}: {
  invoice: InvoiceRecord;
  shipmentReference?: string;
}) {
  const documents = useSystemSettings().documents;
  const remittance = useRemittanceAccount();

  const isProforma = invoice.kind === 'proforma';
  const total = fromMinorUnits(invoice.totalMinorUnits, invoice.currency);
  const lines = invoice.lines ?? [];
  /* Units, not lines. An invoice's lines are one container each so the two
     agree; a quotation's "6 × 40ft" is one line and six units, and printing
     "1 container" there is simply false. */
  const units = lines.reduce((sum, line) => sum + (line.qty || 1), 0);

  return (
    <article className="invoice-sheet relative mx-auto w-full shadow-card print:shadow-none">
      {/* The paid stamp belongs to a bill that was settled. A quote has no
          settlement to stamp, and a withdrawn document must not wear one. */}
      {!isProforma && invoice.status === 'Paid' ? <DocumentStampWatermark document="invoice" /> : null}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-6 border-b-[3px] border-[var(--invoice-brand)] px-[14mm] pb-[8mm] pt-[12mm]">
        <DocumentLetterhead />

        <div className="text-right text-[9pt] leading-[1.6]">
          <p className="text-[20pt] font-extrabold uppercase leading-none tracking-[0.08em] text-[var(--invoice-brand)]">
            {isProforma ? 'Proforma' : 'Invoice'}
          </p>
          <p className="mt-[3mm] font-mono text-[11pt] font-bold">{invoice.number}</p>
          {shipmentReference ? (
            <p className="font-mono text-[9pt] font-bold text-[var(--invoice-brand)]">{shipmentReference}</p>
          ) : null}
          <p className="text-[var(--invoice-muted)]">
            Issued <span className="font-semibold text-[var(--invoice-ink)]">{fmtDocDate(invoice.issueDate)}</span>
          </p>
          <p className="text-[var(--invoice-muted)]">
            {isProforma ? 'Valid until' : 'Due'}{' '}
            <span className="font-semibold text-[var(--invoice-ink)]">{fmtDocDate(invoice.contractDeadline)}</span>
          </p>
        </div>
      </header>

      {/* ── Parties ────────────────────────────────────────────────────── */}
      <section className="grid gap-6 px-[14mm] pt-[8mm] sm:grid-cols-2">
        <div>
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">
            {isProforma ? 'Prepared for' : 'Billed to'}
          </p>
          <p className="mt-[2mm] text-[12pt] font-extrabold text-[var(--invoice-ink)]">{invoice.shipperCompany}</p>
          <p className="text-[9pt] text-[var(--invoice-muted)]">{invoice.shipperName}</p>
        </div>
        <div className="sm:text-right">
          <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">
            {isProforma ? 'Estimated total' : 'Amount due'}
          </p>
          <p className="mt-[2mm] font-mono text-[18pt] font-extrabold tabular-nums text-[var(--invoice-ink)]">
            {fmtDjfPlain(total)} {invoice.currency}
          </p>
          {invoice.status === 'Paid' ? (
            <p className="text-[9pt] font-bold text-[var(--invoice-settled)]">Settled</p>
          ) : null}
          {invoice.status === 'Cancelled' ? (
            <p className="text-[9pt] font-bold text-[var(--invoice-muted)]">Withdrawn</p>
          ) : null}
        </div>
      </section>

      {/* ── What this covers ───────────────────────────────────────────── */}
      <section className="px-[14mm] pt-[8mm]">
        <div className="rounded-[2mm] border border-[var(--invoice-rule)] bg-[var(--invoice-wash)] px-[4mm] py-[3.5mm]">
          <p className="text-[9.5pt] leading-[1.6] text-[var(--invoice-ink)]">
            {isProforma ? (
              /* A quotation has no shipment — that is the whole point of one —
                 so it says what it is FOR and how much of it, never a
                 reference to a job that does not exist yet. The count is the
                 summed quantities, not the number of lines: "6 × 40ft" on one
                 line is six containers. */
              <>
                {invoice.description}
                {units > 0 ? (
                  <>
                    {' — '}
                    <span className="font-bold">
                      {units} container{units === 1 ? '' : 's'}
                    </span>{' '}
                    as itemised below
                  </>
                ) : null}
                . Prices hold until {fmtDocDate(invoice.contractDeadline)}. This is a quotation — no
                payment is due against it.
              </>
            ) : (
              <>
                Delivered under shipment{' '}
                <span className="font-mono font-bold">{shipmentReference ?? '—'}</span>:{' '}
                <span className="font-bold">
                  {units} container{units === 1 ? '' : 's'}
                </span>{' '}
                carried and signed for. Payable in full by {fmtDocDate(invoice.contractDeadline)}.
              </>
            )}
          </p>
        </div>
      </section>

      {/*
        The lines, and the two documents itemise differently because they are
        describing different things.

        An INVOICE bills containers that were carried, so each line names its
        booking — the reference the client can check against their own paper.
        A QUOTATION prices work not yet done, so it shows quantity and unit
        price: "6 × 47,000" is the number a client negotiates, and folding it
        into a single figure hides exactly what they want to argue about.
      */}
      <section className="px-[14mm] pt-[5mm]">
        <table className="w-full border-collapse text-[9pt]">
          <thead>
            <tr className="bg-[var(--invoice-wash)]">
              <Th>Description</Th>
              {isProforma ? (
                <>
                  <Th align="right">Qty</Th>
                  <Th align="right">Price each</Th>
                </>
              ) : (
                <Th>Booking</Th>
              )}
              <Th align="right">Amount</Th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <Td>
                  <span className="font-bold">{invoice.description || 'Freight services as agreed'}</span>
                </Td>
                {isProforma ? (
                  <>
                    <Td align="right">1</Td>
                    <Td align="right" mono>
                      {fmtDjfPlain(total)}
                    </Td>
                  </>
                ) : (
                  <Td mono>{shipmentReference ?? '—'}</Td>
                )}
                <Td align="right" mono bold>
                  {fmtDjfPlain(total)}
                </Td>
              </tr>
            ) : (
              /* A quotation's lines share the synthetic references `L1`, `L2`
                 …, and an invoice's are booking references — unique either
                 way, so the reference alone is a stable key. */
              lines.map((line) => (
                <tr key={line.reference}>
                  <Td>
                    <span className="font-bold">{line.description}</span>
                    {line.category ? (
                      <span className="ml-[2mm] text-[8pt] text-[var(--invoice-muted)]">{line.category}</span>
                    ) : null}
                  </Td>
                  {isProforma ? (
                    <>
                      <Td align="right">{line.qty}</Td>
                      <Td align="right" mono>
                        {fmtDjfPlain(fromMinorUnits(line.unitMinorUnits, invoice.currency))}
                      </Td>
                    </>
                  ) : (
                    <Td mono>{line.reference}</Td>
                  )}
                  <Td align="right" mono bold>
                    {fmtDjfPlain(fromMinorUnits(line.totalMinorUnits, invoice.currency))}
                  </Td>
                </tr>
              ))
            )}
          </tbody>
          <tfoot>
            <tr>
              <td
                colSpan={isProforma ? 3 : 2}
                className="border-t-2 border-[var(--invoice-brand)] px-[3mm] py-[3mm] text-right text-[10pt] font-extrabold uppercase tracking-wide"
              >
                {isProforma ? 'Estimated total' : 'Total due'}
              </td>
              <td className="border-t-2 border-[var(--invoice-brand)] px-[3mm] py-[3mm] text-right font-mono text-[13pt] font-extrabold tabular-nums">
                {fmtDjfPlain(total)}
              </td>
            </tr>
          </tfoot>
        </table>

        <p className="mt-[3mm] text-[8.5pt] italic text-[var(--invoice-muted)]">{amountInWords(total)}</p>
      </section>

      {/* ── Payment + signature ────────────────────────────────────────── */}
      <section className="grid gap-6 px-[14mm] pt-[9mm] sm:grid-cols-2">
        <div>
          {isProforma ? (
            <>
              <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">
                Not a request for payment
              </p>
              <p className="mt-[2mm] max-w-[80mm] text-[9pt] leading-[1.6] text-[var(--invoice-muted)]">
                This proforma is issued for your approval. An invoice carrying our bank details follows once
                the containers have been delivered.
              </p>
            </>
          ) : (
            <>
              <p className="text-[8pt] font-extrabold uppercase tracking-[0.12em] text-[var(--invoice-faint)]">Payable to</p>
              <dl className="mt-[2mm] text-[9pt] leading-[1.7]">
                <PayRow label="Bank" value={remittance.bankName} />
                <PayRow label="Account name" value={remittance.accountHolder} />
                <PayRow label="Account" value={remittance.accountNumber} mono />
                {remittance.swiftCode ? <PayRow label="SWIFT" value={remittance.swiftCode} mono /> : null}
              </dl>
              <p className="mt-[3mm] text-[8pt] text-[var(--invoice-muted)]">
                Please quote <span className="font-mono font-bold">{invoice.number}</span> as the payment reference.
              </p>
            </>
          )}
          {documents.invoiceTerms ? (
            <p className="mt-[3mm] max-w-[80mm] text-[8pt] leading-[1.55] text-[var(--invoice-faint)]">
              {documents.invoiceTerms}
            </p>
          ) : null}
        </div>

        <div className="flex flex-col items-end justify-end">
          <DocumentSignatureBlock document="invoice" />
        </div>
      </section>

      <DocumentFooter note={documents.invoiceDisclaimer} />
    </article>
  );
}

function Th({ children, align }: { children: React.ReactNode; align?: 'right' }) {
  return (
    <th
      className={`border-b border-[var(--invoice-rule)] px-[3mm] py-[2.5mm] text-[8pt] font-extrabold uppercase tracking-[0.08em] text-[var(--invoice-muted)] ${
        align === 'right' ? 'text-right' : 'text-left'
      }`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align,
  mono,
  bold,
}: {
  children: React.ReactNode;
  align?: 'right';
  mono?: boolean;
  bold?: boolean;
}) {
  return (
    <td
      className={`border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[3mm] align-top ${
        align === 'right' ? 'text-right' : ''
      } ${mono ? 'font-mono text-[8pt] tabular-nums' : ''} ${bold ? 'font-bold' : ''}`}
    >
      {children}
    </td>
  );
}

function PayRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex gap-2">
      <dt className="w-[28mm] shrink-0 text-[var(--invoice-faint)]">{label}</dt>
      <dd className={mono ? 'font-mono font-semibold' : 'font-semibold'}>{value}</dd>
    </div>
  );
}

export default InvoiceDocumentPage;
