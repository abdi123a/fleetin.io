import { useQuery } from '@tanstack/react-query';
import type { BiFilters } from '../contracts';
import { fetchDataset, fetchOverview } from './biService';

/**
 * Query hooks, one per section.
 *
 * The key carries the shipper, the section and the filters, so changing any
 * filter refetches exactly the sections on screen and nothing else. `now` is
 * pinned to the day rather than the instant — including a millisecond
 * timestamp in a query key means every render is a cache miss.
 */

export const biQueryKeys = {
  all: (shipperId: string) => ['shipper-bi', shipperId] as const,
  section: (shipperId: string, section: string, filters: BiFilters, day: string) =>
    ['shipper-bi', shipperId, section, day, filters] as const,
};

interface SectionArgs {
  shipperId: string;
  filters: BiFilters;
  now: Date;
  enabled?: boolean;
}

const dayOf = (now: Date) => now.toISOString().slice(0, 10);

/**
 * The raw dataset, for the few consumers that need it rather than an
 * aggregated section — the cover map wants the corridor geometry itself.
 * Shares its key with `useShipperAccount`, so one fetch serves both.
 */
export function useBiDataset(shipperId: string, now: Date) {
  return useQuery({
    queryKey: [...biQueryKeys.all(shipperId), 'dataset', dayOf(now)] as const,
    queryFn: () => fetchDataset(shipperId, now),
    enabled: Boolean(shipperId),
    staleTime: Infinity,
  });
}

export function useOverviewSection({ shipperId, filters, now, enabled = true }: SectionArgs) {
  return useQuery({
    queryKey: biQueryKeys.section(shipperId, 'overview', filters, dayOf(now)),
    queryFn: () => fetchOverview({ shipperId, filters, now }),
    enabled,
    // The dataset is deterministic for a given day, so a result stays valid
    // until the filters change. Refetching would recompute an identical answer.
    staleTime: Infinity,
  });
}
