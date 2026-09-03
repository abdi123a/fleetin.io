/**
 * The entities a Document (or DocumentType catalog entry) can attach to.
 *
 * `BOOKING` carries the two proofs a job produces — see `BOOKING_PROOFS`. They
 * are documents about a *job* rather than about a counterparty or an asset,
 * which is why they did not fit the original four.
 *
 * `FOLDER` is a file somebody put in a drive folder of their own — see
 * `DriveFolder`. It has no catalogue: nothing in one is required, expires, or
 * is reviewed. It is just a file, kept.
 */
export const DOCUMENT_OWNER_TYPES = ['SHIPPER', 'PARTNER', 'VEHICLE', 'DRIVER', 'BOOKING', 'FOLDER'] as const;
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];

/**
 * The cargo reached the consignee. Gates the delivery rung and everything past
 * it — see `hasProofOfDelivery`.
 */
export const PROOF_OF_DELIVERY = 'Proof of Delivery';

/**
 * The empty box reached the depot. Gates the last rung: a container is not home
 * because somebody clicked that it is.
 */
export const PROOF_OF_RETURN = 'Proof of Return';

/** The two categories a booking owns, in the order the job produces them. */
export const BOOKING_PROOFS = [PROOF_OF_DELIVERY, PROOF_OF_RETURN] as const;

/**
 * The compliance catalog — closed, and owned here rather than by whoever last
 * opened the onboarding wizard.
 *
 * Four papers, each attached to the thing that actually holds it:
 *
 * | Owner       | Paper                        |
 * |-------------|------------------------------|
 * | TRANSPORTER | Business License             |
 * | VEHICLE     | Grey Card · Insurance        |
 * | DRIVER      | Driver License               |
 * | SHIPPER     | Business License             |
 *
 * The grey card used to sit on the transporter, which is why a fleet of forty
 * trucks proved its registration with one document. It registers a *vehicle*,
 * so it belongs to the vehicle, and the same is true of the insurance policy
 * and of the driver's licence.
 *
 * A transporter is onboarded with its business licence and nothing else; the
 * vehicle and driver papers are asked for when those records are created.
 */
export const COMPLIANCE_CATALOG: Readonly<Record<Exclude<DocumentOwnerType, 'BOOKING' | 'FOLDER'>, readonly string[]>> = {
  SHIPPER: ['Business License'],
  PARTNER: ['Business License'],
  VEHICLE: ['Grey Card', 'Insurance'],
  DRIVER: ['Driver License'],
};
