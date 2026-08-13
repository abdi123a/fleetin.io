import type { TransporterFilters } from './filters';

/**
 * Where clicking any mark in the portal takes you.
 *
 * The shipper suite's `DrillDown` carries only a filter narrowing; the
 * transporter portal needs more shapes because the scope demands entity
 * detail — a driver, a vehicle, a route, a backhaul opportunity — not just
 * "the trips behind this figure". One discriminated union, one sheet, so
 * every clickable mark in every section speaks the same language.
 *
 * Carried *with* the data wherever an aggregation produces it: the code that
 * computed a number is the only code that knows exactly which records made it.
 */
export type DetailRequest =
  | {
      kind: 'trips';
      title: string;
      /** One clause under the title — what this list is. */
      description?: string;
      /** Narrowing applied on top of the current filters, not replacing them. */
      narrow?: Partial<TransporterFilters>;
      /** Explicit ids when the selection is not expressible as a filter. */
      tripIds?: string[];
      /** Include trips outside the current period (for stock-style figures). */
      ignorePeriod?: boolean;
    }
  | { kind: 'trip'; tripId: string; focus?: 'payment' | 'delay' | 'backhaul' }
  | { kind: 'driver'; driverId: string }
  | { kind: 'vehicle'; vehicleId: string }
  | { kind: 'route'; routeId: string }
  | { kind: 'opportunity'; opportunityId: string };
