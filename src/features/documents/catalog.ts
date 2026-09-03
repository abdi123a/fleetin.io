import type { DocumentOwnerType } from './api/documentsService';

/**
 * Every paper Fleetin asks for, and nothing else.
 *
 * The catalog used to be open — the onboarding wizard had a "New Document
 * Type" box, so each of the four record types accumulated whatever the last
 * person to onboard somebody had decided to invent. Seven types across four
 * owners, several in the wrong place: the **grey card sat on the transporter**,
 * which meant a haulier with forty trucks proved its registration once, with
 * one file.
 *
 * The list is now closed and lives here, because a required document is a
 * *rule* — it gates a status, it drives an expiry alert — and a rule that
 * anybody can add from a form is not a rule. Its twin is `COMPLIANCE_CATALOG`
 * in the backend's `document-owner-type.ts`; the two must agree.
 *
 * | Owner       | Paper                    | Because                              |
 * |-------------|--------------------------|--------------------------------------|
 * | Transporter | Business License         | the company is licensed to trade     |
 * | Vehicle     | Grey Card · Insurance    | the truck is registered and covered  |
 * | Driver      | Driver License           | the person is allowed to drive       |
 * | Shipper     | Business License         | the client is a real business        |
 *
 * A transporter is onboarded with its business licence and its logo, and
 * nothing more; its trucks and its drivers bring their own papers when those
 * records are created.
 */
export interface DocumentTypeSpec {
  /** The stored `category` — the string the backend and every guard match on. */
  label: string;
  /** Whether the record is incomplete without it. All four are, today. */
  required: boolean;
  /**
   * Who issued it, asked for alongside the dates.
   *
   * Only the insurance certificate asks. A policy is worth whatever the
   * company behind it is worth — a claim is made against the insurer, not
   * against the paper — so "whose cover is this?" is part of the document.
   * The others are issued by the state, which is not a question.
   */
  issuer?: { label: string; catalog: 'insurers' };
  /**
   * The paper carries no expiry date, so nothing may ask for one.
   *
   * Only the driving licence, and only because Djibouti issues them without
   * one. It is a property of the DOCUMENT rather than of the driver: the record
   * used to hold a `licenseExpiry` column, which meant the system invented a
   * deadline, alerted on it, and withdrew a driver's verified tick when its own
   * invention lapsed. Dropped 2026-09-02.
   */
  neverExpires?: boolean;
}

export const DOCUMENT_CATALOG: Readonly<
  Record<Exclude<DocumentOwnerType, 'BOOKING' | 'FOLDER'>, readonly DocumentTypeSpec[]>
> = {
  SHIPPER: [{ label: 'Business License', required: true }],
  PARTNER: [{ label: 'Business License', required: true }],
  VEHICLE: [
    { label: 'Grey Card', required: true },
    { label: 'Insurance', required: true, issuer: { label: 'Insurance company', catalog: 'insurers' } },
  ],
  DRIVER: [{ label: 'Driver License', required: true, neverExpires: true }],
};

export function documentCatalogFor(ownerType: DocumentOwnerType): readonly DocumentTypeSpec[] {
  /* A job's proofs and a drive folder's files are not compliance papers:
     nothing in either is owed. */
  if (ownerType === 'BOOKING' || ownerType === 'FOLDER') return [];
  return DOCUMENT_CATALOG[ownerType];
}

export function documentSpecFor(
  ownerType: DocumentOwnerType,
  category: string,
): DocumentTypeSpec | undefined {
  return documentCatalogFor(ownerType).find((spec) => spec.label === category);
}

/**
 * How close a paper is to being worthless.
 *
 * One scale, because "is this transporter compliant" is asked on six screens
 * and was answered slightly differently on each. `expiring` is the only
 * interesting state — expired is a fact and valid is silence, but a licence
 * with five weeks left is the one somebody can still do something about.
 */
export type DocumentValidity = 'valid' | 'expiring' | 'expired' | 'undated';

/** Six weeks. Long enough to renew a Djibouti licence without expediting it. */
export const EXPIRY_WARNING_DAYS = 42;

export function documentValidity(expiryDate: string | null | undefined, now = Date.now()): DocumentValidity {
  if (!expiryDate) return 'undated';
  const at = new Date(expiryDate).getTime();
  if (Number.isNaN(at)) return 'undated';
  if (at <= now) return 'expired';
  return at - now <= EXPIRY_WARNING_DAYS * 86_400_000 ? 'expiring' : 'valid';
}

/**
 * Newest first, where "newest" means the copy that is in force.
 *
 * A renewed paper is uploaded BESIDE the one it replaces, not over it — the old
 * certificate is still the evidence for the period it covered, and a compliance
 * file that overwrites its own history is not a compliance file. So a category
 * holds several copies, and something has to say which one is current.
 *
 * Expiry decides it, because that is what "current" means for a licence: the
 * copy that runs latest is the one in force. Upload time only breaks ties
 * between undated copies — it is a fact about the office, and a certificate
 * filed late is still the newer certificate.
 *
 * Mirrors `rank` in `compliance.ts`, which ranks the same way to decide a
 * category's state. The two must agree: a folder showing one copy as current
 * while the tally judged a different one would be reporting on a paper the
 * reader cannot see.
 */
export function newestFirst(
  a: { expiryDate?: string | null; uploadedAt?: string | null },
  b: { expiryDate?: string | null; uploadedAt?: string | null },
): number {
  return rankOf(b) - rankOf(a);
}

function rankOf(doc: { expiryDate?: string | null; uploadedAt?: string | null }): number {
  const expiry = doc.expiryDate ? new Date(doc.expiryDate).getTime() : NaN;
  if (!Number.isNaN(expiry)) return expiry;
  const uploaded = doc.uploadedAt ? new Date(doc.uploadedAt).getTime() : NaN;
  return Number.isNaN(uploaded) ? 0 : uploaded;
}

/** Whole days until it lapses — negative once it has. */
export function daysUntilExpiry(expiryDate: string, now = Date.now()): number {
  return Math.ceil((new Date(expiryDate).getTime() - now) / 86_400_000);
}
