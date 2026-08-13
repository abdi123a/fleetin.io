import { useQuery } from '@tanstack/react-query';
import type { BiFilters } from '../contracts';
import { fetchOverview } from './biService';

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
