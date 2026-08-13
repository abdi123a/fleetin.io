import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resolvePreset, type Period } from '@/lib/bi/time';
import {
  DEFAULT_TRANSPORTER_FILTERS,
  TP_FILTER_DIMENSIONS,
  isDatePreset,
  type DatePreset,
  type TransporterFilterDimension,
  type TransporterFilters,
} from '../contracts';

/**
 * Portal filter state, stored in the URL.
 *
 * Identical design to the shipper suite's `useBiFilters`: the URL *is* the
 * state, so a filtered command center is a pasteable link, back steps through
 * the analysis, and reload keeps the view. Params matching defaults are
 * omitted so links stay clean, and every write goes through a mutator so the
 * host page's own params (like `?tab=`) survive.
 */

const PARAM = {
  preset: 'p',
  from: 'from',
  to: 'to',
  compare: 'cmp',
  routeIds: 'route',
  vehicleIds: 'veh',
  driverIds: 'drv',
  customerIds: 'cust',
  statuses: 'st',
  containerTypes: 'cnt',
  delayCauses: 'cause',
} as const satisfies Record<keyof TransporterFilters, string>;

function readList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  return raw ? raw.split(',').filter(Boolean) : [];
}

export interface UseTransporterFiltersResult {
  filters: TransporterFilters;
  /** The resolved date window, after applying the preset. */
  period: Period;
  setPreset: (preset: DatePreset) => void;
  setCustomRange: (from: string, to: string) => void;
  toggleCompare: () => void;
  toggleDimension: (dimension: TransporterFilterDimension, value: string) => void;
  clearDimension: (dimension: TransporterFilterDimension) => void;
  reset: () => void;
  /** Merge a detail request's narrowing on top of the current filters. */
  withNarrowing: (narrowing: Partial<TransporterFilters>) => TransporterFilters;
  isDefault: boolean;
}

export function useTransporterFilters(now: Date): UseTransporterFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<TransporterFilters>(() => {
    const rawPreset = searchParams.get(PARAM.preset);
    const preset = isDatePreset(rawPreset) ? rawPreset : DEFAULT_TRANSPORTER_FILTERS.preset;

    const customFrom = searchParams.get(PARAM.from);
    const customTo = searchParams.get(PARAM.to);
    const custom =
      preset === 'custom' && customFrom && customTo
        ? { from: customFrom, to: customTo }
        : undefined;

    const { from, to } = resolvePreset(preset, now, custom);

    return {
      preset,
      from,
      to,
      compare: searchParams.get(PARAM.compare) === '1',
      routeIds: readList(searchParams, PARAM.routeIds),
      vehicleIds: readList(searchParams, PARAM.vehicleIds),
      driverIds: readList(searchParams, PARAM.driverIds),
      customerIds: readList(searchParams, PARAM.customerIds),
      statuses: readList(searchParams, PARAM.statuses) as TransporterFilters['statuses'],
      containerTypes: readList(
        searchParams,
        PARAM.containerTypes,
      ) as TransporterFilters['containerTypes'],
      delayCauses: readList(searchParams, PARAM.delayCauses) as TransporterFilters['delayCauses'],
    };
  }, [searchParams, now]);

  /** Mutate the current params so unrelated host-page params survive. */
  const update = useCallback(
    (mutate: (params: URLSearchParams) => void) => {
      setSearchParams(
        (current) => {
          const next = new URLSearchParams(current);
          mutate(next);
          return next;
        },
        { replace: true },
      );
    },
    [setSearchParams],
  );

  const setPreset = useCallback(
    (preset: DatePreset) => {
      update((params) => {
        if (preset === DEFAULT_TRANSPORTER_FILTERS.preset) params.delete(PARAM.preset);
        else params.set(PARAM.preset, preset);
        if (preset !== 'custom') {
          params.delete(PARAM.from);
          params.delete(PARAM.to);
        }
      });
    },
    [update],
  );

  const setCustomRange = useCallback(
    (from: string, to: string) => {
      update((params) => {
        params.set(PARAM.preset, 'custom');
        params.set(PARAM.from, from);
        params.set(PARAM.to, to);
      });
    },
    [update],
  );

  const toggleCompare = useCallback(() => {
    update((params) => {
      if (params.get(PARAM.compare) === '1') params.delete(PARAM.compare);
      else params.set(PARAM.compare, '1');
    });
  }, [update]);

  const toggleDimension = useCallback(
    (dimension: TransporterFilterDimension, value: string) => {
      update((params) => {
        const key = PARAM[dimension];
        const current = readList(params, key);
        const next = current.includes(value)
          ? current.filter((item) => item !== value)
          : [...current, value];
        if (next.length === 0) params.delete(key);
        else params.set(key, next.join(','));
      });
    },
    [update],
  );

  const clearDimension = useCallback(
    (dimension: TransporterFilterDimension) => {
      update((params) => params.delete(PARAM[dimension]));
    },
    [update],
  );

  const reset = useCallback(() => {
    update((params) => {
      for (const key of Object.values(PARAM)) params.delete(key);
    });
  }, [update]);

  const withNarrowing = useCallback(
    (narrowing: Partial<TransporterFilters>): TransporterFilters => ({
      ...filters,
      ...narrowing,
    }),
    [filters],
  );

  const isDefault =
    filters.preset === DEFAULT_TRANSPORTER_FILTERS.preset &&
    !filters.compare &&
    TP_FILTER_DIMENSIONS.every((dimension) => filters[dimension].length === 0);

  return {
    filters,
    period: { from: filters.from, to: filters.to },
    setPreset,
    setCustomRange,
    toggleCompare,
    toggleDimension,
    clearDimension,
    reset,
    withNarrowing,
    isDefault,
  };
}
