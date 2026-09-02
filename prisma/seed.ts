import { PrismaClient, UserStatus } from '@prisma/client';
import { NestFactory } from '@nestjs/core';
import { hashPassword } from '../src/common/security/password.util';
import { PERMISSIONS, WILDCARD_ALL } from '../src/common/constants/permissions';
import { AppModule } from '../src/app.module';
import { StorageService } from '../src/modules/storage/storage.service';
import { EmptyReturnsService } from '../src/modules/empty-returns/empty-returns.service';
import { seedHr } from './seed-hr';
import { ID_DIGITS, formatReference } from '../src/common/helpers/reference.util';
import { assertSeedTargetIsSafe } from './seed-target-guard';

const prisma = new PrismaClient();

/**
 * A seed `mockId` in the short `AAA-#####` scheme every minted reference uses:
 * `MSN-2026-8801` -> `MSN-08801`, `DRV-001` -> `DRV-00001`.
 *
 * The mock ids themselves stay long — they are this file's internal join keys,
 * written into a dozen cross-references between shippers, missions, drivers and
 * vehicles — so the conversion happens at every point one touches the database
 * instead. Anything that is not `PREFIX-digits` is somebody else's number (a
 * DPCS booking id, a container number) and passes through untouched.
 */
function shortRef(mockId: string): string {
  const match = /^([A-Z]{2,4})-[\d-]*?(\d+)$/.exec(mockId);
  if (!match) return mockId;
  const [, prefix = '', digits = ''] = match;
  return formatReference(prefix, parseInt(digits.slice(-ID_DIGITS), 10));
}

/**
 * Baseline roles.
 *
 * Permissions use the `resource.action` convention defined in
 * src/common/constants/permissions.ts, and are written as references to that
 * catalogue rather than as string literals — a permission that is renamed
 * there fails this file at compile time instead of silently seeding a grant
 * that no guard will ever match.
 *
 * `resource.*` grants every action on that resource; `*` grants everything.
 */
const DEFAULT_ROLES = [
  {
    name: 'ADMIN',
    description: 'System Administrator with full access to all resources',
    permissions: [WILDCARD_ALL],
  },
  {
    name: 'MANAGER',
    description: 'Fleet Manager with control over operations, fleet and analytics',
    permissions: [
      'users.*',
      'shippers.*',
      'partners.*',
      'vehicles.*',
      'drivers.*',
      'shipments.*',
      'bookings.*',
      'empty-returns.*',
      'documents.*',
      'finance.*',
      'projects.*',
      PERMISSIONS.analytics.view,
      PERMISSIONS.roles.view,
      /* Own team only, and deliberately without `hr.view-salary` or
       * `hr.view-identity`: a line manager approves leave and reads a
       * profile, but never sees a salary or an ID scan. */
      PERMISSIONS.hr.view,
      PERMISSIONS.leave.view,
      PERMISSIONS.leave.approve,
      'workspace.*',
    ],
  },
  /*
   * HR roles.
   *
   * The four §6 roles land as three new roles plus a grant on the existing
   * MANAGER. The lines between them run *through* an employee record rather
   * than around it, which is why `hr.view-salary` and `hr.view-identity`
   * exist: HR_ADMIN holds both, FINANCE holds salary but not identity, and a
   * MANAGER holds neither while still seeing their team.
   *
   * Row scoping (MANAGER to their own reports, EMPLOYEE to their own record)
   * is enforced in the service layer, never by these grants alone.
   */
  {
    name: 'HR_ADMIN',
    description: 'HR Administrator — full access to staff records, payroll and HR documents',
    permissions: [
      'hr.*',
      'payroll.*',
      'hr-documents.*',
      'leave.*',
      'workspace.*',
      PERMISSIONS.settings.view,
    ],
  },
  {
    name: 'FINANCE',
    description: 'Finance — payroll figures and bank transfers, no personal identity documents',
    permissions: [
      'finance.*',
      PERMISSIONS.hr.view,
      PERMISSIONS.hr.viewSalary,
      PERMISSIONS.payroll.view,
      PERMISSIONS.payroll.calculate,
      PERMISSIONS.payroll.pay,
      PERMISSIONS.hrDocuments.view,
      PERMISSIONS.hrDocuments.issue,
      PERMISSIONS.hrDocuments.download,
      PERMISSIONS.leave.view,
      'workspace.*',
    ],
  },
  {
    name: 'EMPLOYEE',
    description: 'Staff self-service — own record, own payslips, own leave requests',
    permissions: [
      PERMISSIONS.hr.view,
      PERMISSIONS.hr.viewSalary, // own record only; enforced by row-level scoping
      PERMISSIONS.payroll.view,
      PERMISSIONS.hrDocuments.view,
      PERMISSIONS.hrDocuments.download,
      PERMISSIONS.leave.view,
      PERMISSIONS.leave.request,
      /* Can raise work and be given it; cannot hand it to somebody else or
       * edit work they did not raise. */
      PERMISSIONS.workspace.view,
      PERMISSIONS.workspace.create,
    ],
  },
  {
    name: 'DISPATCHER',
    description: 'Logistics Dispatcher managing scheduling and active shipments',
    permissions: [
      'shipments.*',
      'empty-returns.*',
      PERMISSIONS.bookings.view,
      PERMISSIONS.bookings.create,
      PERMISSIONS.bookings.update,
      PERMISSIONS.vehicles.view,
      PERMISSIONS.drivers.view,
      PERMISSIONS.partners.view,
      PERMISSIONS.shippers.view,
      PERMISSIONS.documents.view,
      PERMISSIONS.documents.upload,
      'workspace.*',
    ],
  },
  {
    name: 'DRIVER',
    description: 'Fleet Driver managing assigned deliveries and status updates',
    permissions: [
      PERMISSIONS.shipments.view,
      PERMISSIONS.shipments.update,
      PERMISSIONS.documents.view,
      PERMISSIONS.documents.upload,
    ],
  },
  {
    name: 'CLIENT',
    description: 'Client account for placing and tracking bookings',
    permissions: [
      PERMISSIONS.bookings.view,
      PERMISSIONS.bookings.create,
      PERMISSIONS.shipments.view,
      PERMISSIONS.documents.view,
    ],
  },
  {
    name: 'SHIPPER',
    description: 'Shipper portal account — views and tracks own company shipments',
    permissions: [
      PERMISSIONS.shippers.view, // own record only; enforced by row-level scoping, not by this grant
      PERMISSIONS.shipments.view,
      // The shipment report reads per-booking timelines and empty-return
      // cycles — a shipper must see its own containers' runs end to end.
      PERMISSIONS.bookings.view,
      PERMISSIONS.emptyReturns.view,
      PERMISSIONS.documents.view,
      PERMISSIONS.documents.upload,
      PERMISSIONS.analytics.view,
    ],
  },
  {
    name: 'TRANSPORTER',
    description: 'Transporter portal account — manages own fleet, views assigned shipments',
    permissions: [
      PERMISSIONS.partners.view,
      PERMISSIONS.vehicles.view,
      PERMISSIONS.vehicles.update,
      PERMISSIONS.drivers.view,
      PERMISSIONS.drivers.update,
      PERMISSIONS.shipments.view,
      PERMISSIONS.documents.view,
      PERMISSIONS.documents.upload,
      PERMISSIONS.analytics.view,
    ],
  },
] as const;

/**
 * Development admin credentials.
 *
 * Overridable via env so a non-development environment is never seeded with a
 * password that is published in this repository.
 */
const ADMIN_EMAIL = process.env.SEED_ADMIN_EMAIL ?? 'admin@fleetin.com';
const ADMIN_PASSWORD = process.env.SEED_ADMIN_PASSWORD ?? 'Admin@Fleetin2026!';
const SHIPPER_DEMO_EMAIL = process.env.SEED_SHIPPER_EMAIL ?? 'shipper-demo@fleetin.com';
const SHIPPER_DEMO_PASSWORD = process.env.SEED_SHIPPER_PASSWORD ?? 'Shipper@2026!';
const TRANSPORTER_DEMO_EMAIL = process.env.SEED_TRANSPORTER_EMAIL ?? 'transporter-demo@fleetin.com';
const TRANSPORTER_DEMO_PASSWORD = process.env.SEED_TRANSPORTER_PASSWORD ?? 'Transporter@2026!';

/* ────────────────────────────────────────────────────────────────────────
 * Seed fixtures, hand-transcribed from the frontend's mock data
 * (src/data/{shippersData,partnerData,missionsData}.ts) at the time this
 * file was written. Per DD-11, these three files are the canonical
 * counterparty/shipment source — never financeMockData.ts, whose
 * shipper/partner names and ids collide with these on several ids.
 *
 * This is a snapshot, not a live sync: the seed script runs from this repo
 * and the mock arrays live in a sibling repo with no package relationship,
 * so re-importing across repos would be fragile. If the frontend's mock
 * data changes, this file does not automatically follow.
 * ──────────────────────────────────────────────────────────────────────── */

interface SeedContact {
  name: string;
  title: string;
  email: string;
  phone: string;
  isPrimary: boolean;
}

interface SeedDocument {
  name: string;
  category: string;
}

interface SeedShipper {
  mockId: string;
  companyLegalName: string;
  registrationNumber: string;
  industry: string;
  companySize: string;
  country: string;
  address: string;
  projectsCount: number;
  approvalStatus: string;
  registrationDate: string;
  contacts: SeedContact[];
  documents: SeedDocument[];
}

const SEED_SHIPPERS: SeedShipper[] = [
  {
    mockId: 'SHP-101',
    companyLegalName: 'CMA-CGM',
    registrationNumber: 'DJ-REG-2022-4482',
    industry: 'Logistics & Freight',
    companySize: 'Medium (51-250)',
    country: 'Djibouti',
    address: 'PK12 Free Zone Commercial Complex, Djibouti City',
    projectsCount: 5,
    approvalStatus: 'Verified',
    registrationDate: '2022-10-12',
    contacts: [
      { name: 'Mohamed Amin', title: 'Chief Logistics Officer', email: 'm.amin@amina-fzco.dj', phone: '+253 77 81 92 01', isPrimary: true },
      { name: 'Sara Hassan', title: 'Warehouse Supervisor', email: 'wh.sara@amina-fzco.dj', phone: '+253 77 12 34 56', isPrimary: false },
      { name: 'Ali Nour', title: 'Customs Officer', email: 'customs@amina-fzco.dj', phone: '+253 77 99 88 77', isPrimary: false },
    ],
    documents: [
      { name: 'Business License 2026.pdf', category: 'Business License' },
      { name: 'Tax Compliance Card 2026.pdf', category: 'Tax Certificate' },
      { name: 'Import_Export_Permit_2026.pdf', category: 'Import/Export License' },
    ],
  },
  {
    mockId: 'SHP-102',
    companyLegalName: 'Al-Baraka Logistics Ltd',
    registrationNumber: 'REG-PK-2024-9921',
    industry: 'Manufacturing & Distribution',
    companySize: 'Large (251-1000)',
    country: 'Pakistan',
    address: 'Port Qasim Freight Zone, Block 4, Lahore',
    projectsCount: 5,
    approvalStatus: 'Verified',
    registrationDate: '2024-02-15',
    contacts: [
      { name: 'Tariq Mehmood', title: 'Operations Director', email: 'tariq@albaraka-logistics.pk', phone: '+92 300 4829102', isPrimary: true },
      { name: 'Kamran Akmal', title: 'Dispatch Manager', email: 'kamran@albaraka-logistics.pk', phone: '+92 301 5551234', isPrimary: false },
    ],
    documents: [
      { name: 'Commercial Reg Certificate.pdf', category: 'Commercial Registration' },
      { name: 'Tax Certificate 2026.pdf', category: 'Tax Certificate' },
    ],
  },
  {
    mockId: 'SHP-103',
    companyLegalName: 'Red Sea Cargo Group',
    registrationNumber: 'DJ-REG-2022-9910',
    industry: 'Agriculture & Food Import',
    companySize: 'Medium (51-250)',
    country: 'Djibouti',
    address: 'Harbor Commercial Complex, Zone B, Djibouti City',
    projectsCount: 3,
    approvalStatus: 'Pending',
    registrationDate: '2022-05-20',
    contacts: [
      { name: 'Dr. Hassan Gouled', title: 'VP Operations', email: 'hassan@redseacargo.dj', phone: '+253 21 35 90 20', isPrimary: true },
    ],
    documents: [{ name: 'Incorporation Certificate.pdf', category: 'Incorporation Certificate' }],
  },
  {
    mockId: 'SHP-104',
    companyLegalName: 'Horn Freight Express',
    registrationNumber: 'SO-REG-1092',
    industry: 'Retail & E-commerce',
    companySize: 'Small (11-50)',
    country: 'Somalia',
    address: 'Port Gate 2, Maritime Warehouse 5, Mogadishu',
    projectsCount: 4,
    approvalStatus: 'Verified',
    registrationDate: '2025-03-01',
    contacts: [{ name: 'Fahad Nur', title: 'Managing Director', email: 'fahad@hornfreight.so', phone: '+252 61 555 4321', isPrimary: true }],
    documents: [{ name: 'Business License 2026.pdf', category: 'Business License' }],
  },
];

interface SeedVehicle {
  mockId: string;
  plateNumber: string;
  truckType: string;
  containerCapacity?: string;
  trailerInfo?: string;
  ownershipType: string;
  insuranceExpiry: string;
  registrationExpiry: string;
  hasGPS: boolean;
  gpsDeviceId?: string;
  operationalStatus: string;
  assignedDriverMockId?: string;
  year?: number;
  make?: string;
  model?: string;
}

interface SeedDriver {
  mockId: string;
  fullName: string;
  phone: string;
  nationalId: string;
  drivingLicenseNumber: string;
  licenseExpiry: string;
  accessCards?: string[];
  status: string;
  joinDate: string;
}

interface SeedPricingTier {
  route: string;
  vehicleType: string;
  basePrice: number;
  currency: string;
  pricePerKm?: number;
}

interface SeedBankAccount {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  iban?: string;
  swiftCode?: string;
  currency: string;
}

interface SeedPartner {
  mockId: string;
  companyLegalName: string;
  registrationNumber: string;
  businessLicenseNumber?: string;
  country: string;
  address: string;
  operatingRegions: string[];
  serviceCategories: string[];
  fleetSize: number;
  vehicleTypes: string[];
  insuranceProvider?: string;
  insurancePolicyNumber?: string;
  insuranceExpiry?: string;
  partnerStatus: string;
  registrationDate: string;
  dispatchers: SeedContact[];
  bankAccount?: SeedBankAccount;
  pricingGrid?: SeedPricingTier[];
  documents: SeedDocument[];
  drivers: SeedDriver[];
  vehicles: SeedVehicle[];
}

const SEED_PARTNERS: SeedPartner[] = [
  {
    mockId: 'PTR-001',
    companyLegalName: 'Red Sea Express Ltd',
    registrationNumber: 'DJ-TRP-2021-0091',
    businessLicenseNumber: 'BL-2021-4421',
    country: 'Djibouti',
    address: 'Zone Industrielle, Port Ave, Djibouti City',
    operatingRegions: ['Djibouti', 'Ethiopia', 'Somalia', 'Kenya'],
    serviceCategories: ['Container Haulage', 'Bulk Cargo', 'Refrigerated Transport'],
    fleetSize: 14,
    vehicleTypes: ['40ft Container', 'Refrigerated', 'Flatbed'],
    insuranceProvider: 'Horn of Africa Insurance Co.',
    insurancePolicyNumber: 'INS-2024-88492',
    insuranceExpiry: '2025-12-31',
    partnerStatus: 'Active',
    registrationDate: '2021-03-15',
    dispatchers: [
      { name: 'Omar Hassan Ali', title: 'Fleet Operations Manager', phone: '+253 77 81 12 01', email: 'omar@redsea-express.dj', isPrimary: true },
      { name: 'Fatima Nour', title: 'Dispatch Coordinator', phone: '+253 77 22 33 44', email: 'f.nour@redsea-express.dj', isPrimary: false },
    ],
    bankAccount: {
      bankName: 'Banque de Djibouti',
      accountHolder: 'Red Sea Express Ltd',
      accountNumber: '0001234567890',
      iban: 'DJ21 0002 0001 0001 2345 6789 01',
      swiftCode: 'BCDIDJ2D',
      currency: 'USD',
    },
    pricingGrid: [
      { route: 'Djibouti → Addis Ababa', vehicleType: '40ft Container', basePrice: 3500, currency: 'USD' },
      { route: 'Djibouti → Hargeisa', vehicleType: 'Flatbed', basePrice: 2200, currency: 'USD' },
    ],
    documents: [
      { name: 'Business License 2026.pdf', category: 'Business License' },
    ],
    drivers: [
      { mockId: 'DRV-001', fullName: 'Abdi Yusuf Mohamed', phone: '+253 77 55 11 22', nationalId: 'DJ-NID-882211', drivingLicenseNumber: 'DL-DJ-44821', licenseExpiry: '2026-08-15', status: 'Available', joinDate: '2022-03-01', accessCards: ['Port Gate A', 'Free Zone'] },
      { mockId: 'DRV-002', fullName: 'Hassan Farah Jama', phone: '+253 77 66 22 33', nationalId: 'DJ-NID-991132', drivingLicenseNumber: 'DL-DJ-55932', licenseExpiry: '2025-09-30', status: 'In Transit', joinDate: '2021-07-15', accessCards: ['Port Gate B'] },
      { mockId: 'DRV-003', fullName: 'Ali Warsame Hussein', phone: '+253 77 99 44 55', nationalId: 'DJ-NID-337841', drivingLicenseNumber: 'DL-DJ-77342', licenseExpiry: '2027-02-28', status: 'Available', joinDate: '2023-11-01' },
    ],
    vehicles: [
      { mockId: 'VEH-001', plateNumber: 'DJ-ABJ-1234', truckType: '40ft Container', containerCapacity: '40ft / 28 tons', trailerInfo: 'DRY-VAN-2020', ownershipType: 'Owned', insuranceExpiry: '2025-12-31', registrationExpiry: '2026-03-20', hasGPS: true, gpsDeviceId: 'GPS-4421', operationalStatus: 'Available', assignedDriverMockId: 'DRV-001', year: 2020, make: 'Volvo', model: 'FH16' },
      { mockId: 'VEH-002', plateNumber: 'DJ-ABJ-5678', truckType: 'Flatbed', containerCapacity: '20 tons', ownershipType: 'Owned', insuranceExpiry: '2025-12-31', registrationExpiry: '2025-10-15', hasGPS: true, gpsDeviceId: 'GPS-4422', operationalStatus: 'In Transit', assignedDriverMockId: 'DRV-002', year: 2019, make: 'Mercedes', model: 'Actros 2641' },
      { mockId: 'VEH-003', plateNumber: 'DJ-ABJ-9900', truckType: 'Refrigerated', containerCapacity: '15 tons / -20°C', ownershipType: 'Leased', insuranceExpiry: '2026-01-15', registrationExpiry: '2026-05-30', hasGPS: true, gpsDeviceId: 'GPS-4423', operationalStatus: 'Under Maintenance', year: 2022, make: 'Scania', model: 'P410' },
    ],
  },
  {
    mockId: 'PTR-002',
    companyLegalName: 'Horn Transit Solutions',
    registrationNumber: 'ETH-TRP-2020-7741',
    country: 'Ethiopia',
    address: 'Bole Industrial Zone, Addis Ababa',
    operatingRegions: ['Ethiopia', 'Djibouti', 'Kenya'],
    serviceCategories: ['Container Haulage', 'Tanker Transport'],
    fleetSize: 22,
    vehicleTypes: ['40ft Container', '20ft Container', 'Tanker'],
    insuranceProvider: 'Awash Insurance',
    insurancePolicyNumber: 'AWI-2025-21983',
    insuranceExpiry: '2026-06-30',
    partnerStatus: 'Active',
    registrationDate: '2020-11-08',
    dispatchers: [{ name: 'Tigist Bekele', title: 'Operations Director', phone: '+251 91 234 5678', email: 'tigist@horn-transit.et', isPrimary: true }],
    documents: [{ name: 'Commercial Registration Certificate.pdf', category: 'Business License' }],
    drivers: [
      { mockId: 'DRV-101', fullName: 'Bekele Haile', phone: '+251 91 111 2222', nationalId: 'ETH-NID-33441', drivingLicenseNumber: 'DL-ETH-88812', licenseExpiry: '2026-12-01', status: 'In Transit', joinDate: '2023-01-10' },
      { mockId: 'DRV-102', fullName: 'Dawit Mulugeta', phone: '+251 91 555 6666', nationalId: 'ETH-NID-55123', drivingLicenseNumber: 'DL-ETH-99921', licenseExpiry: '2025-07-15', status: 'In Transit', joinDate: '2022-05-20' },
      { mockId: 'DRV-103', fullName: 'Meron Tadesse', phone: '+251 91 777 8888', nationalId: 'ETH-NID-77234', drivingLicenseNumber: 'DL-ETH-11132', licenseExpiry: '2026-09-30', status: 'Available', joinDate: '2023-08-14' },
    ],
    vehicles: [
      { mockId: 'VEH-101', plateNumber: 'ETH-AA-4421', truckType: '40ft Container', containerCapacity: '40ft', ownershipType: 'Owned', insuranceExpiry: '2026-06-30', registrationExpiry: '2026-01-15', hasGPS: true, gpsDeviceId: 'GPS-8891', operationalStatus: 'In Transit', assignedDriverMockId: 'DRV-101', year: 2021, make: 'Scania', model: 'R450' },
      { mockId: 'VEH-102', plateNumber: 'ETH-AA-8834', truckType: 'Tanker', containerCapacity: '30,000L', ownershipType: 'Leased', insuranceExpiry: '2026-06-30', registrationExpiry: '2025-11-30', hasGPS: false, operationalStatus: 'Available', year: 2018, make: 'DAF', model: 'XF105' },
    ],
  },
  {
    mockId: 'PTR-003',
    companyLegalName: 'Al-Baraka Transport Co.',
    registrationNumber: 'SOM-TRP-2023-3312',
    country: 'Somalia',
    address: 'Mogadishu Cargo Terminal Hub, Mogadishu',
    operatingRegions: ['Somalia', 'Kenya', 'Djibouti'],
    serviceCategories: ['General Cargo', 'Bulk Cargo'],
    fleetSize: 8,
    vehicleTypes: ['Flatbed', 'Box Truck'],
    insuranceExpiry: '2024-12-31',
    partnerStatus: 'Pending',
    registrationDate: '2023-07-12',
    dispatchers: [{ name: 'Ahmed Abdi Warsame', title: 'Fleet Manager', phone: '+252 61 234 5678', email: 'ahmed@albaraka-transport.so', isPrimary: true }],
    documents: [],
    drivers: [
      { mockId: 'DRV-201', fullName: 'Mohamud Farah Rage', phone: '+252 61 888 9999', nationalId: 'SOM-NID-44001', drivingLicenseNumber: 'DL-SOM-10022', licenseExpiry: '2025-11-20', status: 'Available', joinDate: '2024-02-10' },
    ],
    vehicles: [
      { mockId: 'VEH-201', plateNumber: 'SOM-MGS-991', truckType: 'Box Truck', containerCapacity: '10 tons', ownershipType: 'Owned', insuranceExpiry: '2024-12-31', registrationExpiry: '2025-06-30', hasGPS: false, operationalStatus: 'Available', assignedDriverMockId: 'DRV-201', year: 2017, make: 'Isuzu', model: 'NPR' },
    ],
  },
];

interface SeedTimelineStep {
  key: string;
  title: string;
  description: string;
  timestamp?: string;
  status: string;
  actor?: string;
  location?: string;
  podFileUrl?: string;
  notes?: string;
}

interface SeedMission {
  mockId: string;
  bookingId: string;
  referenceNumber: string;
  dpcsReference: string;
  status: string;
  paymentStatus: string;
  shipperMockId: string;
  customer: { name: string; company: string; phone: string; email: string; rating: number };
  partnerMockId: string;
  transporter: { name: string; company: string; phone: string; fleetCode: string; rating: number };
  driverMockId?: string;
  driver?: { name: string; phone: string; licenseNumber: string; rating: number; isVerified: boolean };
  vehicleMockId?: string;
  vehicle?: { registrationNumber: string; vehicleType: string; capacity: string; isVerified: boolean };
  pickupLocation: { name: string; address: string; city: string; gateOrTerminal?: string; contactPerson?: string; contactPhone?: string };
  deliveryLocation: { name: string; address: string; city: string; gateOrTerminal?: string; contactPerson?: string; contactPhone?: string };
  estimatedDistanceKm: number;
  estimatedDurationHours: string;
  cargoType: string;
  shipmentCategory?: string;
  containerNumber?: string;
  shippingLine?: string;
  containerReturn?: { depot: string; deadline: string; freeDays: number };
  goodsDescription: string;
  totalWeightKg: number;
  dimensions?: string;
  equipmentType?: string;
  createdAt: string;
  scheduledPickupTime: string;
  completedAt?: string;
  rateFDJ: number;
  timeline: SeedTimelineStep[];
}

const SEED_MISSIONS: SeedMission[] = [
  {
    mockId: 'MSN-2026-8801',
    bookingId: 'BKG-1178',
    referenceNumber: 'REF-99201',
    dpcsReference: 'DPCS-DJ-7731',
    status: 'En Route',
    paymentStatus: 'Paid',
    shipperMockId: 'SHP-101',
    customer: { name: 'Mohamed Amin', company: 'CMA-CGM', phone: '+253 77 81 92 01', email: 'm.amin@amina-fzco.dj', rating: 4.9 },
    partnerMockId: 'PTR-001',
    transporter: { name: 'Omar Hassan Ali', company: 'Red Sea Express Ltd', phone: '+253 77 81 12 01', fleetCode: 'RSE-FLT-01', rating: 4.8 },
    driverMockId: 'DRV-001',
    driver: { name: 'Abdi Yusuf Mohamed', phone: '+253 77 55 11 22', licenseNumber: 'DL-DJ-44821', rating: 4.9, isVerified: true },
    vehicleMockId: 'VEH-001',
    vehicle: { registrationNumber: 'DJ-ABJ-1234', vehicleType: '40ft Container Truck (Volvo FH16)', capacity: '28 Metric Tons', isVerified: true },
    pickupLocation: { name: 'Société de Gestion du Terminal à Conteneurs de Dor', address: 'Port District, Gate 4', city: 'Doraleh Port, Djibouti', gateOrTerminal: 'Terminal Gate 4A', contactPerson: 'Hassan Port Mgr', contactPhone: '+253 77 12 34 56' },
    deliveryLocation: { name: 'DIFTZ Djibouti International Free Trade Zone', address: 'Warehouse Block B-12', city: 'DIFTZ Zone, Djibouti', gateOrTerminal: 'North Customs Checkpoint', contactPerson: 'Mohamed Operations', contactPhone: '+253 77 98 76 54' },
    estimatedDistanceKm: 42,
    estimatedDurationHours: '1h 15m',
    cargoType: 'Containerized (40ft Rice)',
    shipmentCategory: 'containerized',
    containerNumber: 'MSKU-882194-0',
    shippingLine: 'Maersk Line',
    containerReturn: { depot: 'Doraleh Container Terminal (DCT)', deadline: '2026-08-10 17:00', freeDays: 7 },
    goodsDescription: 'Agriculture Goods - Premium Long Grain Rice (24t)',
    totalWeightKg: 24000,
    createdAt: '2026-08-06 07:30',
    scheduledPickupTime: '2026-08-06 08:30',
    rateFDJ: 50000,
    timeline: [
      { key: 'creation', title: 'Mission Creation', description: 'Mission created from Booking BKG-1178', timestamp: '2026-08-06 07:30:12', status: 'completed', actor: 'Super Admin' },
      { key: 'booking_confirmation', title: 'Booking Confirmation', description: 'Confirmed by Shipper CMA-CGM', timestamp: '2026-08-06 07:35:45', status: 'completed', actor: 'CMA-CGM Ops' },
      { key: 'vehicle_assignment', title: 'Vehicle Assignment', description: 'Truck DJ-ABJ-1234 assigned to mission', timestamp: '2026-08-06 07:42:10', status: 'completed', actor: 'Red Sea Express Dispatch' },
      { key: 'driver_assignment', title: 'Driver Assignment', description: 'Abdi Yusuf Mohamed dispatched & accepted', timestamp: '2026-08-06 07:45:00', status: 'completed', actor: 'Abdi Yusuf Mohamed' },
      { key: 'gate_in', title: 'Gate-in Time', description: 'Checked into Doraleh Container Terminal Gate 4A', timestamp: '2026-08-06 08:15:33', status: 'completed', actor: 'Port Gate System', location: 'Doraleh Gate 4A' },
      { key: 'pickup', title: 'Pickup Time', description: 'Container MSKU-882194-0 loaded onto chassis', timestamp: '2026-08-06 08:50:00', status: 'completed', actor: 'Terminal Crane Operator' },
      { key: 'departure', title: 'Departure Time', description: 'Departed port terminal en route to DIFTZ Free Trade Zone', timestamp: '2026-08-06 09:10:15', status: 'current', actor: 'Abdi Yusuf Mohamed', location: 'RN-1 Highway, Km 12' },
      { key: 'arrival', title: 'Arrival Time', description: 'Pending arrival at DIFTZ Warehouse B-12', status: 'pending', location: 'DIFTZ Gate B' },
      { key: 'pod_upload', title: 'POD Upload', description: 'Proof of Delivery document upload required upon offloading', status: 'pending' },
      { key: 'completion', title: 'Completion Timestamp', description: 'Final mission completion sign-off', status: 'pending' },
    ],
  },
  {
    mockId: 'MSN-2026-8802',
    bookingId: 'BKG-1174',
    referenceNumber: 'REF-99202',
    dpcsReference: 'DPCS-DJ-7732',
    status: 'Completed',
    paymentStatus: 'Paid',
    shipperMockId: 'SHP-103',
    customer: { name: 'Dr. Hassan Gouled', company: 'Red Sea Cargo Group', phone: '+253 21 35 90 20', email: 'hassan@redseacargo.dj', rating: 4.7 },
    partnerMockId: 'PTR-001',
    transporter: { name: 'Omar Hassan Ali', company: 'Red Sea Express Ltd', phone: '+253 77 81 12 01', fleetCode: 'RSE-FLT-01', rating: 4.8 },
    driverMockId: 'DRV-002',
    driver: { name: 'Hassan Farah Jama', phone: '+253 77 66 22 33', licenseNumber: 'DL-DJ-55932', rating: 4.8, isVerified: true },
    vehicleMockId: 'VEH-003',
    vehicle: { registrationNumber: 'DJ-ABJ-9900', vehicleType: 'Refrigerated Container Carrier (Scania P410)', capacity: '15 Metric Tons', isVerified: true },
    pickupLocation: { name: 'Djibouti Oil & Terminal Storage', address: 'Zone Industrielle Sud', city: 'Djibouti City' },
    deliveryLocation: { name: 'Nagad Inland Container Depot', address: 'Nagad Junction', city: 'Nagad, Djibouti' },
    estimatedDistanceKm: 20,
    estimatedDurationHours: '0h 50m',
    cargoType: 'Refrigerated Foodstuffs',
    shipmentCategory: 'containerized',
    containerNumber: 'CMAU-441092-3',
    shippingLine: 'CMA CGM',
    containerReturn: { depot: 'Doraleh Container Terminal (DCT)', deadline: '2026-08-09 17:00', freeDays: 5 },
    goodsDescription: 'Perishable Goods - Chilled Poultry',
    totalWeightKg: 22000,
    createdAt: '2026-08-07 10:00',
    scheduledPickupTime: '2026-08-07 11:30',
    completedAt: '2026-08-07 16:45',
    rateFDJ: 120000,
    timeline: [
      { key: 'creation', title: 'Mission Creation', description: 'Mission created', timestamp: '2026-08-07 10:00:00', status: 'completed' },
      { key: 'booking_confirmation', title: 'Booking Confirmation', description: 'Booking approved', timestamp: '2026-08-07 10:15:00', status: 'completed' },
      { key: 'vehicle_assignment', title: 'Vehicle Assignment', description: 'Refrigerated Carrier DJ-ABJ-9900 assigned', timestamp: '2026-08-07 10:30:00', status: 'completed' },
      { key: 'driver_assignment', title: 'Driver Assignment', description: 'Hassan Farah Jama assigned', timestamp: '2026-08-07 10:45:00', status: 'completed' },
      { key: 'gate_in', title: 'Gate-in Time', description: 'Entered oil storage terminal', timestamp: '2026-08-07 11:20:00', status: 'completed' },
      { key: 'pickup', title: 'Pickup Time', description: 'Cargo loaded', timestamp: '2026-08-07 12:00:00', status: 'completed' },
      { key: 'departure', title: 'Departure Time', description: 'Departed terminal', timestamp: '2026-08-07 12:15:00', status: 'completed' },
      { key: 'arrival', title: 'Arrival Time', description: 'Arrived at Nagad Inland Container Depot', timestamp: '2026-08-07 16:15:00', status: 'completed' },
      { key: 'pod_upload', title: 'POD Upload', description: 'Signed POD uploaded & verified', timestamp: '2026-08-07 16:30:00', status: 'completed', podFileUrl: '/docs/pod-2026-8802.pdf' },
      { key: 'completion', title: 'Completion Timestamp', description: 'Mission closed & marked completed — container CMAU-441092-3 now an empty return at Nagad', timestamp: '2026-08-07 16:45:00', status: 'completed' },
    ],
  },
  {
    mockId: 'MSN-2026-8803',
    bookingId: 'BKG-1190',
    referenceNumber: 'REF-99405',
    dpcsReference: 'DPCS-DJ-8812',
    status: 'En Route',
    paymentStatus: 'Paid',
    shipperMockId: 'SHP-101',
    customer: { name: 'Mohamed Amin', company: 'CMA-CGM', phone: '+253 77 81 92 01', email: 'm.amin@amina-fzco.dj', rating: 4.9 },
    partnerMockId: 'PTR-002',
    transporter: { name: 'Tigist Bekele', company: 'Horn Transit Solutions', phone: '+251 91 234 5678', fleetCode: 'HTS-FLT-02', rating: 4.9 },
    driverMockId: 'DRV-101',
    driver: { name: 'Bekele Haile', phone: '+251 91 111 2222', licenseNumber: 'DL-ETH-88812', rating: 4.9, isVerified: true },
    // NOTE: mock data's assignedTruck.id "VEH-104" does not exist in PTR-002's
    // fleet (a pre-existing mock-data inconsistency, flagged in the backend's
    // own DOMAIN_MAP.md §5.1). vehicleMockId is intentionally omitted so this
    // shipment seeds with a null vehicleId FK; the display snapshot below is
    // preserved as-is.
    vehicle: { registrationNumber: 'ETH-AA-9917', vehicleType: 'Heavy Lowbed Trailer (60T)', capacity: '60 Metric Tons', isVerified: true },
    pickupLocation: { name: 'Port of Djibouti Main Crane Yard', address: 'Berth 12, Heavy Equipment Terminal', city: 'Djibouti City' },
    deliveryLocation: { name: 'Ethiopian Electric Substation Expansion Site', address: 'Mile 45 Corridor', city: 'Dire Dawa Dry Port, Ethiopia' },
    estimatedDistanceKm: 310,
    estimatedDurationHours: '6h 30m',
    cargoType: 'Bulky Goods (Heavy Industrial Transformer)',
    shipmentCategory: 'bulky_goods',
    goodsDescription: 'Industrial Step-Down Substation Transformer (45 Tons)',
    totalWeightKg: 45000,
    dimensions: '6.2m × 3.5m × 4.1m',
    equipmentType: 'Lowbed Trailer + Escort Convoy',
    createdAt: '2026-08-05 06:00',
    scheduledPickupTime: '2026-08-05 07:00',
    rateFDJ: 350000,
    timeline: [
      { key: 'creation', title: 'Mission Creation', description: 'Bulky Goods Heavy Freight Booking confirmed', timestamp: '2026-08-05 06:00:00', status: 'completed' },
      { key: 'pickup', title: 'Heavy Crane Loading', description: 'Loaded onto 60T Lowbed trailer at Berth 12', timestamp: '2026-08-05 07:45:00', status: 'completed' },
      { key: 'departure', title: 'Dispatched with Escort', description: 'In transit to Dire Dawa with oversized convoy escort', timestamp: '2026-08-05 08:30:00', status: 'current' },
    ],
  },
  {
    mockId: 'MSN-2026-8804',
    bookingId: 'BKG-1175',
    referenceNumber: 'REF-99203',
    dpcsReference: 'DPCS-DJ-7733',
    status: 'POD Submitted',
    paymentStatus: 'Pending',
    shipperMockId: 'SHP-104',
    customer: { name: 'Fahad Nur', company: 'Horn Freight Express', phone: '+252 61 555 4321', email: 'fahad@hornfreight.so', rating: 4.8 },
    partnerMockId: 'PTR-001',
    transporter: { name: 'Omar Hassan Ali', company: 'Red Sea Express Ltd', phone: '+253 77 81 12 01', fleetCode: 'RSE-FLT-01', rating: 4.8 },
    driverMockId: 'DRV-003',
    driver: { name: 'Ali Warsame Hussein', phone: '+253 77 99 44 55', licenseNumber: 'DL-DJ-77342', rating: 4.9, isVerified: true },
    vehicleMockId: 'VEH-002',
    vehicle: { registrationNumber: 'DJ-ABJ-5678', vehicleType: 'Heavy Flatbed Truck (Mercedes Actros)', capacity: '20 Metric Tons', isVerified: true },
    pickupLocation: { name: 'Doraleh Multi-Purpose Port (DMP)', address: 'Berth 3', city: 'Doraleh, Djibouti' },
    deliveryLocation: { name: 'Ali Sabieh Logistics Hub', address: 'Zone Industrielle Block C', city: 'Ali Sabieh, Djibouti' },
    estimatedDistanceKm: 98,
    estimatedDurationHours: '2h 00m',
    cargoType: 'Steel Construction Beams',
    goodsDescription: 'Structural Steel Beams (30 metric tons)',
    totalWeightKg: 30000,
    createdAt: '2026-08-07 06:15',
    scheduledPickupTime: '2026-08-07 07:00',
    rateFDJ: 85000,
    timeline: [
      { key: 'creation', title: 'Mission Creation', description: 'Mission created', timestamp: '2026-08-07 06:15:00', status: 'completed' },
      { key: 'booking_confirmation', title: 'Booking Confirmation', description: 'Confirmed', timestamp: '2026-08-07 06:20:00', status: 'completed' },
      { key: 'vehicle_assignment', title: 'Vehicle Assignment', description: 'Truck DJ-ABJ-5678 assigned', timestamp: '2026-08-07 06:30:00', status: 'completed' },
      { key: 'driver_assignment', title: 'Driver Assignment', description: 'Ali Warsame Hussein assigned', timestamp: '2026-08-07 06:35:00', status: 'completed' },
      { key: 'gate_in', title: 'Gate-in Time', description: 'Entered DMP Berth 3', timestamp: '2026-08-07 07:10:00', status: 'completed' },
      { key: 'pickup', title: 'Pickup Time', description: 'Steel loaded', timestamp: '2026-08-07 07:50:00', status: 'completed' },
      { key: 'departure', title: 'Departure Time', description: 'En route to Ali Sabieh', timestamp: '2026-08-07 08:05:00', status: 'completed' },
      { key: 'arrival', title: 'Arrival Time', description: 'Arrived at Ali Sabieh Hub', timestamp: '2026-08-07 10:15:00', status: 'completed' },
      { key: 'pod_upload', title: 'POD Upload', description: 'POD document uploaded awaiting final verification', timestamp: '2026-08-07 10:40:00', status: 'current', podFileUrl: '/docs/pod-2026-8803.pdf' },
      { key: 'completion', title: 'Completion Timestamp', description: 'Awaiting admin verification signoff', status: 'pending' },
    ],
  },
  {
    mockId: 'MSN-2026-8807',
    bookingId: 'BKG-1179',
    referenceNumber: 'REF-99204',
    dpcsReference: 'DPCS-DJ-7734',
    status: 'Pending',
    paymentStatus: 'Paid',
    shipperMockId: 'SHP-103',
    customer: { name: 'Dr. Hassan Gouled', company: 'Red Sea Cargo Group', phone: '+253 21 35 90 20', email: 'hassan@redseacargo.dj', rating: 4.7 },
    partnerMockId: 'PTR-001',
    transporter: { name: 'Omar Hassan Ali', company: 'Red Sea Express Ltd', phone: '+253 77 81 12 01', fleetCode: 'RSE-FLT-01', rating: 4.8 },
    pickupLocation: { name: 'Port of Djibouti - Quay 1', address: 'Old Port District', city: 'Djibouti City' },
    deliveryLocation: { name: 'Nagad Inland Container Depot', address: 'Nagad Junction', city: 'Nagad, Djibouti' },
    estimatedDistanceKm: 18,
    estimatedDurationHours: '0h 45m',
    cargoType: 'Containerized (40ft General Cargo)',
    shipmentCategory: 'containerized',
    containerNumber: 'MSCU-772810-5',
    containerReturn: { depot: 'Doraleh Container Terminal (DCT)', deadline: '2026-08-15 17:00', freeDays: 7 },
    goodsDescription: 'Electronics & Spare Machinery Parts',
    totalWeightKg: 14000,
    createdAt: '2026-08-08 07:30',
    scheduledPickupTime: '2026-08-09 09:00',
    rateFDJ: 40000,
    timeline: [
      { key: 'creation', title: 'Mission Creation', description: 'Created by customer request', timestamp: '2026-08-08 07:30:00', status: 'completed' },
      { key: 'booking_confirmation', title: 'Booking Confirmation', description: 'Booking confirmed', timestamp: '2026-08-08 07:45:00', status: 'completed' },
      { key: 'vehicle_assignment', title: 'Vehicle Assignment', description: 'Awaiting truck matching — open full load in Empty Return Matching', status: 'current' },
      { key: 'driver_assignment', title: 'Driver Assignment', description: 'Awaiting driver matching', status: 'pending' },
      { key: 'gate_in', title: 'Gate-in Time', description: 'Pending', status: 'pending' },
      { key: 'pickup', title: 'Pickup Time', description: 'Pending', status: 'pending' },
      { key: 'departure', title: 'Departure Time', description: 'Pending', status: 'pending' },
      { key: 'arrival', title: 'Arrival Time', description: 'Pending', status: 'pending' },
      { key: 'pod_upload', title: 'POD Upload', description: 'Pending', status: 'pending' },
      { key: 'completion', title: 'Completion Timestamp', description: 'Pending', status: 'pending' },
    ],
  },
  {
    mockId: 'MSN-2026-8805',
    bookingId: 'BKG-1180',
    referenceNumber: 'REF-99205',
    dpcsReference: 'DPCS-DJ-7735',
    status: 'Cancelled',
    paymentStatus: 'Pending',
    shipperMockId: 'SHP-102',
    customer: { name: 'Tariq Mehmood', company: 'Al-Baraka Logistics Ltd', phone: '+92 300 4829102', email: 'tariq@albaraka-logistics.pk', rating: 4.4 },
    partnerMockId: 'PTR-003',
    transporter: { name: 'Ahmed Abdi Warsame', company: 'Al-Baraka Transport Co.', phone: '+252 61 234 5678', fleetCode: 'ABT-FLT-03', rating: 4.5 },
    pickupLocation: { name: 'Doraleh Container Terminal', address: 'Gate 2', city: 'Doraleh Port' },
    deliveryLocation: { name: 'Tadjoura Port Facility', address: 'Main Terminal', city: 'Tadjoura, Djibouti' },
    estimatedDistanceKm: 180,
    estimatedDurationHours: '3h 30m',
    cargoType: 'Heavy Machinery',
    goodsDescription: 'Excavator & Trenching Unit',
    totalWeightKg: 28000,
    createdAt: '2026-08-04 09:00',
    scheduledPickupTime: '2026-08-04 12:00',
    rateFDJ: 150000,
    timeline: [
      { key: 'creation', title: 'Mission Creation', description: 'Created', timestamp: '2026-08-04 09:00:00', status: 'completed' },
      { key: 'booking_confirmation', title: 'Booking Confirmation', description: 'Cancelled by customer', timestamp: '2026-08-04 10:30:00', status: 'failed', notes: 'Customer changed transport schedule' },
    ],
  },
  {
    mockId: 'MSN-2026-8806',
    bookingId: 'BKG-1181',
    referenceNumber: 'REF-99206',
    dpcsReference: 'DPCS-DJ-7736',
    status: 'Assigned',
    paymentStatus: 'Paid',
    shipperMockId: 'SHP-102',
    customer: { name: 'Tariq Mehmood', company: 'Al-Baraka Logistics Ltd', phone: '+92 300 4829102', email: 'tariq@albaraka-logistics.pk', rating: 4.7 },
    partnerMockId: 'PTR-003',
    transporter: { name: 'Ahmed Abdi Warsame', company: 'Al-Baraka Transport Co.', phone: '+252 61 234 5678', fleetCode: 'ABT-FLT-03', rating: 4.5 },
    driverMockId: 'DRV-201',
    driver: { name: 'Mohamud Farah Rage', phone: '+252 61 888 9999', licenseNumber: 'DL-SOM-10022', rating: 4.9, isVerified: true },
    vehicleMockId: 'VEH-201',
    vehicle: { registrationNumber: 'SOM-MGS-991', vehicleType: '40ft Container Truck', capacity: '28 Metric Tons', isVerified: true },
    pickupLocation: { name: 'Doraleh Container Terminal (DCT)', address: 'Port District, Gate 1', city: 'Doraleh, Djibouti' },
    deliveryLocation: { name: 'Ali Sabieh Commercial Logistics Hub', address: 'Block A, Terminal 2', city: 'Ali Sabieh, Djibouti' },
    estimatedDistanceKm: 95,
    estimatedDurationHours: '1h 50m',
    cargoType: '40ft Container',
    shipmentCategory: 'containerized',
    containerNumber: 'ONEU-885521-7',
    containerReturn: { depot: 'Doraleh Container Terminal (DCT)', deadline: '2026-08-16 17:00', freeDays: 7 },
    goodsDescription: 'Commercial Manufactured Goods',
    totalWeightKg: 21000,
    createdAt: '2026-08-08 08:00',
    scheduledPickupTime: '2026-08-08 13:00',
    rateFDJ: 75000,
    timeline: [
      { key: 'creation', title: 'Mission Creation', description: 'Mission created', timestamp: '2026-08-08 08:00:00', status: 'completed' },
      { key: 'booking_confirmation', title: 'Booking Confirmation', description: 'Confirmed', timestamp: '2026-08-08 08:15:00', status: 'completed' },
      { key: 'vehicle_assignment', title: 'Vehicle Assignment', description: 'Truck SOM-MGS-991 assigned', timestamp: '2026-08-08 08:30:00', status: 'completed' },
    ],
  },
];

/**
 * The closed compliance catalog — four papers, each on the thing that holds it.
 * Mirrors `COMPLIANCE_CATALOG` in src/modules/documents/document-owner-type.ts;
 * the two must agree, and the migration
 * `20260901140000_document_issue_date_and_catalog` installs the same list on an
 * environment this seed will never be pointed at.
 */
const DOCUMENT_TYPE_SEEDS: { ownerType: string; label: string; required: boolean }[] = [
  { ownerType: 'SHIPPER', label: 'Business License', required: true },
  { ownerType: 'PARTNER', label: 'Business License', required: true },
  { ownerType: 'VEHICLE', label: 'Grey Card', required: true },
  { ownerType: 'VEHICLE', label: 'Insurance', required: true },
  { ownerType: 'DRIVER', label: 'Driver License', required: true },
];

/** Parses the frontend's "YYYY-MM-DD HH:mm[:ss]" / "YYYY-MM-DD" timestamps. */
function parseTimestamp(value?: string): Date | undefined {
  if (!value) return undefined;
  return new Date(value.replace(' ', 'T'));
}

/**
 * Uploads a small placeholder object through the real StorageService so
 * seeded documents are genuinely downloadable end to end — the point of this
 * task is that document download stops being a fabricated client-side blob
 * (src/components/documentDownload.ts) and becomes a real file.
 */
async function uploadPlaceholderDocument(storage: StorageService, name: string) {
  const buffer = Buffer.from(`Seed placeholder document for "${name}".\n\nGenerated by prisma/seed.ts.`);
  return storage.upload(
    { originalname: name, buffer, mimetype: 'application/pdf', size: buffer.length },
    { folder: 'documents' },
  );
}

async function seedDocumentTypes() {
  for (const type of DOCUMENT_TYPE_SEEDS) {
    await prisma.documentType.upsert({
      where: { ownerType_label: { ownerType: type.ownerType, label: type.label } },
      update: { required: type.required },
      create: type,
    });
  }
  console.log(`📄 Seeded ${DOCUMENT_TYPE_SEEDS.length} document type catalog entries`);
}

async function seedShippers(storage: StorageService, uploadedById: string): Promise<Map<string, string>> {
  const shipperIdByMockId = new Map<string, string>();

  for (const seed of SEED_SHIPPERS) {
    const existing = await prisma.shipper.findUnique({ where: { reference: seed.mockId } });
    if (existing) {
      shipperIdByMockId.set(seed.mockId, existing.id);
      continue;
    }

    const shipper = await prisma.shipper.create({
      data: {
        reference: seed.mockId,
        companyLegalName: seed.companyLegalName,
        registrationNumber: seed.registrationNumber,
        industry: seed.industry,
        companySize: seed.companySize,
        country: seed.country,
        address: seed.address,
        projectsCount: seed.projectsCount,
        approvalStatus: seed.approvalStatus,
        registrationDate: new Date(seed.registrationDate),
      },
    });
    shipperIdByMockId.set(seed.mockId, shipper.id);

    for (const contact of seed.contacts) {
      await prisma.contact.create({
        data: { ownerType: 'SHIPPER', ownerId: shipper.id, ...contact },
      });
    }

    for (const doc of seed.documents) {
      const stored = await uploadPlaceholderDocument(storage, doc.name);
      await prisma.document.create({
        data: {
          ownerType: 'SHIPPER',
          ownerId: shipper.id,
          category: doc.category,
          name: doc.name,
          storageKey: stored.key,
          mimeType: stored.mimetype,
          fileSizeBytes: stored.size,
          status: 'Verified',
          uploadedById,
        },
      });
    }
  }

  console.log(`🏢 Seeded ${SEED_SHIPPERS.length} shippers`);
  return shipperIdByMockId;
}

async function seedPartners(storage: StorageService, uploadedById: string) {
  const partnerIdByMockId = new Map<string, string>();
  const vehicleIdByMockId = new Map<string, string>();
  const driverIdByMockId = new Map<string, string>();
  /** Deferred assignment pairs — resolved in a second pass once every vehicle and driver exists. */

  for (const seed of SEED_PARTNERS) {
    const existing = await prisma.partner.findUnique({ where: { reference: seed.mockId } });
    if (existing) {
      partnerIdByMockId.set(seed.mockId, existing.id);
      // Re-hydrate vehicle/driver maps from the DB so shipment seeding below can still resolve them on reseed.
      const [vehicles, drivers] = await Promise.all([
        prisma.vehicle.findMany({ where: { partnerId: existing.id } }),
        prisma.driver.findMany({ where: { partnerId: existing.id } }),
      ]);
      vehicles.forEach((v) => vehicleIdByMockId.set(v.reference, v.id));
      drivers.forEach((d) => driverIdByMockId.set(d.reference, d.id));
      continue;
    }

    const partner = await prisma.partner.create({
      data: {
        reference: seed.mockId,
        companyLegalName: seed.companyLegalName,
        registrationNumber: seed.registrationNumber,
        businessLicenseNumber: seed.businessLicenseNumber,
        operatingRegions: seed.operatingRegions,
        serviceCategories: seed.serviceCategories,
        fleetSize: seed.fleetSize,
        vehicleTypes: seed.vehicleTypes,
        country: seed.country,
        address: seed.address,
        insuranceProvider: seed.insuranceProvider,
        insurancePolicyNumber: seed.insurancePolicyNumber,
        insuranceExpiry: seed.insuranceExpiry ? new Date(seed.insuranceExpiry) : undefined,
        partnerStatus: seed.partnerStatus,
        registrationDate: new Date(seed.registrationDate),
      },
    });
    partnerIdByMockId.set(seed.mockId, partner.id);

    for (const dispatcher of seed.dispatchers) {
      await prisma.contact.create({ data: { ownerType: 'PARTNER', ownerId: partner.id, ...dispatcher } });
    }

    if (seed.bankAccount) {
      await prisma.partnerBankAccount.create({ data: { partnerId: partner.id, ...seed.bankAccount } });
    }


    for (const doc of seed.documents) {
      const stored = await uploadPlaceholderDocument(storage, doc.name);
      await prisma.document.create({
        data: {
          ownerType: 'PARTNER',
          ownerId: partner.id,
          category: doc.category,
          name: doc.name,
          storageKey: stored.key,
          mimeType: stored.mimetype,
          fileSizeBytes: stored.size,
          status: 'Verified',
          uploadedById,
        },
      });
    }

    for (const v of seed.vehicles) {
      const vehicle = await prisma.vehicle.create({
        data: {
          reference: shortRef(v.mockId),
          partnerId: partner.id,
          plateNumber: v.plateNumber,
          truckType: v.truckType,
          containerCapacity: v.containerCapacity,
          trailerInfo: v.trailerInfo,
          ownershipType: v.ownershipType,
          insuranceExpiry: new Date(v.insuranceExpiry),
          registrationExpiry: new Date(v.registrationExpiry),
          hasGPS: v.hasGPS,
          gpsDeviceId: v.gpsDeviceId,
          operationalStatus: v.operationalStatus,
          year: v.year,
          make: v.make,
          model: v.model,
        },
      });
      vehicleIdByMockId.set(v.mockId, vehicle.id);
    }

    for (const d of seed.drivers) {
      const driver = await prisma.driver.create({
        data: {
          reference: shortRef(d.mockId),
          partnerId: partner.id,
          fullName: d.fullName,
          phone: d.phone,
          nationalId: d.nationalId,
          drivingLicenseNumber: d.drivingLicenseNumber,
          licenseExpiry: new Date(d.licenseExpiry),
          accessCards: d.accessCards,
          status: d.status,
          joinDate: new Date(d.joinDate),
        },
      });
      driverIdByMockId.set(d.mockId, driver.id);
    }
  }

  /* There is no second pass any more. A vehicle used to be paired with a
     standing driver here; that pairing was removed from the product on
     2026-08-30 — a driver and a truck meet on a booking, per trip, and the
     fleet directories count those instead. */

  console.log(`🚚 Seeded ${SEED_PARTNERS.length} partners, ${vehicleIdByMockId.size} vehicles, ${driverIdByMockId.size} drivers`);
  return { partnerIdByMockId, vehicleIdByMockId, driverIdByMockId };
}

async function seedShipments(
  shipperIdByMockId: Map<string, string>,
  partnerIdByMockId: Map<string, string>,
  driverIdByMockId: Map<string, string>,
  vehicleIdByMockId: Map<string, string>,
) {
  let seededCount = 0;

  for (const mission of SEED_MISSIONS) {
    const existing = await prisma.shipment.findUnique({ where: { reference: shortRef(mission.mockId) } });
    if (existing) continue;

    const shipperId = shipperIdByMockId.get(mission.shipperMockId);
    const partnerId = partnerIdByMockId.get(mission.partnerMockId);
    if (!shipperId || !partnerId) {
      console.warn(`⚠️  Skipping shipment "${mission.mockId}": shipper or partner reference did not resolve`);
      continue;
    }

    const driverId = mission.driverMockId ? driverIdByMockId.get(mission.driverMockId) : undefined;
    const vehicleId = mission.vehicleMockId ? vehicleIdByMockId.get(mission.vehicleMockId) : undefined;
    if (mission.vehicleMockId && !vehicleId) {
      console.warn(`⚠️  Shipment "${mission.mockId}": vehicle mock id "${mission.vehicleMockId}" not found — seeding with vehicleId null, snapshot preserved`);
    }

    const rateMinorUnits = BigInt(mission.rateFDJ);

    const shipment = await prisma.shipment.create({
      data: {
        reference: shortRef(mission.mockId),
        bookingId: shortRef(mission.bookingId),
        referenceNumber: mission.referenceNumber,
        dpcsReference: mission.dpcsReference,
        status: mission.status,
        paymentStatus: mission.paymentStatus,

        shipperId,
        customerName: mission.customer.name,
        customerCompany: mission.customer.company,
        customerPhone: mission.customer.phone,
        customerEmail: mission.customer.email,
        customerRating: mission.customer.rating,

        partnerId,
        transporterName: mission.transporter.name,
        transporterCompany: mission.transporter.company,
        transporterPhone: mission.transporter.phone,
        transporterFleetCode: mission.transporter.fleetCode,
        transporterRating: mission.transporter.rating,

        driverId,
        driverName: mission.driver?.name,
        driverPhone: mission.driver?.phone,
        driverLicenseNumber: mission.driver?.licenseNumber,
        driverRating: mission.driver?.rating,
        driverVerified: mission.driver?.isVerified,

        vehicleId,
        vehicleRegistrationNumber: mission.vehicle?.registrationNumber,
        vehicleTypeSnapshot: mission.vehicle?.vehicleType,
        vehicleCapacity: mission.vehicle?.capacity,
        vehicleVerified: mission.vehicle?.isVerified,

        pickupLocationName: mission.pickupLocation.name,
        pickupLocationAddress: mission.pickupLocation.address,
        pickupLocationCity: mission.pickupLocation.city,
        pickupGateOrTerminal: mission.pickupLocation.gateOrTerminal,
        pickupContactPerson: mission.pickupLocation.contactPerson,
        pickupContactPhone: mission.pickupLocation.contactPhone,

        deliveryLocationName: mission.deliveryLocation.name,
        deliveryLocationAddress: mission.deliveryLocation.address,
        deliveryLocationCity: mission.deliveryLocation.city,
        deliveryGateOrTerminal: mission.deliveryLocation.gateOrTerminal,
        deliveryContactPerson: mission.deliveryLocation.contactPerson,
        deliveryContactPhone: mission.deliveryLocation.contactPhone,

        estimatedDistanceKm: mission.estimatedDistanceKm,
        estimatedDurationHours: mission.estimatedDurationHours,
        cargoType: mission.cargoType,
        shipmentCategory: mission.shipmentCategory,
        containerNumber: mission.containerNumber,
        shippingLine: mission.shippingLine,
        containerReturnDepot: mission.containerReturn?.depot,
        containerReturnDeadline: parseTimestamp(mission.containerReturn?.deadline),
        containerReturnFreeDays: mission.containerReturn?.freeDays,
        goodsDescription: mission.goodsDescription,
        totalWeightKg: mission.totalWeightKg,
        dimensions: mission.dimensions,
        equipmentType: mission.equipmentType,

        scheduledPickupTime: parseTimestamp(mission.scheduledPickupTime)!,
        completedAt: parseTimestamp(mission.completedAt),

        rateMinorUnits,
        rateCurrency: 'FDJ',
        rateFxRate: 1.0,
        rateBaseAmountMinorUnits: rateMinorUnits,

        createdAt: parseTimestamp(mission.createdAt),
      },
    });

    for (const step of mission.timeline) {
      await prisma.shipmentTimelineStep.create({
        data: {
          shipmentId: shipment.id,
          key: step.key,
          title: step.title,
          description: step.description,
          timestamp: parseTimestamp(step.timestamp),
          status: step.status,
          actor: step.actor,
          location: step.location,
          podFileUrl: step.podFileUrl,
          notes: step.notes,
        },
      });
    }

    seededCount += 1;
  }

  console.log(`🚛 Seeded ${seededCount} shipments`);
}

/**
 * One real `Booking` per seeded shipment's own container — the primary
 * booking, reusing the mission's designated `bookingId` as its reference so
 * demo data everyone already recognises ("Booking #BKG-1178") doesn't grow a
 * second, disconnected id. `MSN-2026-8801` additionally gets two bonus
 * containers, demonstrating the real shape: one shipment ("20 containers,
 * this freezone"), several bookings, a handful of vehicles rotating through
 * them — not the flat one-shipment-one-container the old model implied.
 */
async function seedBookings(): Promise<Map<string, string>> {
  const bookingIdByContainer = new Map<string, string>();
  let seededCount = 0;

  for (const mission of SEED_MISSIONS) {
    const shipment = await prisma.shipment.findUnique({ where: { reference: shortRef(mission.mockId) } });
    if (!shipment) continue;

    const existing = await prisma.booking.findUnique({ where: { reference: shortRef(mission.bookingId) } });
    if (existing) {
      if (mission.containerNumber) bookingIdByContainer.set(mission.containerNumber, existing.id);
      continue;
    }

    const booking = await prisma.booking.create({
      data: {
        reference: shortRef(mission.bookingId),
        shipmentId: shipment.id,
        status: mission.status,
        cargoType: mission.cargoType,
        shipmentCategory: mission.shipmentCategory,
        containerNumber: mission.containerNumber,
        shippingLine: mission.shippingLine,
        partnerId: shipment.partnerId,
        vehicleId: shipment.vehicleId,
        driverId: shipment.driverId,
        containerReturnDepot: mission.containerReturn?.depot,
        containerReturnDeadline: parseTimestamp(mission.containerReturn?.deadline),
        containerReturnFreeDays: mission.containerReturn?.freeDays,
        scheduledPickupTime: parseTimestamp(mission.scheduledPickupTime)!,
        completedAt: parseTimestamp(mission.completedAt),
        createdAt: parseTimestamp(mission.createdAt),
        timeline: {
          create: {
            key: 'creation',
            title: 'Booking Created',
            description: `Booking created for shipment ${shipment.reference}`,
            timestamp: parseTimestamp(mission.createdAt),
            status: 'completed',
          },
        },
      },
    });
    if (mission.containerNumber) bookingIdByContainer.set(mission.containerNumber, booking.id);
    seededCount += 1;
  }

  // Bonus containers on MSN-2026-8801 — same shipment, two more bookings,
  // proving a shipment isn't one container. Left `Pending`, no vehicle yet:
  // exactly what a fresh booking looks like before rotation assigns one.
  const primaryShipment = await prisma.shipment.findUnique({ where: { reference: shortRef('MSN-2026-8801') } });
  if (primaryShipment) {
    const bonusContainers = [
      { number: 'MSKU-882195-1', line: 'Maersk Line' },
      { number: 'MSKU-882196-8', line: 'Maersk Line' },
    ];
    for (const [index, bonus] of bonusContainers.entries()) {
      const existing = await prisma.booking.findFirst({ where: { containerNumber: bonus.number } });
      if (existing) continue;
      await prisma.booking.create({
        data: {
          reference: shortRef(`BKG-2026-${1179 + index}`),
          shipmentId: primaryShipment.id,
          status: 'Pending',
          cargoType: 'Containerized (40ft Rice)',
          shipmentCategory: 'containerized',
          containerNumber: bonus.number,
          shippingLine: bonus.line,
          containerReturnDepot: 'Doraleh Container Terminal (DCT)',
          containerReturnFreeDays: 7,
          scheduledPickupTime: primaryShipment.scheduledPickupTime,
          timeline: {
            create: {
              key: 'creation',
              title: 'Booking Created',
              description: `Booking created for shipment ${primaryShipment.reference} — rotation not yet assigned`,
              timestamp: new Date(),
              status: 'completed',
            },
          },
        },
      });
      seededCount += 1;
    }
  }

  console.log(`📦 Seeded ${seededCount} bookings`);
  return bookingIdByContainer;
}

/**
 * One real empty↔full match, through the real service — not a hand-rolled
 * Prisma write — so the seed exercises the exact chain-minting and
 * forced-Assigned logic a live request would. `MSCU-772810-5` (booking
 * `MSN-2026-8807`) was written into the mock data specifically as "awaiting
 * truck matching" for this; `CMAU-441092-3` (`MSN-2026-8802`) is the
 * completed delivery whose empty return it demonstrates matching against.
 */
async function seedEmptyReturnDemo(bookingIdByContainer: Map<string, string>, emptyReturns: EmptyReturnsService) {
  const emptyBookingId = bookingIdByContainer.get('CMAU-441092-3');
  const fullBookingId = bookingIdByContainer.get('MSCU-772810-5');
  if (!emptyBookingId || !fullBookingId) {
    console.warn('⚠️  Skipping empty-return demo cycle: seed containers not found');
    return;
  }

  const alreadyCycled = await prisma.emptyReturnCycle.findUnique({ where: { bookingId: emptyBookingId } });
  if (alreadyCycled) return;

  const cycle = await emptyReturns.createCycle({ bookingId: emptyBookingId, nextBookingId: fullBookingId });
  console.log(`🔁 Seeded empty-return cycle ${cycle.reference} in chain ${cycle.chainId}`);
}

async function seedDemoPortalUsers(roleIds: Record<string, string>, shipperIdByMockId: Map<string, string>, partnerIdByMockId: Map<string, string>) {
  const shipperPasswordHash = await hashPassword(SHIPPER_DEMO_PASSWORD);
  await prisma.user.upsert({
    where: { email: SHIPPER_DEMO_EMAIL },
    update: { passwordHash: shipperPasswordHash, roleId: roleIds['SHIPPER'], shipperId: shipperIdByMockId.get('SHP-101') },
    create: {
      email: SHIPPER_DEMO_EMAIL,
      passwordHash: shipperPasswordHash,
      firstName: 'CMA-CGM',
      lastName: '(Demo)',
      status: UserStatus.ACTIVE,
      roleId: roleIds['SHIPPER'],
      shipperId: shipperIdByMockId.get('SHP-101'),
    },
  });

  const transporterPasswordHash = await hashPassword(TRANSPORTER_DEMO_PASSWORD);
  await prisma.user.upsert({
    where: { email: TRANSPORTER_DEMO_EMAIL },
    update: { passwordHash: transporterPasswordHash, roleId: roleIds['TRANSPORTER'], partnerId: partnerIdByMockId.get('PTR-001') },
    create: {
      email: TRANSPORTER_DEMO_EMAIL,
      passwordHash: transporterPasswordHash,
      firstName: 'Red Sea Express',
      lastName: '(Demo)',
      status: UserStatus.ACTIVE,
      roleId: roleIds['TRANSPORTER'],
      partnerId: partnerIdByMockId.get('PTR-001'),
    },
  });

  console.log(`👤 Seeded demo portal users: ${SHIPPER_DEMO_EMAIL} (SHIPPER), ${TRANSPORTER_DEMO_EMAIL} (TRANSPORTER)`);
}

async function main() {
  // Refuse to touch anything but a local database — see seed-target-guard.ts.
  assertSeedTargetIsSafe('seed.ts');

  console.log('🌱 Starting database seed...');

  if (process.env.NODE_ENV === 'production' && !process.env.SEED_ADMIN_PASSWORD) {
    throw new Error(
      'Refusing to seed the default admin password in production. ' +
        'Set SEED_ADMIN_PASSWORD explicitly.',
    );
  }

  const roleIds: Record<string, string> = {};

  for (const role of DEFAULT_ROLES) {
    const saved = await prisma.role.upsert({
      where: { name: role.name },
      update: {
        description: role.description,
        permissions: [...role.permissions],
      },
      create: {
        name: role.name,
        description: role.description,
        permissions: [...role.permissions],
      },
    });
    roleIds[saved.name] = saved.id;
    console.log(`✅ Seeded role: ${saved.name} (${role.permissions.length} grants)`);
  }

  /* Argon2id, via the same helper the application uses — the seed must never
   * write a hash the login path cannot verify. */
  const passwordHash = await hashPassword(ADMIN_PASSWORD);

  const admin = await prisma.user.upsert({
    where: { email: ADMIN_EMAIL },
    /* Re-hash on every seed so a database left over from the bcrypt era is
     * upgraded rather than leaving an unverifiable hash behind. */
    update: { passwordHash, roleId: roleIds['ADMIN'] },
    create: {
      email: ADMIN_EMAIL,
      passwordHash,
      firstName: 'System',
      lastName: 'Administrator',
      status: UserStatus.ACTIVE,
      roleId: roleIds['ADMIN'],
    },
  });

  console.log(`👤 Seeded admin user: ${admin.email}`);

  /* A real Nest application context, so seeded documents are genuinely
   * downloadable (StorageService) and the empty-return demo cycle goes
   * through the real service — same chain-minting and forced-Assigned logic
   * a live request would exercise, not a hand-rolled duplicate. */
  const appContext = await NestFactory.createApplicationContext(AppModule, { logger: false });
  const storage = appContext.get(StorageService);
  const emptyReturns = appContext.get(EmptyReturnsService);

  try {
    await seedDocumentTypes();
    const shipperIdByMockId = await seedShippers(storage, admin.id);
    const { partnerIdByMockId, vehicleIdByMockId, driverIdByMockId } = await seedPartners(storage, admin.id);
    await seedShipments(shipperIdByMockId, partnerIdByMockId, driverIdByMockId, vehicleIdByMockId);
    const bookingIdByContainer = await seedBookings();
    await seedEmptyReturnDemo(bookingIdByContainer, emptyReturns);
    await seedDemoPortalUsers(roleIds, shipperIdByMockId, partnerIdByMockId);
    await seedHr(prisma, admin.id);
  } finally {
    await appContext.close();
  }

  console.log('🎉 Seeding completed successfully!');
}

main()
  .catch((error) => {
    console.error('❌ Seeding error:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
