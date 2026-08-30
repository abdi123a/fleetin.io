import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import {
  AlertTriangle,
  ArrowRight,
  Banknote,
  CheckCircle2,
  Clock,
  ContainerIcon,
  ListChecks,
  Truck,
} from '@/design-system/icons';
import { ShipmentCard, StatisticCard, type ShipmentCardProps } from '@/design-system';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { baseChartOptions, buildTooltipHtml, donutOptions } from '@/features/shipper-bi/charts/apexChartTheme';
import { intentColor, MARK, stepColor } from '@/features/shipper-bi/charts/chartTheme';
import { cn } from '@/utils';
import { toDateOnly } from '@/utils/format';
import type { MissionReport } from './missionReport';
import type { MonthlyReport, MonthlyWeeklyRollup } from './monthlyReport';
import { formatDuration, HOUR } from './reportFormat';
import {
  ProportionBarList,
  ReportAlertPill,
  ReportCallout,
  ReportCard,
  ReportEmpty,
  ReportEyebrow,
  ReportStat,
  ReportStatusBadge,
  STAGE_VISUAL,
  TimeRibbon,
  type RibbonSegment,
} from './reportKit';

/**
 * The month, reported.
 *
 * Five headline tiles, then five pictures with exact figures attached: where
 * the time went, what the container cycle looks like, what one more bad day
 * would cost, which missions closed and how, and how the weeks compare. The
 * same idiom the mission report is typeset in — composition over counting —
 * scaled up to a month.
 */

export interface MonthlyReportViewProps {
  report: MonthlyReport;
  currency: string;
  /** Opens a mission's own report — a shipment card and the detention table are both bridges to it. */
  onOpenMission?: (report: MissionReport) => void;
  /** Optional escape hatch to the account's full shipment list. */
  onViewAllShipments?: () => void;
  className?: string;
}

export function MonthlyReportView({
  report,
  currency,
  onOpenMission,
  onViewAllShipments,
  className,
}: MonthlyReportViewProps) {
  const { missions, containers, detention, stages, weeklyRollup, recommendations } = report;
  const longestStage = stages.find((stage) => stage.isLongest) ?? null;
  const completedMissions = useMemo(
    () => report.reports.filter((r) => r.isClosed && !r.overview.isTerminated),
    [report.reports],
  );
  const inProgressMissions = useMemo(
    () => report.reports.filter((r) => !r.isClosed && !r.overview.isTerminated),
    [report.reports],
  );
  const slowestStrip = useMemo(() => slowestDepotageMission(completedMissions), [completedMissions]);

  const stageSegments = useMemo<RibbonSegment[]>(() => {
    const totalMs = stages.reduce((sum, stage) => sum + stage.avgMs, 0);
    if (totalMs === 0) return [];
    return stages.map((stage) => {
      const visual = STAGE_VISUAL[stage.key] ?? { tone: 'active' as const, step: 1 as const };
      return {
        key: stage.key,
        label: stage.label,
        share: (stage.avgMs / totalMs) * 100,
        value: formatDuration(stage.avgMs, { compact: true }),
        tone: visual.tone,
        step: visual.step,
        isLongest: stage.isLongest,
      };
    });
  }, [stages]);
  const totalCycleMs = stages.reduce((sum, stage) => sum + stage.avgMs, 0);

  /* The average-mission-time tile's own trend: first vs. last week that closed
   * a mission this month — the only week-over-week comparison the KPI row
   * makes, and the same figure the recommendation engine checks for an anomaly. */
  const missionTimeTrend = useMemo(() => {
    const dataWeeks = weeklyRollup.filter((w) => w.avgMissionMs !== null);
    const first = dataWeeks[0];
    const last = dataWeeks[dataWeeks.length - 1];
    if (!first || !last || first === last || first.avgMissionMs === null || last.avgMissionMs === null) {
      return null;
    }
    const deltaHours = Math.round((last.avgMissionMs - first.avgMissionMs) / HOUR);
    return { deltaHours, firstKey: first.key, lastKey: last.key };
  }, [weeklyRollup]);

  /* The one week the recommendation engine flagged, if any — reused so the
   * chart highlights the same week the "check why it slowed" card names. */
  const anomalyWeekKey = useMemo(() => {
    const match = recommendations.find((r) => r.title.startsWith('Check why'));
    if (!match) return null;
    const week = weeklyRollup.find((w) => match.title.includes(w.key));
    return week?.key ?? null;
  }, [recommendations, weeklyRollup]);

  return (
    <div className={cn('grid gap-3', className)}>
      {/* ── 1. Executive KPI tiles ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <StatisticCard
          variant="teal"
          icon={<Truck />}
          value={missions.total}
          title="Total missions"
          subtitle={`${missions.completed} closed · ${missions.inProgress} still running`}
        />
        <StatisticCard
          variant="blue"
          icon={<CheckCircle2 />}
          value={missions.completed > 0 ? `${missions.onTimePct}%` : '—'}
          title="On-time rate"
          subtitle={
            missions.completed > 0
              ? `${missions.onTime} of ${missions.completed} inside window`
              : 'no completed mission yet'
          }
        />
        <StatisticCard
          variant="peach"
          icon={<Clock />}
          value={formatDuration(missions.avgMissionMs, { compact: true })}
          title="Avg mission time"
          trend={missionTimeTrend ? (missionTimeTrend.deltaHours >= 0 ? 'up' : 'down') : undefined}
          percentage={
            missionTimeTrend ? `${Math.abs(missionTimeTrend.deltaHours)}h` : undefined
          }
          subtitle={
            missionTimeTrend
              ? `${missionTimeTrend.firstKey} → ${missionTimeTrend.lastKey}`
              : 'assigned → empty back'
          }
        />
        <StatisticCard
          variant="amber"
          icon={<AlertTriangle />}
          value={formatDuration(containers.avgDepotageMs, { compact: true })}
          title="Dépotage"
          subtitle={
            totalCycleMs > 0 && containers.avgDepotageMs
              ? `${Math.round((containers.avgDepotageMs / totalCycleMs) * 100)}% of the cycle`
              : 'not measured yet'
          }
        />
        <StatisticCard
          variant="pink"
          icon={<Banknote />}
          value={`${detention.fees.toLocaleString()} ${currency}`}
          title="Detention fees"
          subtitle={`${detention.cases} case${detention.cases === 1 ? '' : 's'} past free time`}
        />
      </div>

      {/* ── 2. Time by Operational Stage ──────────────────────────────── */}
      <ReportCard
        icon={Clock}
        title="Time by Operational Stage"
        subtitle={`Average per stage across the month · full cycle ${formatDuration(totalCycleMs, { compact: true })} from pickup to empty return`}
      >
        {longestStage && (
          <ReportAlertPill icon={AlertTriangle}>
            {longestStage.label} is the bottleneck
          </ReportAlertPill>
        )}
        {stageSegments.length === 0 ? (
          <ReportEmpty>No stage was measured this month.</ReportEmpty>
        ) : (
          <>
            <TimeRibbon segments={stageSegments} />
            {longestStage && (
              <p className="text-[11.5px] text-muted-foreground">
                <b className="text-accent">{longestStage.label}</b> is the month's main bottleneck at{' '}
                {formatDuration(longestStage.avgMs, { compact: true })} on average across{' '}
                {longestStage.samples} mission{longestStage.samples === 1 ? '' : 's'}.
              </p>
            )}
          </>
        )}
      </ReportCard>

      {/* ── 3. Container Cycle + Detention Exposure ───────────────────── */}
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <ReportCard
          icon={ContainerIcon}
          title="Container Cycle"
          subtitle={`${containers.total} containerized mission${containers.total === 1 ? '' : 's'} — delivery is not the end of the cycle`}
        >
          {containers.total === 0 ? (
            <ReportEmpty>No containerized mission ran this month.</ReportEmpty>
          ) : (
            <>
              <div className="flex flex-wrap items-center gap-6">
                <ContainerCycleDonut returned={containers.returned} total={containers.total} />
                <div className="grid flex-1 grid-cols-3 gap-3">
                  <ReportStat label="Delivered" value={containers.delivered} caption="at destination" />
                  <ReportStat
                    label="Empties ready"
                    value={containers.emptyReady}
                    caption={formatDuration(containers.avgDepotageMs, { compact: true })}
                  />
                  <ReportStat
                    label="Empties returned"
                    value={containers.returned}
                    caption={formatDuration(containers.avgReturnLegMs, { compact: true })}
                  />
                </div>
              </div>
              <p className="text-[11.5px] text-muted-foreground">
                <b className="text-foreground">
                  {containers.onTimeReturns} of {containers.returned}
                </b>{' '}
                on time · {containers.total - containers.delivered} box
                {containers.total - containers.delivered === 1 ? '' : 'es'} still in the cycle
              </p>
            </>
          )}
        </ReportCard>

        <ReportCard
          icon={detention.cases > 0 ? AlertTriangle : Banknote}
          tint={detention.cases > 0 ? 'red' : undefined}
          title="Detention Exposure"
          subtitle={`Billed at ${detention.ratePerDay} ${currency} per container-day past free time`}
          right={<ReportStatusBadge status={detention.cases === 0 ? 'ontime' : 'delayed'} />}
        >
          <div className="grid grid-cols-3 gap-3">
            <ReportStat
              label="Cases"
              value={detention.cases}
              tone={detention.cases > 0 ? 'bad' : 'neutral'}
            />
            <ReportStat label="Days" value={detention.days} tone={detention.days > 0 ? 'bad' : 'neutral'} />
            <ReportStat
              label="Late returns"
              value={containers.lateReturns}
              tone={containers.lateReturns > 0 ? 'bad' : 'neutral'}
            />
          </div>

          {containers.returned > 0 && (
            <ReportCallout
              value={`${detention.oneMoreDayCost.toLocaleString()} ${currency}`}
              caption={`what one extra dépotage day would cost, at this month's ${containers.returned} container${containers.returned === 1 ? '' : 's'}`}
            />
          )}

          <p className="text-[11.5px] text-muted-foreground">
            {detention.cases === 0 ? (
              containers.avgReturnLegMs !== null ? (
                <>
                  Nothing was billed this month. The{' '}
                  <b className="text-foreground">
                    {formatDuration(containers.avgReturnLegMs, { compact: true })}
                  </b>{' '}
                  return buffer is what absorbed the long strips — it is the margin protecting the zero.
                </>
              ) : (
                'No container crossed its return deadline this month — no detention was incurred.'
              )
            ) : (
              <>
                <b className="text-destructive">
                  {detention.fees.toLocaleString()} {currency}
                </b>{' '}
                billed across {detention.cases} case{detention.cases === 1 ? '' : 's'}, averaging{' '}
                {detention.avgDaysPerCase !== null ? detention.avgDaysPerCase.toFixed(1) : '—'} day
                {detention.avgDaysPerCase === 1 ? '' : 's'} each.
              </>
            )}
          </p>

          {detention.responsibility.length > 0 && (
            <>
              <ReportEyebrow>Responsibility — share of the month's detention days</ReportEyebrow>
              <ProportionBarList
                rows={detention.responsibility.map((row) => ({
                  key: row.party,
                  label: row.label,
                  value: row.pct,
                  displayValue: `${row.pct}%`,
                  accented: row.pct >= 50,
                }))}
              />
            </>
          )}
        </ReportCard>
      </div>

      {/* ── 4. Shipments Closed This Month ─────────────────────────────── */}
      <ReportCard
        icon={ListChecks}
        title="Shipments Closed This Month"
        subtitle={`${completedMissions.length} shipment${completedMissions.length === 1 ? '' : 's'} · every closed mission, dispatch to empty return`}
        right={
          onViewAllShipments ? (
            <button
              type="button"
              onClick={onViewAllShipments}
              className="flex cursor-pointer items-center gap-1 text-[12.5px] font-semibold text-primary hover:underline print:hidden"
            >
              View all shipments <ArrowRight className="size-3.5" />
            </button>
          ) : undefined
        }
      >
        {completedMissions.length === 0 ? (
          <ReportEmpty>No mission closed this month yet.</ReportEmpty>
        ) : (
          <>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {completedMissions.map((mission) => (
                <ShipmentCard
                  key={mission.bookingId}
                  density="compact"
                  {...missionToShipmentCardProps(mission, mission === slowestStrip, onOpenMission)}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg bg-muted/50 px-4 py-3">
              <span className="text-[12px] font-semibold uppercase tracking-[0.06em] text-muted-foreground">
                Average · {completedMissions.length} mission{completedMissions.length === 1 ? '' : 's'}
              </span>
              <div className="flex flex-wrap gap-x-6 gap-y-1 font-mono text-[12.5px] tabular-nums text-foreground">
                <span>
                  Mission <b>{formatDuration(missions.avgMissionMs, { compact: true })}</b>
                </span>
                <span>
                  Dépotage <b>{formatDuration(containers.avgDepotageMs, { compact: true })}</b>
                </span>
                <span>
                  On time <b>{missions.onTimePct}%</b>
                </span>
              </div>
            </div>
          </>
        )}

        {inProgressMissions.length > 0 && (
          <p className="rounded-lg bg-info-subtle px-3.5 py-2.5 text-[12px] leading-relaxed text-info-subtle-foreground">
            {inProgressSummary(inProgressMissions)}
          </p>
        )}
      </ReportCard>

      {/* ── 5. Weekly Trend ─────────────────────────────────────────────── */}
      <ReportCard
        icon={Clock}
        title="Weekly Trend"
        subtitle="Volume against cycle time, week by week"
      >
        {weeklyRollup.every((week) => week.closed === 0) ? (
          <ReportEmpty>No mission closed this month yet.</ReportEmpty>
        ) : (
          <>
            <WeeklyTrendChart weeklyRollup={weeklyRollup} anomalyWeekKey={anomalyWeekKey} currency={currency} />
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] border-collapse text-xs">
                <thead>
                  <tr className="border-b border-border text-left text-[10px] uppercase tracking-[0.09em] text-muted-foreground">
                    <th className="py-1.5 pr-2 font-semibold">Week</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Closed</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Avg mission</th>
                    <th className="px-2 py-1.5 text-right font-semibold">Avg dépotage</th>
                    <th className="px-2 py-1.5 text-right font-semibold">On time</th>
                    <th className="py-1.5 pl-2 text-right font-semibold">Detention</th>
                  </tr>
                </thead>
                <tbody>
                  {weeklyRollup.map((week) => (
                    <tr
                      key={week.key}
                      className={cn(
                        'border-b border-border/60 last:border-0',
                        week.key === anomalyWeekKey && 'bg-warning-subtle/50',
                      )}
                    >
                      <td className="py-1.5 pr-2 font-medium text-foreground">
                        {week.key} · {week.dateRangeLabel}
                      </td>
                      {week.isOpen && week.closed === 0 ? (
                        <td colSpan={5} className="px-2 py-1.5 text-muted-foreground">
                          still open
                        </td>
                      ) : (
                        <>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">{week.closed}</td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {formatDuration(week.avgMissionMs, { compact: true })}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {formatDuration(week.avgDepotageMs, { compact: true })}
                          </td>
                          <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                            {week.onTimePct !== null ? `${week.onTimePct}%` : '—'}
                          </td>
                          <td className="py-1.5 pl-2 text-right font-mono tabular-nums">
                            {week.detentionFees !== null
                              ? `${week.detentionFees.toLocaleString()} ${currency}`
                              : '—'}
                          </td>
                        </>
                      )}
                    </tr>
                  ))}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-semibold text-foreground">
                    <td className="py-1.5 pr-2">Month total</td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {completedMissions.length}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {formatDuration(missions.avgMissionMs, { compact: true })}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">
                      {formatDuration(containers.avgDepotageMs, { compact: true })}
                    </td>
                    <td className="px-2 py-1.5 text-right font-mono tabular-nums">{missions.onTimePct}%</td>
                    <td className="py-1.5 pl-2 text-right font-mono tabular-nums">
                      {detention.fees.toLocaleString()} {currency}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </ReportCard>

      {/* ── 6. Recommendations ─────────────────────────────────────────── */}
      {recommendations.length > 0 && (
        <ReportCard icon={AlertTriangle} title="Recommended for Next Month" subtitle="Data-driven moves, ranked by impact">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            {recommendations.map((recommendation) => (
              <div
                key={recommendation.rank}
                className="flex flex-col gap-2 rounded-lg bg-muted/50 p-4"
              >
                <span className="font-mono text-[11px] font-bold text-muted-foreground">
                  {String(recommendation.rank).padStart(2, '0')}
                </span>
                <p className="text-[13px] font-semibold leading-snug text-foreground">
                  {recommendation.title}
                </p>
                <p className="text-[11.5px] leading-relaxed text-muted-foreground">
                  {recommendation.description}
                </p>
                <p className="mt-auto text-[12px] font-medium text-warning-subtle-foreground">
                  {recommendation.impact}
                </p>
              </div>
            ))}
          </div>
        </ReportCard>
      )}
    </div>
  );
}

/* ── Shipment card ─────────────────────────────────────────────────────── */

const CURRENT_STAGE_LABEL: Record<string, string> = {
  assigned: 'assigned',
  arrived_pickup: 'at pickup',
  loading_started: 'loading',
  loading_completed: 'in transit',
  left_for_dropoff: 'in transit',
  arrived_dropoff: 'at drop-off',
  unloading_started: 'unloading',
  container_delivered: 'at dépotage',
  empty_ready: 'awaiting empty return',
};

function slowestDepotageMission(missions: MissionReport[]): MissionReport | null {
  return missions.reduce<MissionReport | null>((slowest, mission) => {
    if ((mission.kpis.depotageMs ?? 0) <= 0) return slowest;
    if (!slowest || (mission.kpis.depotageMs ?? 0) > (slowest.kpis.depotageMs ?? 0)) return mission;
    return slowest;
  }, null);
}

const MISSION_STATUS_TO_SHIPMENT_CARD: Record<
  MissionReport['status'],
  { label: string; statusIntent: NonNullable<ShipmentCardProps['statusIntent']> }
> = {
  ontime: { label: 'On Time', statusIntent: 'green' },
  attention: { label: 'Attention', statusIntent: 'orange' },
  delayed: { label: 'Delayed', statusIntent: 'red' },
};

/**
 * Maps one mission onto the app's existing `ShipmentCard` — the same card
 * used on the operational shipments list — rather than a report-only
 * lookalike. A couple of its generic slots get repurposed for report-specific
 * figures (`distance`/`duration` carry the mission and dépotage durations,
 * `goodsWeight` carries the container size in place of a tonnage this report
 * does not have), and `cornerIntent`/the `red` status intent are the two
 * small additions the card gained so this call site did not need its own.
 */
function missionToShipmentCardProps(
  mission: MissionReport,
  isSlowestStrip: boolean,
  onOpen?: (report: MissionReport) => void,
): ShipmentCardProps {
  const { overview } = mission;
  const truckPlate = overview.vehiclePlate;
  const statusMeta = MISSION_STATUS_TO_SHIPMENT_CARD[mission.status];

  return {
    shipmentNumber: overview.missionId,
    origin: overview.pickup,
    destination: overview.dropoff,
    organization: overview.customerCompany,
    createdBy: overview.customerContactName,
    date: toDateOnly(overview.missionStartAt) ?? '—',
    goodsType: overview.cargo,
    goodsWeight: overview.containerType,
    vehicleType: overview.transporter,
    driverName: overview.driver === 'Unassigned' ? undefined : overview.driver,
    truckPlate: truckPlate === 'Unassigned' ? undefined : truckPlate,
    distance: `Mission ${formatDuration(mission.kpis.totalMs, { compact: true })}`,
    duration: `Dépotage ${formatDuration(mission.kpis.depotageMs, { compact: true })}`,
    status: isSlowestStrip ? 'Slowest Strip' : statusMeta.label,
    statusIntent: isSlowestStrip ? 'orange' : statusMeta.statusIntent,
    cornerIntent: isSlowestStrip ? 'orange' : 'teal',
    clickable: Boolean(onOpen),
    onClick: onOpen ? () => onOpen(mission) : undefined,
  };
}

function inProgressSummary(missions: MissionReport[]): string {
  const counts = new Map<string, number>();
  for (const mission of missions) {
    const recorded = mission.timeline.filter((row) => row.at !== null);
    const lastKey = recorded[recorded.length - 1]?.key ?? 'assigned';
    const label = CURRENT_STAGE_LABEL[lastKey] ?? 'in progress';
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }
  const parts = [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([label, count]) => `${count} ${label}`);

  const delayed = missions.filter((mission) => mission.status === 'delayed').length;
  const closing =
    delayed === 0
      ? 'None has crossed a threshold.'
      : `${delayed} ${delayed === 1 ? 'has' : 'have'} crossed a threshold.`;

  return `${missions.length} mission${missions.length === 1 ? '' : 's'} still running — ${parts.join(', ')}. ${closing}`;
}

/* ── Container cycle donut ─────────────────────────────────────────────── */

/** Same donut pattern as the dashboard's `ExpenseDonutCard` — a real animated
 * ApexCharts ring with a centre overlay, in place of the report kit's hand-drawn
 * SVG ring, at the user's explicit choice to trade the mission report's
 * print-safe consistency for the app's richer chart language on this page. */
function ContainerCycleDonut({ returned, total }: { returned: number; total: number }) {
  const stillInCycle = total - returned;
  const hasStill = stillInCycle > 0;
  const series = hasStill ? [returned, stillInCycle] : [returned];
  const labels = hasStill ? ['Returned', 'Still in cycle'] : ['Returned'];
  const colors = hasStill ? [stepColor(4, 5), stepColor(1, 5)] : [stepColor(4, 5)];

  const options: ApexOptions = donutOptions(colors, {
    labels,
    plotOptions: { pie: { donut: { size: '72%' } } },
    tooltip: {
      y: { formatter: (value: number) => `${value} container${value === 1 ? '' : 's'}` },
    },
  });

  return (
    <div className="flex shrink-0 flex-col items-center gap-2.5">
      <div className="relative size-[136px]">
        <ApexChart type="donut" series={series} options={options} height="100%" />
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-mono text-xl font-bold tabular-nums leading-none text-foreground">
            {returned}/{total}
          </span>
          <span className="mt-1 text-center text-[9px] font-semibold uppercase leading-tight tracking-[0.08em] text-muted-foreground">
            Boxes
            <br />
            returned
          </span>
        </div>
      </div>
      <div className="flex flex-col gap-1">
        {labels.map((label, index) => (
          <span key={label} className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
            <span aria-hidden className="size-2 rounded-sm" style={{ backgroundColor: colors[index] }} />
            {label} <b className="font-mono text-foreground">{index === 0 ? returned : stillInCycle}</b>
          </span>
        ))}
      </div>
    </div>
  );
}

/* ── Weekly trend chart ────────────────────────────────────────────────── */

/**
 * One axis, not two. An earlier version scaled a volume bar and a duration
 * line on the same plot — two different units sharing one set of pixels,
 * which is exactly the dual-axis chart this design system does not draw.
 * Duration is the only real geometry here — an animated ApexCharts bar per
 * week, coloured by the app's own chart theme, the flagged week in the intent
 * "warning" colour. Volume, dépotage and on-time all still ride along, in a
 * rich per-bar tooltip rather than a second scaled series — richer without
 * becoming a dual-axis chart.
 */
function WeeklyTrendChart({
  weeklyRollup,
  anomalyWeekKey,
  currency,
}: {
  weeklyRollup: MonthlyWeeklyRollup[];
  anomalyWeekKey: string | null;
  currency: string;
}) {
  const hours = weeklyRollup.map((week) =>
    week.avgMissionMs !== null ? Math.round((week.avgMissionMs / HOUR) * 10) / 10 : null,
  );
  const colors = weeklyRollup.map((week) =>
    week.key === anomalyWeekKey ? intentColor('warning') : 'var(--primary)',
  );

  const options: ApexOptions = baseChartOptions({
    chart: {
      type: 'bar',
      toolbar: { show: false },
    },
    plotOptions: {
      bar: {
        distributed: true,
        borderRadius: MARK.barRadius[0],
        borderRadiusApplication: 'end',
        columnWidth: '58%',
      },
    },
    colors,
    legend: { show: false },
    xaxis: {
      categories: weeklyRollup.map((week) => week.key),
    },
    yaxis: {
      labels: { formatter: (value: number) => `${Math.round(value)}h` },
    },
    dataLabels: {
      enabled: true,
      formatter: (val: string | number | number[]) =>
        typeof val === 'number' ? formatDuration(val * HOUR, { compact: true }) : '',
      offsetY: -22,
      style: { fontSize: '10.5px', fontWeight: 700, colors: ['var(--foreground)'] },
      background: { enabled: false },
    },
    tooltip: {
      custom: ({ dataPointIndex }: { dataPointIndex: number }) => {
        const week = weeklyRollup[dataPointIndex];
        if (!week) return '';
        if (week.isOpen && week.closed === 0) {
          return buildTooltipHtml(`${week.key} · ${week.dateRangeLabel}`, [
            { key: 'status', label: 'Status', value: 'Still open' },
          ]);
        }
        return buildTooltipHtml(`${week.key} · ${week.dateRangeLabel}`, [
          { key: 'closed', label: 'Closed', value: week.closed, color: 'var(--primary)' },
          { key: 'mission', label: 'Avg mission', value: formatDuration(week.avgMissionMs, { compact: true }) },
          { key: 'depotage', label: 'Avg dépotage', value: formatDuration(week.avgDepotageMs, { compact: true }) },
          { key: 'on_time', label: 'On time', value: week.onTimePct !== null ? `${week.onTimePct}%` : '—' },
          {
            key: 'detention',
            label: 'Detention',
            value: week.detentionFees !== null ? `${week.detentionFees.toLocaleString()} ${currency}` : '—',
          },
        ]);
      },
    },
  });

  return (
    <div className="h-[190px]">
      <ApexChart
        type="bar"
        series={[{ name: 'Avg mission time', data: hours }]}
        options={options}
        height="100%"
      />
    </div>
  );
}
