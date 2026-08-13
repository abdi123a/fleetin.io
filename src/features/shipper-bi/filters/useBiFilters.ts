import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router-dom';
import { resolvePreset, type Period } from '@/lib/bi/time';
import {
  BI_FILTER_DIMENSIONS,
  DEFAULT_BI_FILTERS,
  datePresetSchema,
  type BiFilterDimension,
  type BiFilters,
  type DatePreset,
} from '../contracts';

/**
 * Dashboard filter state, stored in the URL.
 *
 * The URL is the state, not a mirror of it. That buys three things a `useState`
 * cannot: a filtered control tower is a link someone can paste into a message,
 * the browser back button steps through the analysis, and a reload does not
 * throw the view away. The cost is serialisation, which is the code below.
 *
 * Params are omitted when they match the default, so the common case stays a
 * clean URL and a shared link carries only what the sender actually changed.
 */

const PARAM = {
  preset: 'p',
  from: 'from',
  to: 'to',
  compare: 'cmp',
  routeIds: 'route',
  transporterIds: 'trp',
  stages: 'stage',
  containerTypes: 'cnt',
  cargoTypes: 'cargo',
  delayOwners: 'owner',
} as const satisfies Record<keyof BiFilters, string>;

function readList(params: URLSearchParams, key: string): string[] {
  const raw = params.get(key);
  return raw ? raw.split(',').filter(Boolean) : [];
}

export interface UseBiFiltersResult {
  filters: BiFilters;
  /** The resolved date window, after applying the preset. */
  period: Period;
  setPreset: (preset: DatePreset) => void;
  setCustomRange: (from: string, to: string) => void;
  toggleCompare: () => void;
  toggleDimension: (dimension: BiFilterDimension, value: string) => void;
  clearDimension: (dimension: BiFilterDimension) => void;
  reset: () => void;
  /** Merge a drill-down's narrowing on top of the current filters. */
  withNarrowing: (narrowing: Partial<BiFilters>) => BiFilters;
  isDefault: boolean;
}

export function useBiFilters(now: Date): UseBiFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  const filters = useMemo<BiFilters>(() => {
    const presetResult = datePresetSchema.safeParse(searchParams.get(PARAM.preset));
    const preset = presetResult.success ? presetResult.data : DEFAULT_BI_FILTERS.preset;

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
      transporterIds: readList(searchParams, PARAM.transporterIds),
      stages: readList(searchParams, PARAM.stages) as BiFilters['stages'],
      containerTypes: readList(searchParams, PARAM.containerTypes) as BiFilters['containerTypes'],
      cargoTypes: readList(searchParams, PARAM.cargoTypes) as BiFilters['cargoTypes'],
      delayOwners: readList(searchParams, PARAM.delayOwners) as BiFilters['delayOwners'],
    };
  }, [searchParams, now]);

  /**
   * Write through a mutator so every update reads the *current* params.
   * Building a new `URLSearchParams` from a captured `filters` would drop any
   * unrelated query the host page owns.
   */
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
        if (preset === DEFAULT_BI_FILTERS.preset) params.delete(PARAM.preset);
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
    (dimension: BiFilterDimension, value: string) => {
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
    (dimension: BiFilterDimension) => {
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
    (narrowing: Partial<BiFilters>): BiFilters => ({ ...filters, ...narrowing }),
    [filters],
  );

  const isDefault =
    filters.preset === DEFAULT_BI_FILTERS.preset &&
    !filters.compare &&
    BI_FILTER_DIMENSIONS.every((dimension) => filters[dimension].length === 0);

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
