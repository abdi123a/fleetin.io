import { useMemo } from 'react';
import type { ComponentType, SVGProps } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  ClipboardList,
  Clock,
  ContainerIcon,
  ListChecks,
  MapPin,
  Navigation,
  Package,
  PackageSearch,
  Route,
  RotateCcw,
  Timer,
  Truck,
  UserCheck,
  Warehouse,
} from '@/design-system/icons';
import { Badge, Card } from '@/design-system';
import { formatDate } from '@/utils';
import { cn } from '@/utils';
import { DELAY_REASON_LABELS, RESPONSIBLE_PARTY_LABELS } from './delayVocabulary';
import { MISSION_PHASE_LABELS, MISSION_PHASE_ORDER, type MissionPhase } from './missionLifecycle';
import type { MissionReport, MissionTimelineRow } from './missionReport';
import { DAY, formatDuration } from './reportFormat';
import {
  DateMilestoneStrip,
  FreeTimeTrack,
  MilestoneRail,
  ReportCard,
  ReportEmpty,
  ReportEyebrow,
  ReportField,
  ReportIdentityGroup,
  ReportStat,
  ReportStatusBadge,
  stepTone,
  TimeDonut,
  TimeLegend,
  type MilestoneRow,
  type RibbonSegment,
} from './reportKit';

/**
 * One mission, reported — for a businessperson, not an operator.
 *
 * The reader is a shipper: they want the verdict, then the money, then the
 * evidence, and they want it without reading formulas. So the page is four
 * pictures, each with its exact figures attached:
 *
 * 1. **The verdict** — status, total time, and one plain sentence saying what
 *    happened. Identity is a row of icon chips, not fourteen labelled fields.
 * 2. **Where the time went** — the mission as a single proportional ribbon, the
 *    seven §4 KPIs as its legend, and one ring for active against waiting.
 * 3. **The journey** — twelve milestones grouped into four chapters, drawn on a
 *    rail with the gap between them in a pill. The same data a table held, at a
 *    third of the reading.
 * 4. **The container** — free time drawn against the line's deadline, because
 *    "did we burn the free days" is the question that costs money.
 *
 * Nothing was dropped to get there: every timestamp, duration, party and figure
 * the specification asks for is still on the page.
 */

export interface MissionReportViewProps {
  report: MissionReport;
  className?: string;
}

export function MissionReportView({ report, className }: MissionReportViewProps) {
  const { overview, kpis, containerReturn: ret } = report;

  const segments = useMemo<RibbonSegment[]>(
    () =>
      report.breakdown.map((segment) => ({
        key: segment.key,
        label: segment.label,
        share: segment.share,
        value: formatDuration(segment.ms, { compact: segment.ms >= DAY }),
        tone: segment.tone,
        step: segment.step,
        isLongest: segment.isLongest,
      })),
    [report.breakdown],
  );

  const longest = report.breakdown.find((segment) => segment.isLongest) ?? null;
  const waitingPct = kpis.activePct !== null ? 100 - kpis.activePct : null;

  return (
    /* `grid-cols-1`, not a bare `grid`: an implicit track is `auto`, which
       sizes to MAX-content, and grid items default to `min-width: auto` — so a
       single `truncate` line (the route, which is `whitespace-nowrap`) stretched
       the whole report to 811px inside a 343px phone. Tailwind's `grid-cols-1`
       is `minmax(0, 1fr)`, which is the cap that was missing. */
    <div className={cn('grid grid-cols-1 gap-3', className)}>
      {/* ══ 1. The verdict ══════════════════════════════════════════════ */}
      <Card className="report-block space-y-4 rounded-lg border border-border/80 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <ReportEyebrow>Mission Report</ReportEyebrow>
            <div className="flex flex-wrap items-center gap-2.5">
              <h3 className="font-mono text-xl font-bold leading-tight tracking-tight text-foreground sm:text-2xl">
                {overview.missionId}
              </h3>
              {overview.isTerminated ? (
                <Badge
                  variant="subtle"
                  intent="default"
                  size="md"
                  className="uppercase tracking-[0.08em]"
                >
                  {overview.lifecycleStatus}
                </Badge>
              ) : (
                <ReportStatusBadge status={report.status} size="md" />
              )}
            </div>
            <p className="mt-1.5 flex items-center gap-1.5 text-[12.5px] text-muted-foreground">
              <Route className="size-3.5 shrink-0" aria-hidden />
              <span className="truncate">
                {overview.pickup} → {overview.dropoff}
              </span>
            </p>
          </div>

          {/*
           * The one number the whole report exists to give.
           *
           * Not a filled tile — that was tried and it read as a third teal block
           * under the masthead and the section header, competing with the status
           * badge instead of leading. The figure carries the colour itself, at
           * display size: at 40px bold the brand teal clears large-text contrast
           * comfortably, and nothing else on the page is allowed to be this big.
           */}
          <div className="shrink-0 text-left sm:text-right">
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
              {kpis.totalMs !== null ? 'Total mission time' : 'Running for'}
            </p>
            <p className="mt-1 font-mono text-[34px] font-extrabold tabular-nums leading-[0.95] tracking-tight text-primary-bold sm:text-[40px]">
              {formatDuration(kpis.totalMs ?? kpis.elapsedMs, { compact: true })}
            </p>
            <p className="mt-1.5 text-[11px] text-muted-foreground">
              {kpis.totalMs !== null ? 'assigned → empty back' : 'still running'}
            </p>
          </div>
        </div>

        {/* The sentence. What a shipper would say out loud about this mission. */}
        <p className="border-l-2 border-primary/40 pl-3 text-[13px] leading-relaxed text-foreground">
          <VerdictSentence report={report} />
        </p>

        {/* Who, what box, who moved it — three groups, not seven pills. */}
        <div className="grid grid-cols-1 gap-4 border-t border-border/60 pt-3.5 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border/60">
          <ReportIdentityGroup label="Shipper" primary={overview.shipperName} />
          <ReportIdentityGroup
            label="Container"
            primary={overview.containerNumber ?? 'Not containerized'}
            mono={Boolean(overview.containerNumber)}
            lines={[
              [overview.containerType, overview.shippingLine].filter(Boolean).join(' · '),
              overview.cargo,
            ]}
          />
          <ReportIdentityGroup
            label="Transporter"
            primary={overview.transporter}
            lines={[overview.truck, overview.driver]}
          />
        </div>

        {/* Three dates: started, delivered, and the empty back at the depot.
            There is no fourth "closed" stamp any more — the booking IS finished
            when the box is home, and printing a separate closing time invited
            the two to disagree. On this very report they did: a mission closed
            17 Aug against a delivery on 26 Aug. A load with no container has no
            return leg, so it shows where it has got to instead. */}
        <div className="border-t border-border/60 pt-3.5">
          <DateMilestoneStrip
            items={[
              {
                label: 'Mission started',
                icon: ClipboardList,
                value: overview.missionStartAt ? formatDate(overview.missionStartAt, 'dateTime') : null,
              },
              {
                label: 'Delivered',
                icon: CheckCircle2,
                value: overview.deliveredAt ? formatDate(overview.deliveredAt, 'dateTime') : null,
              },
              ret.hasContainer
                ? {
                    label: 'Empty returned',
                    icon: Warehouse,
                    value: overview.emptyReturnedAt
                      ? formatDate(overview.emptyReturnedAt, 'dateTime')
                      : null,
                  }
                : { label: 'Current status', icon: RotateCcw, value: overview.lifecycleStatus },
            ]}
          />
        </div>
      </Card>

      {/* ══ 2. Where the time went ══════════════════════════════════════ */}
      {segments.length > 0 && (
        <ReportCard
          icon={Timer}
          title="Where the Time Went"
          subtitle="each arc is a stage of the run · orange is time waiting, teal is time working"
        >
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            <TimeDonut
              segments={segments}
              centerValue={kpis.activePct !== null ? `${kpis.activePct}%` : '—'}
              centerLabel={kpis.activePct !== null ? 'Active' : 'Measured'}
              centerCaption={
                waitingPct !== null ? `${waitingPct}% waiting or idle` : undefined
              }
            />
            <TimeLegend segments={segments} />
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border/60 pt-3.5 sm:grid-cols-4">
            <ReportStat
              label="Transit time"
              value={formatDuration(kpis.transitMs, { compact: true })}
              caption="pickup → destination"
            />
            <ReportStat
              label="Total waiting"
              value={formatDuration(kpis.waitTotalMs, { compact: true })}
              caption="both gates together"
              tone={longest?.tone === 'waiting' ? 'accent' : 'neutral'}
            />
            <ReportStat
              label="Dépotage (client)"
              value={formatDuration(kpis.depotageMs, { compact: true })}
              caption="delivered → empty ready"
            />
            <ReportStat
              label="Biggest single block"
              value={longest ? formatDuration(longest.ms, { compact: true }) : '—'}
              caption={longest ? longest.label.toLowerCase() : 'no interval measured'}
              tone="accent"
            />
          </div>

          {longest && (
            <p className="text-[11.5px] text-muted-foreground">
              <b className="text-accent">{longest.label}</b> consumed {Math.round(longest.share)}% of
              the mission's measured time
              {longest.tone === 'waiting'
                ? ' — time the truck was neither loading nor moving.'
                : '.'}
            </p>
          )}
        </ReportCard>
      )}

      {/* ══ 3. The journey ══════════════════════════════════════════════ */}
      <ReportCard
        icon={Clock}
        title="The Journey"
        subtitle="every recorded milestone in four chapters · the pill is the gap since the one above"
      >
        <div className="grid gap-x-8 gap-y-5 lg:grid-cols-2">
          {MISSION_PHASE_ORDER.map((phase) => (
            <PhaseBlock key={phase} phase={phase} report={report} />
          ))}
        </div>
      </ReportCard>

      {/* ══ 4. The container ════════════════════════════════════════════ */}
      {ret.hasContainer && (
        <ReportCard
          icon={ContainerIcon}
          title="Empty Container Return"
          subtitle={
            ret.cycleReference
              ? `Cycle ${ret.cycleReference}${ret.depot ? ` · depot ${ret.depot}` : ''} — the mission ends when the box is back, not at delivery`
              : 'the mission ends when the box is back, not at delivery'
          }
          right={<ReportStatusBadge status={ret.status} />}
        >
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_250px]">
            <ContainerTrack report={report} />

            <div className="grid grid-cols-2 gap-4 rounded-lg border border-border/60 bg-secondary/30 p-3.5 lg:grid-cols-1 lg:gap-3.5">
              <ReportStat
                label="Detention"
                value={
                  ret.detention
                    ? `${ret.detentionFees.toLocaleString()} ${ret.detentionCurrency}`
                    : 'None'
                }
                caption={
                  ret.detention
                    ? `${ret.detentionDays} day${ret.detentionDays === 1 ? '' : 's'} × ${ret.detentionRatePerDay} ${ret.detentionCurrency} per container-day`
                    : 'no fees incurred'
                }
                tone={ret.detention ? 'bad' : 'good'}
                size="lg"
              />
              <ReportStat
                label="Empty return leg"
                value={formatDuration(kpis.returnLegMs, { compact: true })}
                caption="empty ready → depot"
              />
            </div>
          </div>

          {/* Every date §5 asks for, once, under the picture that uses them. */}
          <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border/60 pt-3.5 sm:grid-cols-3">
            <ReportField
              label="Container delivered"
              value={formatDate(ret.deliveredAt, 'dateTime')}
              mono
            />
            <ReportField label="Empty ready" value={formatDate(ret.emptyReadyAt, 'dateTime')} mono />
            <ReportField label="Dépotage time (client)" value={formatDuration(kpis.depotageMs)} mono />
            <ReportField
              label="Return deadline"
              value={
                ret.deadlineAt
                  ? `${formatDate(ret.deadlineAt, 'dateTime')}${ret.freeDays ? ` · ${ret.freeDays} free days` : ''}`
                  : 'No deadline set by the line'
              }
              mono
            />
            <ReportField
              label="Actual empty return"
              value={ret.returnedAt ? formatDate(ret.returnedAt, 'dateTime') : 'Still out'}
              mono
            />
            {ret.deltaMs !== null && (
              <ReportField
                label={
                  ret.returnedAt
                    ? ret.deltaMs <= 0
                      ? 'Margin before deadline'
                      : 'Late past deadline'
                    : ret.deltaMs > 0
                      ? 'Overrun so far'
                      : 'Free time remaining'
                }
                value={
                  <span
                    className={cn(
                      'font-semibold',
                      ret.deltaMs > 0 ? 'text-destructive' : 'text-success',
                    )}
                  >
                    {formatDuration(Math.abs(ret.deltaMs))}
                  </span>
                }
                mono
              />
            )}
          </div>
        </ReportCard>
      )}

      {/* ══ 5. Responsibility ═══════════════════════════════════════════ */}
      {report.attribution && (
        <ReportCard
          icon={UserCheck}
          tint="red"
          title="Delay Responsibility"
          subtitle="party and reason are recorded as two separate fields"
          right={
            <Badge
              variant="outline"
              intent="default"
              size="sm"
              className="uppercase tracking-[0.08em]"
            >
              {report.attribution.source === 'derived'
                ? 'Derived from timestamps'
                : 'Recorded by ops'}
            </Badge>
          }
        >
          <div className="grid gap-x-5 gap-y-3 sm:grid-cols-[170px_170px_minmax(0,1fr)]">
            <ReportStat
              label="Responsible party"
              value={
                <span className="font-sans text-[15px]">
                  {RESPONSIBLE_PARTY_LABELS[report.attribution.party]}
                </span>
              }
            />
            <ReportStat
              label="Reason"
              value={
                <span className="font-sans text-[15px]">
                  {DELAY_REASON_LABELS[report.attribution.reason]}
                </span>
              }
            />
            <div className="min-w-0">
              <ReportEyebrow>Operational comment</ReportEyebrow>
              <p className="mt-1 text-[12.5px] leading-relaxed text-muted-foreground">
                {report.attribution.comment ?? '—'}
              </p>
            </div>
          </div>
        </ReportCard>
      )}

      {/* ══ 6. Exceptions ═══════════════════════════════════════════════ */}
      <ReportCard
        icon={report.exceptions.length > 0 ? AlertTriangle : ListChecks}
        tint={
          report.exceptions.some((exception) => exception.level === 'delayed') ? 'red' : undefined
        }
        title="Flagged Exceptions"
        subtitle="only what carries an operational or financial consequence"
      >
        {report.exceptions.length === 0 ? (
          <ReportEmpty>
            Nothing was flagged — every stage stayed inside its operational threshold and the empty
            came back within free time.
          </ReportEmpty>
        ) : (
          <div className="grid gap-2 sm:grid-cols-2">
            {report.exceptions.map((exception) => (
              <div
                key={exception.code}
                className="flex items-start gap-2.5 rounded-lg border border-border/60 bg-secondary/30 p-2.5"
              >
                <ReportStatusBadge
                  status={exception.level === 'delayed' ? 'delayed' : 'attention'}
                  className="mt-0.5 shrink-0"
                />
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold leading-tight text-foreground">
                    {exception.label}
                  </p>
                  <p className="mt-0.5 text-[11.5px] leading-tight text-muted-foreground">
                    {exception.detail}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </ReportCard>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Pieces
 * ═══════════════════════════════════════════════════════════════════════ */

/**
 * What each chapter looks like.
 *
 * The design system's ordinal teal ramp, in journey order: light at the pickup,
 * dark at the depot, so the four blocks read as a progression rather than as
 * four identical lists. The steps line up with the ribbon above — transit is the
 * same teal in both — so the two graphics agree at a glance. Each chapter also
 * gets a glyph, because a shape is found faster than a heading.
 */
const PHASE_STYLE: Record<
  MissionPhase,
  { icon: ComponentType<SVGProps<SVGSVGElement>>; step: 1 | 2 | 3 | 4 | 5 }
> = {
  pickup: { icon: Warehouse, step: 2 },
  transit: { icon: Truck, step: 3 },
  delivery: { icon: MapPin, step: 4 },
  container: { icon: ContainerIcon, step: 5 },
};

/**
 * One chapter of the journey: its own colour, span, share of the mission, and
 * the milestones inside it.
 */
function PhaseBlock({ phase, report }: { phase: MissionPhase; report: MissionReport }) {
  const rows = report.timeline.filter((row) => row.phase === phase);
  if (rows.length === 0) return null;

  const { icon: Icon, step } = PHASE_STYLE[phase];
  const tone = stepTone(step);

  const recorded = rows.filter((row) => row.at !== null);
  const spanMs = recorded.reduce((sum, row) => sum + (row.durationMs ?? 0), 0);
  const sharePct =
    report.measuredMs > 0 ? Math.min(100, Math.round((spanMs / report.measuredMs) * 100)) : 0;

  return (
    <div className="min-w-0">
      {/* The chapter flag — same solid-fill, bold-uppercase tab as the
          Booking No. corner badge on the shipment card, so a chapter reads as
          a heading you can find by shape, not a line of small type. */}
      <div className="mb-2 rounded-t-md bg-primary-bold px-2.5 py-1.5 text-primary-bold-foreground">
        <div className="flex items-baseline gap-2">
          <Icon className="size-3.5 shrink-0 translate-y-0.5" aria-hidden />
          <span className="text-[11px] font-bold uppercase tracking-[0.08em]">
            {MISSION_PHASE_LABELS[phase]}
          </span>
          <span className="text-[10.5px] text-primary-bold-foreground/70">
            {recorded.length} of {rows.length}
          </span>
          {spanMs > 0 && (
            <span className="ml-auto shrink-0 font-mono text-[11.5px] font-bold tabular-nums">
              {formatDuration(spanMs, { compact: true })}
              <span className="ml-1 font-sans text-[10px] font-normal text-primary-bold-foreground/70">
                {sharePct}%
              </span>
            </span>
          )}
        </div>
        {spanMs > 0 && (
          /* The chapter's share of the mission, drawn — the number alone made
             every chapter look the same weight. */
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-primary-bold-foreground/20">
            <div
              className="h-full rounded-full bg-primary-bold-foreground/90"
              style={{ width: `${Math.max(2, sharePct)}%` }}
            />
          </div>
        )}
      </div>
      <MilestoneRail rows={rows.map(toMilestoneRow)} tone={tone} />
    </div>
  );
}

/**
 * One mark per rung.
 *
 * The rail used to draw twelve identical dots, which made every milestone look
 * like the same kind of event — you had to read all twelve labels to find the
 * gate you cared about. These are chosen so the shape carries the meaning: a
 * truck is moving, a pin is standing somewhere, a box is being handled.
 */
const STAGE_ICON: Record<string, ComponentType<{ className?: string }>> = {
  assigned: ClipboardList,
  left_for_loading: Truck,
  arrived_pickup: MapPin,
  loading_started: PackageSearch,
  loading_completed: Package,
  left_for_dropoff: Navigation,
  arrived_dropoff: MapPin,
  unloading_started: PackageSearch,
  container_delivered: CheckCircle2,
  empty_ready: ContainerIcon,
  empty_picked_up: Truck,
  empty_returned: Warehouse,
  mission_closed: CheckCircle2,
};

/**
 * A date is repeated only when the day changes — a single-day leg reads as bare
 * times, which is how the specification's own example prints it.
 */
function toMilestoneRow(
  row: MissionTimelineRow,
  index: number,
  all: MissionTimelineRow[],
): MilestoneRow {
  const previous = all[index - 1];
  const sameDay =
    row.at !== null &&
    previous?.at != null &&
    new Date(row.at).toDateString() === new Date(previous.at).toDateString();

  return {
    key: row.key,
    label: row.label,
    icon: STAGE_ICON[row.key],
    note: row.note,
    responsible: row.responsible,
    at: row.at === null ? null : formatDate(row.at, sameDay ? 'time' : 'dateTime'),
    duration: row.durationMs === null ? null : formatDuration(row.durationMs, { compact: true }),
    intervalLabel: row.intervalLabel,
    isLongest: row.isLongest,
  };
}

/** Free time drawn against the deadline, with the margin named on the bar. */
function ContainerTrack({ report }: { report: MissionReport }) {
  const ret = report.containerReturn;

  // Without both ends there is no scale to draw — say so rather than draw a lie.
  if (ret.deliveredAt === null || ret.deadlineAt === null) {
    return (
      <div className="flex items-center rounded-lg border border-dashed border-border bg-secondary/20 p-4">
        <ReportEmpty>
          {ret.deadlineAt === null
            ? 'The shipping line set no return deadline for this container, so there is no free-time window to measure against.'
            : 'The container has not been delivered yet — free time starts at delivery.'}
        </ReportEmpty>
      </div>
    );
  }

  /*
   * The window is delivery → deadline. A box that came back inside it splits the
   * window in two: the days the client held it, and the margin that was left. A
   * box that came back late extends the track past the deadline, capped at one
   * further window so a badly late return cannot squeeze the window to nothing.
   */
  const windowMs = Math.max(1, ret.deadlineAt - ret.deliveredAt);
  const endMs = ret.returnedAt ?? Math.max(ret.deadlineAt, Date.now());
  const overrunMs = Math.max(0, endMs - ret.deadlineAt);
  const isLate = overrunMs > 0;

  const drawnOverrunMs = Math.min(overrunMs, windowMs);
  const totalMs = windowMs + drawnOverrunMs;
  const usedMs = Math.max(0, Math.min(endMs, ret.deadlineAt) - ret.deliveredAt);
  const restMs = isLate ? drawnOverrunMs : windowMs - usedMs;
  const pct = (ms: number) => (ms / totalMs) * 100;

  /*
   * The boundary between the two parts means different things on each side of
   * the deadline, and the anchors have to follow it: on a return inside free
   * time it is the moment the empty came back, with the deadline at the far
   * right; on a late one it is the deadline itself, and the empty landed at the
   * end of the red. Labelling both the same way was the bug this comment
   * replaced.
   */
  const usedLabel = isLate
    ? `${formatDuration(windowMs, { compact: true })} free time used`
    : `${formatDuration(usedMs, { compact: true })} at the client`;
  const restLabel = isLate
    ? `${formatDuration(overrunMs, { compact: true })} late`
    : `${formatDuration(windowMs - usedMs, { compact: true })} spare`;
  const returnAnchor = ret.returnedAt ? 'Empty back' : 'Today';

  const caption = ret.returnedAt
    ? isLate
      ? `Free time ran out on ${formatDate(ret.deadlineAt, 'date')}; the empty came back ${formatDuration(overrunMs)} after that, which is what the ${ret.detentionDays} detention day${ret.detentionDays === 1 ? '' : 's'} are charged for.`
      : `The empty was back with ${formatDuration(windowMs - usedMs)} of free time still unused — the client held the container ${formatDuration(usedMs)} of the ${formatDuration(windowMs, { compact: true })} allowed.`
    : isLate
      ? `The container is still out, ${formatDuration(overrunMs)} past the deadline, and is accruing detention at ${ret.detentionRatePerDay} ${ret.detentionCurrency} per day.`
      : `The container is still out. ${formatDuration(windowMs - usedMs)} of free time remains before detention starts.`;

  return (
    <div className="rounded-lg border border-border/60 bg-secondary/20 p-4">
      <FreeTimeTrack
        usedPct={pct(usedMs)}
        usedLabel={usedLabel}
        restPct={pct(restMs)}
        restLabel={restLabel}
        restTone={isLate ? 'late' : 'spare'}
        /* Anchors name the moments, not their dates: three dates across one bar
           collided at every width, and all three are printed in full in the
           field grid directly under this card. */
        startLabel="Delivered"
        markerLabel={isLate ? 'Free time ends' : ret.returnedAt ? returnAnchor : undefined}
        endLabel={isLate ? returnAnchor : 'Free time ends'}
        caption={caption}
      />
    </div>
  );
}

/** The mission in one sentence — the only prose on the page, and it earns its place. */
function VerdictSentence({ report }: { report: MissionReport }) {
  const { overview, containerReturn: ret, kpis } = report;
  const parts: string[] = [];

  if (overview.isTerminated) {
    return (
      <>This mission was {overview.lifecycleStatus.toLowerCase()} and has no performance to report.</>
    );
  }

  if (overview.deliveredAt !== null) {
    parts.push(`Delivered ${formatDate(overview.deliveredAt, 'dateTime')}`);
    if (report.deliveryOutcome === 'late') parts.push('after the promised date');
  } else {
    parts.push(`In progress — currently ${overview.lifecycleStatus.toLowerCase()}`);
  }

  if (ret.hasContainer) {
    if (ret.returnedAt !== null && ret.deltaMs !== null) {
      parts.push(
        ret.deltaMs <= 0
          ? `empty back at the depot ${formatDuration(Math.abs(ret.deltaMs), { compact: true })} before the deadline`
          : `empty returned ${formatDuration(ret.deltaMs, { compact: true })} late`,
      );
    } else if (ret.deltaMs !== null && ret.deltaMs > 0) {
      parts.push(
        `empty still out, ${formatDuration(ret.deltaMs, { compact: true })} past the deadline`,
      );
    } else if (ret.deadlineAt !== null) {
      parts.push(
        `empty still out with ${formatDuration(Math.abs(ret.deltaMs ?? 0), { compact: true })} of free time left`,
      );
    }

    parts.push(
      ret.detention
        ? `detention of ${ret.detentionFees.toLocaleString()} ${ret.detentionCurrency} over ${ret.detentionDays} day${ret.detentionDays === 1 ? '' : 's'}`
        : 'no detention',
    );
  }

  if (kpis.waitTotalMs !== null) {
    parts.push(
      `${formatDuration(kpis.waitTotalMs, { compact: true })} of the run was spent waiting at the gates`,
    );
  }

  return <>{parts.join(' · ')}.</>;
}
