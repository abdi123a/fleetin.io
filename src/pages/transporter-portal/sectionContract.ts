import type { Granularity, Period } from '@/lib/bi/time';
import type {
  DetailRequest,
  TransporterDataset,
  TransporterFilters,
} from '@/features/transporter-bi';
import type { TripFact } from '@/features/transporter-bi';

/**
 * The contract every portal section renders against.
 *
 * The suite computes the expensive things once — fact derivation, dimension
 * filtering, period resolution — and hands each section the same view of the
 * world, so two tabs can never disagree about which trips are in scope.
 */
export interface TransporterSectionProps {
  dataset: TransporterDataset;
  /**
   * Dimension-filtered facts (route/vehicle/driver/customer/status/container/
   * cause applied), NOT period-filtered: sections slice periods themselves via
   * `inPeriod(facts, period)` because stock figures (outstanding invoices,
   * live risk) deliberately ignore the date window.
   */
  facts: TripFact[];
  /** Entirely unfiltered facts, for "whole book" context where needed. */
  allFacts: TripFact[];
  filters: TransporterFilters;
  period: Period;
  /** The window immediately before `period`, of identical length. */
  previousPeriod: Period;
  granularity: Granularity;
  /** Prior-period overlays and deltas beyond the KPI strip render only when true. */
  compare: boolean;
  onOpenDetail: (request: DetailRequest | undefined) => void;
}
