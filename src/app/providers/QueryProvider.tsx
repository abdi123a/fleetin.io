import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import type { ReactNode } from 'react';

import { ENV } from '@/config/app';
import { queryClient } from '@/lib';

/**
 * QueryProvider — TanStack Query context.
 *
 * Devtools are gated on the development build so they are tree-shaken out of
 * production bundles.
 */
export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {ENV.isDevelopment && <ReactQueryDevtools initialIsOpen={false} />}
    </QueryClientProvider>
  );
}
