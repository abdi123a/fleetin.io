import type { ReactNode } from 'react';

import { ErrorBoundary } from '@/components';
import { TooltipProvider } from '@/design-system';

import { QueryProvider } from './QueryProvider';
import { ThemeProvider } from './ThemeProvider';

/**
 * AppProviders — every application-wide context, composed in one place.
 *
 * Order matters and is deliberate:
 *   ErrorBoundary  outermost, so a provider that throws is still caught
 *   ThemeProvider  applies the theme before anything paints
 *   QueryProvider  data layer
 *   TooltipProvider shared hover timing for every tooltip in the app
 *
 * New global providers are added here rather than in `main.tsx`, which stays a
 * three-line mount.
 */
export function AppProviders({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ThemeProvider>
        <QueryProvider>
          <TooltipProvider delayDuration={300} skipDelayDuration={150}>
            {children}
          </TooltipProvider>
        </QueryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
