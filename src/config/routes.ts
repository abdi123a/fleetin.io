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
  /*
   * Billing. Six routes, down from twelve — the working-capital module
   * (accounts, funding, ledger, payout vouchers, per-booking finance pages)
   * was removed on 2026-09-03. Old links land on `/finance` via the redirects
   * in the router rather than 404ing.
   */
  /** The desk: shipments to quote, bill and collect. */
  finance: '/finance',
  /** Proformas and invoices already issued. */
  financeInvoices: '/finance/invoices',
  /** One printed document — the same sheet serves both kinds. */
  financeInvoiceDetail: '/finance/invoices/:invoiceId',
  /** The grouping over a shipper's shipments. */
  financeProjects: '/finance/projects',
  financeProjectDetail: '/finance/projects/:projectId',
  /**
   * What it costs to run Fleetin — the one finance screen that is not about a
   * shipment, and the one every employee can reach.
   */
  financeExpenses: '/finance/expenses',
  /**
   * HR & Payroll. `employees` above stays where it is — it is the operational
   * staff directory in the fleet sense; these are the payroll records.
   */
  hr: '/hr',
  hrEmployees: '/hr/employees',
  hrEmployeeDetail: '/hr/employees/:id',
  hrPayroll: '/hr/payroll',
  hrPayrollPeriod: '/hr/payroll/:periodId',
  hrLeave: '/hr/leave',
  /** The three-step document generator. */
  hrDocuments: '/hr/documents',
  /**
   * Carbon. One page, and deliberately not `/analytics/emissions`: it reads
   * bookings rather than the BI dataset, and a reader looking for the fleet's
   * CO₂ should not have to know which of the two it was built on.
   */
  emissions: '/emissions',
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
  /*
   * Workspace — the work layer.
   *
   * The task detail is `/workspace/task/:reference` (singular) rather than
   * living under `/workspace/tasks/`, so a reference can never be shadowed by
   * one of the three view paths beside it. Router ranking would resolve it
   * correctly today; a URL that depends on ranking to mean the right thing is
   * a trap for whoever adds the fourth view.
   */
  workspace: '/workspace',
  /*
   * ONE tasks route. Whose work you are looking at is `?scope=`, and which of
   * the four views draws it is `?view=` — both are parameters of one screen,
   * not three screens.
   *
   * They used to be three nav rows and three paths, which is how the sidebar
   * ended up with six Workspace rows saying "tasks" four different ways. The
   * three old paths still resolve, as redirects that carry the scope across,
   * so any link already written down still lands somewhere right.
   */
  workspaceTasks: '/workspace/tasks',
  workspaceMyTasks: '/workspace/tasks/mine',
  workspaceAssignedByMe: '/workspace/tasks/assigned-by-me',
  workspaceAllTasks: '/workspace/tasks/all',
  workspaceTaskDetail: '/workspace/task/:reference',
  /* Tickets — the customer's side of the same work. Detail is `/ticket/`
     singular for the same reason the task's is: a reference must never be
     shadowed by a view name under the plural path. */
  workspaceTickets: '/workspace/tickets',
  workspaceTicketDetail: '/workspace/ticket/:reference',
  /*
   * Messages is ONE route, not a "Channels" page beside a "Direct Messages"
   * page. Both would open the same two-pane screen, and two nav rows for one
   * screen is the same navigation twice — the reason Empty Container has no
   * tab strip either. Channels and DMs are sections of the rail, as they are
   * in every tool that gets this right.
   */
  workspaceMessages: '/workspace/messages',
  workspaceChannel: '/workspace/messages/:channelId',
  /**
   * Empty Container Management — five sibling views, five real URLs.
   *
   * The module root is the **Control Tower**, not a dashboard: an operator
   * opening Empty Return wants the queue of containers needing a decision, and
   * performance measurement is a place you go deliberately. `emptyReturnsChains`
   * and `emptyReturnsTransporters` are kept as redirects so old bookmarks land
   * somewhere real.
   */
  emptyReturns: '/empty-returns',
  emptyReturnsCalendar: '/empty-returns/calendar',
  emptyReturnsMatching: '/empty-returns/matching',
  emptyReturnsCycles: '/empty-returns/cycles',
  emptyReturnsPerformance: '/empty-returns/performance',
  /** @deprecated Chains are a view of the Cycles page. */
  emptyReturnsChains: '/empty-returns/chains',
  /** @deprecated The per-transporter view folded into Cycles. */
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
