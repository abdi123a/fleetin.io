import type { ReactNode } from 'react';

import { ErrorBoundary } from '@/components';
import { TooltipProvider } from '@/design-system';

import { BrandingProvider } from './BrandingProvider';
import { QueryProvider } from './QueryProvider';
import { ThemeProvider } from './ThemeProvider';

/**
 * AppProviders — every application-wide context, composed in one place.
 *
 * Order matters and is deliberate:
 *   ErrorBoundary   outermost, so a provider that throws is still caught
 *   ThemeProvider   applies the theme before anything paints
 *   QueryProvider   data layer
 *   BrandingProvider inside QueryProvider — it reads the settings query for the
 *                    server-owned commission, so it needs the client above it
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
          <BrandingProvider>
            <TooltipProvider delayDuration={300} skipDelayDuration={150}>
              {children}
            </TooltipProvider>
          </BrandingProvider>
        </QueryProvider>
      </ThemeProvider>
    </ErrorBoundary>
  );
}
