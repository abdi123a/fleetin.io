import { useMemo } from 'react';
import { peekDataset } from '../api/biService';
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
 * derivation. `peekDataset` is cached per shipper per day, so mounting this
 * beside `ShipperAnalyticsSuite` costs a memo, not a second simulation.
 *
 * Synchronous today because the data is generated in the browser. When the BI
 * endpoints land this becomes a `useQuery` against the same service and the
 * call sites keep their shape — they already read `summary` and `rows` off one
 * object.
 */
export function useShipperAccount({ shipperId, now }: UseShipperAccountOptions): ShipperAccount {
  // Pinned to the day so a re-render cannot shift the observation instant
  // mid-page and leave the header disagreeing with the table below it.
  const asOf = useMemo(() => now ?? new Date(), [now]);

  return useMemo(
    () => buildShipperAccount(peekDataset(shipperId, asOf)),
    [shipperId, asOf],
  );
}
