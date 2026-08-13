import { useEffect, useState, type ReactNode } from 'react';

import { IconChip } from '@/design-system';
import {
  Banknote,
  Camera,
  Check,
  CircleCheck,
  Clock,
  CreditCard,
  FileText,
  Coins,
  FolderOpen,
  Landmark,
  MapPin,
  Phone,
  TriangleAlert,
  Trash2,
  Truck,
  Upload,
  X,
} from '@/design-system/icons';
import { POD_DOCUMENT_LABEL, fmtDjf } from '@/lib/finance';
import type {
  FundingSource,
  PaymentMethod,
  PodDocument,
  PodDocumentKind,
  TransporterSettlement,
} from '@/types/finance';
import { cn } from '@/utils';

import type { BookingRow } from '../model';
import { ActionButton, Avatar, BookingStageChip, MoneyAmount } from './kit';

/* ═══════════════════════════════════════════════════════════════════════════
 * Shell
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The module's one modal frame. Escape closes, the backdrop closes, and the
 * footer is where the committing action lives — never floating in the body.
 */
function ModalShell({
  open,
  onClose,
  icon,
  tint,
  title,
  subtitle,
  size = 'md',
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  icon: Parameters<typeof IconChip>[0]['icon'];
  tint: Parameters<typeof IconChip>[0]['tint'];
  title: string;
  subtitle: string;
  /** `sm` is for quick-glance popups — status only, nothing to act on. */
  size?: 'md' | 'sm';
  children: ReactNode;
  footer: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs">
      <button
        type="button"
        aria-label="Close"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={cn(
          'relative flex max-h-[88vh] w-full flex-col overflow-hidden rounded-card border border-border bg-card shadow-2xl',
          size === 'sm' ? 'max-w-sm' : 'max-w-xl',
        )}
      >
        <div className="flex items-start gap-3 border-b border-border-subtle px-5 py-4">
          <IconChip icon={icon} tint={tint} size={36} />
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-extrabold tracking-tight text-foreground">{title}</h2>
            <p className="mt-0.5 text-xs font-semibold text-muted-foreground">{subtitle}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:bg-surface-sunken hover:text-foreground"
          >
            <X className="size-4" />
          </button>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">{children}</div>

        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border-subtle bg-surface-sunken px-5 py-3.5">
          {footer}
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Booking quick view
 * ═══════════════════════════════════════════════════════════════════════ */

const formatStamp = (iso: string): string =>
  new Date(iso).toLocaleString('en-GB', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * The two-second answer to "how's this one doing" — opened from the bookings
 * table instead of a full page, because that's all the desk asks of a single
 * container: is it proven, and where does it stand.
 */
export function BookingQuickViewDialog({
  open,
  onClose,
  entry,
}: {
  open: boolean;
  onClose: () => void;
  entry: BookingRow | null;
}) {
  if (!entry) return null;
  const { booking, stage, transporter } = entry;
  const { proof } = booking;

  const podState = proof.podSentAt ? 'proven' : proof.completedAt ? 'awaiting' : 'transit';
  const podIcon = podState === 'proven' ? CircleCheck : podState === 'awaiting' ? FileText : Clock;
  const podTint = podState === 'proven' ? 'teal' : podState === 'awaiting' ? 'orange' : 'neutral';
  const podTitle =
    podState === 'proven'
      ? 'Proof of delivery confirmed'
      : podState === 'awaiting'
        ? 'Delivered — proof not confirmed yet'
        : 'Still on the road';
  const podDetail =
    podState === 'proven'
      ? `Confirmed ${formatStamp(proof.podSentAt as string)}`
      : podState === 'awaiting'
        ? `Arrived ${formatStamp(proof.completedAt as string)} — waiting on the signed note and photo`
        : 'Has not reported arrival at destination yet.';

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={Truck}
      tint={podTint}
      title={booking.id}
      subtitle={
        booking.containerNumber
          ? `${booking.containerNumber} · ${booking.cargoSummary}`
          : booking.cargoSummary
      }
      size="sm"
      footer={
        <ActionButton variant="ghost" onClick={onClose}>
          Close
        </ActionButton>
      }
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Status
        </span>
        <BookingStageChip stage={stage} />
      </div>

      <div className="mt-3 flex items-center gap-3 rounded-card-nested bg-surface-sunken px-3.5 py-3">
        <IconChip icon={podIcon} tint={podTint} size={36} />
        <div className="min-w-0 flex-1">
          <p className="text-sm font-bold text-foreground">{podTitle}</p>
          <p className="mt-0.5 text-xs font-semibold leading-relaxed text-muted-foreground">
            {podDetail}
          </p>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted-foreground">
        <MapPin aria-hidden className="size-3.5 shrink-0" />
        <span>
          {booking.origin} → {booking.destination}
        </span>
      </div>

      {transporter ? (
        <div className="mt-2 flex items-center gap-2">
          <Avatar name={transporter.name} logoUrl={transporter.logoUrl} size={20} />
          <span className="text-xs font-bold text-foreground">{transporter.name}</span>
        </div>
      ) : null}
    </ModalShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Proof of delivery
 * ═══════════════════════════════════════════════════════════════════════ */

const POD_SLOTS: {
  kind: PodDocumentKind;
  icon: typeof FileText;
  accept: string;
  hint: string;
}[] = [
  {
    kind: 'signed_pdf',
    icon: FileText,
    accept: '.pdf,application/pdf',
    hint: 'The printed delivery note, signed by the receiver, scanned back as PDF.',
  },
  {
    kind: 'delivery_photo',
    icon: Camera,
    accept: 'image/*,.jpg,.jpeg,.png,.heic',
    hint: 'A photograph taken at the drop showing the goods delivered.',
  },
];

const bytes = (size: number): string =>
  size >= 1_000_000 ? `${(size / 1_000_000).toFixed(1)} MB` : `${Math.max(1, Math.round(size / 1000))} KB`;

/**
 * Confirming PoD, with the evidence attached to the act.
 *
 * Both proofs are required and the dialog refuses to submit without them —
 * this is the moment the client's payment terms start and the transporter's
 * money becomes releasable, so it is the right place to be strict.
 */
export function PodDialog({
  open,
  onClose,
  bookingId,
  onConfirm,
}: {
  open: boolean;
  onClose: () => void;
  bookingId: string;
  onConfirm: (documents: PodDocument[]) => void;
}) {
  const [files, setFiles] = useState<Partial<Record<PodDocumentKind, File>>>({});

  // A fresh dialog per booking: never carry one mission's proofs into another.
  useEffect(() => {
    if (open) setFiles({});
  }, [open, bookingId]);

  const missing = POD_SLOTS.filter((slot) => !files[slot.kind]);
  const complete = missing.length === 0;

  const confirm = () => {
    if (!complete) return;
    const now = new Date().toISOString();
    onConfirm(
      POD_SLOTS.map((slot) => {
        const file = files[slot.kind] as File;
        return {
          kind: slot.kind,
          fileName: file.name,
          mimeType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          uploadedAt: now,
          uploadedBy: 'finance.desk',
          previewUrl: URL.createObjectURL(file),
        };
      }),
    );
    onClose();
  };

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={FileText}
      tint="teal"
      title="Confirm proof of delivery"
      subtitle={`${bookingId} · both proofs are required`}
      footer={
        <>
          <ActionButton variant="ghost" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton
            variant="primary"
            icon={CircleCheck}
            onClick={confirm}
            className={cn(!complete && 'pointer-events-none opacity-40')}
          >
            Confirm PoD
          </ActionButton>
        </>
      }
    >
      <div className="flex flex-col gap-2">
        {POD_SLOTS.map((slot) => {
          const file = files[slot.kind];
          return (
            <div
              key={slot.kind}
              className={cn(
                'flex flex-wrap items-center gap-3 rounded-card-nested border px-4 py-3 transition-colors',
                file ? 'border-primary/40 bg-primary-subtle/40' : 'border-border bg-card',
              )}
            >
              <span
                aria-hidden
                className={cn(
                  'flex size-5 shrink-0 items-center justify-center rounded-full border-2 transition-colors',
                  file
                    ? 'border-primary bg-primary text-primary-foreground'
                    : 'border-border-strong text-transparent',
                )}
              >
                <Check className="size-3 stroke-[3]" />
              </span>

              <div className="min-w-[10rem] flex-1">
                <p className="flex flex-wrap items-center gap-2 text-sm font-bold text-foreground">
                  <slot.icon aria-hidden className="size-4 shrink-0 text-muted-foreground" />
                  {POD_DOCUMENT_LABEL[slot.kind]}
                  <span className="rounded-full bg-accent-subtle px-2 py-0.5 text-2xs font-extrabold uppercase tracking-wide text-accent-subtle-foreground">
                    Required
                  </span>
                </p>
                <p className="mt-1 text-xs font-semibold text-muted-foreground">
                  {file ? `${file.name} · ${bytes(file.size)}` : slot.hint}
                </p>
              </div>

              {file ? (
                <button
                  type="button"
                  onClick={() => setFiles((prev) => ({ ...prev, [slot.kind]: undefined }))}
                  title="Remove file"
                  className="shrink-0 cursor-pointer rounded-lg p-1.5 text-muted-foreground transition-colors hover:text-destructive-subtle-foreground"
                >
                  <Trash2 className="size-4" />
                </button>
              ) : (
                <label className="flex shrink-0 cursor-pointer items-center gap-1.5 rounded-lg border border-dashed border-primary/50 bg-primary-subtle px-3 py-2 text-xs font-bold text-primary-subtle-foreground transition-colors hover:bg-primary-subtle/70">
                  <input
                    type="file"
                    accept={slot.accept}
                    className="hidden"
                    onChange={(event) => {
                      const picked = event.target.files?.[0];
                      if (picked) setFiles((prev) => ({ ...prev, [slot.kind]: picked }));
                    }}
                  />
                  <Upload className="size-3.5" />
                  Upload
                </label>
              )}
            </div>
          );
        })}
      </div>

      <p
        className={cn(
          'mt-3 flex items-start gap-2 rounded-card-nested px-3.5 py-3 text-xs font-semibold leading-relaxed',
          complete
            ? 'bg-surface-sunken text-muted-foreground'
            : 'bg-accent-subtle text-accent-subtle-foreground',
        )}
      >
        {complete ? null : <TriangleAlert aria-hidden className="mt-px size-4 shrink-0" />}
        {complete
          ? 'Confirming starts the client’s payment terms and makes this payout releasable.'
          : `Still needed: ${missing.map((slot) => POD_DOCUMENT_LABEL[slot.kind]).join(' and ')}. The signature proves acceptance, the photo proves condition — one without the other is not proof.`}
      </p>
    </ModalShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Paying a transporter
 * ═══════════════════════════════════════════════════════════════════════ */

const METHODS: { id: PaymentMethod; label: string; icon: typeof Landmark }[] = [
  { id: 'bank_transfer', label: 'Bank transfer', icon: Landmark },
  { id: 'mobile_money', label: 'Mobile money', icon: Phone },
  { id: 'cash', label: 'Cash', icon: Coins },
  { id: 'cheque', label: 'Cheque', icon: CreditCard },
];

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  bank_transfer: 'Bank transfer',
  mobile_money: 'Mobile money',
  cash: 'Cash',
  cheque: 'Cheque',
};

/**
 * The money-leaves-Fleetin moment.
 *
 * Deliberately a confirmation and not a one-click button: the amount and the
 * payee are restated at full size, every booking being covered is listed, and
 * the reference is captured here because a payment nobody can find in the bank
 * statement later is not a payment.
 *
 * ONE settlement, one transporter, one transfer — a haulier who carried twelve
 * containers on this consignment sees twelve lines and pays once. There is
 * deliberately no way from here to pay a single container.
 */
export function PayDialog({
  open,
  onClose,
  settlement,
  shipmentId,
  logoFor,
  onPay,
}: {
  open: boolean;
  onClose: () => void;
  /** The transporter's whole position on this shipment. */
  settlement: TransporterSettlement | null;
  shipmentId: string;
  logoFor: (counterpartyId: string) => string | undefined;
  onPay: (method: PaymentMethod, reference: string) => void;
}) {
  const [method, setMethod] = useState<PaymentMethod>('bank_transfer');
  const [reference, setReference] = useState('');

  useEffect(() => {
    if (open) {
      setMethod('bank_transfer');
      setReference('');
    }
  }, [open]);

  if (!settlement) return null;

  // Only the unpaid bookings are on this transfer: a settlement that was part
  // paid must not restate money that already left as if it were leaving again.
  const covered = settlement.lines.filter((line) => !line.paidAt);
  const total = settlement.payableDjf;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={Banknote}
      tint="teal"
      title={`Pay ${settlement.transporterName}`}
      subtitle={`${covered.length} booking${covered.length === 1 ? '' : 's'} on ${shipmentId} — one transfer, one receipt`}
      footer={
        <>
          <ActionButton variant="ghost" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton
            variant="primary"
            icon={Banknote}
            onClick={() => {
              onPay(method, reference.trim());
              onClose();
            }}
          >
            Pay {fmtDjf(total)}
          </ActionButton>
        </>
      }
    >
      <div className="flex flex-wrap items-center gap-3 rounded-card-nested border border-border px-4 py-3">
        <Avatar
          name={settlement.transporterName}
          logoUrl={logoFor(settlement.transporterId)}
          size={40}
        />
        <div className="min-w-[8rem] flex-1">
          <p className="text-sm font-extrabold text-foreground">{settlement.transporterName}</p>
          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
            {covered.length} booking{covered.length === 1 ? '' : 's'} delivered on {shipmentId}
          </p>
        </div>
        <MoneyAmount value={total} direction="out" className="text-lg" />
      </div>

      {/* Every booking on the transfer. This is the list that becomes the
          voucher he signs, so it has to be visible before the money moves. */}
      <ul className="mt-3 max-h-56 overflow-y-auto rounded-card-nested border border-border-subtle">
        {covered.map((line) => (
          <li
            key={line.bookingId}
            className="flex flex-wrap items-center gap-3 border-b border-border-subtle px-4 py-2.5 last:border-b-0"
          >
            <span className="font-mono text-xs font-bold text-foreground">{line.bookingId}</span>
            <span className="min-w-[6rem] flex-1 truncate text-xs font-semibold text-muted-foreground">
              {line.containerNumber ? `${line.containerNumber} · ` : ''}
              {line.destination}
            </span>
            <MoneyAmount value={line.amountDjf} direction="out" unit={false} className="text-xs" />
          </li>
        ))}
      </ul>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-card-nested border border-border px-4 py-3">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Total leaving Fleetin
        </span>
        <MoneyAmount value={total} direction="out" className="text-lg" />
      </div>

      <fieldset className="mt-4">
        <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
          How it was paid
        </legend>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {METHODS.map((entry) => (
            <button
              key={entry.id}
              type="button"
              onClick={() => setMethod(entry.id)}
              className={cn(
                'flex cursor-pointer flex-col items-center gap-1.5 rounded-card-nested border px-2 py-3 text-xs font-bold transition-colors',
                method === entry.id
                  ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
                  : 'border-border text-muted-foreground hover:bg-surface-sunken',
              )}
            >
              <entry.icon aria-hidden className="size-4" />
              {entry.label}
            </button>
          ))}
        </div>
      </fieldset>

      <label className="mt-4 block">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Payment reference
        </span>
        <input
          value={reference}
          onChange={(event) => setReference(event.target.value)}
          placeholder="Bank transfer / mobile-money transaction id"
          className="mt-1.5 w-full rounded-lg border border-border bg-card px-3.5 py-2.5 font-mono text-sm font-semibold text-foreground outline-none transition-colors placeholder:font-sans placeholder:font-medium placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
        />
        <span className="mt-1.5 block text-xs font-semibold text-muted-foreground">
          Optional, but it is what reconciliation joins on later.
        </span>
      </label>
    </ModalShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Voucher sign-back
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * The transporter signed the voucher on collection.
 *
 * A separate act from paying, because it genuinely is one: the transfer leaves
 * on Monday and the signed sheet comes back on Thursday, and the desk has to be
 * able to see that gap rather than have the system pretend money and paperwork
 * move together. Recording WHO signed is the whole content — that name is what
 * a later dispute is answered with.
 */
export function SignVoucherDialog({
  open,
  onClose,
  paymentId,
  transporterName,
  amountDjf,
  bookingsCount,
  onSign,
}: {
  open: boolean;
  onClose: () => void;
  paymentId: string;
  transporterName: string;
  amountDjf: number;
  bookingsCount: number;
  onSign: (signedBy: string) => void;
}) {
  const [signedBy, setSignedBy] = useState('');

  useEffect(() => {
    if (open) setSignedBy('');
  }, [open]);

  const name = signedBy.trim();

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={CircleCheck}
      tint="teal"
      title={`Sign off ${paymentId}`}
      subtitle={`${transporterName} · ${bookingsCount} booking${bookingsCount === 1 ? '' : 's'} · ${fmtDjf(amountDjf)}`}
      footer={
        <>
          <ActionButton variant="ghost" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton
            variant="primary"
            icon={Check}
            disabled={name.length === 0}
            onClick={() => {
              if (name.length === 0) return;
              onSign(name);
              onClose();
            }}
          >
            Record signature
          </ActionButton>
        </>
      }
    >
      <p className="text-sm font-semibold leading-relaxed text-muted-foreground">
        The money already left. This records that the printed voucher came back signed — who
        collected it and put their name to it.
      </p>
      <label className="mt-4 block">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Signed by
        </span>
        <input
          value={signedBy}
          onChange={(event) => setSignedBy(event.target.value)}
          placeholder="Name of the person who signed"
          className="mt-1.5 w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring"
        />
        <span className="mt-1.5 block text-xs font-semibold text-muted-foreground">
          Required — an unsigned voucher and a voucher signed by nobody are different problems.
        </span>
      </label>
    </ModalShell>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Add project
 * ═══════════════════════════════════════════════════════════════════════ */

const textInputClass =
  'mt-1.5 w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none transition-colors placeholder:font-medium placeholder:text-muted-foreground focus:border-primary focus:ring-2 focus:ring-ring';

const dateInputClass =
  'mt-1.5 w-full rounded-lg border border-border bg-card px-3.5 py-2.5 text-sm font-semibold text-foreground outline-none transition-colors focus:border-primary focus:ring-2 focus:ring-ring';

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

/** "≈ 6 months" / "18 days" — the plain-language read of a date span. Null for a non-span. */
function formatDuration(startIso: string, endIso: string): string | null {
  const start = new Date(startIso).getTime();
  const end = new Date(endIso).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return null;
  const days = Math.round((end - start) / (24 * 60 * 60 * 1000));
  if (days < 60) return `${days} day${days === 1 ? '' : 's'}`;
  const months = Math.round(days / 30);
  return `≈ ${months} month${months === 1 ? '' : 's'}`;
}

/**
 * A new body of work for a client — the contract's dates are captured here,
 * not bolted on afterwards, because they are what drives the closing
 * reminder and the final invoice once the work ends.
 */
export function AddProjectDialog({
  open,
  onClose,
  clientName,
  sources,
  onCreate,
}: {
  open: boolean;
  onClose: () => void;
  clientName: string;
  /** This client's own funding on this channel — their dedicated facility/line plus any shared pool. */
  sources: FundingSource[];
  onCreate: (input: {
    name: string;
    scope?: string;
    contractRef?: string;
    fundingSourceId: string;
    startedAt: string;
    contractEndAt: string | null;
  }) => void;
}) {
  const [name, setName] = useState('');
  const [scope, setScope] = useState('');
  const [contractRef, setContractRef] = useState('');
  const [fundingSourceId, setFundingSourceId] = useState('');
  const [startedAt, setStartedAt] = useState(todayIso());
  const [contractEndAt, setContractEndAt] = useState('');

  useEffect(() => {
    if (!open) return;
    setName('');
    setScope('');
    setContractRef('');
    setFundingSourceId(sources[0]?.id ?? '');
    setStartedAt(todayIso());
    setContractEndAt('');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const trimmedName = name.trim();
  const canSubmit = trimmedName.length > 0 && fundingSourceId.length > 0 && startedAt.length > 0;
  const duration = contractEndAt ? formatDuration(startedAt, contractEndAt) : null;

  return (
    <ModalShell
      open={open}
      onClose={onClose}
      icon={FolderOpen}
      tint="teal"
      title="New project"
      subtitle={`A body of work for ${clientName}`}
      footer={
        <>
          <ActionButton variant="ghost" onClick={onClose}>
            Cancel
          </ActionButton>
          <ActionButton
            variant="primary"
            icon={FolderOpen}
            disabled={!canSubmit}
            onClick={() => {
              if (!canSubmit) return;
              onCreate({
                name: trimmedName,
                scope: scope.trim() || undefined,
                contractRef: contractRef.trim() || undefined,
                fundingSourceId,
                startedAt: new Date(startedAt).toISOString(),
                contractEndAt: contractEndAt ? new Date(contractEndAt).toISOString() : null,
              });
              onClose();
            }}
          >
            Create project
          </ActionButton>
        </>
      }
    >
      <label className="block">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Project name
        </span>
        <input
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="e.g. Q4 electronics corridor"
          className={textInputClass}
        />
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Scope <span className="normal-case text-muted-foreground/70">(optional)</span>
        </span>
        <input
          value={scope}
          onChange={(event) => setScope(event.target.value)}
          placeholder="What this project covers, in one line"
          className={textInputClass}
        />
      </label>

      <label className="mt-4 block">
        <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
          Contract reference <span className="normal-case text-muted-foreground/70">(optional)</span>
        </span>
        <input
          value={contractRef}
          onChange={(event) => setContractRef(event.target.value)}
          placeholder="CT-2026-XXX-NN — leave blank for spot work"
          className={cn(textInputClass, 'font-mono')}
        />
      </label>

      {sources.length > 0 ? (
        <fieldset className="mt-4">
          <legend className="mb-2 text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Funded from
          </legend>
          <div className="flex flex-col gap-2">
            {sources.map((source) => (
              <button
                key={source.id}
                type="button"
                onClick={() => setFundingSourceId(source.id)}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-card-nested border px-3.5 py-2.5 text-left text-xs font-bold transition-colors',
                  fundingSourceId === source.id
                    ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
                    : 'border-border text-muted-foreground hover:bg-surface-sunken',
                )}
              >
                <span className="truncate">{source.name}</span>
                <span className="shrink-0 font-mono text-[11px] opacity-80">{source.id}</span>
              </button>
            ))}
          </div>
        </fieldset>
      ) : null}

      <div className="mt-4 grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Start date
          </span>
          <input
            type="date"
            value={startedAt}
            onChange={(event) => setStartedAt(event.target.value)}
            className={dateInputClass}
          />
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-wide text-muted-foreground">
            Contract ends <span className="normal-case text-muted-foreground/70">(optional)</span>
          </span>
          <input
            type="date"
            value={contractEndAt}
            min={startedAt || undefined}
            onChange={(event) => setContractEndAt(event.target.value)}
            className={dateInputClass}
          />
        </label>
      </div>
      <p className="mt-1.5 text-xs font-semibold text-muted-foreground">
        {duration
          ? `Contract duration: ${duration}. A reminder appears here once the end date reaches this month.`
          : 'No end date — treated as open-ended work, not a fixed-term contract.'}
      </p>
    </ModalShell>
  );
}
