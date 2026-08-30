/**
 * Where a shipper account stands.
 *
 * `Suspended` was added 2026-08-30. Without it the only way to take a company
 * out of circulation was to delete the record — which throws away an account
 * that is meant to come back. It sits between `Pending` and `Canceled`
 * deliberately: paused, not refused and not ended.
 */
export type ApprovalStatus = 'Verified' | 'Pending' | 'Suspended' | 'Canceled';

export type CompanySize =
  | 'Micro (1-10)'
  | 'Small (11-50)'
  | 'Medium (51-250)'
  | 'Large (251-1000)'
  | 'Enterprise (1000+)';

export interface ContactPerson {
  id: string;
  name: string;
  title: string;
  email: string;
  phone: string;
  isPrimary?: boolean;
}

export interface ShipperDocument {
  id: string;
  name: string;
  category:
    | 'Business License'
    | 'Incorporation Certificate'
    | 'Tax Certificate'
    | 'Import/Export License'
    | 'Commercial Registration'
    | 'ID/Passport'
    | 'Contract'
    | 'Other';
  uploadDate: string;
  fileSize: string;
  status: 'Verified' | 'Pending Review' | 'Rejected';
  fileUrl?: string;
}

export interface ShipperRecord {
  id: string;
  /** Human-readable code (e.g. "SHP-101") — the backend's display reference, distinct from `id`. Used as the URL identifier for the detail page. */
  reference: string;
  companyLegalName: string;
  registrationNumber: string;
  industry: string;
  companySize: CompanySize;

  // Simple Location
  country: string;
  address: string;

  // Executive Contacts
  primaryContact: ContactPerson;
  operationalContacts?: ContactPerson[];

  // Operational Metrics
  projectsCount: number;
  activeShipments: number;
  pastShipments: number;
  /**
   * When a truck last collected for this shipper — the newest
   * `scheduledPickupTime` across their shipments, computed server-side beside
   * the counts above. `null` means they have never shipped with us, which is a
   * different thing from having gone quiet and is drawn differently.
   */
  lastShipmentAt: string | null;

  // Compliance Documents Vault
  uploadedDocuments: ShipperDocument[];

  // Client Status & Meta
  approvalStatus: ApprovalStatus;
  registrationDate: string;
  logoUrl?: string;
}

export interface ProfileCompletionResult {
  percentage: number;
  totalItems: number;
  completedItemsCount: number;
  completedFields: { id: string; label: string; details?: string }[];
  remainingFields: { id: string; label: string; description: string }[];
}

export function calculateShipperCompletion(shipper: Partial<ShipperRecord>): ProfileCompletionResult {
  const items = [
    {
      id: 'companyLegalName',
      label: 'Company Legal Name',
      description: 'Enter official business legal entity name',
      isFilled: Boolean(shipper.companyLegalName?.trim()),
      details: shipper.companyLegalName,
    },
    {
      id: 'companySize',
      label: 'Company Scale / Size',
      description: 'Specify employee headcount scale',
      isFilled: Boolean(shipper.companySize?.trim()),
      details: shipper.companySize,
    },
    {
      id: 'country',
      label: 'Country of Operation',
      description: 'Select operating country location',
      isFilled: Boolean(shipper.country?.trim()),
      details: shipper.country,
    },
    {
      id: 'address',
      label: 'Physical Address',
      description: 'Provide detailed headquarters address',
      isFilled: Boolean(shipper.address?.trim()),
      details: shipper.address,
    },
    {
      id: 'primaryContactName',
      label: 'Primary Contact Person',
      description: 'Add name of executive point of contact',
      isFilled: Boolean(shipper.primaryContact?.name?.trim()),
      details: shipper.primaryContact?.name,
    },
    {
      id: 'primaryContactEmail',
      label: 'Primary Contact Email',
      description: 'Add valid business email address',
      isFilled: Boolean(shipper.primaryContact?.email?.trim()),
      details: shipper.primaryContact?.email,
    },
    {
      id: 'primaryContactPhone',
      label: 'Primary Contact Phone / WhatsApp',
      description: 'Add direct phone number with country code',
      isFilled: Boolean(shipper.primaryContact?.phone?.trim()),
      details: shipper.primaryContact?.phone,
    },
    {
      id: 'businessLicenseDoc',
      label: 'Business License Document',
      description: 'Upload valid official Business License',
      isFilled: Boolean(
        shipper.uploadedDocuments?.some(
          (d) => d.category === 'Business License',
        ),
      ),
      details: shipper.uploadedDocuments?.find(
        (d) => d.category === 'Business License',
      )?.name,
    },
  ];

  const filled = items.filter((i) => i.isFilled);
  const remaining = items.filter((i) => !i.isFilled);
  const percentage = Math.round((filled.length / items.length) * 100);

  return {
    percentage,
    totalItems: items.length,
    completedItemsCount: filled.length,
    completedFields: filled.map((f) => ({ id: f.id, label: f.label, details: f.details })),
    remainingFields: remaining.map((r) => ({ id: r.id, label: r.label, description: r.description })),
  };
}
