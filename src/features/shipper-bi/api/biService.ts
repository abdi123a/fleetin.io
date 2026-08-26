import { apiClient } from '@/services/api.client';
import { useAuthStore } from '@/stores/auth.store';
import { buildContext } from '@/lib/bi/aggregate/context';
import { aggregateOverview } from '@/lib/bi/aggregate/overview';
import { biDatasetSchema, type BiDataset, type BiFilters, type OverviewSection } from '../contracts';

/**
 * The seam between the dashboard and its data source.
 *
 * This file used to build the dataset in the browser from `generateDataset` —
 * a simulation that, for one real shipper with nine shipments, reported 260
 * shipments and a 69.8% on-time rate under the heading "Live position". It now
 * fetches `GET /bi/shipper/:id/dataset`, which the backend builds from real
 * bookings, and everything above this file is unchanged: the aggregators
 * already ran on this exact contract, which is why they live in `lib/bi`
 * rather than in components.
 *
 * Some arrays come back empty because the system genuinely has no such data —
 * there is no delay-attribution model, no GPS feed and no stored ETA
 * predictions (see `BiService` on the backend). Sections built on those show
 * nothing rather than something invented.
 */

function token() {
  return useAuthStore.getState().accessToken;
}

/**
 * What a consumer renders while the real dataset is in flight. Every figure
 * derived from it is zero, which is the point: a loading dashboard must never
 * flash a number that isn't real.
 */
export const EMPTY_BI_DATASET: BiDataset = {
  asOf: new Date(0).toISOString(),
  shipperId: '',
  transporters: [],
  routes: [],
  depots: [],
  vehicles: [],
  shipments: [],
  events: [],
  containers: [],
  delays: [],
  charges: [],
  positions: [],
  etaSnapshots: [],
};

/** Pinned to the day, matching the query keys — an instant-level key is a guaranteed cache miss. */
const dayOf = (now: Date) => now.toISOString().slice(0, 10);

const datasetCache = new Map<string, Promise<BiDataset>>();

export function fetchDataset(shipperId: string, now: Date): Promise<BiDataset> {
  const cacheKey = `${shipperId}:${dayOf(now)}`;
  let pending = datasetCache.get(cacheKey);
  if (!pending) {
    pending = apiClient
      .get<unknown>(`/bi/shipper/${encodeURIComponent(shipperId)}/dataset?asOf=${now.toISOString()}`, token())
      // Parsed, not cast: the contract is the agreement with the backend, and a
      // drift on either side should fail loudly here rather than surface as a
      // quietly wrong chart.
      .then((res) => biDatasetSchema.parse(res.data))
      .catch((error) => {
        datasetCache.delete(cacheKey);
        throw error;
      });
    datasetCache.set(cacheKey, pending);
  }
  return pending;
}

export interface BiRequest {
  shipperId: string;
  filters: BiFilters;
  now: Date;
}

export async function fetchOverview({ shipperId, filters, now }: BiRequest): Promise<OverviewSection> {
  const context = buildContext(await fetchDataset(shipperId, now), filters);
  return aggregateOverview(context);
}
