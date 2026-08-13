import type { ContainerType, DelayCause, TripStatus } from './enums';

/**
 * One filter object for the whole portal.
 *
 * Same design as the shipper suite: the scoping sheet lists filters per
 * feature row, but implemented that way the portal becomes twenty independent
 * filter states that disagree with each other. Instead: one object, applied to
 * every section, serialised into the URL so a filtered command center is a
 * link someone can paste.
 *
 * The dimensions differ from the shipper's because the seat differs: the
 * transporter *is* the subject, so the counterpart dimension is the customer,
 * and the vehicle/driver dimensions exist because that is what a fleet
 * dispatcher slices by.
 */

export const DATE_PRESETS = [
  'last_7_days',
  'last_30_days',
  'last_90_days',
  'this_month',
  'last_month',
  'this_quarter',
  'year_to_date',
  'custom',
] as const;
export type DatePreset = (typeof DATE_PRESETS)[number];

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

export function isDatePreset(value: string | null): value is DatePreset {
  return value !== null && (DATE_PRESETS as readonly string[]).includes(value);
}

export interface TransporterFilters {
  preset: DatePreset;
  /** Inclusive `YYYY-MM-DD`, resolved from `preset`. */
  from: string;
  to: string;
  /** When set, KPIs gain deltas and trends gain a prior-period overlay. */
  compare: boolean;

  routeIds: string[];
  vehicleIds: string[];
  driverIds: string[];
  customerIds: string[];
  statuses: TripStatus[];
  containerTypes: ContainerType[];
  delayCauses: DelayCause[];
}

export const DEFAULT_TRANSPORTER_FILTERS: TransporterFilters = {
  preset: 'last_30_days',
  from: '',
  to: '',
  compare: false,
  routeIds: [],
  vehicleIds: [],
  driverIds: [],
  customerIds: [],
  statuses: [],
  containerTypes: [],
  delayCauses: [],
};

/** Dimensions the user can narrow by, for the filter bar and the chip row. */
export const TP_FILTER_DIMENSIONS = [
  'routeIds',
  'vehicleIds',
  'driverIds',
  'customerIds',
  'statuses',
  'containerTypes',
  'delayCauses',
] as const;

export type TransporterFilterDimension = (typeof TP_FILTER_DIMENSIONS)[number];

export const TP_FILTER_DIMENSION_LABELS: Record<TransporterFilterDimension, string> = {
  routeIds: 'Route',
  vehicleIds: 'Truck',
  driverIds: 'Driver',
  customerIds: 'Customer',
  statuses: 'Status',
  containerTypes: 'Container',
  delayCauses: 'Delay cause',
};

/** How many dimensions are actually narrowing the view right now. */
export function countActiveFilters(filters: TransporterFilters): number {
  return TP_FILTER_DIMENSIONS.reduce(
    (total, dimension) => total + (filters[dimension].length > 0 ? 1 : 0),
    0,
  );
}
