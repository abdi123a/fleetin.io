import { useCallback, useState } from 'react';
import type { DrillDown } from '../contracts';

/**
 * One drill-down channel for the whole panel.
 *
 * Every clickable chart mark carries a `DrillDown` in its data — the aggregator
 * that produced the number decides what "the shipments behind it" means,
 * because only it knows which rows went into the figure. The UI's job is to
 * open a sheet with whatever it was handed, which is why one hook serves all
 * twenty-one features instead of each chart wiring its own.
 */

export interface UseBiDrillDownResult {
  active: DrillDown | null;
  open: (drillDown: DrillDown | undefined) => void;
  close: () => void;
}

export function useBiDrillDown(): UseBiDrillDownResult {
  const [active, setActive] = useState<DrillDown | null>(null);

  const open = useCallback((drillDown: DrillDown | undefined) => {
    if (drillDown) setActive(drillDown);
  }, []);

  const close = useCallback(() => setActive(null), []);

  return { active, open, close };
}
