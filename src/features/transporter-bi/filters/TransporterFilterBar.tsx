import type { ReactNode } from 'react';
import { formatDate } from '@/utils';
import type { TransporterDataset } from '../contracts';
import type { UseTransporterFiltersResult } from './useTransporterFilters';

/**
 * Stub — replaced by the full filter bar (date presets, compare toggle, seven
 * dimension menus, active chips) mirroring `shipper-bi/filters/BiFilterBar`.
 */

export interface TransporterFilterBarProps {
  state: UseTransporterFiltersResult;
  dataset: TransporterDataset;
  /** Rendered at the bar's right edge — the resolved date range, an export. */
  actions?: ReactNode;
}

export function TransporterFilterBar({ state, actions }: TransporterFilterBarProps) {
  const { filters } = state;
  return (
    <div className="flex items-center justify-between rounded-card border border-border bg-card px-4 py-2.5">
      <span className="text-sm font-medium text-muted-foreground">Filters</span>
      <span className="flex items-center gap-3 text-[11px] text-muted-foreground">
        {actions ?? (
          <>
            {formatDate(filters.from, 'date')} — {formatDate(filters.to, 'date')}
          </>
        )}
      </span>
    </div>
  );
}
