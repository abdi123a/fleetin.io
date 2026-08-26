import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { EMPTY_BI_DATASET, fetchDataset } from '../api/biService';
import { biQueryKeys } from '../api/queries';
import { buildShipperAccount, type ShipperAccount } from './accountSummary';

export interface UseShipperAccountOptions {
  shipperId: string;
  /** Injected so a test — and the control tower beside it — observes the same instant. */
  now?: Date;
}

/**
 * The account figures for one shipper.
 *
 * Reads the control tower's dataset rather than a parallel source, which is the
 * whole point: the page header and the dashboard under it are two views of one
 * derivation.
 *
 * Now a real query against `GET /bi/shipper/:id/dataset`, which is what this
 * file's previous version said it would become once the BI endpoints landed.
 * Until then it read an in-browser simulation, so a shipper with nine real
 * shipments was shown 260 of them, 242 "delivered", under the heading "Live
 * position".
 *
 * While the fetch is in flight it returns an account built from an empty
 * dataset — every figure zero — so the call sites keep their shape and,
 * more importantly, never briefly show a number that isn't real. `isLoading`
 * is exposed for anything that wants to say so explicitly.
 */
export function useShipperAccount({
  shipperId,
  now,
}: UseShipperAccountOptions): ShipperAccount & { isLoading: boolean } {
  // Pinned to the day so a re-render cannot shift the observation instant
  // mid-page and leave the header disagreeing with the table below it.
  const asOf = useMemo(() => now ?? new Date(), [now]);

  const { data, isLoading } = useQuery({
    queryKey: [...biQueryKeys.all(shipperId), 'dataset', asOf.toISOString().slice(0, 10)] as const,
    queryFn: () => fetchDataset(shipperId, asOf),
    enabled: Boolean(shipperId),
    staleTime: Infinity,
  });

  return useMemo(
    () => ({ ...buildShipperAccount(data ?? EMPTY_BI_DATASET), isLoading }),
    [data, isLoading],
  );
}
