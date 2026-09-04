import { lazy } from 'react';
import { Navigate, type RouteObject } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { AppLayout, AuthLayout } from '@/layouts';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';

/** Every route element is rendered without props. */
type RouteComponent<P = Record<string, never>> = React.ComponentType<P>;

function lazyWithRetry<P extends object = Record<string, never>>(
  factory: () => Promise<unknown>,
  exportName?: string,
) {
  return lazy(async () => {
    try {
      const mod = (await factory()) as Record<string, RouteComponent<P> | undefined>;
      if (exportName && mod[exportName]) {
        return { default: mod[exportName] };
      }
      if (mod.default) {
        return { default: mod.default };
      }
      return { default: mod as unknown as RouteComponent<P> };
    } catch (error) {
      const hasReloaded = window.sessionStorage.getItem('vite-chunk-retry');
      if (!hasReloaded) {
        window.sessionStorage.setItem('vite-chunk-retry', 'true');
        window.location.reload();
        return new Promise<{ default: RouteComponent<P> }>(() => {});
      }
      window.sessionStorage.removeItem('vite-chunk-retry');
      throw error;
    }
  });
}

const LoginPage = lazyWithRetry(() => import('@/pages/auth'), 'LoginPage');
const RegisterPage = lazyWithRetry(() => import('@/pages/auth'), 'RegisterPage');
const ForgotPasswordPage = lazyWithRetry(() => import('@/pages/auth'), 'ForgotPasswordPage');

const DashboardPage = lazyWithRetry(() => import('@/pages/dashboard'));
const PartnersPage = lazyWithRetry(() => import('@/pages/partners'), 'PartnersPage');
const PartnerDetailPage = lazyWithRetry(() => import('@/pages/partners'), 'PartnerDetailPage');
const VehiclesPage = lazyWithRetry(() => import('@/pages/vehicles'), 'VehiclesPage');
const DriversPage = lazyWithRetry(() => import('@/pages/drivers'), 'DriversPage');
const DocumentsPage = lazyWithRetry(() => import('@/pages/documents'), 'DocumentsPage');
const FinanceModuleChrome = lazyWithRetry(() => import('@/pages/finance'), 'FinanceModuleChrome');
const BillingPage = lazyWithRetry(() => import('@/pages/finance'), 'BillingPage');
const InvoicesPage = lazyWithRetry(() => import('@/pages/finance'), 'InvoicesPage');
const ProjectsPage = lazyWithRetry(() => import('@/pages/finance'), 'ProjectsPage');
const ProjectPage = lazyWithRetry(() => import('@/pages/finance'), 'ProjectPage');
const ExpensesPage = lazyWithRetry(() => import('@/pages/finance'), 'ExpensesPage');
const InvoiceDocumentPage = lazyWithRetry(() => import('@/pages/finance'), 'InvoiceDocumentPage');
const HrModuleChrome = lazyWithRetry(() => import('@/pages/hr'), 'HrModuleChrome');
const HrDashboardPage = lazyWithRetry(() => import('@/pages/hr'), 'HrDashboardPage');
const HrEmployeesPage = lazyWithRetry(() => import('@/pages/hr'), 'HrEmployeesPage');
const HrEmployeeDetailPage = lazyWithRetry(() => import('@/pages/hr'), 'HrEmployeeDetailPage');
const HrPayrollPage = lazyWithRetry(() => import('@/pages/hr'), 'HrPayrollPage');
const HrPayrollPeriodPage = lazyWithRetry(() => import('@/pages/hr'), 'HrPayrollPeriodPage');
const HrLeavePage = lazyWithRetry(() => import('@/pages/hr'), 'HrLeavePage');
const HrDocumentsPage = lazyWithRetry(() => import('@/pages/hr'), 'HrDocumentsPage');
const ReportsPage = lazyWithRetry(() => import('@/pages/reports'), 'ReportsPage');
const AdministrationPage = lazyWithRetry(() => import('@/pages/administration'), 'AdministrationPage');
const SettingsPage = lazyWithRetry(() => import('@/pages/settings'), 'SettingsPage');
const DesignSystemPage = lazyWithRetry(() => import('@/pages/design-system'), 'DesignSystemPage');
const EmissionsPage = lazyWithRetry(() => import('@/pages/emissions'), 'EmissionsPage');
const LocationsPage = lazyWithRetry(() => import('@/pages/locations'), 'LocationsPage');
const AddLocationPage = lazyWithRetry(() => import('@/pages/locations'), 'AddLocationPage');
const ShippersPage = lazyWithRetry(() => import('@/pages/shippers'), 'ShippersPage');
const AddShipperPage = lazyWithRetry(() => import('@/pages/shippers'), 'AddShipperPage');
const ShipperDetailPage = lazyWithRetry(() => import('@/pages/shippers'), 'ShipperDetailPage');
const ShipperDashboardPage = lazyWithRetry(() => import('@/pages/shippers'), 'ShipperDashboardPage');
const AnalyticsPage = lazyWithRetry(() => import('@/pages/analytics'), 'AnalyticsPage');
const TransporterPortalPage = lazyWithRetry(
  () => import('@/pages/transporter-portal'),
  'TransporterPortalPage',
);
const TransporterDashboardPage = lazyWithRetry(
  () => import('@/pages/transporter-portal'),
  'TransporterDashboardPage',
);
const TransporterAnalyticsPage = lazyWithRetry(
  () => import('@/pages/transporter-portal'),
  'TransporterAnalyticsPage',
);
const ShipmentOverviewPage = lazyWithRetry(() => import('@/pages/shipments'), 'ShipmentOverviewPage');
const MissionsPage = lazyWithRetry(() => import('@/pages/missions'), 'MissionsPage');
const OnboardingPage = lazyWithRetry(() => import('@/pages/onboarding'));
const EmptyReturnModuleChrome = lazyWithRetry(
  () => import('@/pages/empty-returns'),
  'EmptyReturnModuleChrome',
);
const WorkspaceModuleChrome = lazyWithRetry(() => import('@/pages/workspace'), 'WorkspaceModuleChrome');
const WorkspaceTasksPage = lazyWithRetry(() => import('@/pages/workspace'), 'WorkspaceTasksPage');
const WorkspaceTicketsPage = lazyWithRetry(() => import('@/pages/workspace'), 'WorkspaceTicketsPage');
const WorkspaceTicketDetailPage = lazyWithRetry(() => import('@/pages/workspace'), 'WorkspaceTicketDetailPage');
const WorkspaceTaskDetailPage = lazyWithRetry(() => import('@/pages/workspace'), 'WorkspaceTaskDetailPage');
const WorkspaceMessagesPage = lazyWithRetry(() => import('@/pages/workspace'), 'WorkspaceMessagesPage');
const EmptyReturnControlTowerPage = lazyWithRetry(
  () => import('@/pages/empty-returns'),
  'ControlTowerPage',
);
const EmptyReturnCyclesPage = lazyWithRetry(
  () => import('@/pages/empty-returns'),
  'EmptyReturnCyclesPage',
);
const EmptyReturnMatchingPage = lazyWithRetry(
  () => import('@/pages/empty-returns'),
  'MatchingPage',
);
const EmptyReturnPerformancePage = lazyWithRetry(
  () => import('@/pages/empty-returns'),
  'EmptyReturnPerformancePage',
);
const NotFoundPage = lazyWithRetry(() => import('@/pages/errors'));


import { useAuthStore } from '@/stores';

function RootIndexRedirect() {
  const user = useAuthStore((state) => state.user);
  if (user?.role === 'SHIPPER' || user?.role === 'CLIENT') {
    return <Navigate to={ROUTES.shipperDashboard} replace />;
  }
  if (user?.role === 'TRANSPORTER') {
    return <Navigate to={ROUTES.transporterDashboard} replace />;
  }
  return <Navigate to={ROUTES.dashboard} replace />;
}

function DashboardOrShipperRedirect() {
  const user = useAuthStore((state) => state.user);
  if (user?.role === 'SHIPPER' || user?.role === 'CLIENT') {
    return <Navigate to={ROUTES.shipperDashboard} replace />;
  }
  if (user?.role === 'TRANSPORTER') {
    return <Navigate to={ROUTES.transporterDashboard} replace />;
  }
  return <DashboardPage />;
}

export const routes: RouteObject[] = [
  {
    path: ROUTES.login,
    element: (
      <AuthLayout>
        <LoginPage />
      </AuthLayout>
    ),
  },
  {
    path: ROUTES.register,
    element: (
      <AuthLayout>
        <RegisterPage />
      </AuthLayout>
    ),
  },
  {
    path: ROUTES.forgotPassword,
    element: (
      <AuthLayout>
        <ForgotPasswordPage />
      </AuthLayout>
    ),
  },
  {
    path: ROUTES.root,
    element: (
      <ProtectedRoute>
        <AppLayout />
      </ProtectedRoute>
    ),
    children: [
      { index: true, element: <RootIndexRedirect /> },

      { path: ROUTES.dashboard, element: <DashboardOrShipperRedirect /> },
      { path: ROUTES.onboarding, element: <OnboardingPage /> },
      { path: ROUTES.partners, element: <PartnersPage /> },
      { path: ROUTES.partnerDetail, element: <PartnerDetailPage /> },
      { path: ROUTES.vehicles, element: <VehiclesPage /> },
      { path: ROUTES.drivers, element: <DriversPage /> },
      /* The staff directory placeholder is superseded by the HR module. */
      { path: ROUTES.employees, element: <Navigate to={ROUTES.hrEmployees} replace /> },
      { path: ROUTES.documents, element: <DocumentsPage /> },
      /*
       * Billing. Six views under one chrome, down from twelve — the
       * working-capital module was removed on 2026-09-03. Expenses is the odd
       * one out and gated differently: see `ROUTE_PERMISSIONS`.
       *
       * The old deep links are kept as redirects rather than deleted. People
       * bookmark a finance screen and mail each other links to one; a 404 on a
       * URL that worked last week reads as the app being broken, where a
       * redirect to the desk reads as the screen having moved.
       */
      {
        element: <FinanceModuleChrome />,
        children: [
          { path: ROUTES.finance, element: <BillingPage /> },
          { path: ROUTES.financeInvoices, element: <InvoicesPage /> },
          { path: ROUTES.financeInvoiceDetail, element: <InvoiceDocumentPage /> },
          { path: ROUTES.financeProjects, element: <ProjectsPage /> },
          { path: ROUTES.financeProjectDetail, element: <ProjectPage /> },
          { path: ROUTES.financeExpenses, element: <ExpensesPage /> },
        ],
      },
      { path: '/finance/shipments/*', element: <Navigate to={ROUTES.finance} replace /> },
      { path: '/finance/accounts', element: <Navigate to={ROUTES.finance} replace /> },
      { path: '/finance/funding', element: <Navigate to={ROUTES.finance} replace /> },
      { path: '/finance/payments/*', element: <Navigate to={ROUTES.financeInvoices} replace /> },
      /*
       * HR & Payroll. A layout route like finance and empty return, so the six
       * views share one module shell — and so the payroll run, the leave grid
       * and the document generator can never be reached without the module's
       * own chrome around them.
       */
      {
        element: <HrModuleChrome />,
        children: [
          { path: ROUTES.hr, element: <HrDashboardPage /> },
          { path: ROUTES.hrEmployees, element: <HrEmployeesPage /> },
          { path: ROUTES.hrEmployeeDetail, element: <HrEmployeeDetailPage /> },
          { path: ROUTES.hrPayroll, element: <HrPayrollPage /> },
          { path: ROUTES.hrPayrollPeriod, element: <HrPayrollPeriodPage /> },
          { path: ROUTES.hrLeave, element: <HrLeavePage /> },
          { path: ROUTES.hrDocuments, element: <HrDocumentsPage /> },
        ],
      },
      { path: ROUTES.emissions, element: <EmissionsPage /> },
      { path: ROUTES.reports, element: <ReportsPage /> },
      { path: ROUTES.administration, element: <AdministrationPage /> },
      { path: ROUTES.settings, element: <SettingsPage /> },
      { path: ROUTES.designSystem, element: <DesignSystemPage /> },
      { path: ROUTES.locations, element: <LocationsPage /> },
      { path: ROUTES.addLocation, element: <AddLocationPage /> },
      { path: ROUTES.shippers, element: <ShippersPage /> },
      { path: ROUTES.addShipper, element: <AddShipperPage /> },
      { path: ROUTES.shipperDetail, element: <ShipperDetailPage /> },
      { path: ROUTES.shipperDashboard, element: <ShipperDashboardPage /> },
      { path: ROUTES.analytics, element: <AnalyticsPage /> },
      { path: ROUTES.transporterDashboard, element: <TransporterDashboardPage /> },
      { path: ROUTES.transporterAnalytics, element: <TransporterAnalyticsPage /> },
      { path: ROUTES.transporterPortal, element: <TransporterPortalPage /> },
      { path: ROUTES.shipmentsList, element: <MissionsPage /> },
      { path: ROUTES.shipmentOverview, element: <ShipmentOverviewPage /> },
      { path: ROUTES.bookings, element: <MissionsPage /> },
      { path: ROUTES.bookingDetail, element: <ShipmentOverviewPage /> },
      { path: ROUTES.missions, element: <MissionsPage /> },
      { path: ROUTES.missionDetail, element: <ShipmentOverviewPage /> },
      // Workspace — the work layer. Same pathless-layout shape as Empty
      // Container below: four sibling URLs sharing one title and one Raise
      // entry point. `/workspace` itself is a redirect, because a module root
      // that renders nothing is a dead click from the sidebar.
      {
        element: <WorkspaceModuleChrome />,
        children: [
          { path: ROUTES.workspace, element: <Navigate to={ROUTES.workspaceTasks} replace /> },
          /* The Inbox was removed 2026-08-31 — the bell in the header carries
             the same notifications, including assigned comments. */
          { path: '/workspace/inbox', element: <Navigate to={ROUTES.workspaceTasks} replace /> },
          { path: ROUTES.workspaceTasks, element: <WorkspaceTasksPage /> },
          /* The three paths this screen replaced. Kept as redirects that carry
             the scope across, so a link somebody already wrote down still
             lands on the list they meant. */
          { path: ROUTES.workspaceMyTasks, element: <Navigate to={`${ROUTES.workspaceTasks}?scope=mine`} replace /> },
          { path: ROUTES.workspaceAssignedByMe, element: <Navigate to={`${ROUTES.workspaceTasks}?scope=raised`} replace /> },
          { path: ROUTES.workspaceAllTasks, element: <Navigate to={ROUTES.workspaceTasks} replace /> },
          { path: ROUTES.workspaceTaskDetail, element: <WorkspaceTaskDetailPage /> },
          { path: ROUTES.workspaceTickets, element: <WorkspaceTicketsPage /> },
          { path: ROUTES.workspaceTicketDetail, element: <WorkspaceTicketDetailPage /> },
          /* Recurring tasks were removed 2026-08-31 — one rule ever existed and
             it was a test one. The old path still lands somewhere real. */
          { path: '/workspace/automation', element: <Navigate to={ROUTES.workspaceTasks} replace /> },
          { path: ROUTES.workspaceMessages, element: <WorkspaceMessagesPage /> },
          { path: ROUTES.workspaceChannel, element: <WorkspaceMessagesPage /> },
        ],
      },
      // Pathless layout route: the views are siblings in the URL, but they
      // share one 30s clock and one toast renderer. See EmptyReturnModuleChrome.
      // Chains used to be a sibling here; it's now drawn inside Cycles — the
      // old path redirects there, below. Matching used to be a sibling too; it
      // is the Matching page again since 2026-08-29, so the
      // old path lands there with the popup already open.
      {
        element: <EmptyReturnModuleChrome />,
        children: [
          // The module root is the Control Tower, not a dashboard: an operator
          // opening Empty Return wants the queue of containers needing a
          // decision. Measurement is a place you go deliberately.
          { path: ROUTES.emptyReturns, element: <EmptyReturnControlTowerPage /> },
          // Matching is a page again as of 2026-08-29, restored with the rest
          // of v19. It works ONE container deeply (score, margin, checklist,
          // refusal reasons); the Control Tower's popup works the whole pile at
          // once. Same engine behind both, so they cannot disagree.
          { path: ROUTES.emptyReturnsMatching, element: <EmptyReturnMatchingPage /> },
          { path: ROUTES.emptyReturnsCycles, element: <EmptyReturnCyclesPage /> },
          { path: ROUTES.emptyReturnsPerformance, element: <EmptyReturnPerformancePage /> },
          // Chains are drawn inside Cycles, the per-transporter table folded into
          // the Dashboard's filters, and the Calendar is now a tab on the
          // Control Tower. Every path stays so old bookmarks and any link
          // outside this repo still land somewhere real.
          // The Calendar moved to the Shipments page as a tab on 2026-08-29 —
          // it plans shipments, so it belongs beside them. The old path stays
          // so bookmarks and any link outside this repo still land somewhere.
          {
            path: ROUTES.emptyReturnsCalendar,
            element: <Navigate to={ROUTES.shipmentsList} replace />,
          },
          {
            path: ROUTES.emptyReturnsChains,
            element: <Navigate to={ROUTES.emptyReturnsCycles} replace />,
          },
          {
            path: ROUTES.emptyReturnsTransporters,
            element: <Navigate to={ROUTES.emptyReturnsPerformance} replace />,
          },
        ],
      },

      // Legacy: Container Returns became Empty Returns. Kept so old bookmarks and
      // any link outside this repo still land on the module that replaced it.
      { path: '/container-returns', element: <Navigate to={ROUTES.emptyReturns} replace /> },

      // Unmatched paths render inside the shell so navigation stays available.
      { path: ROUTES.notFound, element: <NotFoundPage /> },
    ],
  },
];
