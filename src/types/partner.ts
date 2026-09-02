/**
 * Partner (Transporter) type definitions.
 *
 * Partners are transport companies / fleet owners that carry cargo for Shippers.
 * Each Partner owns Drivers and Vehicles, maintains compliance documents,
 * and operates under a pricing agreement.
 */

// ─── Shared ────────────────────────────────────────────────────────────────

export type PartnerStatus = 'Active' | 'Suspended' | 'Pending' | 'Inactive';

export type OperationalStatus = 'Available' | 'In Transit' | 'Under Maintenance' | 'Out of Service';

export type DocumentVerificationStatus = 'Verified' | 'Pending Review' | 'Rejected' | 'Expired';

// ─── Dispatcher / Contact ───────────────────────────────────────────────────

export interface DispatcherContact {
  id: string;
  name: string;
  title: string;
  phone: string;
  email: string;
  isPrimary?: boolean;
}

// ─── Bank Account ───────────────────────────────────────────────────────────

export interface BankAccount {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban?: string;
  swiftCode?: string;
  currency: string;
}

// ─── Pricing Grid ───────────────────────────────────────────────────────────

export interface PricingTier {
  id: string;
  route: string;           // e.g. "Djibouti → Addis Ababa"
  vehicleType: string;     // e.g. "40ft Container Truck"
  basePrice: number;
  currency: string;
  pricePerKm?: number;
}

// ─── Partner Document ───────────────────────────────────────────────────────

/**
 * Free-form document type label. Onboarding (AddPartnerForm) sources the set
 * of categories on offer from the persisted catalog in
 * `usePartnerDocumentTypeStore` rather than a closed union, since admins can
 * define new required/optional document types there for every future
 * transporter onboarding. Kept as a type alias (not `string` inline) so call
 * sites read as "this is a document category", not just any string.
 */
export type PartnerDocumentCategory = string;

export interface PartnerDocument {
  id: string;
  name: string;
  category: PartnerDocumentCategory;
  uploadDate: string;
  expiryDate?: string;
  fileSize: string;
  status: DocumentVerificationStatus;
  rejectionReason?: string;
  version?: number;
  downloadCount?: number;
  fileUrl?: string;
}

// ─── Driver ─────────────────────────────────────────────────────────────────

export interface PartnerDriver {
  id: string;              // e.g. DRV-001
  reference?: string;
  fullName: string;
  phone: string;
  nationalId: string;
  drivingLicenseNumber: string;
  licenseExpiry: string;   // ISO date string or formatted
  nationalIdExpiry?: string;
  /**
   * Container runs driven — one per booking, cancelled and failed excluded,
   * counted server-side.
   *
   * This replaced `assignedVehicleId`/`assignedVehiclePlate`. A driver is not
   * paired with a truck any more: they meet on a booking, per trip, which is
   * where dispatch actually happens — so "which truck is theirs" had no single
   * true answer and the stored one could disagree with every job on the road.
   */
  trips?: number;
  profilePictureUrl?: string;
  accessCards?: string[];  // e.g. ["Port Gate A", "Free Zone"]
  status: OperationalStatus;
  joinDate: string;
  documents?: PartnerDocument[];
}

// ─── Vehicle ─────────────────────────────────────────────────────────────────

export type TruckType =
  | 'Flatbed'
  | '20ft Container'
  | '40ft Container'
  | 'Refrigerated'
  | 'Tanker'
  | 'Tipper'
  | 'Box Truck'
  | 'Low Loader'
  | 'Other';

export interface PartnerVehicle {
  id: string;              // e.g. VEH-001
  reference?: string;
  plateNumber: string;
  truckType: TruckType;
  containerCapacity?: string;   // e.g. "20ft", "40ft", "60 tons"
  trailerInfo?: string;
  ownershipType: 'Owned' | 'Leased' | 'Rented';
  insuranceStartDate?: string;
  insuranceExpiry: string;
  registrationExpiry: string;
  hasGPS: boolean;
  gpsDeviceId?: string;
  operationalStatus: OperationalStatus;
  /**
   * Container runs made — one per booking, cancelled and failed excluded,
   * counted server-side. Replaced the standing `assignedDriverId`/
   * `assignedDriverName`; see `PartnerDriver.trips`.
   */
  trips?: number;
  year?: number;
  make?: string;
  model?: string;
  documents?: PartnerDocument[];
}

// ─── Compliance ──────────────────────────────────────────────────────────────

export interface ComplianceAlert {
  id: string;
  type: 'missing' | 'expired' | 'expiring_soon' | 'rejected';
  severity: 'critical' | 'warning' | 'info';
  message: string;
  relatedDocId?: string;
  date: string;
}

export interface ComplianceCheckItem {
  id: string;
  label: string;
  description: string;
  isComplete: boolean;
  completedDate?: string;
  relatedDocId?: string;
}

// ─── Partner Record ──────────────────────────────────────────────────────────

export interface PartnerRecord {
  id: string;                         // e.g. PTR-001
  /** Human-readable code (e.g. "PTR-001") — the backend's display reference, distinct from `id`. Used as the URL identifier for the detail page. */
  reference: string;
  companyLegalName: string;
  registrationNumber: string;
  businessLicenseNumber?: string;
  operatingRegions: string[];          // e.g. ["Djibouti", "Ethiopia", "Somalia"]
  serviceCategories: string[];         // e.g. ["Container Haulage", "Bulk Cargo"]
  fleetSize: number;
  vehicleTypes: string[];              // e.g. ["40ft Container", "Flatbed"]

  // Location
  country: string;
  address: string;

  // Insurance & License
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: string;

  // Contacts
  primaryDispatcher: DispatcherContact;
  additionalDispatchers?: DispatcherContact[];

  // Financial
  bankAccount?: BankAccount;
  pricingGrid?: PricingTier[];

  // Compliance & Documents
  uploadedDocuments: PartnerDocument[];
  partnerStatus: PartnerStatus;

  // Fleet (owned by this partner)
  drivers: PartnerDriver[];
  vehicles: PartnerVehicle[];

  // Meta
  logoUrl?: string;
  registrationDate: string;
  lastUpdated?: string;
}

// ─── Profile Completion ──────────────────────────────────────────────────────

export interface PartnerProfileCompletion {
  percentage: number;
  totalItems: number;
  completedItemsCount: number;
  completedFields: { id: string; label: string; details?: string }[];
  remainingFields: { id: string; label: string; description: string }[];
}

export function calculatePartnerCompletion(partner: Partial<PartnerRecord>): PartnerProfileCompletion {
  const items = [
    {
      id: 'companyLegalName',
      label: 'Company Legal Name',
      description: 'Enter official business legal entity name',
      isFilled: Boolean(partner.companyLegalName?.trim()),
      details: partner.companyLegalName,
    },
    {
      id: 'country',
      label: 'Country of Operation',
      description: 'Select operating country location',
      isFilled: Boolean(partner.country?.trim()),
      details: partner.country,
    },
    {
      id: 'operatingRegions',
      label: 'Operating Regions',
      description: 'Define the regions this transporter covers',
      isFilled: Boolean(partner.operatingRegions && partner.operatingRegions.length > 0),
      details: partner.operatingRegions?.join(', '),
    },
    {
      id: 'fleetSize',
      label: 'Fleet Size',
      description: 'Number of vehicles in the fleet',
      isFilled: Boolean(partner.fleetSize && partner.fleetSize > 0),
      details: partner.fleetSize ? `${partner.fleetSize} vehicles` : undefined,
    },
    {
      id: 'primaryDispatcher',
      label: 'Primary Dispatcher Contact',
      description: 'Add primary dispatch point of contact',
      isFilled: Boolean(partner.primaryDispatcher?.name?.trim()),
      details: partner.primaryDispatcher?.name,
    },
    {
      id: 'primaryDispatcherPhone',
      label: 'Dispatcher Phone',
      description: 'Add dispatcher phone number with country code',
      isFilled: Boolean(partner.primaryDispatcher?.phone?.trim()),
      details: partner.primaryDispatcher?.phone,
    },
    {
      /* The transporter's own paper, and its only one. The grey card used to
         be checked here, which asked a haulage COMPANY to prove a VEHICLE's
         registration — so one file cleared a fleet of forty. Each truck carries
         its own grey card and insurance now, and each driver their licence. */
      id: 'businessLicenseDoc',
      label: 'Business License',
      description: 'Upload the company\u2019s valid business licence',
      isFilled: Boolean(partner.uploadedDocuments?.some((d) => d.category === 'Business License')),
      details: partner.uploadedDocuments?.find((d) => d.category === 'Business License')?.name,
    },
    {
      id: 'vehicles',
      label: 'Vehicle Registry',
      description: 'Register at least one vehicle in the fleet',
      isFilled: Boolean(partner.vehicles && partner.vehicles.length > 0),
      details: partner.vehicles ? `${partner.vehicles.length} vehicle(s) registered` : undefined,
    },
    {
      id: 'drivers',
      label: 'Driver Registry',
      description: 'Register at least one driver',
      isFilled: Boolean(partner.drivers && partner.drivers.length > 0),
      details: partner.drivers ? `${partner.drivers.length} driver(s) registered` : undefined,
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

/**
 * Derive compliance alerts from a partner record (documents + drivers + vehicles).
 */
export function deriveComplianceAlerts(partner: Partial<PartnerRecord>): ComplianceAlert[] {
  const alerts: ComplianceAlert[] = [];
  const today = new Date();
  const soonDays = 30;

  const isExpired = (dateStr?: string) => {
    if (!dateStr) return false;
    return new Date(dateStr) < today;
  };

  const isExpiringSoon = (dateStr?: string): dateStr is string => {
    if (!dateStr) return false;
    const d = new Date(dateStr);
    const diff = (d.getTime() - today.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 0 && diff <= soonDays;
  };

  // Document alerts
  (partner.uploadedDocuments || []).forEach((doc) => {
    if (doc.status === 'Expired' || isExpired(doc.expiryDate)) {
      alerts.push({
        id: `alert-doc-expired-${doc.id}`,
        type: 'expired',
        severity: 'critical',
        message: `${doc.category} "${doc.name}" has expired`,
        relatedDocId: doc.id,
        date: doc.expiryDate || doc.uploadDate,
      });
    } else if (isExpiringSoon(doc.expiryDate)) {
      alerts.push({
        id: `alert-doc-expiring-${doc.id}`,
        type: 'expiring_soon',
        severity: 'warning',
        message: `${doc.category} "${doc.name}" expires on ${doc.expiryDate}`,
        relatedDocId: doc.id,
        date: doc.expiryDate,
      });
    } else if (doc.status === 'Rejected') {
      alerts.push({
        id: `alert-doc-rejected-${doc.id}`,
        type: 'rejected',
        severity: 'critical',
        message: `${doc.category} was rejected${doc.rejectionReason ? `: ${doc.rejectionReason}` : ''}`,
        relatedDocId: doc.id,
        date: doc.uploadDate,
      });
    }
  });

  // Driver license alerts
  (partner.drivers || []).forEach((drv) => {
    if (isExpired(drv.licenseExpiry)) {
      alerts.push({
        id: `alert-drv-license-${drv.id}`,
        type: 'expired',
        severity: 'critical',
        message: `Driver "${drv.fullName}" driving license expired on ${drv.licenseExpiry}`,
        date: drv.licenseExpiry,
      });
    } else if (isExpiringSoon(drv.licenseExpiry)) {
      alerts.push({
        id: `alert-drv-expiring-${drv.id}`,
        type: 'expiring_soon',
        severity: 'warning',
        message: `Driver "${drv.fullName}" license expires on ${drv.licenseExpiry}`,
        date: drv.licenseExpiry,
      });
    }
  });

  // Vehicle insurance / registration alerts
  (partner.vehicles || []).forEach((veh) => {
    if (isExpired(veh.insuranceExpiry)) {
      alerts.push({
        id: `alert-veh-ins-${veh.id}`,
        type: 'expired',
        severity: 'critical',
        message: `Vehicle ${veh.plateNumber} insurance expired on ${veh.insuranceExpiry}`,
        date: veh.insuranceExpiry,
      });
    } else if (isExpiringSoon(veh.insuranceExpiry)) {
      alerts.push({
        id: `alert-veh-ins-soon-${veh.id}`,
        type: 'expiring_soon',
        severity: 'warning',
        message: `Vehicle ${veh.plateNumber} insurance expires on ${veh.insuranceExpiry}`,
        date: veh.insuranceExpiry,
      });
    }
    if (isExpired(veh.registrationExpiry)) {
      alerts.push({
        id: `alert-veh-reg-${veh.id}`,
        type: 'expired',
        severity: 'critical',
        message: `Vehicle ${veh.plateNumber} registration expired on ${veh.registrationExpiry}`,
        date: veh.registrationExpiry,
      });
    }
  });

  return alerts;
}

/**
 * Compute a compliance score (0–100) from documents, drivers, and vehicles.
 */
export function computeComplianceScore(partner: Partial<PartnerRecord>): number {
  const docs = partner.uploadedDocuments || [];
  const drivers = partner.drivers || [];
  const vehicles = partner.vehicles || [];

  if (docs.length === 0 && drivers.length === 0 && vehicles.length === 0) return 0;

  const verifiedDocs = docs.filter((d) => d.status === 'Verified').length;
  const totalDocs = Math.max(docs.length, 1);

  const validDrivers = drivers.filter((d) => {
    const exp = new Date(d.licenseExpiry);
    return exp > new Date();
  }).length;
  const totalDrivers = Math.max(drivers.length, 1);

  const validVehicles = vehicles.filter((v) => {
    const insOk = new Date(v.insuranceExpiry) > new Date();
    const regOk = new Date(v.registrationExpiry) > new Date();
    return insOk && regOk;
  }).length;
  const totalVehicles = Math.max(vehicles.length, 1);

  const score = Math.round(
    ((verifiedDocs / totalDocs) * 0.5 + (validDrivers / totalDrivers) * 0.25 + (validVehicles / totalVehicles) * 0.25) * 100,
  );

  return Math.min(100, Math.max(0, score));
}
