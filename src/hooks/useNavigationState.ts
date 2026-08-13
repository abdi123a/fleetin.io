import { useCallback } from 'react';
import { useLocation } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
import type { NavItem } from '@/types';

interface UseNavigationStateResult {
  /** True when the item's own path matches the current URL. */
  isItemActive: (item: NavItem) => boolean;
  /** True when the item or any descendant matches — used to highlight groups. */
  isBranchActive: (item: NavItem) => boolean;
}

/**
 * Active-state resolution for navigation items.
 *
 * `matchNested` opts an item into prefix matching, so `/vehicles/42` keeps
 * "Vehicles" highlighted. Without it, matching is exact.
 *
 * Paths with `?tab=` match on pathname + the `tab` query value only, so
 * filter params on the same page do not break the highlight — and a bare
 * analytics path stays inactive while a subject tab is open.
 */
export function useNavigationState(): UseNavigationStateResult {
  const { pathname, search } = useLocation();
  const fullPath = `${pathname}${search}`;
  const currentParams = new URLSearchParams(search);
  const currentTab = currentParams.get('tab');

  const isItemActive = useCallback(
    (item: NavItem): boolean => {
      if (!item.path) return false;

      if (item.path.includes('?')) {
        const [itemPathname, itemQuery = ''] = item.path.split('?');
        if (pathname !== itemPathname) return false;

        const itemParams = new URLSearchParams(itemQuery);
        const itemTab = itemParams.get('tab');
        if (itemTab !== null) {
          return currentTab === itemTab;
        }

        // Non-tab query paths: require exact search match.
        return fullPath === item.path;
      }

      // `/` is an alias for the dashboard, so both must light the same item up.
      if (item.path === ROUTES.dashboard) {
        return pathname === ROUTES.dashboard || pathname === ROUTES.root;
      }

      // Bare analytics path is only active on the overview (no / default tab).
      if (
        item.path === ROUTES.transporterAnalytics ||
        item.path === ROUTES.analytics
      ) {
        if (pathname !== item.path) return false;
        return currentTab === null || currentTab === 'overview';
      }

      if (item.matchNested) {
        return pathname === item.path || pathname.startsWith(`${item.path}/`);
      }

      return pathname === item.path;
    },
    [pathname, fullPath, currentTab],
  );

  const isBranchActive = useCallback(
    function branchActive(item: NavItem): boolean {
      if (isItemActive(item)) return true;
      return item.children?.some(branchActive) ?? false;
    },
    [isItemActive],
  );

  return { isItemActive, isBranchActive };
}
