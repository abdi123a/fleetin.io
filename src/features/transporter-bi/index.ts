/**
 * Transporter BI feature — the carrier-side twin of `shipper-bi`.
 *
 * Contracts, deterministic mocks, the fact derivation, the overview
 * aggregation and the URL-backed filter state all live here; the portal pages
 * under `src/pages/transporter-portal` only compose.
 */
export * from './contracts';
export * from './config';
export * from './format';
export * from './derive';
export { aggregateOverview } from './aggregate';
export type { TransporterOverview, TransporterOverviewKpis } from './aggregate';
export { peekTransporterDataset, fetchTransporterOverview } from './api/service';
export { customerInitials, getCustomerLogoUrl } from './mocks/customerProfiles';
export { useTransporterOverview, transporterBiKeys } from './api/queries';
export { useTransporterFilters, type UseTransporterFiltersResult } from './filters/useTransporterFilters';
export { useDetailChannel, type DetailChannel } from './detail/useDetailChannel';
export { MetricTile, type MetricTileProps } from './cards/MetricTile';
export {
  CompanyLabel,
  CompanyMark,
  type CompanyLabelProps,
  type CompanyMarkProps,
} from './cards/CompanyLabel';
