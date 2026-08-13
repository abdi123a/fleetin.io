import { buildContext } from '@/lib/bi/aggregate/context';
import { aggregateOverview } from '@/lib/bi/aggregate/overview';
import { generateDataset } from '../mocks/generateDataset';
import type { BiDataset, BiFilters, OverviewSection } from '../contracts';

/**
 * The seam between the dashboard and its data source.
 *
 * Every function here is the client half of one endpoint. Today they build a
 * dataset in the browser and run the aggregators over it; when
 * `fleetin-backend` grows its `bi` module each body becomes a `fetch` and a
 * `parse`, and nothing above this file changes — the aggregators already run on
 * the server side of that call, on the same contract.
 *
 * That is the whole reason the aggregators live in `lib/bi` rather than in
 * components: they are shared logic that happens to be running client-side for
 * now, not view code.
 */

/** Datasets are expensive to simulate and stable per shipper, so build once. */
const datasetCache = new Map<string, BiDataset>();

function getDataset(shipperId: string, now: Date): BiDataset {
  const cacheKey = `${shipperId}:${now.toISOString().slice(0, 10)}`;
  let dataset = datasetCache.get(cacheKey);
  if (!dataset) {
    dataset = generateDataset({ shipperId, asOf: now });
    datasetCache.set(cacheKey, dataset);
  }
  return dataset;
}

export interface BiRequest {
  shipperId: string;
  filters: BiFilters;
  now: Date;
}

export async function fetchOverview({
  shipperId,
  filters,
  now,
}: BiRequest): Promise<OverviewSection> {
  const context = buildContext(getDataset(shipperId, now), filters);
  return aggregateOverview(context);
}

/** Exposed for the tests and the export path, which need the raw dataset. */
export function peekDataset(shipperId: string, now: Date): BiDataset {
  return getDataset(shipperId, now);
}
