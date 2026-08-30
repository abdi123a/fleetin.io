import type { PartnerRecord, PartnerVehicle, PartnerDriver } from '@/types/partner';

export interface EnrichedVehicle extends PartnerVehicle {
  partnerId: string;
  partnerReference: string;
  partnerName: string;
  partnerLogo?: string;
  partnerCountry: string;
}

export interface EnrichedDriver extends PartnerDriver {
  partnerId: string;
  partnerReference: string;
  partnerName: string;
  partnerLogo?: string;
  partnerCountry: string;
}

/**
 * Retained solely because `src/data/emptyReturnData.ts` (Empty Returns, out
 * of scope for the backend integration) statically depends on this array at
 * import time. Do not use as a data source for any page — Partners/Vehicles/
 * Drivers now read from the real backend via `usePartners()`/`usePartner()`/
 * `useVehicles()`/`useDrivers()` (see
 * `src/features/{partners,vehicles,drivers}/api/queries.ts`).
 */
export const INITIAL_PARTNERS: PartnerRecord[] = [
  {
    id: 'PTR-001',
    reference: 'PTR-001',
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
    primaryDispatcher: {
      id: 'CTC-00001',
      name: 'Omar Hassan Ali',
      title: 'Fleet Operations Manager',
      phone: '+253 77 81 12 01',
      email: 'omar@redsea-express.dj',
      isPrimary: true,
    },
    additionalDispatchers: [
      { id: 'CTC-00002', name: 'Fatima Nour', title: 'Dispatch Coordinator', phone: '+253 77 22 33 44', email: 'f.nour@redsea-express.dj' },
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
      { id: 'PG-01', route: 'Djibouti → Addis Ababa', vehicleType: '40ft Container', basePrice: 3500, currency: 'USD' },
      { id: 'PG-02', route: 'Djibouti → Hargeisa', vehicleType: 'Flatbed', basePrice: 2200, currency: 'USD' },
    ],
    uploadedDocuments: [
      { id: 'DOC-00001', name: 'Business License 2026.pdf', category: 'Business License', uploadDate: '10 Jan 2025', expiryDate: '2026-01-10', fileSize: '2.4 MB', status: 'Verified', version: 1 },
      { id: 'DOC-00002', name: 'Fleet Insurance Certificate.pdf', category: 'Fleet Insurance', uploadDate: '05 Feb 2025', expiryDate: '2025-12-31', fileSize: '1.8 MB', status: 'Verified', version: 1 },
    ],
    drivers: [
      { id: 'DRV-00001', fullName: 'Abdi Yusuf Mohamed', phone: '+253 77 55 11 22', nationalId: 'DJ-NID-882211', drivingLicenseNumber: 'DL-DJ-44821', licenseExpiry: '2026-08-15', status: 'Available', joinDate: '2022-03-01', accessCards: ['Port Gate A', 'Free Zone'], profilePictureUrl: 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=80&auto=format&fit=crop&q=80' },
      { id: 'DRV-00002', fullName: 'Hassan Farah Jama', phone: '+253 77 66 22 33', nationalId: 'DJ-NID-991132', drivingLicenseNumber: 'DL-DJ-55932', licenseExpiry: '2025-09-30', status: 'In Transit', joinDate: '2021-07-15', accessCards: ['Port Gate B'] },
      { id: 'DRV-00003', fullName: 'Ali Warsame Hussein', phone: '+253 77 99 44 55', nationalId: 'DJ-NID-337841', drivingLicenseNumber: 'DL-DJ-77342', licenseExpiry: '2027-02-28', status: 'Available', joinDate: '2023-11-01' },
    ],
    vehicles: [
      { id: 'VEH-00001', plateNumber: 'DJ-ABJ-1234', truckType: '40ft Container', containerCapacity: '40ft / 28 tons', trailerInfo: 'DRY-VAN-2020', ownershipType: 'Owned', insuranceExpiry: '2025-12-31', registrationExpiry: '2026-03-20', hasGPS: true, gpsDeviceId: 'GPS-4421', operationalStatus: 'Available', year: 2020, make: 'Volvo', model: 'FH16' },
      { id: 'VEH-00002', plateNumber: 'DJ-ABJ-5678', truckType: 'Flatbed', containerCapacity: '20 tons', ownershipType: 'Owned', insuranceExpiry: '2025-12-31', registrationExpiry: '2025-10-15', hasGPS: true, gpsDeviceId: 'GPS-4422', operationalStatus: 'In Transit', year: 2019, make: 'Mercedes', model: 'Actros 2641' },
      { id: 'VEH-00003', plateNumber: 'DJ-ABJ-9900', truckType: 'Refrigerated', containerCapacity: '15 tons / -20°C', ownershipType: 'Leased', insuranceExpiry: '2026-01-15', registrationExpiry: '2026-05-30', hasGPS: true, gpsDeviceId: 'GPS-4423', operationalStatus: 'Under Maintenance', year: 2022, make: 'Scania', model: 'P410' },
    ],
    logoUrl: 'https://images.unsplash.com/photo-1558618666-fcd25c85cd64?w=120&auto=format&fit=crop&q=80',
    registrationDate: '15 Mar 2021',
  },
  {
    id: 'PTR-002',
    reference: 'PTR-002',
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
    primaryDispatcher: {
      id: 'CTC-00003',
      name: 'Tigist Bekele',
      title: 'Operations Director',
      phone: '+251 91 234 5678',
      email: 'tigist@horn-transit.et',
      isPrimary: true,
    },
    uploadedDocuments: [
      { id: 'DOC-00101', name: 'Commercial Registration Certificate.pdf', category: 'Business License', uploadDate: '20 Feb 2025', expiryDate: '2026-02-20', fileSize: '1.9 MB', status: 'Verified', version: 1 },
    ],
    drivers: [
      { id: 'DRV-00101', fullName: 'Bekele Haile', phone: '+251 91 111 2222', nationalId: 'ETH-NID-33441', drivingLicenseNumber: 'DL-ETH-88812', licenseExpiry: '2026-12-01', status: 'In Transit', joinDate: '2023-01-10', profilePictureUrl: 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=80&auto=format&fit=crop&q=80' },
      { id: 'DRV-00102', fullName: 'Dawit Mulugeta', phone: '+251 91 555 6666', nationalId: 'ETH-NID-55123', drivingLicenseNumber: 'DL-ETH-99921', licenseExpiry: '2025-07-15', status: 'In Transit', joinDate: '2022-05-20' },
      { id: 'DRV-00103', fullName: 'Meron Tadesse', phone: '+251 91 777 8888', nationalId: 'ETH-NID-77234', drivingLicenseNumber: 'DL-ETH-11132', licenseExpiry: '2026-09-30', status: 'Available', joinDate: '2023-08-14' },
    ],
    vehicles: [
      { id: 'VEH-00101', plateNumber: 'ETH-AA-4421', truckType: '40ft Container', containerCapacity: '40ft', ownershipType: 'Owned', insuranceExpiry: '2026-06-30', registrationExpiry: '2026-01-15', hasGPS: true, gpsDeviceId: 'GPS-8891', operationalStatus: 'In Transit', year: 2021, make: 'Scania', model: 'R450' },
      { id: 'VEH-00102', plateNumber: 'ETH-AA-8834', truckType: 'Tanker', containerCapacity: '30,000L', ownershipType: 'Leased', insuranceExpiry: '2026-06-30', registrationExpiry: '2025-11-30', hasGPS: false, operationalStatus: 'Available', year: 2018, make: 'DAF', model: 'XF105' },
    ],
    logoUrl: 'https://images.unsplash.com/photo-1601584115197-04ecc0da31d7?w=120&auto=format&fit=crop&q=80',
    registrationDate: '08 Nov 2020',
  },
  {
    id: 'PTR-003',
    reference: 'PTR-003',
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
    primaryDispatcher: {
      id: 'CTC-00004',
      name: 'Ahmed Abdi Warsame',
      title: 'Fleet Manager',
      phone: '+252 61 234 5678',
      email: 'ahmed@albaraka-transport.so',
      isPrimary: true,
    },
    uploadedDocuments: [],
    drivers: [
      { id: 'DRV-00201', fullName: 'Mohamud Farah Rage', phone: '+252 61 888 9999', nationalId: 'SOM-NID-44001', drivingLicenseNumber: 'DL-SOM-10022', licenseExpiry: '2025-11-20', status: 'Available', joinDate: '2024-02-10' },
    ],
    vehicles: [
      { id: 'VEH-00201', plateNumber: 'SOM-MGS-991', truckType: 'Box Truck', containerCapacity: '10 tons', ownershipType: 'Owned', insuranceExpiry: '2024-12-31', registrationExpiry: '2025-06-30', hasGPS: false, operationalStatus: 'Available', year: 2017, make: 'Isuzu', model: 'NPR' },
    ],
    registrationDate: '12 Jul 2023',
  },
];


export function addDriverToPartner(partnerId: string, driver: PartnerDriver) {
  const partner = INITIAL_PARTNERS.find((p) => p.id === partnerId);
  if (partner) {
    if (!partner.drivers) partner.drivers = [];
    partner.drivers.push(driver);
  }
}

export function addVehicleToPartner(partnerId: string, vehicle: PartnerVehicle) {
  const partner = INITIAL_PARTNERS.find((p) => p.id === partnerId);
  if (partner) {
    if (!partner.vehicles) partner.vehicles = [];
    partner.vehicles.push(vehicle);
    partner.fleetSize = (partner.vehicles || []).length;
  }
}
