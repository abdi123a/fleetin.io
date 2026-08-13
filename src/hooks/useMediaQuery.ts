import { useSyncExternalStore } from 'react';

import { breakpointTokens, type Breakpoint } from '@/design-system/tokens';

/**
 * Subscribes to a CSS media query.
 *
 * Uses `useSyncExternalStore` rather than `useState` + `useEffect` so the first
 * render already has the correct value — no layout flash on mount.
 */
export function useMediaQuery(query: string): boolean {
  const subscribe = (onStoreChange: () => void) => {
    if (typeof window === 'undefined') return () => {};

    const mediaQuery = window.matchMedia(query);
    mediaQuery.addEventListener('change', onStoreChange);
    return () => mediaQuery.removeEventListener('change', onStoreChange);
  };

  const getSnapshot = () =>
    typeof window === 'undefined' ? false : window.matchMedia(query).matches;

  return useSyncExternalStore(subscribe, getSnapshot, () => false);
}

/** True at or above the given breakpoint. */
export function useBreakpoint(breakpoint: Breakpoint): boolean {
  return useMediaQuery(`(min-width: ${breakpointTokens[breakpoint]}px)`);
}

/**
 * True below the `lg` breakpoint — the point at which the sidebar switches from
 * a docked rail to an overlay drawer.
 */
export function useIsMobile(): boolean {
  return useMediaQuery(`(max-width: ${breakpointTokens.lg - 1}px)`);
}
