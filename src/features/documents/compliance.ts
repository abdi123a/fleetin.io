import { documentCatalogFor } from './catalog';
import type { DocumentOwnerType, DocumentRecord } from './api/documentsService';

/**
 * Whether a counterparty's papers are in order, counted the same way everywhere.
 *
 * The catalogue says which papers are required; this says which of them are
 * actually held, and how close the held ones are to lapsing. It is deliberately
 * pure and owner-agnostic — a transporter is its own licence plus every truck's
 * two papers plus every driver's one, and the same function answers "is this
 * one vehicle compliant?" and "is this haulier's whole book compliant?".
 *
 * ## The four states
 *
 * A required paper is `missing`, `expired`, `expiring` or `valid`, in that
 * order of urgency, and every required paper is exactly one of them. There is
 * no fifth state for "uploaded but not yet verified": a document under review
 * is one somebody has already produced, and treating it as a gap would send an
 * operator chasing a haulier who has done what was asked.
 *
 * `expired` is either of two things — a date in the past, or the backend having
 * already stamped the record `Expired`. Both are checked because they can
 * disagree: the stamp is written by a sweep, and between a paper lapsing and
 * that sweep running the date is the only thing that knows.
 */
export type DocumentState = 'valid' | 'expiring' | 'expired' | 'missing';

/**
 * How long before a lapse counts as news.
 *
 * Thirty days is the window a replacement can realistically be obtained in on
 * this corridor — an insurance renewal or a licence takes weeks, not days — so
 * a shorter window would report a problem too late to act on it.
 */
export const EXPIRING_WINDOW_DAYS = 30;

const DAY_MS = 24 * 60 * 60 * 1000;

export interface ComplianceOwner {
  ownerType: DocumentOwnerType;
  ownerId: string;
  /** For the finding list: "DT-2238-DJ", "Kamil Abdallah Guedi". */
  ownerLabel: string;
}

export interface ComplianceFinding {
  ownerType: DocumentOwnerType;
  ownerId: string;
  ownerLabel: string;
  /** The catalogue's own label — the string the backend matches on. */
  category: string;
  state: DocumentState;
  /** Null when the paper is missing, or held but carries no expiry. */
  expiryDate: string | null;
  /** Negative once it has lapsed. Null when there is no date to count to. */
  daysToExpiry: number | null;
}

export interface ComplianceTally {
  required: number;
  valid: number;
  expiring: number;
  expired: number;
  missing: number;
  /** Everything that is not `valid` — the number worth putting on a row. */
  attention: number;
}

/** The state of one required paper, given whichever copies of it are held. */
export function documentState(held: DocumentRecord[], now: number): DocumentState {
  if (held.length === 0) return 'missing';
  /* The newest copy wins. A renewed insurance certificate is uploaded beside
     the one it replaces rather than over it, so the oldest is nearly always
     lapsed and reading it would report every renewed policy as expired. */
  const newest = held.reduce((best, doc) => (rank(doc) > rank(best) ? doc : best));
  if (newest.status === 'Expired') return 'expired';
  if (!newest.expiryDate) return 'valid';
  const expiresAt = new Date(newest.expiryDate).getTime();
  if (Number.isNaN(expiresAt)) return 'valid';
  if (expiresAt <= now) return 'expired';
  if (expiresAt - now <= EXPIRING_WINDOW_DAYS * DAY_MS) return 'expiring';
  return 'valid';
}

/** Newest by expiry where there is one, else by upload. */
function rank(doc: DocumentRecord): number {
  const expiry = doc.expiryDate ? new Date(doc.expiryDate).getTime() : NaN;
  if (!Number.isNaN(expiry)) return expiry;
  const uploaded = new Date(doc.uploadedAt).getTime();
  return Number.isNaN(uploaded) ? 0 : uploaded;
}

/**
 * Every required paper across a set of owners, one finding each.
 *
 * `docs` is the whole document book rather than one owner's slice — the callers
 * that need this are lists, and fetching per owner would be one request per
 * truck.
 */
export function complianceFindings(
  owners: ComplianceOwner[],
  docs: DocumentRecord[],
  now = Date.now(),
): ComplianceFinding[] {
  const byOwner = new Map<string, DocumentRecord[]>();
  for (const doc of docs) {
    const key = `${doc.ownerType}:${doc.ownerId}`;
    const bucket = byOwner.get(key);
    if (bucket) bucket.push(doc);
    else byOwner.set(key, [doc]);
  }

  const findings: ComplianceFinding[] = [];
  for (const owner of owners) {
    const owned = byOwner.get(`${owner.ownerType}:${owner.ownerId}`) ?? [];
    for (const spec of documentCatalogFor(owner.ownerType)) {
      if (!spec.required) continue;
      const held = owned.filter((doc) => doc.category === spec.label);
      const state = documentState(held, now);
      const newest = held.length
        ? held.reduce((best, doc) => (rank(doc) > rank(best) ? doc : best))
        : null;
      const expiryDate = newest?.expiryDate ?? null;
      findings.push({
        ownerType: owner.ownerType,
        ownerId: owner.ownerId,
        ownerLabel: owner.ownerLabel,
        category: spec.label,
        state,
        expiryDate,
        daysToExpiry: expiryDate
          ? Math.round((new Date(expiryDate).getTime() - now) / DAY_MS)
          : null,
      });
    }
  }
  return findings;
}

export function tallyFindings(findings: ComplianceFinding[]): ComplianceTally {
  const tally: ComplianceTally = {
    required: findings.length,
    valid: 0,
    expiring: 0,
    expired: 0,
    missing: 0,
    attention: 0,
  };
  for (const finding of findings) {
    tally[finding.state] += 1;
    if (finding.state !== 'valid') tally.attention += 1;
  }
  return tally;
}

/** Most urgent first, then soonest to lapse — the order a chase list is worked. */
const STATE_ORDER: Record<DocumentState, number> = {
  missing: 0,
  expired: 1,
  expiring: 2,
  valid: 3,
};

export function byUrgency(a: ComplianceFinding, b: ComplianceFinding): number {
  const state = STATE_ORDER[a.state] - STATE_ORDER[b.state];
  if (state !== 0) return state;
  return (a.daysToExpiry ?? Infinity) - (b.daysToExpiry ?? Infinity);
}

/** The words the UI uses, in one place so a bar and a list never disagree. */
export const DOCUMENT_STATE_LABEL: Record<DocumentState, string> = {
  valid: 'Valid',
  expiring: 'Expiring',
  expired: 'Expired',
  missing: 'Missing',
};
