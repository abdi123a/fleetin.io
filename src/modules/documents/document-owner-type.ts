/**
 * The entities a Document (or DocumentType catalog entry) can attach to.
 *
 * `BOOKING` carries one thing only: the proof of delivery. It is a document
 * about a *job* rather than about a counterparty or an asset, which is why it
 * did not fit the original four — and why the POD had nowhere real to live
 * until it was added.
 */
export const DOCUMENT_OWNER_TYPES = ['SHIPPER', 'PARTNER', 'VEHICLE', 'DRIVER', 'BOOKING'] as const;

/** The one document category a booking owns. Referenced wherever POD is gated. */
export const PROOF_OF_DELIVERY = 'Proof of Delivery';
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];
