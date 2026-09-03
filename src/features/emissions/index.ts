/**
 * Emissions — the carbon layer.
 *
 * A vehicle carries a computed factor, a booking snapshots the factor it ran
 * under, a shipment is the sum of its bookings, and the dashboard reads the
 * lot. Everything a screen needs to draw one of those is exported here.
 */
export { Co2CardStrip, Co2Figure, Co2Inline, type Co2FigureProps } from './components/Co2Figure';
export { Co2FactorField, type Co2FactorFieldProps } from './components/Co2FactorField';
export { Co2Kpi, type Co2KpiProps } from './components/Co2Kpi';
export { VehiclePhotoField, type VehiclePhotoFieldProps } from './components/VehiclePhotoField';
export {
  clearCycleImpactDecision,
  decideCycleImpact,
  fetchBookingRoute,
  fetchEmissionsDashboard,
  fetchEmissionsFilterOptions,
  fetchShipmentImpact,
  rebuildBookingRoute,
  rebuildImpact,
  replaceBookingRoute,
  type BookingRoute,
  type CycleImpact,
  type EmissionsDashboard,
  type EmissionsFilterOptions,
  type EmissionsFilters,
  type EmissionsKpis,
  type EmissionsPoint,
  type EmissionsScatterPoint,
  type EmissionsSlice,
  type ImpactPlace,
  type ImpactSeriesPoint,
  type ImpactStatus,
  type ImpactSummary,
  type RouteLeg,
  type ShipmentImpact,
} from './api/emissionsService';
export {
  emissionsQueryKeys,
  useBookingRoute,
  useClearCycleImpact,
  useDecideCycleImpact,
  useEmissionsDashboard,
  useEmissionsFilterOptions,
  useRebuildBookingRoute,
  useRebuildImpact,
  useReplaceBookingRoute,
  useShipmentImpact,
} from './api/queries';
export {
  ContinuationLine,
  FleetinImpactBlock,
  IMPACT_STATUS_META,
  ImpactStatusBadge,
} from './components/FleetinImpact';
