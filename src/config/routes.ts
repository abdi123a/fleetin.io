/**
 * Canonical route registry.
 *
 * Every path in the application is declared here exactly once. Router config,
 * navigation config and any `<Link>` in feature code all read from this object,
 * so a URL can be changed in one place without a codebase-wide search.
 *
 * Never write a route string literal anywhere else.
 */
export const ROUTES = {
  root: '/',
  login: '/login',
  register: '/register',
  forgotPassword: '/forgot-password',
  dashboard: '/dashboard',
  partners: '/partners',
  partnerDetail: '/partners/:id',
  vehicles: '/vehicles',
  drivers: '/drivers',
  employees: '/employees',
  documents: '/documents',
  finance: '/finance',
  financeShipments: '/finance/shipments',
  financeShipmentClient: '/finance/shipments/client/:clientId',
  financeShipmentProject: '/finance/shipments/project/:projectId',
  /** One consignment — where release, settlement and both documents live. */
  financeShipmentDetail: '/finance/shipments/shipment/:shipmentId',
  /** One container. Read-only detail; it carries no payment control. */
  financeShipmentBooking: '/finance/shipments/booking/:bookingId',
  financeInvoices: '/finance/invoices',
  financeInvoiceDetail: '/finance/invoices/:invoiceId',
  /** The transporter's signed payment voucher for one shipment. */
  financePayment: '/finance/payments/:paymentId',
  reports: '/reports',
  administration: '/administration',
  settings: '/settings',
  designSystem: '/design-system',
  locations: '/locations',
  addLocation: '/locations/new',
  shippers: '/shippers',
  addShipper: '/shippers/new',
  shipperDetail: '/shippers/:id',
  shipperDashboard: '/shipper-dashboard',
  analytics: '/analytics',
  transporterDashboard: '/transporter-dashboard',
  transporterAnalytics: '/transporter-analytics',
  /** @deprecated Prefer transporterDashboard / transporterAnalytics */
  transporterPortal: '/transporter-portal',
  shipmentsList: '/shipments',
  shipmentOverview: '/shipments/:id',
  bookings: '/bookings',
  bookingDetail: '/bookings/:id',
  missions: '/missions',
  missionDetail: '/shipments/:id',
  onboarding: '/onboarding',
  emptyReturns: '/empty-returns',
  emptyReturnsCycles: '/empty-returns/cycles',
  emptyReturnsMatching: '/empty-returns/matching',
  emptyReturnsChains: '/empty-returns/chains',
  emptyReturnsTransporters: '/empty-returns/transporters',
  notFound: '*',
} as const;

export type RouteKey = keyof typeof ROUTES;
export type RoutePath = (typeof ROUTES)[RouteKey];

/**
 * Builds a path from a template and its params:
 * `buildPath('/vehicles/:id', { id: '42' })` -> `/vehicles/42`.
 *
 * Kept here so detail routes added in Phase 2 have a typed construction point
 * instead of ad-hoc template literals.
 */
export function buildPath(
  template: string,
  params: Record<string, string | number> = {},
): string {
  return template.replace(/:([a-zA-Z0-9_]+)/g, (_match, key: string) => {
    const value = params[key];
    if (value === undefined) {
      throw new Error(`buildPath: missing route param "${key}" for template "${template}"`);
    }
    return encodeURIComponent(String(value));
  });
}
