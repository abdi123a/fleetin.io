import { aggregateOverview, type TransporterOverview } from '../aggregate';
import { generateDataset } from '../mocks/generateDataset';
import type { TransporterDataset, TransporterFilters } from '../contracts';

/**
 * The seam between the portal and its data source.
 *
 * Today every function resolves against the deterministic mock generator;
 * when `fleetin-backend` lands, the bodies become fetches and nothing above
 * this file changes. Datasets cache per transporter per day so the simulation
 * runs once, not per render.
 */

const datasetCache = new Map<string, TransporterDataset>();

function cacheKey(transporterId: string, now: Date): string {
  return `${transporterId}:${now.toISOString().slice(0, 10)}`;
}

/** Synchronous access to the raw dataset, for derivations done in-component. */
export function peekTransporterDataset(transporterId: string, now: Date): TransporterDataset {
  const key = cacheKey(transporterId, now);
  let dataset = datasetCache.get(key);
  if (!dataset) {
    dataset = generateDataset({ transporterId, asOf: now });
    datasetCache.set(key, dataset);
  }
  return dataset;
}

export interface TransporterBiRequest {
  transporterId: string;
  filters: TransporterFilters;
  now: Date;
}

export async function fetchTransporterOverview(
  request: TransporterBiRequest,
): Promise<TransporterOverview> {
  const dataset = peekTransporterDataset(request.transporterId, request.now);
  return aggregateOverview(dataset, request.filters);
}
