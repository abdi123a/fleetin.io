import { lazy } from 'react';
import { Navigate, useNavigate, type RouteObject } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import { AppLayout, AuthLayout } from '@/layouts';
import { ProtectedRoute } from '@/components/auth/ProtectedRoute';
// Type-only, so it is erased at build time and does not pull the page into this chunk.
import type { EmptyReturnMatchingPageProps } from '@/pages/empty-returns';

/**
 * Almost every route element is rendered without props, so `P` defaults to none.
 * The one exception is a page that hands a decision back to its host — Empty
 * Return Matching reports "a cycle was created" instead of navigating itself —
 * and a prop-free `ComponentType` would make that wrapper untypeable.
 */
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
const EmployeesPage = lazyWithRetry(() => import('@/pages/employees'), 'EmployeesPage');
const DocumentsPage = lazyWithRetry(() => import('@/pages/documents'), 'DocumentsPage');
const FinanceModuleChrome = lazyWithRetry(() => import('@/pages/finance'), 'FinanceModuleChrome');
const FinanceOverviewPage = lazyWithRetry(() => import('@/pages/finance'), 'FinanceOverviewPage');
const FinanceShipmentsPage = lazyWithRetry(() => import('@/pages/finance'), 'FinanceShipmentsPage');
const FinanceClientPage = lazyWithRetry(() => import('@/pages/finance'), 'FinanceClientPage');
const FinanceProjectPage = lazyWithRetry(() => import('@/pages/finance'), 'FinanceProjectPage');
const FinanceShipmentPage = lazyWithRetry(() => import('@/pages/finance'), 'FinanceShipmentPage');
const FinanceBookingPage = lazyWithRetry(() => import('@/pages/finance'), 'FinanceBookingPage');
const FinanceInvoicesPage = lazyWithRetry(() => import('@/pages/finance'), 'FinanceInvoicesPage');
const InvoiceDocumentPage = lazyWithRetry(() => import('@/pages/finance'), 'InvoiceDocumentPage');
const PaymentVoucherPage = lazyWithRetry(() => import('@/pages/finance'), 'PaymentVoucherPage');
const ReportsPage = lazyWithRetry(() => import('@/pages/reports'), 'ReportsPage');
const AdministrationPage = lazyWithRetry(() => import('@/pages/administration'), 'AdministrationPage');
const SettingsPage = lazyWithRetry(() => import('@/pages/settings'), 'SettingsPage');
const DesignSystemPage = lazyWithRetry(() => import('@/pages/design-system'), 'DesignSystemPage');
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
const EmptyReturnDashboardPage = lazyWithRetry(
  () => import('@/pages/empty-returns'),
  'EmptyReturnDashboardPage',
);
const EmptyReturnCyclesPage = lazyWithRetry(
  () => import('@/pages/empty-returns'),
  'EmptyReturnCyclesPage',
);
const EmptyReturnMatchingPage = lazyWithRetry<EmptyReturnMatchingPageProps>(
  () => import('@/pages/empty-returns'),
  'EmptyReturnMatchingPage',
);
const EmptyReturnTransportersPage = lazyWithRetry(
  () => import('@/pages/empty-returns'),
  'EmptyReturnTransportersPage',
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

/**
 * Matching hands the "a cycle was created" moment back to its host rather than
 * navigating itself, so the same view can live behind a route or behind a tab.
 * A `RouteObject.element` cannot call `useNavigate`, hence this two-line seam.
 */
function EmptyReturnMatchingRoute() {
  const navigate = useNavigate();
  return <EmptyReturnMatchingPage onCycleCreated={() => navigate(ROUTES.emptyReturnsCycles)} />;
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
      { path: ROUTES.employees, element: <EmployeesPage /> },
      { path: ROUTES.documents, element: <DocumentsPage /> },
      /*
       * Finance is a layout route like Empty Return: the chrome owns the one
       * 30-second clock every validation window reads from and the module's
       * single toast renderer. Seven views mount inside it.
       */
      {
        element: <FinanceModuleChrome />,
        children: [
          { path: ROUTES.finance, element: <FinanceOverviewPage /> },
          { path: ROUTES.financeShipments, element: <FinanceShipmentsPage /> },
          { path: ROUTES.financeShipmentClient, element: <FinanceClientPage /> },
          { path: ROUTES.financeShipmentProject, element: <FinanceProjectPage /> },
          /*
           * The two tiers, deliberately different pages. The SHIPMENT owns
           * release, settlement and both documents; the BOOKING is a container
           * you can read but not pay. Pointing both at one component is what
           * made the old build pay per container.
           */
          { path: ROUTES.financeShipmentDetail, element: <FinanceShipmentPage /> },
          { path: ROUTES.financeShipmentBooking, element: <FinanceBookingPage /> },
          { path: ROUTES.financeInvoices, element: <FinanceInvoicesPage /> },
          { path: ROUTES.financeInvoiceDetail, element: <InvoiceDocumentPage /> },
          // The two documents: the client's invoice above, the transporter's
          // signed voucher here.
          { path: ROUTES.financePayment, element: <PaymentVoucherPage /> },
        ],
      },
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
      // Pathless layout route: the four views are siblings in the URL, but they
      // share one 30s clock and one toast renderer. See EmptyReturnModuleChrome.
      // Chains used to be a fifth sibling here; it's now a tab inside Cycles
      // (`?tab=chains`) — the old path redirects there, below.
      {
        element: <EmptyReturnModuleChrome />,
        children: [
          { path: ROUTES.emptyReturns, element: <EmptyReturnDashboardPage /> },
          { path: ROUTES.emptyReturnsCycles, element: <EmptyReturnCyclesPage /> },
          { path: ROUTES.emptyReturnsMatching, element: <EmptyReturnMatchingRoute /> },
          {
            path: ROUTES.emptyReturnsChains,
            element: <Navigate to={`${ROUTES.emptyReturnsCycles}?tab=chains`} replace />,
          },
          { path: ROUTES.emptyReturnsTransporters, element: <EmptyReturnTransportersPage /> },
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
