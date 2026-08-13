import { z } from 'zod';
import {
  cargoTypeSchema,
  containerTypeSchema,
  delayOwnerSchema,
  stageKeySchema,
} from './enums';
import { isoDate } from './entities';

/**
 * One filter object for the whole dashboard.
 *
 * The scoping sheet lists filters per feature row — date here, routes there,
 * status somewhere else. Implemented that way the panel becomes twenty-one
 * independent filter states that disagree with each other, and no view can be
 * shared. Instead: one object, applied to every section, serialised into the
 * URL so a filtered control tower is a link.
 */

export const datePresetSchema = z.enum([
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_month',
  'last_month',
  'this_quarter',
  'year_to_date',
  'custom',
]);
export type DatePreset = z.infer<typeof datePresetSchema>;

export const DATE_PRESET_LABELS: Record<DatePreset, string> = {
  last_7_days: 'Last 7 days',
  last_30_days: 'Last 30 days',
  last_90_days: 'Last 90 days',
  this_month: 'This month',
  last_month: 'Last month',
  this_quarter: 'This quarter',
  year_to_date: 'Year to date',
  custom: 'Custom',
};

export const biFiltersSchema = z.object({
  preset: datePresetSchema,
  /** Inclusive, in the shipper's local calendar. Resolved from `preset`. */
  from: isoDate,
  to: isoDate,

  /**
   * When set, every trend gains a dashed prior-period overlay and every KPI
   * gains a delta. Resolved by `shiftPeriod` rather than stored, so changing
   * the main range keeps the comparison honest (equal length, immediately
   * preceding) instead of leaving a stale window behind.
   */
  compare: z.boolean(),

  routeIds: z.array(z.string()),
  transporterIds: z.array(z.string()),
  stages: z.array(stageKeySchema),
  containerTypes: z.array(containerTypeSchema),
  cargoTypes: z.array(cargoTypeSchema),
  delayOwners: z.array(delayOwnerSchema),
});
export type BiFilters = z.infer<typeof biFiltersSchema>;

export const DEFAULT_BI_FILTERS: BiFilters = {
  preset: 'last_30_days',
  from: '',
  to: '',
  compare: false,
  routeIds: [],
  transporterIds: [],
  stages: [],
  containerTypes: [],
  cargoTypes: [],
  delayOwners: [],
};

/** Dimensions the user can narrow by, for the filter bar and the chip row. */
export const BI_FILTER_DIMENSIONS = [
  'routeIds',
  'transporterIds',
  'stages',
  'containerTypes',
  'cargoTypes',
  'delayOwners',
] as const;

export type BiFilterDimension = (typeof BI_FILTER_DIMENSIONS)[number];

export const BI_FILTER_DIMENSION_LABELS: Record<BiFilterDimension, string> = {
  routeIds: 'Route',
  transporterIds: 'Transporter',
  stages: 'Stage',
  containerTypes: 'Container',
  cargoTypes: 'Cargo',
  delayOwners: 'Delay owner',
};

/** How many dimensions are actually narrowing the view right now. */
export function countActiveFilters(filters: BiFilters): number {
  return BI_FILTER_DIMENSIONS.reduce(
    (total, dimension) => total + (filters[dimension].length > 0 ? 1 : 0),
    0,
  );
}
