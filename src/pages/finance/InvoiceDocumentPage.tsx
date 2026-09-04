import { useParams } from 'react-router-dom';

import { ReturnLink } from '@/components/common/ReturnLink';
import { ROUTES } from '@/config/routes';
import { Printer } from '@/design-system/icons';
import { Button, Card, Skeleton } from '@/design-system';
import { RecordRaise } from '@/features/workspace';
import { useSystemSettings } from '@/features/settings';
import { amountInWords, fmtDjfPlain, fmtDocDate, fromMinorUnits } from '@/lib/finance';
import {
  cargoLabel,
  useCancelInvoice,
  useInvoice,
  useMarkInvoicePaid,
  useMarkInvoiceSent,
  type InvoiceRecord,
} from '@/features/finance';
import { useShipmentRaw } from '@/features/shipments/api/queries';
import { useShipper } from '@/features/shippers/api/queries';

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
  const cancelled = invoice.status === 'Cancelled';

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {/* Screen-only chrome. `print:hidden` throughout — the sheet below is
          the whole of what comes out of the printer. */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        {/* Back to wherever the reader came from — Billing's open items link
            straight to a document, and the fixed "All documents" control used
            to strand them on a list they had not been working. */}
        <ReturnLink fallback={{ to: ROUTES.financeInvoices, label: 'All documents' }} />

        <div className="flex flex-wrap items-center gap-2">
          <RecordRaise recordType="INVOICE" recordId={invoice.id} recordRef={invoice.number} size="sm" />

          {/* A paid document plainly reached the client — offering "mark sent"
              on one is asking about a step the money already proves. */}
          {!cancelled && !settled && !invoice.sentAt ? (
            <Button variant="outline" size="sm" disabled={markSent.isPending} onClick={() => markSent.mutate(invoice.id)}>
              Mark sent
            </Button>
          ) : null}

          {/* Only a bill can be settled. The button is absent on a proforma
              rather than disabled: there is nothing owed to pay. */}
          {!isProforma && !settled && !cancelled ? (
            <Button size="sm" disabled={markPaid.isPending} onClick={() => markPaid.mutate(invoice.id)}>
              Mark paid
            </Button>
          ) : null}

          {!settled && !cancelled ? (
            <Button
              variant="ghost"
              size="sm"
              disabled={cancel.isPending}
              onClick={() => cancel.mutate({ id: invoice.id, reason: 'Cancelled by Finance' })}
            >
              Cancel invoice
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
/**
 * The printed document.
 *
 * Designed as an accounting instrument, not a brochure. The things a client's
 * finance clerk looks for — who is billed, what for, how much, by when, where
 * to pay, against which reference — are each in one fixed place, and nothing
 * competes with them for attention. That is the whole brief: a document is
 * professional when it can be processed without being read twice.
 *
 * Layout, top to bottom:
 *
 *   1. **Mark and title.** The logo alone — no invented address; see
 *      `DocumentLetterhead`. The document's kind, number and dates sit
 *      opposite it as a labelled block, because those are what a clerk files
 *      it under.
 *   2. **Parties and the amount.** Who it is billed to on the left, what is
 *      owed and when on the right, on one rule.
 *   3. **What it covers**, in a sentence.
 *   4. **The lines**, itemised, with a totals block beneath them aligned to
 *      the money column so the eye runs straight down from the last line to
 *      the total.
 *   5. **How to pay**, terms, and the signature.
 */
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
  /* A PROJECT invoice bills a whole agreement: its lines are shipments, not
     containers, and it has no single shipment reference to print. Told apart
     by the project link with no shipment link — the shape only this document
     has. */
  const isProject = !isProforma && invoice.projectId != null && invoice.shipmentId == null;
  /* The client's registered address, read from the account rather than
     snapshotted on the document. An address is a current fact about a company
     — unlike the money, which must never be recomputed — and a bill reissued
     to a moved client should carry where they are now. */
  const { data: shipper } = useShipper(invoice.shipperId);
  const billedToLines = [shipper?.address, shipper?.country].filter(
    (line): line is string => Boolean(line && line.trim()),
  );

  const total = fromMinorUnits(invoice.totalMinorUnits, invoice.currency);
  const lines = invoice.lines ?? [];
  /* Units, not lines. An invoice's lines are one container each so the two
     agree; a project line is one shipment carrying several. */
  const units = lines.reduce((sum, line) => sum + (line.qty || 1), 0);

  const title = isProforma ? 'Proforma Invoice' : 'Invoice';
  const settled = invoice.status === 'Paid';
  const cancelled = invoice.status === 'Cancelled';

  return (
    <article className="invoice-sheet relative mx-auto w-full shadow-card print:shadow-none">
      {!isProforma && settled ? <DocumentStampWatermark document="invoice" /> : null}

      {/* ── 1. Mark and title ──────────────────────────────────────────── */}
      <header className="flex flex-wrap items-start justify-between gap-6 px-[14mm] pt-[13mm]">
        <DocumentLetterhead />

        <div className="text-right">
          <p className="text-[15pt] font-bold uppercase leading-none tracking-[0.16em] text-[var(--invoice-brand)]">
            {title}
          </p>
          <dl className="mt-[4mm] inline-grid grid-cols-[auto_auto] gap-x-[4mm] gap-y-[1.2mm] text-[8.5pt]">
            <Meta label="No." value={invoice.number} mono />
            <Meta label="Issued" value={fmtDocDate(invoice.issueDate)} />
            <Meta
              label={isProforma ? 'Valid until' : 'Due'}
              value={fmtDocDate(invoice.contractDeadline)}
            />
            {shipmentReference && !isProject ? (
              <Meta label="Shipment" value={shipmentReference} mono />
            ) : null}
          </dl>
        </div>
      </header>

      {/*
        ── 2. Parties and the amount ───────────────────────────────────────
        Two panels of equal weight: who is billed, and what is owed. They
        replaced a plain line pair under a full-width rule — the rule was
        doing the separating that the panels now do themselves, and the
        client's name and the figure were the same colour and size, so
        neither led.

        The COMPANY and its address, never the contact person. An invoice is
        addressed to a legal entity; naming an individual on one is how a bill
        ends up filed as somebody's personal debt.
      */}
      <section className="mt-[7mm] grid gap-[4mm] px-[14mm] sm:grid-cols-[1fr_auto] sm:items-stretch">
        <div className="rounded-[2mm] bg-[var(--invoice-wash)] px-[5mm] py-[4mm]">
          <p className="text-[7.5pt] font-bold uppercase tracking-[0.14em] text-[var(--invoice-muted)]">
            {isProforma ? 'Prepared for' : 'Billed to'}
          </p>
          <p className="mt-[1.5mm] text-[15pt] font-bold leading-tight tracking-tight text-[var(--invoice-brand)]">
            {invoice.shipperCompany}
          </p>
          {billedToLines.length > 0 ? (
            <div className="mt-[1.5mm] text-[8.5pt] leading-[1.6] text-[var(--invoice-muted)]">
              {billedToLines.map((line) => (
                <p key={line}>{line}</p>
              ))}
            </div>
          ) : null}
        </div>

        <div className="flex min-w-[62mm] flex-col justify-center rounded-[2mm] bg-[var(--invoice-brand)] px-[5mm] py-[4mm] text-right">
          <p className="text-[7.5pt] font-bold uppercase tracking-[0.14em] text-white/75">
            {isProforma ? 'Estimated total' : 'Amount due'}
          </p>
          <p className="mt-[1.5mm] font-mono text-[19pt] font-bold leading-none tabular-nums text-white">
            {fmtDjfPlain(total)}
          </p>
          <p className="mt-[1.5mm] text-[8.5pt] font-semibold text-white/85">
            {invoice.currency}
            {!isProforma ? <> · due {fmtDocDate(invoice.contractDeadline)}</> : null}
          </p>
          {settled ? (
            <p className="mt-[1.5mm] text-[8.5pt] font-bold uppercase tracking-wide text-white">
              Paid in full
            </p>
          ) : cancelled ? (
            <p className="mt-[1.5mm] text-[8.5pt] font-bold uppercase tracking-wide text-white/80">
              Cancelled
            </p>
          ) : null}
        </div>
      </section>

      {/* ── 3. What it covers ──────────────────────────────────────────── */}
      <section className="px-[14mm] pt-[6mm]">
        <p className="border-l-[0.8mm] border-[var(--invoice-rule)] pl-[3.5mm] text-[9pt] leading-[1.6] text-[var(--invoice-muted)]">
          {isProforma ? (
            <>
              {invoice.description}
              {units > 0 ? (
                <>
                  {' — '}
                  <span className="font-semibold text-[var(--invoice-ink)]">
                    {units} container{units === 1 ? '' : 's'}
                  </span>
                </>
              ) : null}
              . Prices hold until {fmtDocDate(invoice.contractDeadline)}. This is a quotation; no payment
              is due against it.
            </>
          ) : isProject ? (
            <>
              <span className="font-semibold text-[var(--invoice-ink)]">
                {subjectOf(invoice.description)}
              </span>{' '}
              — {lines.length} shipment{lines.length === 1 ? '' : 's'} covering {units} container
              {units === 1 ? '' : 's'}, itemised below.
            </>
          ) : (
            <>
              Delivered under shipment{' '}
              <span className="font-semibold text-[var(--invoice-ink)]">{shipmentReference ?? '—'}</span>{' '}
              — {units} container{units === 1 ? '' : 's'} carried and signed for.
            </>
          )}
        </p>
      </section>

      {/*
        ── 4. The lines ────────────────────────────────────────────────────

        ONE ROW PER LINE, always — a shipment on a project invoice, a container
        on a single-shipment one.

        A grouped version was tried, with each shipment as its own sub-table of
        containers and a subtotal. It reads well for three shipments and falls
        apart at a hundred bookings: the document becomes pages of near-identical
        rows for information the client already has. The route, the shipment
        number and the container COUNT are what identifies a job on a bill; the
        individual box numbers belong to the shipment record, not the invoice.
      */}
      <section className="px-[14mm] pt-[6mm]">
        <table className="w-full border-collapse overflow-hidden rounded-[1.5mm] text-[9pt] ring-1 ring-[var(--invoice-rule)]">
          <thead>
            <tr className="bg-[var(--invoice-wash)]">
              <Th align="center" width="8mm">
                #
              </Th>
              <Th>{isProject ? 'Route' : 'Description'}</Th>
              {isProforma ? (
                <>
                  <Th align="right" width="18mm">
                    Qty
                  </Th>
                  <Th align="right" width="30mm">
                    Unit price
                  </Th>
                </>
              ) : isProject ? (
                <>
                  <Th width="28mm">Shipment</Th>
                  <Th align="right" width="24mm">
                    Containers
                  </Th>
                </>
              ) : (
                <Th width="34mm">Booking</Th>
              )}
              <Th align="right" width="32mm">
                Amount
              </Th>
            </tr>
          </thead>
          <tbody>
            {lines.length === 0 ? (
              <tr>
                <Td align="center" muted>
                  1
                </Td>
                <Td>
                  <span className="font-semibold text-[var(--invoice-ink)]">
                    {invoice.description || 'Freight services as agreed'}
                  </span>
                </Td>
                {isProforma ? (
                  <>
                    <Td align="right">1</Td>
                    <Td align="right" mono>
                      {fmtDjfPlain(total)}
                    </Td>
                  </>
                ) : isProject ? (
                  <>
                    <Td mono>—</Td>
                    <Td align="right">1</Td>
                  </>
                ) : (
                  <Td mono>{shipmentReference ?? '—'}</Td>
                )}
                <Td align="right" mono bold>
                  {fmtDjfPlain(total)}
                </Td>
              </tr>
            ) : (
              lines.map((line, index) => (
                <tr key={line.reference}>
                  <Td align="center" muted>
                    {index + 1}
                  </Td>
                  <Td>
                    <span className="font-semibold text-[var(--invoice-ink)]">{line.description}</span>
                    {cargoLabel(line.category) ? (
                      <span className="ml-[2mm] text-[8pt] text-[var(--invoice-muted)]">
                        {cargoLabel(line.category)}
                      </span>
                    ) : null}
                  </Td>
                  {isProforma ? (
                    <>
                      <Td align="right">{line.qty}</Td>
                      <Td align="right" mono>
                        {fmtDjfPlain(fromMinorUnits(line.unitMinorUnits, invoice.currency))}
                      </Td>
                    </>
                  ) : isProject ? (
                    <>
                      <Td mono>{line.reference}</Td>
                      <Td align="right">{line.qty}</Td>
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
        </table>

        {/*
          The totals, aligned to the money column rather than spanning the
          table. A clerk's eye runs straight down the amounts to the figure
          they will enter, and a full-width total row breaks that line.
        */}
        <div className="mt-[4mm] flex justify-end">
          <dl className="w-[76mm] overflow-hidden rounded-[1.5mm] text-[9pt] ring-1 ring-[var(--invoice-rule)]">
            <Total label="Subtotal" value={fmtDjfPlain(total)} />
            {Number(invoice.taxMinorUnits) > 0 ? (
              <Total
                label="Tax"
                value={fmtDjfPlain(fromMinorUnits(invoice.taxMinorUnits, invoice.currency))}
              />
            ) : null}
            <div className="flex items-baseline justify-between bg-[var(--invoice-brand)] px-[3mm] py-[2.6mm]">
              <dt className="text-[9pt] font-bold uppercase tracking-wide text-white">
                {isProforma ? 'Estimated total' : 'Total due'}
              </dt>
              <dd className="font-mono text-[11.5pt] font-bold tabular-nums text-white">
                {fmtDjfPlain(total)} <span className="text-[8pt] opacity-90">{invoice.currency}</span>
              </dd>
            </div>
          </dl>
        </div>

        <p className="mt-[3mm] text-[8pt] italic text-[var(--invoice-muted)]">{amountInWords(total)}</p>
      </section>

      {/*
        ── 5. How to pay, and who signed ───────────────────────────────────
        The bank details are the one block on the page somebody RETYPES, into
        a transfer form, digit by digit. They were a loose definition list
        floating in white space beside a dashed box; now they sit in a panel of
        their own with the reference called out under them, and the signature
        keeps its own framed space at the same height.
      */}
      <section className="grid gap-[4mm] px-[14mm] pt-[7mm] sm:grid-cols-[1fr_auto] sm:items-stretch">
        <div className="rounded-[2mm] bg-[var(--invoice-wash)] px-[5mm] py-[4mm]">
          {isProforma ? (
            <>
              <p className="text-[7.5pt] font-bold uppercase tracking-[0.14em] text-[var(--invoice-muted)]">
                Not a request for payment
              </p>
              <p className="mt-[2mm] max-w-[86mm] text-[8.5pt] leading-[1.65] text-[var(--invoice-muted)]">
                This proforma is issued for your approval. An invoice carrying our bank details follows
                once the containers have been delivered.
              </p>
            </>
          ) : (
            <>
              <p className="text-[7.5pt] font-bold uppercase tracking-[0.14em] text-[var(--invoice-muted)]">
                Payment details
              </p>
              <dl className="mt-[2.5mm] grid grid-cols-[26mm_1fr] gap-x-[3mm] gap-y-[1.4mm] text-[8.5pt]">
                <PayRow label="Bank" value={remittance.bankName} />
                <PayRow label="Account name" value={remittance.accountHolder} />
                <PayRow label="Account" value={remittance.accountNumber} mono />
                {remittance.swiftCode ? <PayRow label="SWIFT" value={remittance.swiftCode} mono /> : null}
              </dl>
              <p className="mt-[3mm] border-t border-[var(--invoice-rule)] pt-[2.5mm] text-[8pt] text-[var(--invoice-muted)]">
                Quote{' '}
                <span className="font-mono font-bold text-[var(--invoice-brand)]">{invoice.number}</span>{' '}
                as the payment reference.
              </p>
            </>
          )}
          {documents.invoiceTerms ? (
            <p className="mt-[2.5mm] max-w-[86mm] text-[7.5pt] leading-[1.6] text-[var(--invoice-faint)]">
              {documents.invoiceTerms}
            </p>
          ) : null}
        </div>

        <div className="flex min-w-[58mm] flex-col justify-end">
          <DocumentSignatureBlock document="invoice" />
        </div>
      </section>

      <DocumentFooter />
    </article>
  );
}

/**
 * The document's subject, without a count trailing it.
 *
 * Project invoices issued before 2026-09-04 snapshotted their description as
 * "Name — N shipments", and the sentence composed around it added the count
 * again: "… — 3 shipments — 3 shipments covering 11 containers". The
 * description is a snapshot and must not be rewritten in the database, so the
 * duplicate is trimmed at render.
 */
function subjectOf(description: string): string {
  return description.replace(/\s*[—-]\s*\d+\s+shipments?$/i, '').trim();
}

/** One labelled fact in the document's reference block. */
function Meta({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-left text-[var(--invoice-faint)]">{label}</dt>
      <dd
        className={`text-right font-semibold text-[var(--invoice-ink)] ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </>
  );
}

/** A subtotal row in the totals box, ruled to match the table above it. */
function Total({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between border-b border-[var(--invoice-rule-soft)] px-[3mm] py-[2mm]">
      <dt className="text-[var(--invoice-muted)]">{label}</dt>
      <dd className="font-mono tabular-nums text-[var(--invoice-ink)]">{value}</dd>
    </div>
  );
}

const ALIGN = { right: 'text-right', center: 'text-center', left: 'text-left' } as const;

function Th({
  children,
  align = 'left',
  width,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  /** Fixed column width in mm — the number columns must not breathe with content. */
  width?: string;
}) {
  return (
    <th
      style={width ? { width } : undefined}
      className={`border-b border-[var(--invoice-rule)] px-[2.5mm] py-[2.2mm] text-[7.5pt] font-bold uppercase tracking-[0.1em] text-[var(--invoice-muted)] [&:not(:last-child)]:border-r [&:not(:last-child)]:border-[var(--invoice-rule)] ${ALIGN[align]}`}
    >
      {children}
    </th>
  );
}

function Td({
  children,
  align = 'left',
  mono,
  bold,
  muted,
}: {
  children: React.ReactNode;
  align?: 'left' | 'right' | 'center';
  mono?: boolean;
  bold?: boolean;
  muted?: boolean;
}) {
  return (
    <td
      className={`border-b border-[var(--invoice-rule-soft)] px-[2.5mm] py-[2.6mm] align-top [&:not(:last-child)]:border-r [&:not(:last-child)]:border-[var(--invoice-rule-soft)] ${
        ALIGN[align]
      } ${mono ? 'font-mono text-[8pt] tabular-nums' : ''} ${bold ? 'font-bold' : ''} ${
        muted ? 'text-[8pt] text-[var(--invoice-faint)]' : ''
      }`}
    >
      {children}
    </td>
  );
}

/** A label/value pair in the payment panel's two-column grid. */
function PayRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <>
      <dt className="text-[var(--invoice-muted)]">{label}</dt>
      <dd
        className={`break-all font-semibold text-[var(--invoice-ink)] ${mono ? 'font-mono' : ''}`}
      >
        {value}
      </dd>
    </>
  );
}

export default InvoiceDocumentPage;
