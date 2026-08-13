import { useQuery } from '@tanstack/react-query';
import { fetchTransporterOverview } from './service';
import type { TransporterFilters } from '../contracts';

/**
 * TanStack Query hooks for the portal.
 *
 * Query keys carry the transporter, the filters and the *day* — not the
 * millisecond — so a rerender never refetches but a new day does. Mock data
 * never goes stale, hence `staleTime: Infinity`; swap when the backend lands.
 */

const dayOf = (now: Date) => now.toISOString().slice(0, 10);

export const transporterBiKeys = {
  all: (transporterId: string) => ['transporter-bi', transporterId] as const,
  overview: (transporterId: string, filters: TransporterFilters, day: string) =>
    ['transporter-bi', transporterId, 'overview', filters, day] as const,
};

export interface UseTransporterOverviewOptions {
  transporterId: string;
  filters: TransporterFilters;
  now: Date;
  enabled?: boolean;
}

export function useTransporterOverview({
  transporterId,
  filters,
  now,
  enabled = true,
}: UseTransporterOverviewOptions) {
  return useQuery({
    queryKey: transporterBiKeys.overview(transporterId, filters, dayOf(now)),
    queryFn: () => fetchTransporterOverview({ transporterId, filters, now }),
    staleTime: Infinity,
    enabled,
  });
}
