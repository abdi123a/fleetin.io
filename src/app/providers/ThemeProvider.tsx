import { useEffect, type ReactNode } from 'react';

import { applyTheme, subscribeToSystemTheme, useThemeStore } from '@/stores';

/**
 * ThemeProvider.
 *
 * The theme store owns the `<html>` class, so this provider carries no state of
 * its own. It exists to run the two effects that must happen exactly once at
 * the application root:
 *
 *   1. apply the rehydrated theme on mount (covering the case where the store
 *      hydrated before this tree rendered)
 *   2. keep `mode: 'system'` reactive to OS theme changes
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    applyTheme(useThemeStore.getState().resolvedTheme);
    return subscribeToSystemTheme();
  }, []);

  return <>{children}</>;
}
