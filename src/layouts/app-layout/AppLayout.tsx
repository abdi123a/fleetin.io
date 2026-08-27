import { useEffect } from 'react';
import { Outlet, useLocation } from 'react-router-dom';

import { ErrorBoundary, RouteLoader } from '@/components';
import { RoutePermissionGuard } from '@/components/auth/RoutePermissionGuard';
import { CreateShipmentModal } from '@/components/shipments';
import { useIsMobile } from '@/hooks';
import { useAuthStore, useUiStore } from '@/stores';
import { useHydrateShipments } from '@/features/shipments/api/queries';
import { cn } from '@/utils';
import { Suspense } from 'react';

import { Header } from './components/Header';
import { MobileNav } from './components/MobileNav';
import { Sidebar } from './components/Sidebar';
import { useCompanyLogoRegistry } from '@/features/companies/companyLogos';

/**
 * AppLayout — the single application shell.
 *
 * Every authenticated route renders inside this layout via `<Outlet />`; pages
 * supply content only and never re-implement chrome.
 *
 * Responsive behaviour:
 *   - `lg` and up : sidebar docked, collapsible to a 72px icon rail (persisted)
 *   - below `lg`  : sidebar hidden, reachable as an overlay drawer
 *
 * The docked sidebar is `fixed` with the content offset by a matching padding,
 * so the sidebar does not scroll with the page and the width transition never
 * reflows the content's own scroll position.
 */
export function AppLayout() {
  /* Fill the company-mark registry once for the whole authenticated app. Every
     avatar below reads the resolved map instead of holding a query of its own —
     see `@/features/companies/companyLogos`. */
  useCompanyLogoRegistry();

  const { pathname } = useLocation();
  const isMobile = useIsMobile();

  // Keeps `useShipmentStore`'s `missions` (still read directly by
  // MissionsPage, MissionRowCard, and the Empty Returns bridge) backed by
  // the real API instead of mock data — called once here so every route,
  // including a deep-linked shipment detail page, has it hydrated.
  useHydrateShipments();

  // Permissions are stored with the session at login, and the sidebar and
  // route guard read that stored copy — so an access profile changed by an
  // administrator has to be picked up somewhere. Once per app load is enough:
  // the server re-checks every request regardless.
  const refreshProfile = useAuthStore((state) => state.refreshProfile);
  useEffect(() => {
    void refreshProfile();
  }, [refreshProfile]);

  const isSidebarCollapsed = useUiStore((state) => state.isSidebarCollapsed);
  const isMobileNavOpen = useUiStore((state) => state.isMobileNavOpen);
  const openMobileNav = useUiStore((state) => state.openMobileNav);
  const closeMobileNav = useUiStore((state) => state.closeMobileNav);

  // A drawer left open while the viewport grows would trap focus behind the
  // now-docked sidebar.
  useEffect(() => {
    if (!isMobile && isMobileNavOpen) closeMobileNav();
  }, [isMobile, isMobileNavOpen, closeMobileNav]);

  // Route changes restore the reading position; without this a deep-scrolled
  // page carries its offset into the next route.
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'instant' });
  }, [pathname]);

  return (
    <div className="min-h-dvh bg-background overflow-x-clip">
      {/* Docked sidebar (lg and up) */}
      <aside
        aria-label="Sidebar"
        className={cn(
          'fixed inset-y-0 left-0 z-sidebar hidden border-r border-sidebar-border lg:block',
          'transition-[width] duration-normal ease-emphasized',
          isSidebarCollapsed ? 'w-sidebar-collapsed' : 'w-sidebar',
        )}
      >
        <Sidebar isCollapsed={isSidebarCollapsed} />
      </aside>

      {/* Overlay drawer (below lg) */}
      <MobileNav
        isOpen={isMobileNavOpen}
        onOpenChange={(open) => (open ? openMobileNav() : closeMobileNav())}
        onNavigate={closeMobileNav}
      />

      {/* Content column, offset by the sidebar's current width */}
      <div
        className={cn(
          'flex min-h-dvh flex-col min-w-0 transition-[padding] duration-normal ease-emphasized',
          isSidebarCollapsed ? 'lg:pl-sidebar-collapsed' : 'lg:pl-sidebar',
        )}
      >
        <Header onOpenMobileNav={openMobileNav} />

        <main id="main-content" className="flex-1 flex flex-col min-w-0 px-4 py-6 lg:px-6 lg:py-8">
          <div className="mx-auto w-full max-w-content min-w-0 flex-1 flex flex-col">
            {/* Reset on navigation so an error on one route does not persist
                into the next. */}
            <ErrorBoundary key={pathname}>
              <Suspense fallback={<RouteLoader />}>
                {/* Inside the shell, so a refusal keeps the sidebar and the
                    user can go somewhere they are allowed. */}
                <RoutePermissionGuard>
                  <Outlet />
                </RoutePermissionGuard>
              </Suspense>
            </ErrorBoundary>
          </div>
        </main>
      </div>

      {/* Global Create Shipment Wizard Modal */}
      <CreateShipmentModal />
    </div>
  );
}
