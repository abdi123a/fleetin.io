import { useCallback, useState } from 'react';
import type { DetailRequest } from '../contracts';

/**
 * The single detail channel for the whole portal.
 *
 * Every clickable mark — KPI tile, chart slice, alert row, leaderboard entry —
 * opens through this one hook, so exactly one sheet exists and stacking or
 * orphaned drawers cannot happen.
 */
export interface DetailChannel {
  active: DetailRequest | null;
  open: (request: DetailRequest | undefined) => void;
  close: () => void;
}

export function useDetailChannel(): DetailChannel {
  const [active, setActive] = useState<DetailRequest | null>(null);

  const open = useCallback((request: DetailRequest | undefined) => {
    if (request) setActive(request);
  }, []);

  const close = useCallback(() => setActive(null), []);

  return { active, open, close };
}
