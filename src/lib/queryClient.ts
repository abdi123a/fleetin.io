import { QueryClient } from '@tanstack/react-query';

/**
 * TanStack Query client.
 *
 * Configured, but with no queries defined — Phase 1 ships no API integration.
 * The defaults below are the ones an internal operations tool wants: data is
 * treated as fresh for a short window, refetch-on-focus is off (operators keep
 * many tabs open), and 4xx responses are never retried.
 */

/** HTTP status codes that indicate a client error and must not be retried. */
const CLIENT_ERROR_RANGE = { min: 400, max: 499 } as const;

const MAX_RETRIES = 2;

interface HttpError {
  status?: number;
}

function isClientError(error: unknown): boolean {
  const status = (error as HttpError | null)?.status;
  return (
    typeof status === 'number' &&
    status >= CLIENT_ERROR_RANGE.min &&
    status <= CLIENT_ERROR_RANGE.max
  );
}

export function createQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        // Operators keep many tabs open; refetching on every focus generates
        // load without changing what they see.
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
        retry: (failureCount, error) =>
          !isClientError(error) && failureCount < MAX_RETRIES,
      },
      mutations: {
        // Mutations are not idempotent — never retry them automatically.
        retry: false,
      },
    },
  });
}

/** Shared client instance for the application root. */
export const queryClient = createQueryClient();
