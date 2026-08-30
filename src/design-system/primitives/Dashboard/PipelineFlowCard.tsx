import type { StatusIntent } from '@/design-system/primitives/Layout/statusIntent';
import { AlertTriangle, ChevronRight, Timer } from 'lucide-react';
import { pipelineStages as defaultPipelineStages } from '@/data/dashboardData';
import { Skeleton } from './DashboardSkeleton';

const rampFills = [
  'bg-primary/30',
  'bg-primary/45',
  'bg-primary/60',
  'bg-primary/75',
  'bg-primary/90',
  'bg-primary',
];

export interface PipelineBookingItem {
  id: string;
  bookingNumber: string;
  driverName?: string;
  driverPhone?: string;
  driverVerified?: boolean;
  vehicleNumber?: string;
  vehicleType?: string;
  vehicleVerified?: boolean;
  status: string;
  statusIntent?: StatusIntent;
  step?: string;
  startDate?: string;
  endDate?: string;
  /** Where this booking's own container sits on its way back — undefined until delivered. Never sourced from `status`; a booking's real status doesn't carry this. */
  emptyReturnStage?: 'waiting_match' | 'matched' | 'returned' | 'standalone';
}

export interface PipelineFlowCardProps<T extends PipelineBookingItem = PipelineBookingItem> {
  ready?: boolean;
  bookings?: T[];
  onBookingClick?: (booking: T) => void;
  /** Whether the shipment's transporter payout has been released — one flag for the whole card, since money moves per shipment, never per booking. */
  payoutReleased?: boolean;
}

const STAGE_NAMES = [
  'Dispatched',
  'Port Entry',
  'Free Zone Delivered',
  'Pending Empty Return',
  'Empty Returned',
  'Payment Released',
];

/** The real booking ladder's own delivery sub-steps — everything through here is still "in transit", not yet a question of empty return. */
const REAL_DELIVERY_STAGE: Record<string, number> = {
  Pending: 0,
  Assigned: 0,
  'Driver Assigned': 1,
  'Heading to Pickup': 1,
  'At Pickup': 1,
  Loading: 1,
  Loaded: 1,
  'En Route': 1,
  Arrived: 2,
  Unloading: 2,
  'POD Submitted': 2,
  'Empty Ready': 2,
};

export function getStageIndex(
  booking?: Pick<PipelineBookingItem, 'status' | 'emptyReturnStage'>,
  payoutReleased?: boolean,
): number {
  const status = booking?.status;

  // The real ladder: 0-2 are pure delivery progress, keyed off the exact
  // status word. "Completed" is the one status whose stage depends on
  // Empty Return instead — a booking never advances past it on its own.
  if (status && status in REAL_DELIVERY_STAGE) return REAL_DELIVERY_STAGE[status] ?? 0;
  if (status === 'Completed') {
    if (booking?.emptyReturnStage === 'returned') return payoutReleased ? 5 : 4;
    return 3; // not yet returned — unmatched, matched-in-progress, or standalone-unconfirmed all read as "pending" here
  }

  // Anything else (a legacy/demo label vocabulary, e.g. the showcase's own
  // mock bookings) falls back to the original keyword match.
  const s = (status || '').toLowerCase();
  if (s.includes('payment') || s.includes('paid')) return 5;
  if (s.includes('empty returned') || s.includes('trip completed') || s.includes('returned')) return 4;
  if (s.includes('pending empty') || s.includes('waiting return')) return 3;
  if (s.includes('free zone') || s.includes('arrived') || s.includes('delivered')) return 2;
  if (s.includes('port') || s.includes('transit')) return 1;
  if (s.includes('dispatch') || s.includes('assign')) return 0;
  return 0;
}

export function PipelineFlowCard<T extends PipelineBookingItem = PipelineBookingItem>({
  ready = true,
  bookings,
  payoutReleased,
}: PipelineFlowCardProps<T>) {
  const isDynamic = Boolean(bookings && bookings.length >= 0);

  // Calculate cumulative sequential pipeline stages (each stage includes all bookings that reached or passed it)
  const dynamicStages = STAGE_NAMES.map((stageName, stageIdx) => {
    const passedBookings = (bookings || []).filter((b) => getStageIndex(b, payoutReleased) >= stageIdx);
    const activeBookings = (bookings || []).filter((b) => getStageIndex(b, payoutReleased) === stageIdx);

    return {
      stage: stageName,
      stageIdx,
      count: passedBookings.length,
      activeCount: activeBookings.length,
      passedBookings,
      activeBookings,
      /* Unknown, and left that way. This used to read `47` for Pending Empty
       * Return and `12` for every other stage — the same two numbers on every
       * shipment in the system, printed as "12h avg dwell" beside real counts
       * where they were indistinguishable from a measurement. The per-stage
       * dwell of one shipment's containers is a real figure, but it lives in
       * the booking timelines, which this card is not given. */
      avgHours: undefined as number | undefined,
    };
  });

  const stagesToRender = isDynamic
    ? dynamicStages
    : defaultPipelineStages.map((s, idx) => ({
        stage: STAGE_NAMES[idx] || s.stage,
        stageIdx: idx,
        count: s.count,
        activeCount: s.count,
        passedBookings: [] as T[],
        activeBookings: [] as T[],
        avgHours: s.avgHours,
      }));

  const totalCount = isDynamic
    ? (bookings || []).length
    : stagesToRender.reduce((sum, s) => sum + s.count, 0);

  const timedStages = stagesToRender.filter(
    (stage): stage is typeof stage & { avgHours: number } => typeof stage.avgHours === 'number',
  );
  const maxHours = timedStages.length > 0 ? Math.max(...timedStages.map((s) => s.avgHours)) : 0;
  const slowest =
    timedStages.length > 0
      ? timedStages.reduce((a, b) => (b.avgHours > a.avgHours ? b : a))
      : null;

  return (
    <section className="rounded-lg border border-border bg-card p-4 shadow-xs sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="type-h3 text-foreground">Shipment Pipeline</h2>
          <p className="mt-0.5 type-body-xs text-muted-foreground">
            {isDynamic ? (
              <span>Cumulative Progress Lifecycle • {totalCount} total bookings in shipment</span>
            ) : (
              <span>Booking lifecycle · {totalCount.toLocaleString()} in flight</span>
            )}
          </p>
        </div>
        {slowest && (
          <div className="flex items-center gap-1.5 rounded-md bg-warning-subtle px-2 py-1 type-caption font-medium text-warning-subtle-foreground">
            <Timer className="h-3.5 w-3.5 text-warning-active" strokeWidth={2} />
            {slowest.stage} is the slowest stage — {slowest.avgHours}h avg
          </div>
        )}
      </div>

      {/* Progress Bar — each segment width = % of bookings that passed through that stage */}
      <div className="mt-4 flex h-2.5 gap-px overflow-hidden rounded-full bg-muted/40">
        {stagesToRender.map((stage, i) => {
          // Each segment represents the ADDITIONAL bookings that reached exactly this stage
          // (i.e. passed[i] - passed[i+1]) to form a funnel waterfall visual
          const nextCount = i < stagesToRender.length - 1 ? (stagesToRender[i + 1]?.count ?? 0) : 0;
          const stageOnlyCount = stage.count - nextCount;
          const widthPct = totalCount > 0
            ? isDynamic
              ? Math.max((stageOnlyCount / totalCount) * 100, stage.count > 0 ? 2 : 0)
              : 16.66
            : 16.66;

          return ready ? (
            <div
              key={stage.stage}
              className={`animate-grow-x h-full ${rampFills[i]} ${i === 0 ? 'rounded-l-full' : ''} ${
                i === stagesToRender.length - 1 ? 'rounded-r-full' : ''
              }`}
              style={{
                width: `${widthPct}%`,
                ['--d' as string]: `${i * 80}ms`,
              }}
              title={`${stage.stage}: ${stage.count} bookings passed through (${totalCount > 0 ? ((stage.count / totalCount) * 100).toFixed(0) : 0}%)`}
            />
          ) : (
            <Skeleton
              key={stage.stage}
              className="h-full rounded-none"
              style={{ width: `${widthPct}%` }}
            />
          );
        })}
      </div>

      {/* 6 Stage Cards Grid */}
      <div className="mt-4 grid grid-cols-2 gap-2.5 sm:grid-cols-3 xl:grid-cols-6 xl:gap-2">
        {stagesToRender.map((stage, i) => {
          const pct = totalCount > 0 ? (stage.count / totalCount) * 100 : 0;
          const isSlowest = slowest !== null && stage.stage === slowest.stage;
          const isLast = i === stagesToRender.length - 1;

          return (
            <div key={stage.stage} className="relative flex flex-col">
              {!isLast && (
                <ChevronRight
                  className="absolute -right-[7px] top-1/2 z-10 hidden h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground/40 xl:block"
                  strokeWidth={2.5}
                />
              )}

              <div
                className={`h-full flex flex-col justify-between rounded-md border bg-card p-3 transition-all duration-200 hover:-translate-y-0.5 hover:shadow-card ${
                  isSlowest
                    ? 'border-warning/40 bg-warning-subtle/30'
                    : 'border-border hover:border-border-strong'
                }`}
              >
                <div>
                  {/* Stage Header */}
                  <div className="flex items-start gap-1.5 min-h-[32px]">
                    <span className={`mt-[5px] h-1.5 w-1.5 shrink-0 rounded-full ${rampFills[i]}`} />
                    <span className="type-caption text-foreground leading-tight">
                      {stage.stage}
                    </span>
                    {isSlowest && (
                      <AlertTriangle
                        className="ml-auto mt-[3px] h-3 w-3 shrink-0 text-warning-active"
                        strokeWidth={2.5}
                      />
                    )}
                  </div>

                  {ready ? (
                    <div className="mt-1">
                      <div className="flex items-baseline justify-between">
                        <span className="type-h2 tabular-nums text-foreground font-extrabold">
                          {stage.count}
                        </span>
                        <span className="type-caption tabular-nums text-muted-foreground">
                          {pct.toFixed(0)}%
                        </span>
                      </div>
                    </div>
                  ) : (
                    <div className="mt-2 space-y-1.5">
                      <Skeleton className="h-4 w-10" />
                      <Skeleton className="h-2 w-16" />
                    </div>
                  )}
                </div>

                {/* Stage Footer Bar — only where a dwell was actually measured. */}
                {typeof stage.avgHours === 'number' && (
                  <div className="mt-3 border-t border-border pt-2">
                    <div className="h-1 overflow-hidden rounded-full bg-muted">
                      {ready && (
                        <div
                          className={`animate-grow-x h-full rounded-full ${
                            isSlowest ? 'bg-warning' : 'bg-primary'
                          }`}
                          style={{
                            width: `${maxHours > 0 ? (stage.avgHours / maxHours) * 100 : 0}%`,
                            ['--d' as string]: `${250 + i * 80}ms`,
                          }}
                        />
                      )}
                    </div>
                    <div
                      className={`mt-1.5 type-caption tabular-nums font-medium ${
                        isSlowest ? 'text-warning-subtle-foreground' : 'text-muted-foreground'
                      }`}
                    >
                      {stage.avgHours}h avg dwell
                    </div>
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
