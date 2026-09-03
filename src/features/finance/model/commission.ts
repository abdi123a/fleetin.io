import type { InvoiceRecord } from '../invoices/api/invoicesService';

/** A deal is a share of the job, or a flat fee per container. */
export type CommissionMode = 'percent' | 'fixed';

/** Which of the three deals applied. */
export type CommissionSource = 'shipper' | 'transporter' | 'house';

export const COMMISSION_SOURCE_LABEL: Record<CommissionSource, string> = {
  shipper: 'Client deal',
  transporter: 'Transporter deal',
  house: 'House rate',
};

/**
 * What either counterparty stores. `commissionMode` absent or null means no
 * deal — the house rate applies. Every field is optional because a record
 * fetched before these columns existed simply has none of them, and that reads
 * correctly as "no deal" rather than throwing.
 */
export interface CommissionDeal {
  commissionMode?: CommissionMode | null;
  commissionPct?: number | null;
  commissionFixedMinorUnits?: string | null;
}

export interface ResolvedCommission {
  mode: CommissionMode;
  /** Meaningful in `percent` mode. */
  pct: number;
  /** Meaningful in `fixed` mode: the fee for ONE container, whole DJF. */
  fixed: number;
  source: CommissionSource;
}

/**
 * The same three-step resolution the server does, mirrored here so a screen can
 * SHOW the deal before anything is issued.
 *
 * The server's answer is the one that gets stored — this never writes. It
 * exists so an operator sees the rate, and which deal it came from, while they
 * are still deciding whether to raise the document. A number that only appears
 * after you commit is a number you cannot check.
 *
 * A deal exists when its MODE is set, never when its amount is non-zero: a
 * negotiated 0% or 0-franc fee is a real commercial decision, and reading the
 * amount instead would silently bill it at the house rate.
 */
export function resolveCommission(params: {
  shipper?: CommissionDeal | null;
  transporter?: CommissionDeal | null;
  housePct: number;
}): ResolvedCommission {
  const fromDeal = (deal: CommissionDeal | null | undefined, source: CommissionSource) => {
    if (!deal?.commissionMode) return null;
    if (deal.commissionMode === 'fixed') {
      return {
        mode: 'fixed' as const,
        pct: 0,
        fixed: Number(deal.commissionFixedMinorUnits ?? 0),
        source,
      };
    }
    return { mode: 'percent' as const, pct: deal.commissionPct ?? 0, fixed: 0, source };
  };

  return (
    fromDeal(params.shipper, 'shipper') ??
    fromDeal(params.transporter, 'transporter') ?? {
      mode: 'percent',
      pct: params.housePct,
      fixed: 0,
      source: 'house',
    }
  );
}

/**
 * Fleetin's cut of one job.
 *
 * In `percent` mode a share of the total; in `fixed` mode the agreed fee times
 * the number of containers — which is why `containerCount` is required rather
 * than defaulted. A fixed deal applied once to a twenty-container shipment
 * would under-charge by nineteen fees.
 *
 * Capped at the total for the same reason the server caps it: a flat fee
 * larger than the job it is charged against would otherwise show the
 * transporter being paid a negative amount.
 */
export function commissionOf(
  total: number,
  commission: Pick<ResolvedCommission, 'mode' | 'pct' | 'fixed'>,
  containerCount: number,
): number {
  if (commission.mode === 'fixed') {
    const boxes = Math.max(1, Math.trunc(containerCount) || 1);
    return Math.min(total, Math.max(0, commission.fixed) * boxes);
  }
  const safe = Number.isFinite(commission.pct) ? Math.min(100, Math.max(0, commission.pct)) : 0;
  return Math.round((total * safe) / 100);
}

/** "7.5% of the job" / "5,000 DJF a container" — one line an operator can read. */
export function describeCommission(deal: CommissionDeal | null | undefined): string | null {
  if (!deal?.commissionMode) return null;
  if (deal.commissionMode === 'fixed') {
    const fee = Number(deal.commissionFixedMinorUnits ?? 0);
    return `${fee.toLocaleString('en-US')} DJF a container`;
  }
  return `${deal.commissionPct ?? 0}% of the job`;
}

/**
 * Where one shipment stands, as a single word.
 *
 * Read in this order, because each state supersedes the one before it: money
 * in beats a bill sent, a bill beats a quote, and a quote beats nothing. A
 * shipment nobody has priced is `unpriced` regardless — it cannot be billed at
 * all, and saying "not billed" would hide the reason.
 */
export type BillingState = 'unpriced' | 'nothing' | 'quoted' | 'billed' | 'paid';

export function documentStateOf(
  clientRateMinorUnits: string | null,
  documents: InvoiceRecord[],
): BillingState {
  if (clientRateMinorUnits == null) return 'unpriced';

  const live = documents.filter((doc) => doc.status !== 'Cancelled');
  const invoice = live.find((doc) => doc.kind === 'invoice');
  if (invoice?.status === 'Paid') return 'paid';
  if (invoice) return 'billed';
  if (live.some((doc) => doc.kind === 'proforma')) return 'quoted';
  return 'nothing';
}
