/**
 * Empty Container Management — the domain layer.
 *
 * Everything the five views need and nothing they render. The split is the
 * point: the matching engine, the chain arithmetic, the calendar builder and
 * the performance model are all pure functions of a container list and a
 * timestamp, so they are testable on their own and no view can quietly grow a
 * second opinion about how risk works.
 *
 * Import from `@/features/empty-returns`, not from the individual files.
 */

export {
  useAvailableEmpties,
  useCancelCycle,
  useChains,
  useConfirmStandaloneReturn,
  useCreateCycle,
  useCycle,
  useCycles,
  useMarkStandalone,
  useOpenFullLoads,
  usePlanEmptyReturn,
  emptyReturnQueryKeys,
  type PlanEmptyReturnInput,
} from './api/queries';

export {
  cancelCycle,
  confirmStandaloneReturn,
  createCycle,
  planEmptyReturn,
  type CancelledCycle,
  type CreateCyclePayload,
  type EmptyReturnBookingRecord,
  type EmptyReturnChainRecord,
  type EmptyReturnCycleRecord,
} from './api/emptyReturnsService';

export {
  bookingToFullLoadMission,
  chainToCycleChain,
  cycleToRow,
  emptyBookingToRow,
} from './mappers';

export {
  effectivePickup,
  incompatibilityReasons,
  incompatibleLoadsFor,
  isSameLocation,
  marginFor,
  suggestEmptiesFor,
  suggestLoadsFor,
  unclaimedLoads,
} from './matching';

export {
  buildEmptyReturnEvents,
  linesIn,
  sizesIn,
  transportersIn,
  type BuildEventsInput,
} from './events';

export {
  applyPerformanceFilters,
  buildEmptyReturnPerformance,
  AVOIDED_TRIP_DETENTION_DAYS,
  TREND_WEEKS,
  type EmptyReturnPerformance,
  type FailureReason,
  type TrendPoint,
} from './performance';

export { useEmptyContainers, type EmptyContainersModel } from './useEmptyContainers';
export {
  defaultPlannedReturn,
  useEmptyContainerActions,
  type EmptyContainerActions,
} from './useEmptyContainerActions';
