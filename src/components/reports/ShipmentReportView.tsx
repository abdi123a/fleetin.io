import { useMemo } from 'react';
import type { ApexOptions } from 'apexcharts';
import {
  AlertTriangle,
  CheckCircle2,
  Clock,
  ContainerIcon,
  Leaf,
  Route,
  Truck,
} from '@/design-system/icons';
import { Badge } from '@/design-system';
import { ApexChart } from '@/features/shipper-bi/charts/ApexChart';
import { donutOptions } from '@/features/shipper-bi/charts/apexChartTheme';
import { intentColor, stepColor } from '@/features/shipper-bi/charts/chartTheme';
import { formatCo2, formatFactor, formatKm } from '@/lib/co2';
import { formatDate } from '@/utils';
import { cn } from '@/utils';
import type { ShipmentReport } from './shipmentReport';
import { DAY, formatDuration } from './reportFormat';
import { ReportCard, ReportEmpty, ReportStatusBadge, STAGE_VISUAL } from './reportKit';

/**
 * The shipment, reported — every container at once.
 *
 * ## How this is built
 *
 * Two failed versions taught the rules it follows.
 *
 * The first was **all charts**: a donut, a ring of arcs and a gauge, one per
 * card. A consignment carries one or two containers and records a handful of
 * intervals, so every one of them drew a single segment — "all of them are
 * round, all of them look empty".
 *
 * The second was **all type**: the charts came out and nothing replaced them,
 * which left a white page of small figures with no shape to land on.
 *
 * So: **one chart, and grouped panels.**
 *
 * - Exactly **one** round graphic in the whole document — the stage donut,
 *   which is the only block whose data is genuinely a composition worth
 *   drawing. Everything else is figures.
 * - Related figures sit **inside a tinted panel** rather than floating on the
 *   card. The tint is what turns a list of numbers into three things a reader
 *   can see at a glance, and it is meaningful where the app already has a
 *   meaning for it — the container row wears teal/amber/grey because that is
 *   the app-wide full/empty/home scale.
 * - Hierarchy is three sizes and no more: hero figures (28–32px), panel
 *   figures (22px), supporting figures (18px). Labels are 10px and quiet.
 *
 * Names are plain. This scope calls the block "Time Breakdown", with "By stage"
 * and "By party" inside it; the single-mission report splits the same figures
 * out as its own "Time by Party" card.
 */

/**
 * The consignment's carbon, as the report states it.
 *
 * Passed in rather than derived here, because it is the only figure in this
 * document that does not come from a timestamp: `computeShipmentReport` reads
 * the event trail, and emissions are a stored per-booking column snapshotted
 * at assignment. Keeping it a prop means neither has to know about the other.
 */
/**
 * The shipment's Fleetin Impact, as the report states it.
 *
 * Kept apart from `ShipmentCarbon` on purpose: one is what the trucks put
 * out, the other is the `Free Zone → Garage → Port` repositioning a realized
 * match stopped them driving. Neither is ever subtracted from the other.
 */
export interface ShipmentImpactFigures {
  distanceKm: number;
  co2Kg: number;
  /** Continuations that physically happened and carry the count. */
  realizedMatches: number;
  /** Of those, how many could be priced — a carbon figure needs the truck. */
  pricedMatches: number;
  /** Of those, how many could not be measured — no garage on file. */
  unmeasured: number;
}

export interface ShipmentCarbon {
  /** kg CO₂ — the sum of the containers that have actually been driven. */
  co2Kg: number;
  /** The sum of the trucks' roads, which is not the length of the lane. */
  distanceKm: number;
  /** How many of the shipment's containers have a figure at all. */
  priced: number;
  /** How many it has in total, so the report can say what is still to come. */
  total: number;
}

export interface ShipmentReportViewProps {
  report: ShipmentReport;
  /** Absent, or `priced: 0`, when nothing under this shipment has moved yet. */
  carbon?: ShipmentCarbon | null;
  /** The other account — what the containers' realized continuations did not drive. */
  impact?: ShipmentImpactFigures | null;
  className?: string;
}

export function ShipmentReportView({ report, carbon, impact, className }: ShipmentReportViewProps) {
  const { containers, onTime, time, stages, custody, containerReturn: ret } = report;

  const longestStage = stages.find((stage) => stage.isLongest) ?? null;
  const slowest = report.rows.find((row) => row.bookingId === time.longestBookingId) ?? null;
  const verdict = VERDICT[report.status];

  return (
    <div className={cn('grid grid-cols-1 gap-3', className)}>
      {/* ══ 1. The verdict ══════════════════════════════════════════════
          A two-tone masthead: a **solid** block in the shipment's own verdict
          colour carrying the one figure the reader came for, and the four
          supporting metrics on white beside it.

          Solid, not a wash. Three passes of pastel tiles, white tiles and a
          tinted panel all read as decoration; a block of full-strength colour
          with the total time set at 38px reads as a headline, and it changes —
          green when every promise was met, amber when something wants a look,
          red when a deadline went. A reader can take the verdict from across
          the room and still get the exact figures by stepping closer.

          The container strip under "Boxes back" is the piece no number here
          can replace. This data is a handful of boxes, not a distribution, so
          the honest graphic is one pip per container in the app's own
          full/empty/home colours — you see *which* boxes are where, at a
          glance, at any fleet size a shipment actually has. */}
      <div className="report-block overflow-hidden rounded-lg border border-border/80">
        <div className="flex flex-col @[52rem]/report:flex-row">
          <div
            className={cn(
              'flex shrink-0 flex-col justify-center gap-2 px-6 py-6 lg:w-[17.5rem]',
              verdict.solid,
            )}
          >
            <span className="inline-flex items-center gap-2 text-[11px] font-bold uppercase tracking-[0.14em]">
              <verdict.icon className="size-4 shrink-0" aria-hidden />
              {verdict.label}
            </span>
            <p className="font-mono text-[42px] font-extrabold leading-none tracking-tight">
              {formatDuration(time.spanMs, { compact: true })}
            </p>
            <p className="text-[11.5px] opacity-85">
              {time.spanFrom !== null
                ? `Started ${formatDate(time.spanFrom, 'date')}`
                : 'Not started yet'}
            </p>
          </div>

          {/* The second tone. On plain card white this half disappeared beside
              the colour block — the band read as "a green thing, then nothing".
              A sunken ground makes both halves surfaces, and a hairline between
              cells gives the four figures a rhythm to scan along. */}
          {/* Two-up until `xl`, not `sm` and no longer `lg`. Four 30px figures
              share whatever the green block leaves of the band: at `lg` that is
              ~150px each, which truncated "2,700 USD" mid-figure and clipped
              "Clear" to "Cle…" — the two numbers on this card that must never
              be half-read. Two-up costs a row of height and reads at every
              width. */}
          <div className="grid flex-1 grid-cols-2 bg-surface-sunken @[62rem]/report:grid-cols-4">
            <Metric
              label="Containers"
              value={String(containers.total)}
              note={`${containers.closed} closed · ${containers.running} running`}
            />
            <Metric
              label="On time"
              value={onTime.pct === null ? '—' : `${onTime.pct}%`}
              note={onTime.closed > 0 ? `${onTime.onTime} of ${onTime.closed} closed` : 'none closed yet'}
              tone={onTime.pct !== null && onTime.pct === 100 ? 'good' : 'neutral'}
              divided
            />
            <Metric
              label="Boxes back"
              value={ret.withBox > 0 ? `${ret.returned}/${ret.withBox}` : '—'}
              tone={ret.withBox > 0 && ret.returned === ret.withBox ? 'good' : 'neutral'}
              divided
            >
              <ContainerPips rows={report.rows} />
            </Metric>
            <Metric
              label="Detention"
              value={
                ret.detentionFees > 0 ? `${ret.detentionFees.toLocaleString()} ${ret.currency}` : 'Clear'
              }
              note={
                ret.detentionFees > 0
                  ? `${ret.detentionDays} day${ret.detentionDays === 1 ? '' : 's'} charged`
                  /* Short enough to survive the cell: the four notes share a
                     quarter of the band and truncate before they are read. */
                  : 'no charges'
              }
              tone={ret.detentionFees > 0 ? 'bad' : 'good'}
              divided
            />
          </div>
        </div>
      </div>

      {/* ══ 2. Carbon ═══════════════════════════════════════════════════
          What the consignment put into the air, and the two figures that
          explain it: the truck-kilometres it took, and the rate those
          kilometres came out at.

          The rate is the one worth stating. Total CO₂ mostly says how far the
          job was; kg per kilometre says what kind of fleet ran it, and it is
          the only figure here a transport manager can act on.

          Drawn only once something has actually been driven. Carbon accrues
          from movements that happened — a container earns its loaded leg when
          it reaches the consignee — so a shipment still on the road reports
          what it has done so far and says how many boxes that covers, rather
          than projecting the rest. */}
      {carbon && carbon.priced > 0 && (
        <ReportCard
          icon={Leaf}
          title="Emissions"
          right={
            carbon.priced < carbon.total ? (
              <Badge intent="default" variant="subtle" size="sm">
                {carbon.priced} of {carbon.total} containers driven so far
              </Badge>
            ) : undefined
          }
        >
          <div className="grid grid-cols-2 gap-2.5 @[34rem]/report:grid-cols-3">
            <Cell
              label="CO₂ emitted"
              value={`${formatCo2(carbon.co2Kg).value} ${formatCo2(carbon.co2Kg).unit}`}
            />
            <Cell
              label="Distance driven"
              value={`${formatKm(carbon.distanceKm).value} km`}
              note="Every truck's own road, added up"
            />
            <Cell
              label="Rate"
              value={
                carbon.distanceKm > 0 ? formatFactor(carbon.co2Kg / carbon.distanceKm) : '—'
              }
              size="sm"
            />
          </div>
        </ReportCard>
      )}

      {/* ══ 2b. Fleetin Impact ══════════════════════════════════════════
          The other account. A container that left the free zone under the
          next load, or a load that continued from an empty's free zone,
          saved a `Free Zone → Garage → Port` round trip — and only when the
          truck really continued, judged from the bookings' rungs. Its own
          card rather than three more cells under "Emissions": what was
          driven and what was not are never one figure. */}
      {impact && impact.realizedMatches > 0 && (
        <ReportCard
          icon={Route}
          title="Fleetin Impact"
          right={
            impact.unmeasured > 0 ? (
              <Badge intent="warning" variant="subtle" size="sm">
                {impact.unmeasured} of {impact.realizedMatches} not measured — no garage on file
              </Badge>
            ) : undefined
          }
        >
          <div className="grid grid-cols-2 gap-2.5 @[34rem]/report:grid-cols-3">
            <Cell label="Distance avoided" value={`${formatKm(impact.distanceKm).value} km`} tone="good" />
            {/* A distance is a fact about the transporter; a carbon figure
                needs the truck. When no counted continuation could name one,
                the carbon is unknown — never zero, which would read as
                measured and found to be nothing. */}
            <Cell
              label="CO₂ avoided"
              value={
                impact.pricedMatches > 0
                  ? `${formatCo2(impact.co2Kg).value} ${formatCo2(impact.co2Kg).unit}`
                  : 'Not priced'
              }
              tone={impact.pricedMatches > 0 ? 'good' : 'neutral'}
            />
            <Cell label="Realized matches" value={String(impact.realizedMatches)} size="sm" />
          </div>
        </ReportCard>
      )}

      {/* ══ 3. Time ═════════════════════════════════════════════════════ */}
      <ReportCard
        icon={Clock}
        title="Time Breakdown"
        right={
          longestStage ? (
            <Badge intent="warning" variant="subtle" size="sm" className="gap-1.5">
              <AlertTriangle className="size-3" aria-hidden />
              Longest stage: {longestStage.label}
            </Badge>
          ) : undefined
        }
      >
        {stages.length === 0 && custody.segments.length === 0 ? (
          <ReportEmpty>Nothing has been measured on this shipment yet.</ReportEmpty>
        ) : (
          <div className="grid gap-3 @[52rem]/report:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            {/* The document's one chart. Stage shares are the only figures here
                that are a composition of a whole worth drawing. */}
            <Panel caption="By stage" total={formatDuration(time.workedMs, { compact: true })}>
              {stages.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Not measured.</p>
              ) : (
                <div className="flex items-center gap-4">
                  <StageDonut stages={stages} />
                  <Rows
                    rows={stages.map((stage) => ({
                      key: stage.key,
                      label: stage.label,
                      value: formatDuration(stage.totalMs, { compact: true }),
                      share: stage.share,
                      lead: stage.isLongest,
                    }))}
                    leadTone="warn"
                  />
                </div>
              )}
            </Panel>

            <Panel caption="By party" total={formatDuration(custody.totalMs, { compact: true })}>
              {custody.segments.length === 0 ? (
                <p className="text-[12px] text-muted-foreground">Not measured.</p>
              ) : (
                <Rows
                  rows={custody.segments.map((segment) => ({
                    key: segment.party,
                    label: segment.label,
                    value: formatDuration(segment.ms, { compact: segment.ms >= DAY }),
                    share: segment.share,
                    lead: segment.isLongest,
                  }))}
                  leadTone="ink"
                />
              )}
            </Panel>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2.5 @[34rem]/report:grid-cols-4">
          <Cell
            label="Average per container"
            value={formatDuration(time.avgMissionMs, { compact: true })}
            size="sm"
          />
          <Cell
            label="Slowest container"
            value={formatDuration(time.longestMissionMs, { compact: true })}
            note={slowest?.reference}
            size="sm"
          />
          <Cell
            label="Waiting at gates"
            value={formatDuration(time.totalWaitMs, { compact: true })}
            tone={time.totalWaitMs > 0 ? 'warn' : 'neutral'}
            size="sm"
          />
          <Cell
            label="Unloading at client"
            value={formatDuration(time.avgDepotageMs, { compact: true })}
            size="sm"
          />
        </div>
      </ReportCard>

      {/* ══ 3. The boxes ════════════════════════════════════════════════
          Three panels in the app's own container colours — teal while the box
          is loaded, brand yellow once it is empty and owes a return, ink once
          it is home. The same scale the booking cards above this report wear,
          so the row needs no legend to be read. */}
      {ret.withBox > 0 && (
        <ReportCard
          icon={ContainerIcon}
          title="Empty Container Return"
          right={
            ret.late > 0 ? (
              <ReportStatusBadge status="delayed" />
            ) : ret.dueSoon > 0 ? (
              <ReportStatusBadge status="due_soon" />
            ) : ret.out > 0 ? (
              <ReportStatusBadge status="awaiting" />
            ) : (
              <ReportStatusBadge status="ontime" />
            )
          }
        >
          {/* Three across is three ~100px cells on a phone, which clipped
              every one of their labels ("STILL LOA…"). */}
          <div className="grid grid-cols-1 gap-2.5 @[34rem]/report:grid-cols-3">
            <StatePanel
              label="Still loaded"
              value={ret.stillFull}
              className="border-primary/25 bg-primary-subtle text-primary-subtle-foreground"
            />
            <StatePanel
              label="Empty · out"
              value={ret.out}
              className="border-accent/30 bg-accent-subtle text-accent-subtle-foreground"
            />
            <StatePanel
              label="Back at depot"
              value={ret.returned}
              className="border-border bg-secondary text-secondary-foreground"
            />
          </div>

          <div className="grid grid-cols-2 gap-2.5 @[34rem]/report:grid-cols-3">
            <Cell
              label="Past deadline"
              value={String(ret.late)}
              note={ret.dueSoon > 0 ? `${ret.dueSoon} due soon` : undefined}
              tone={ret.late > 0 ? 'bad' : 'neutral'}
              size="sm"
            />
            <Cell
              label="Next deadline"
              value={ret.nextDeadlineAt ? formatDate(ret.nextDeadlineAt, 'date') : 'None'}
              note={ret.nextDeadlineAt ? formatDate(ret.nextDeadlineAt, 'time') : undefined}
              size="sm"
            />
            <Cell
              label="Detention"
              value={`${ret.detentionFees.toLocaleString()} ${ret.currency}`}
              note={ret.detentionDays > 0 ? `${ret.detentionDays} days` : undefined}
              tone={ret.detentionFees > 0 ? 'bad' : 'neutral'}
              size="sm"
            />
          </div>
        </ReportCard>
      )}

      {/* ══ 4. Who moved it ═════════════════════════════════════════════ */}
      {report.transporters.length > 0 && (
        <ReportCard icon={Truck} title="Transporters">
          <div className="grid grid-cols-2 gap-2.5 @[34rem]/report:grid-cols-4">
            {report.transporters.map((transporter) => (
              <Cell
                key={transporter.name}
                label={transporter.name}
                value={String(transporter.containers)}
                note={`container${transporter.containers === 1 ? '' : 's'}`}
                size="sm"
              />
            ))}
          </div>
        </ReportCard>
      )}

      {/* ══ 5. Issues ═══════════════════════════════════════════════════ */}
      {report.exceptions.length > 0 && (
        <ReportCard icon={AlertTriangle} tint="red" title="Issues Raised">
          <div className="grid gap-2.5 @[34rem]/report:grid-cols-2">
            {report.exceptions.map((row) => (
              <div
                key={row.code}
                className={cn(
                  'flex items-center justify-between gap-3 rounded-lg border px-3.5 py-2.5',
                  row.level === 'delayed'
                    ? 'border-destructive/25 bg-destructive-subtle text-destructive-subtle-foreground'
                    : 'border-warning/25 bg-warning-subtle text-warning-subtle-foreground',
                )}
              >
                <span className="min-w-0 truncate text-[12.5px] font-medium">{row.label}</span>
                <span className="shrink-0 font-mono text-[17px] font-extrabold tabular-nums">
                  {row.count}
                </span>
              </div>
            ))}
          </div>
        </ReportCard>
      )}
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════
 * Pieces
 * ═══════════════════════════════════════════════════════════════════════ */

const VERDICT: Record<
  ShipmentReport['status'],
  { label: string; icon: typeof CheckCircle2; solid: string }
> = {
  ontime: { label: 'On time', icon: CheckCircle2, solid: 'bg-success text-success-foreground' },
  attention: {
    label: 'Needs attention',
    icon: AlertTriangle,
    solid: 'bg-warning text-warning-foreground',
  },
  delayed: {
    label: 'Delayed',
    icon: AlertTriangle,
    solid: 'bg-destructive text-destructive-foreground',
  },
};

/**
 * One metric of the masthead. No box around it — the white half of the band is
 * already the group, and a border on every figure inside a bordered card is
 * the boxes-in-boxes the earlier passes were rejected for.
 */
function Metric({
  label,
  value,
  note,
  tone = 'neutral',
  divided = false,
  children,
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'neutral' | 'good' | 'bad';
  /** Hairline on the left — every cell but the row's first. */
  divided?: boolean;
  children?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex min-w-0 flex-col justify-center px-4 py-5 @[34rem]/report:px-5',
        divided && 'border-border/70 @[62rem]/report:border-l',
      )}
    >
      {/* Labels wrap, figures do not. A clipped label ("SLOWEST CONTAIN…") is
          a word the reader has to guess at; a clipped figure is a wrong number.
          So the label takes two lines when it needs them and the number keeps
          its ellipsis as a last resort. */}
      <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-2.5 truncate font-mono text-[26px] font-extrabold tabular-nums leading-none tracking-tight @[34rem]/report:text-[30px]',
          tone === 'bad' ? 'text-destructive' : tone === 'good' ? 'text-success' : 'text-foreground',
        )}
      >
        {value}
      </p>
      {children ??
        (note && (
          <p className="mt-2.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">{note}</p>
        ))}
    </div>
  );
}

/**
 * One pip per container, in the app's full / empty / home colours.
 *
 * The graphic this document was missing. A shipment's containers are a
 * countable handful, never a distribution, so a ring or a bar of them is a
 * chart drawn over three data points — while a row of pips says *which* boxes
 * are still loaded, which owe a return and which are home, in the same colours
 * the booking cards above the report already wear.
 */
function ContainerPips({ rows }: { rows: ShipmentReport['rows'] }) {
  const boxes = rows.filter((row) => row.state !== null);
  if (boxes.length === 0) return null;

  const shown = boxes.slice(0, 24);
  const hidden = boxes.length - shown.length;

  return (
    <div className="mt-3 flex flex-wrap items-center gap-1">
      {shown.map((row) => (
        <span
          key={row.bookingId}
          title={`${row.reference} — ${PIP_LABEL[row.state as 'full' | 'empty' | 'returned']}`}
          className={cn('h-3 w-5 rounded-sm', PIP_FILL[row.state as 'full' | 'empty' | 'returned'])}
        />
      ))}
      {hidden > 0 && (
        <span className="ml-0.5 font-mono text-[10.5px] tabular-nums text-muted-foreground">
          +{hidden}
        </span>
      )}
    </div>
  );
}

const PIP_FILL = {
  full: 'bg-primary',
  empty: 'bg-accent',
  returned: 'bg-container-returned',
} as const;

const PIP_LABEL = {
  full: 'still loaded',
  empty: 'empty, owes a return',
  returned: 'back at depot',
} as const;

/**
 * A figure on its own white cell.
 *
 * The cell is the point: on a tinted band it lifts the number off the wash,
 * and on a white card it groups four figures into one strip instead of four
 * things floating in space.
 */
function Cell({
  label,
  value,
  note,
  tone = 'neutral',
  size = 'md',
}: {
  label: string;
  value: string;
  note?: string;
  tone?: 'neutral' | 'good' | 'bad' | 'warn';
  size?: 'md' | 'sm';
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/70 bg-card px-3.5 py-3">
      <p className="text-[10px] font-bold uppercase leading-tight tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'mt-1.5 truncate font-mono font-extrabold tabular-nums leading-none tracking-tight',
          /* A step down on the narrowest screens. These cells sit two-up on a
             phone, and at 23px "17 Sep 2026" is wider than the cell — a date
             clipped to "17 Sep …" has lost the year. */
          size === 'md' ? 'text-[20px] @[34rem]/report:text-[23px]' : 'text-[16px] @[34rem]/report:text-[18px]',
          tone === 'bad'
            ? 'text-destructive'
            : tone === 'warn'
              ? 'text-accent'
              : tone === 'good'
                ? 'text-success'
                : 'text-foreground',
        )}
      >
        {value}
      </p>
      {note && (
        <p className="mt-1.5 line-clamp-2 text-[10.5px] leading-snug text-muted-foreground">{note}</p>
      )}
    </div>
  );
}

/** One of the three container states, in that state's own colour. */
function StatePanel({
  label,
  value,
  className,
}: {
  label: string;
  value: number;
  className: string;
}) {
  return (
    <div className={cn('rounded-lg border px-3.5 py-3.5', className)}>
      <p className="font-mono text-[26px] font-extrabold tabular-nums leading-none tracking-tight">
        {value}
      </p>
      <p className="mt-2 text-[10px] font-bold uppercase leading-tight tracking-[0.1em] opacity-80">
        {label}
      </p>
    </div>
  );
}

/** A tinted group: a caption, its total, and whatever the block draws. */
function Panel({
  caption,
  total,
  children,
}: {
  caption: string;
  total: string;
  children: React.ReactNode;
}) {
  return (
    <div className="min-w-0 rounded-lg border border-border/60 bg-surface-sunken p-4">
      <div className="flex items-baseline justify-between gap-3">
        <p className="text-[10px] font-bold uppercase tracking-[0.1em] text-muted-foreground">
          {caption}
        </p>
        <p className="font-mono text-[20px] font-extrabold tabular-nums leading-none text-primary-bold">
          {total}
        </p>
      </div>
      <div className="mt-3.5">{children}</div>
    </div>
  );
}

/** Name → duration → share, biggest first. The only coloured row is the lead. */
function Rows({
  rows,
  leadTone,
}: {
  rows: Array<{ key: string; label: string; value: string; share: number; lead?: boolean }>;
  leadTone: 'warn' | 'ink';
}) {
  const ranked = [...rows].sort((a, b) => b.share - a.share);
  return (
    <div className="grid min-w-0 flex-1 gap-2.5">
      {ranked.map((row) => (
        <div key={row.key} className="flex items-baseline gap-3">
          <span
            className={cn(
              'min-w-0 flex-1 truncate text-[12.5px]',
              row.lead
                ? leadTone === 'warn'
                  ? 'font-semibold text-accent'
                  : 'font-semibold text-foreground'
                : 'text-muted-foreground',
            )}
          >
            {row.label}
          </span>
          <span
            className={cn(
              'shrink-0 font-mono text-[13.5px] font-bold tabular-nums',
              row.lead && leadTone === 'warn' ? 'text-accent' : 'text-foreground',
            )}
          >
            {row.value}
          </span>
          <span className="w-9 shrink-0 text-right font-mono text-[10.5px] tabular-nums text-muted-foreground">
            {row.share > 0 && row.share < 1 ? '<1%' : `${Math.round(row.share)}%`}
          </span>
        </div>
      ))}
    </div>
  );
}

/**
 * The document's one round graphic.
 *
 * Waiting keeps the report's single orange; working stages take the brand's
 * ordinal ramp in lifecycle order, so the ring reads as a progression rather
 * than as a set of unrelated hues.
 */
function StageDonut({ stages }: { stages: ShipmentReport['stages'] }) {
  const colors = stages.map((stage, index) =>
    STAGE_VISUAL[stage.key]?.tone === 'waiting'
      ? intentColor('warning')
      : stepColor(index, stages.length),
  );

  const options: ApexOptions = useMemo(
    () =>
      donutOptions(colors, {
        labels: stages.map((stage) => stage.label),
        plotOptions: { pie: { donut: { size: '62%' } } },
        stroke: { show: true, width: 2, colors: ['var(--surface-sunken)'] },
        tooltip: { enabled: false },
      }),
    [colors, stages],
  );

  return (
    <div className="size-[104px] shrink-0">
      <ApexChart
        type="donut"
        series={stages.map((stage) => stage.totalMs)}
        options={options}
        height="100%"
      />
    </div>
  );
}
