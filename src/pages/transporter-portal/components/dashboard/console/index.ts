/**
 * The transporter console — the landing screen of the transporter portal.
 *
 * Reading order, top to bottom: what needs action today, the four operating
 * numbers, the analysis behind them (what you haul, what each move earns,
 * where the hours and the money leak), then the work itself — loads to accept,
 * containers on the clock, jobs in progress.
 */

export { ConsoleHeader, type ConsoleHeaderProps } from './ConsoleHeader';
export { KpiTiles, type KpiTilesProps } from './KpiTiles';
export { RateVsNetworkCard } from './RateVsNetworkCard';
export { EmptyLegsCard } from './EmptyLegsCard';
export { MoveAnalyticsCard } from './MoveAnalyticsCard';
export { DelayOwnershipCard } from './DelayOwnershipCard';
export { WhatYouHaulCard } from './WhatYouHaulCard';
export { OfferToPaymentCard } from './OfferToPaymentCard';
export { MoneyFlowCard } from './MoneyFlowCard';
export { PayingJobsCard } from './PayingJobsCard';
export { FleetWeekCard } from './FleetWeekCard';
export { WaitingByLocationCard } from './WaitingByLocationCard';
export { BusyHeatmapCard } from './BusyHeatmapCard';
export { EarningsPerMoveCard } from './EarningsPerMoveCard';
export { AvailableLoadsCard } from './AvailableLoadsCard';
export { DetentionStatusCard } from './DetentionStatusCard';
export { PaymentsCard } from './PaymentsCard';
export { NetworkComparisonCard } from './NetworkComparisonCard';
export { JobsInProgressCard } from './JobsInProgressCard';

export { buildConsoleModel, type ConsoleModel } from './model';
export { buildRateTabs, type RateTab } from './rateSeries';
export * from './kit';
export * from './money';
