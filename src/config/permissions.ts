import { matchPath } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { hasAnyPermission } from '@/utils';

/**
 * What each screen requires, in one table.
 *
 * The sidebar filter and the route guard both read this, which is the point:
 * two lists would drift, and a nav row that survives a permission its route
 * refuses is exactly the bug this replaces — a full sidebar leading to "This
 * role is not allowed to read …".
 *
 * Values are **any-of**. A screen is reachable when the account can do
 * something on it; the page still hides the parts it must, and the server
 * still refuses what it must. A route absent from this table needs no
 * permission — the dashboard, the shipper's own portal, error pages.
 *
 * Permission strings come from the backend catalogue
 * (`GET /roles/catalog`). Nothing here may invent one: a requirement no grant
 * can ever satisfy hides a screen from everybody except ADMIN.
 */
export const ROUTE_PERMISSIONS: Record<string, readonly string[]> = {
  /* Workspace — the module root only. Every view under it inherits through
     the nearest-ancestor walk below, including the task detail, which sits at
     `/workspace/task/:reference`. */
  [ROUTES.workspace]: ['workspace.view'],

  /* Operations */
  [ROUTES.shipmentsList]: ['shipments.view'],
  [ROUTES.shipmentOverview]: ['shipments.view'],
  [ROUTES.missions]: ['shipments.view'],
  [ROUTES.bookings]: ['bookings.view'],
  [ROUTES.bookingDetail]: ['bookings.view'],
  [ROUTES.emptyReturns]: ['empty-returns.view'],
  [ROUTES.emptyReturnsMatching]: ['empty-returns.view'],
  [ROUTES.emptyReturnsCycles]: ['empty-returns.view'],
  [ROUTES.emptyReturnsChains]: ['empty-returns.view'],
  [ROUTES.emptyReturnsTransporters]: ['empty-returns.view'],
  [ROUTES.documents]: ['documents.view'],

  /* Directory & fleet */
  [ROUTES.shippers]: ['shippers.view'],
  [ROUTES.addShipper]: ['shippers.create'],
  [ROUTES.shipperDetail]: ['shippers.view'],
  [ROUTES.partners]: ['partners.view'],
  [ROUTES.partnerDetail]: ['partners.view'],
  [ROUTES.onboarding]: ['partners.create'],
  [ROUTES.vehicles]: ['vehicles.view'],
  [ROUTES.drivers]: ['drivers.view'],
  /* Locations are the pickup and delivery points a shipment is planned
     against; the catalogue has no resource of their own, so they follow the
     thing they exist for. */
  [ROUTES.locations]: ['shipments.view'],
  [ROUTES.addLocation]: ['shipments.create'],

  /* Finance */
  [ROUTES.finance]: ['finance.view'],
  [ROUTES.financeInvoices]: ['finance.view'],
  [ROUTES.financeInvoiceDetail]: ['finance.view'],
  [ROUTES.financeProjects]: ['finance.view'],
  [ROUTES.financeProjectDetail]: ['finance.view'],

  /* HR & payroll — the module's own lines, which do not all run through
     `hr.view`: FINANCE holds payroll without the staff records. */
  [ROUTES.hr]: ['hr.view'],
  [ROUTES.hrEmployees]: ['hr.view'],
  [ROUTES.hrEmployeeDetail]: ['hr.view'],
  [ROUTES.hrPayroll]: ['payroll.view'],
  [ROUTES.hrPayrollPeriod]: ['payroll.view'],
  [ROUTES.hrLeave]: ['leave.view'],
  [ROUTES.hrDocuments]: ['hr-documents.view'],
  [ROUTES.employees]: ['hr.view'],

  /* Analytics & reporting */
  /* Emissions rides on `analytics.view` rather than a resource of its own.
     It is a reading of bookings that already exist, and a new permission
     string reaches nobody until a data migration writes it into every role —
     see the note above `PERMISSIONS.locations` on the backend. */
  [ROUTES.emissions]: ['analytics.view'],
  [ROUTES.analytics]: ['analytics.view'],
  [ROUTES.reports]: ['analytics.view'],
  [ROUTES.transporterAnalytics]: ['analytics.view', 'partners.view'],

  /* System */
  [ROUTES.administration]: ['users.view', 'roles.view'],
  [ROUTES.settings]: ['settings.view'],
  [ROUTES.designSystem]: ['settings.view'],
};

/** Requirements for one route template, or none. */
export function permissionsForPath(path: string): readonly string[] {
  const clean = path.split('?')[0]?.split('#')[0] ?? path;

  const exact = ROUTE_PERMISSIONS[clean];
  if (exact) return exact;

  /* Nav rows carry concrete URLs (`/shippers/SHP-101`) while the table is
     keyed by templates (`/shippers/:id`), so a literal lookup is not enough. */
  for (const [template, required] of Object.entries(ROUTE_PERMISSIONS)) {
    if (matchPath({ path: template, end: true }, clean)) return required;
  }

  /*
   * Fall back to the nearest listed ancestor, so `/empty-returns/calendar`
   * inherits `/empty-returns`.
   *
   * This is what makes the table safe to leave alone: a view added under a
   * gated module is gated on the day it ships, rather than being open to
   * everyone until somebody remembers to add a row here. A child that needs
   * something *different* from its parent — `/hr/payroll` wants `payroll.view`,
   * not `hr.view` — still says so explicitly above, and an explicit entry
   * always wins over this walk.
   */
  const segments = clean.split('/').filter(Boolean);
  for (let depth = segments.length - 1; depth > 0; depth -= 1) {
    const ancestor = `/${segments.slice(0, depth).join('/')}`;
    const inherited = ROUTE_PERMISSIONS[ancestor];
    if (inherited) return inherited;
  }

  return [];
}

/** May a session holding `grants` open this path? */
export function canOpenPath(grants: string[], path: string): boolean {
  return hasAnyPermission(grants, permissionsForPath(path));
}
