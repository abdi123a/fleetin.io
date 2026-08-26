/**
 * Seed identities shared by the auth store (login) and the access-request
 * store (local account directory). Lives outside both so neither has to
 * import the other just to read this list — see access-request.store.ts for
 * why that would be circular.
 */
export interface DemoPresetUser {
  label: string;
  email: string;
  role: string;
  firstName: string;
  lastName: string;
  shipperId?: string;
  transporterId?: string;
  companyName?: string;
}

export const DEMO_PRESETS: DemoPresetUser[] = [
  {
    label: 'Super Admin',
    email: 'admin@fleetin.com',
    role: 'ADMIN',
    firstName: 'Super',
    lastName: 'Admin',
  },
  {
    label: 'Fleet Manager',
    email: 'manager@fleetin.com',
    role: 'MANAGER',
    firstName: 'Sarah',
    lastName: 'Connor',
  },
  {
    label: 'Dispatcher',
    email: 'dispatcher@fleetin.com',
    role: 'DISPATCHER',
    firstName: 'David',
    lastName: 'Miller',
  },
  {
    label: 'Driver',
    email: 'driver@fleetin.com',
    role: 'DRIVER',
    firstName: 'Michael',
    lastName: 'Knight',
  },
  {
    label: 'Shipper (CMA-CGM)',
    email: 'm.amin@amina-fzco.dj',
    role: 'SHIPPER',
    firstName: 'Mohamed',
    lastName: 'Amin',
    shipperId: 'SHP-101',
    companyName: 'CMA-CGM',
  },
  {
    label: 'Shipper (Al-Baraka)',
    email: 'tariq@albaraka-logistics.pk',
    role: 'SHIPPER',
    firstName: 'Tariq',
    lastName: 'Mehmood',
    shipperId: 'SHP-102',
    companyName: 'Al-Baraka Logistics Ltd',
  },
  {
    label: 'Shipper (Red Sea Cargo)',
    email: 'hassan@redseacargo.dj',
    role: 'SHIPPER',
    firstName: 'Hassan',
    lastName: 'Gouled',
    shipperId: 'SHP-103',
    companyName: 'Red Sea Cargo Group',
  },
  {
    label: 'Transporter (Red Sea Express)',
    email: 'ops@redseaexpress.dj',
    role: 'TRANSPORTER',
    firstName: 'Amina',
    lastName: 'Houssein',
    transporterId: 'TRP-01',
    companyName: 'Red Sea Express Ltd',
  },
  {
    label: 'Transporter (Horn Transit)',
    email: 'dispatch@horntransit.et',
    role: 'TRANSPORTER',
    firstName: 'Getachew',
    lastName: 'Abebe',
    transporterId: 'TRP-02',
    companyName: 'Horn Transit Solutions',
  },
];
