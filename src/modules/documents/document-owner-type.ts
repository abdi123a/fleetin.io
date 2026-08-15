/** The four entities a Document (or DocumentType catalog entry) can attach to. */
export const DOCUMENT_OWNER_TYPES = ['SHIPPER', 'PARTNER', 'VEHICLE', 'DRIVER'] as const;
export type DocumentOwnerType = (typeof DOCUMENT_OWNER_TYPES)[number];
