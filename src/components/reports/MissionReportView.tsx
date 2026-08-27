import { Fragment, useMemo } from 'react';
import type { ComponentType } from 'react';
import {
  ClipboardList,
  ArrowLeftRight,
  ChevronDown,
  ChevronRight,
  ContainerIcon,
  FileText,
  MapPin,
  Package,
  PackageOpen,
  PackageSearch,
  Route,
  RotateCcw,
  Truck,
  Hourglass,
  UserCheck,
  Warehouse,
} from '@/design-system/icons';
import { Badge, Card, CompanyAvatar, IconChip, type IconChipTint } from '@/design-system';
import {
  CONTAINER_OUTCOME_LABEL,
  CONTAINER_STAGE_META,
  RETURN_RISK_META,
} from '@/data/emptyReturnData';
import { useCompanyLogo } from '@/features/companies/companyLogos';
import { formatDate } from '@/utils';
import { cn } from '@/utils';
import { DELAY_REASON_LABELS, RESPONSIBLE_PARTY_LABELS } from './delayVocabulary';
import type { JourneyStepKey } from './missionLifecycle';
import type { MissionReport } from './missionReport';
import { DAY, formatDuration } from './reportFormat';
import {
  ReturnSpanBar,
  JourneyRail,
  ReportCard,
  ReportEmpty,
  ReportEyebrow,
  ReportStat,
  ReportStatusBadge,
  TimeDonut,
  TimeLegend,
  formatShare,
  type JourneyHue,
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

  /* The custody rollup, ready for the ring: one arc per party, in the order
     the mission passed through their hands. Party is identity, not status, so
     every arc takes the teal ramp — `TimeDonut` spreads it across however many
     hands were involved. */
  const custody = report.custody;
  const segments = useMemo<RibbonSegment[]>(
    () =>
      [...custody.segments]
        /* Ranked, biggest holder first — the question is "who had it most". */
        .sort((a, b) => b.ms - a.ms)
        .map((segment, index) => ({
          key: segment.party,
          label: segment.label,
          share: segment.share,
          value: formatDuration(segment.ms, { compact: segment.ms >= DAY }),
          tone: 'active' as const,
          step: Math.min(index + 1, 5) as 1 | 2 | 3 | 4 | 5,
          isLongest: segment.isLongest,
        })),
    [custody.segments],
  );

  const lead = custody.segments.find((segment) => segment.isLongest) ?? null;


  return (
    /* `grid-cols-1`, not a bare `grid`: an implicit track is `auto`, which
       sizes to MAX-content, and grid items default to `min-width: auto` — so a
       single `truncate` line (the route, which is `whitespace-nowrap`) stretched
       the whole report to 811px inside a 343px phone. Tailwind's `grid-cols-1`
       is `minmax(0, 1fr)`, which is the cap that was missing. */
    <div className={cn('grid grid-cols-1 gap-3', className)}>
      {/* ══ 1. The verdict ══════════════════════════════════════════════
          Two sections, and every fact on them appears exactly once on this
          page. What used to be here — a rail of three timestamps and a
          four-clause summary sentence — was, line for line, a restatement of
          blocks further down: the dates are steps of the journey, the free-time
          margin and the detention are the container card, the gate waiting is
          the custody card. A masthead that repeats the document under it makes
          the reader check whether the two agree instead of reading either. */}
      <Card className="report-block space-y-4 rounded-lg border border-border/80 bg-card p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
          <div className="flex min-w-0 items-start gap-3">
            <IconChip icon={FileText} tint={VERDICT_TINT[report.status]} size={44} />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                {/* Kept, though the letterhead prints it too: it is the
                    document's subject line, and a report you cannot name is not
                    a report. Everything else the letterhead already carries —
                    the title, the shipper, the container number — is gone from
                    here. */}
                <span className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
                  Booking
                </span>
                <h3 className="font-mono text-2xl font-bold leading-none tracking-tight text-foreground sm:text-[28px]">
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
              {/* The lane. On screen the shipment band above says it too, but
                  that band is chrome and does not print — on paper this is the
                  only place the route appears. */}
              <p className="mt-1.5 flex items-center gap-1.5 text-[12px] text-muted-foreground">
                <Route className="size-3.5 shrink-0" aria-hidden />
                <span className="truncate">
                  {overview.pickup} → {overview.dropoff}
                </span>
              </p>
            </div>
          </div>

          {/* The one figure this card exists to give, and the only one on the
              page that is not derived from a block below it. Brand teal
              whatever the verdict — the disc opposite is what changes colour. */}
          <div className="shrink-0">
            <p className="text-[10px] font-semibold uppercase tracking-[0.11em] text-muted-foreground">
              {kpis.totalMs !== null ? 'Total mission time' : 'Running for'}
            </p>
            <p className="mt-1 font-mono text-[30px] font-extrabold tabular-nums leading-none tracking-tight text-primary-bold sm:text-[34px]">
              {formatDuration(kpis.totalMs ?? kpis.elapsedMs, { compact: true })}
            </p>
          </div>
        </div>

        {/*
         * Who moved it, and in what. One strip, four facts, no tiles.
         *
         * This was three bordered cards carrying nine lines between them —
         * company, contact, container number, type, line, cargo, plate, truck
         * type, driver — for a block whose only job is to say which parties are
         * on this booking. The contacts are gone (a person's name is not what
         * identifies a shipper on a report), the container is one item rather
         * than a third of the row, and only the two companies carry a mark,
         * which is what makes them read as the parties and the rest as detail.
         */}
        <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-t border-border/60 pt-4">
          <PartyName label="Shipper" name={overview.shipperName} />
          <PartyName label="Transporter" name={overview.transporter} />
          <IdentityFact label="Vehicle" value={overview.vehiclePlate} mono />
          <IdentityFact
            label="Container"
            value={[overview.containerType, overview.shippingLine, goodsOf(overview.cargo)]
              .filter(Boolean)
              .join(' · ')}
          />
        </div>
      </Card>

      {/* ══ 2. Whose clock was running ═══════════════════════════════════
          Deliberately NOT a second reading of the journey. The journey below
          walks the mission in order and prints the gap into every step; this
          card throws the order away and adds the gaps up by party, so the
          question it answers — who was holding this mission, and for how long —
          is one no other block on the page answers. It is also the only picture
          here whose parts sum to the whole mission: the §4 interval list can
          measure two minutes of a twenty-hour run and call it 100% active. */}
      {custody.segments.length > 0 && (
        <ReportCard
          icon={Hourglass}
          title="Who Held the Clock"
          subtitle="the whole mission added up by whose hands it was in · the journey below says when, this says who"
        >
          <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
            {/* `reverse`: these arcs are ranked, not sequenced — the party that
                held the mission longest leads the list and takes the deepest
                teal, rather than the palest rung a lifecycle order would give
                whoever happened to touch it first. */}
            <TimeDonut
              segments={segments}
              rampDirection="reverse"
              centerValue={lead ? formatShare(lead.share) : '—'}
              centerLabel={lead ? lead.label : 'Unmeasured'}
              centerCaption={`of ${formatDuration(custody.totalMs, { compact: true })} recorded`}
            />
            <TimeLegend segments={segments} rampDirection="reverse" />
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border/60 pt-3.5 sm:grid-cols-4">
            <ReportStat
              label="Longest single hold"
              value={custody.longest ? formatDuration(custody.longest.ms, { compact: true }) : '—'}
              caption={
                custody.longest
                  ? `${custody.longest.partyLabel.toLowerCase()} · ${custody.longest.label.toLowerCase()}`
                  : 'no interval measured'
              }
            />
            <ReportStat
              label="Handovers"
              value={String(custody.handovers)}
              caption={custody.chain.join(' → ').toLowerCase()}
            />
            <ReportStat
              label="Waiting at the gates"
              value={formatDuration(kpis.waitTotalMs, { compact: true })}
              caption="nobody working, clock running"
              tone={(kpis.waitTotalMs ?? 0) > 0 ? 'accent' : 'neutral'}
            />
            <ReportStat
              label="Dépotage (client)"
              value={formatDuration(kpis.depotageMs, { compact: true })}
              caption="delivered → empty ready"
            />
          </div>

        </ReportCard>
      )}

      {/* ══ 3. The journey ══════════════════════════════════════════════ */}
      <ReportCard
        icon={Route}
        title="The Journey"
        subtitle="the steps this shipment actually recorded · each link carries the gap into the step below it"
        right={
          <Badge
            variant="outline"
            intent="default"
            size="sm"
            className="uppercase tracking-[0.08em]"
          >
            {report.journeyProgress.recorded} of {report.journeyProgress.total} steps
          </Badge>
        }
      >
        <JourneyBlock report={report} />
      </ReportCard>

      {/* ══ 4. The container ════════════════════════════════════════════
          Read in Empty Container Management's own vocabulary, not a second one
          invented for print: the stage rail, the outcome word and the risk chip
          are the module's, so a box that reads "Paired · Deadline Protected" on
          the Control Tower reads exactly that here. The rail branches where the
          module branches — pairing is terminal and drives no empty trip, so a
          paired box has no "back at depot" rung to be missing. */}
      {ret.hasContainer && (
        <ReportCard
          icon={ContainerIcon}
          title="Empty Container Return"
          subtitle={
            [
              ret.cycleReference ? `Cycle ${ret.cycleReference}` : 'No return cycle opened yet',
              ret.depot,
            ]
              .filter(Boolean)
              .join(' · ')
          }
          right={<ReturnStatusChips ret={ret} />}
        >
          {/* The brand tint, not the neutral wash: this panel is the answer to
              the question that costs money — did we burn the free days — and on
              a card of grey-on-white blocks it was the quietest thing on the
              page. */}
          <div className="space-y-4 rounded-lg border border-primary/25 bg-primary-subtle p-4">
            <ReturnStageRail ret={ret} />
            <div className="border-t border-border/60 pt-3.5">
              <ContainerTrack report={report} />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-x-5 gap-y-3 border-t border-border/60 pt-3.5">
            <ReportStat
              label="Detention"
              value={
                ret.detention
                  ? `${ret.detentionFees.toLocaleString()} ${ret.detentionCurrency}`
                  : 'None'
              }
              caption={
                ret.detention
                  ? `${ret.detentionDays} day${ret.detentionDays === 1 ? '' : 's'} × ${ret.detentionRatePerDay} ${ret.detentionCurrency}`
                  : 'no fees incurred'
              }
              tone={ret.detention ? 'bad' : 'good'}
            />
            <ReportStat
              label="Return deadline"
              value={ret.deadlineAt ? formatDate(ret.deadlineAt, 'date') : 'None set'}
              caption={
                ret.deadlineAt
                  ? `${formatDate(ret.deadlineAt, 'time')}${ret.freeDays ? ` · ${ret.freeDays} free days` : ''}`
                  : 'the line set no free time'
              }
            />
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
/**
 * What is in the box, without the category in front of it.
 *
 * `cargoType` is stored as "<category> — <goods>" ("Container 40ft — Textiles",
 * "Bulk — Fertilizer"), and the category is already the Container item's own
 * first segment — printed whole it read "40' Container · OOCL · Container 40ft
 * — Textiles".
 */
function goodsOf(cargo: string): string {
  const goods = cargo.split(' — ').pop()?.trim();
  return goods && goods !== cargo.trim() ? goods : cargo;
}

/** A named party: its own mark, then its name. Nothing else — the contact
    behind a company is not what identifies it on a report. */
function PartyName({ label, name }: { label: string; name: string }) {
  return (
    <div className="flex min-w-0 items-center gap-2.5">
      <CompanyDisc name={name} />
      <div className="min-w-0">
        <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-[12.5px] font-bold leading-tight text-foreground">{name}</p>
      </div>
    </div>
  );
}

/** A labelled fact with no mark — deliberately quieter than a party. */
function IdentityFact({
  label,
  value,
  mono = false,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div className="min-w-0">
      <p className="text-[9px] font-semibold uppercase tracking-[0.1em] text-muted-foreground">
        {label}
      </p>
      <p
        className={cn(
          'truncate text-[12.5px] font-semibold leading-tight text-foreground',
          mono && 'font-mono tabular-nums',
        )}
      >
        {value}
      </p>
    </div>
  );
}

/**
 * The outcome, as a colour on the card's opening disc.
 *
 * Deliberately the `IconChip` tints and nothing new: the app has one disc
 * vocabulary and adding a green to it here would make this card the only place
 * in Fleetin that owns a colour. An on-time mission therefore opens in the
 * brand teal — the working colour, the ordinary result — while the three
 * outcomes that want a person take amber, red and blue.
 */
const VERDICT_TINT: Record<MissionReport['status'], IconChipTint> = {
  ontime: 'teal',
  attention: 'amber',
  delayed: 'red',
};

/** Two letters, from the first two words that have any — "Bab el Mandeb
    Logistics FZE" is BM, not B. */
function companyInitials(name: string): string {
  const words = name.split(/[\s-]+/).filter((word) => /[a-z0-9]/i.test(word));
  return (words.slice(0, 2).map((word) => word[0]).join('') || '?').toUpperCase();
}

/**
 * A company's own mark, at the same 36px as the icon disc beside it.
 *
 * The report is read by the shipper it is about, and they know their carrier
 * by the logo that is on every booking screen long before they finish reading
 * "Nagad Transit SARL". The registry is filled from the real `/shippers` and
 * `/partners` responses, so a logo uploaded through the app appears here with
 * no work; a company with nothing on file falls back to its initials rather
 * than to an empty circle.
 */
function CompanyDisc({ name }: { name: string }) {
  const logo = useCompanyLogo(name);
  return (
    <CompanyAvatar
      src={logo}
      name={name}
      fallback={companyInitials(name)}
      size="md"
      shape="circle"
      className="shrink-0"
    />
  );
}

/**
 * One mark per step.
 *
 * The shape carries the meaning so the rail can be read before the labels are:
 * a clipboard is paperwork, a box is cargo being handled, a truck is something
 * moving, a warehouse is the box home.
 */
const JOURNEY_ICON: Record<JourneyStepKey, ComponentType<{ className?: string }>> = {
  created: ClipboardList,
  picked_up: Package,
  delivered: MapPin,
  depotage: PackageSearch,
  empty_ready: ContainerIcon,
  empty_picked_up: Truck,
  empty_returned: Warehouse,
};

/** Position in the ladder → journey hue. Fixed per step, not per mission, so the
    same step is the same colour on every report a shipper reads. */
const JOURNEY_HUE: Record<JourneyStepKey, JourneyHue> = {
  created: 1,
  picked_up: 2,
  delivered: 3,
  depotage: 4,
  empty_ready: 5,
  empty_picked_up: 6,
  empty_returned: 7,
};

/**
 * The journey, drawn.
 *
 * A date is repeated only when the day changes — a single-day leg reads as bare
 * times, which is how the specification's own example prints it.
 */
function JourneyBlock({ report }: { report: MissionReport }) {
  const rows = report.journey;

  if (rows.length === 0) {
    return (
      <ReportEmpty>
        Nothing has been recorded against this mission yet — the journey starts at the first
        status an operator reports.
      </ReportEmpty>
    );
  }

  /* The denominator of every share: the whole run from the first recorded step
     to the last, not the sum of the KPI intervals. */
  const first = rows[0];
  const last = rows[rows.length - 1];
  const spanMs = first && last ? last.at - first.at : 0;

  /* Where the container stands right now — the last step reported, and only
     while there is still a "now" to point at. A closed mission has no current
     stage (the box is home), and a cancelled one never will. */
  const currentIndex =
    report.isClosed || report.overview.isTerminated ? -1 : rows.length - 1;

  const railRows = rows.map((row, index) => {
    const previous = rows[index - 1];
    const sameDay =
      previous !== undefined &&
      new Date(row.at).toDateString() === new Date(previous.at).toDateString();

    return {
      key: row.key,
      label: row.label,
      caption: row.caption,
      responsible: row.responsible,
      icon: JOURNEY_ICON[row.key],
      hue: JOURNEY_HUE[row.key],
      at: formatDate(row.at, sameDay ? 'time' : 'dateTime'),
      duration: row.durationMs === null ? null : formatDuration(row.durationMs, { compact: true }),
      intervalLabel: row.intervalLabel,
      sharePct:
        row.durationMs === null || spanMs <= 0 ? null : (row.durationMs / spanMs) * 100,
      isLongest: row.isLongest,
      isCurrent: index === currentIndex,
    };
  });

  return <JourneyRail rows={railRows} />;
}

/** Free time drawn against the deadline, with the margin named on the bar. */
/**
 * The module's own two chips: what the box is, and how the deadline stands.
 *
 * Both strings come from `emptyReturnData` rather than from anything written
 * here, so the report cannot drift from the Control Tower. The overdue chip's
 * pulse is dropped — a report is read on paper as often as on screen, and an
 * animation is either invisible or noise there.
 */
function ReturnStatusChips({ ret }: { ret: MissionReport['containerReturn'] }) {
  const stageLabel = ret.outcome
    ? CONTAINER_OUTCOME_LABEL[ret.outcome]
    : ret.stage
      ? CONTAINER_STAGE_META[ret.stage].label
      : 'Not emptied yet';
  const risk = ret.risk ? RETURN_RISK_META[ret.risk] : null;

  return (
    <div className="flex shrink-0 items-center gap-1.5">
      <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-2.5 py-0.5 text-2xs font-bold uppercase tracking-[0.07em] text-foreground">
        <span
          aria-hidden
          className={cn(
            'size-1.5 rounded-full',
            ret.stage ? CONTAINER_STAGE_META[ret.stage].dotClassName : 'bg-border-strong',
          )}
        />
        {stageLabel}
      </span>
      {risk && (
        <span
          className={cn(
            'rounded-full border px-2.5 py-0.5 text-2xs font-bold uppercase tracking-[0.07em]',
            risk.className.replace(' animate-pulse motion-reduce:animate-none', ''),
          )}
        >
          {risk.label}
        </span>
      )}
    </div>
  );
}

/**
 * Where the box got to, on the module's own rungs.
 *
 * Deliberately not four dots in a row. `paired` and `return_planned` are two
 * *branches* of one decision, not two steps of one sequence — a paired empty
 * leaves under someone else's full load and is finished, with no return trip to
 * drive and therefore no "back at depot" rung it could be missing. So the rail
 * is: the box came empty, a decision was taken, and — on the return branch only
 * — it landed. Three rungs at most, which is also as many as fit a phone.
 *
 * Drawn as a true stepper: dots sit at the ends and evenly between, connectors
 * fill the gaps, and each rung's text takes an equal column aligned to its own
 * dot — left, centre, right. Laying it out as "dot then line, per column" put
 * the last dot two thirds of the way across with a column of white beside it,
 * which read as a rail that had been cut short rather than one that had ended.
 */
function ReturnStageRail({ ret }: { ret: MissionReport['containerReturn'] }) {
  const paired = ret.stage === 'paired' || ret.outcome === 'paired';
  const decided = ret.stage === 'return_planned' || ret.stage === 'closed';

  const rungs: Array<{
    key: string;
    label: string;
    caption: string;
    icon: ComponentType<{ className?: string }>;
    dot: string;
    reached: boolean;
  }> = [
    {
      key: 'empty',
      label: CONTAINER_STAGE_META.empty.label,
      caption: ret.emptyReadyAt ? formatDate(ret.emptyReadyAt, 'dateTime') : 'box not stripped yet',
      icon: PackageOpen,
      dot: CONTAINER_STAGE_META.empty.dotClassName,
      reached: ret.emptyReadyAt !== null,
    },
    paired
      ? {
          key: 'paired',
          label: CONTAINER_STAGE_META.paired.label,
          caption: ret.pairedWith
            ? `onto ${ret.pairedWith.container || ret.pairedWith.reference}`
            : 'reused under another full load',
          /* The module's own pairing mark: two containers swapping legs, never
             one becoming the other. */
          icon: ArrowLeftRight,
          dot: CONTAINER_STAGE_META.paired.dotClassName,
          reached: true,
        }
      : {
          key: 'return_planned',
          label: CONTAINER_STAGE_META.return_planned.label,
          /* Repeating the depot from the card's own subtitle told a reader
             nothing they had not read two lines above. Undecided says so. */
          caption: decided ? (ret.depot ? `to ${ret.depot}` : 'depot not named') : 'not decided yet',
          icon: RotateCcw,
          dot: CONTAINER_STAGE_META.return_planned.dotClassName,
          reached: decided,
        },
  ];

  if (!paired) {
    rungs.push({
      key: 'closed',
      label: 'Back at Depot',
      caption: ret.returnedAt ? formatDate(ret.returnedAt, 'dateTime') : 'still out',
      icon: Warehouse,
      /* The module paints a closed chip grey, which is right for a chip and
         wrong for the last rung of a rail — grey on a rung reads "not reached".
         The outcome already says how it finished, so it colours the mark. */
      dot:
        ret.outcome === 'returned_late' ? 'bg-destructive' : CONTAINER_STAGE_META.closed.dotClassName,
      reached: ret.returnedAt !== null,
    });
  }

  const align = (index: number) =>
    index === 0 ? 'text-left' : index === rungs.length - 1 ? 'text-right' : 'text-center';

  /* A mark, not a dot. Every other rail on this report — the journey above,
     the milestone strip in the header — carries an icon chip, and three bare
     circles beside them read as a placeholder someone forgot to finish. */
  const Mark = ({ rung }: { rung: (typeof rungs)[number] }) => (
    <span
      className={cn(
        'grid size-7 shrink-0 place-items-center rounded-full [&_svg]:size-3.5',
        rung.reached
          ? cn(rung.dot, 'text-white')
          : 'border-2 border-dashed border-border-strong bg-card text-muted-foreground',
      )}
    >
      <rung.icon />
    </span>
  );

  return (
    <>
      {/* Phone: a vertical spine. Three columns of a horizontal stepper come
          out about 75px wide inside a card inside a panel, which is not enough
          for "Return Planned" and a timestamp under it. */}
      <ol className="sm:hidden">
        {rungs.map((rung, index) => (
          <li key={rung.key} className="flex gap-2.5">
            <div className="flex flex-col items-center self-stretch" aria-hidden>
              <Mark rung={rung} />
              {index < rungs.length - 1 && (
                <span className="my-1 flex flex-1 flex-col items-center">
                  <span
                    className={cn(
                      'w-0.5 flex-1 rounded-full',
                      rungs[index + 1]?.reached ? 'bg-primary' : 'bg-border',
                    )}
                  />
                  <ChevronDown
                    className={cn(
                      '-mt-1.5 size-4 shrink-0',
                      rungs[index + 1]?.reached ? 'text-primary' : 'text-border-strong',
                    )}
                    aria-hidden
                  />
                </span>
              )}
            </div>
            <div className={cn('min-w-0 flex-1 pt-1', index < rungs.length - 1 && 'pb-3')}>
              <p
                className={cn(
                  'text-[11px] font-bold uppercase leading-tight tracking-[0.06em]',
                  rung.reached ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {rung.label}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {rung.caption}
              </p>
            </div>
          </li>
        ))}
      </ol>

      {/* Anything wider: a true stepper — dots at the ends and evenly between,
          connectors filling the gaps, each rung's text in an equal column
          aligned to its own dot. Laying it out as "dot then line, per column"
          put the last dot two thirds of the way across with a column of white
          beside it, which read as a rail cut short rather than one that ended. */}
      <div className="hidden sm:block">
        <div className="flex items-center" aria-hidden>
          {rungs.map((rung, index) => (
            <Fragment key={rung.key}>
              {index > 0 && (
                /* A bare rule between two marks reads as a divider — something
                   separating them — which is the opposite of what it means. The
                   arrowhead makes it a direction: this became that. */
                <span className="mx-1 flex min-w-0 flex-1 items-center">
                  <span
                    className={cn(
                      'h-0.5 min-w-0 flex-1 rounded-full',
                      rung.reached ? 'bg-primary' : 'bg-border',
                    )}
                  />
                  <ChevronRight
                    className={cn(
                      '-ml-1.5 size-4 shrink-0',
                      rung.reached ? 'text-primary' : 'text-border-strong',
                    )}
                    aria-hidden
                  />
                </span>
              )}
              <Mark rung={rung} />
            </Fragment>
          ))}
        </div>

        <ol className="mt-2 flex">
          {rungs.map((rung, index) => (
            <li key={rung.key} className={cn('min-w-0 flex-1', align(index))}>
              <p
                className={cn(
                  'text-[11px] font-bold uppercase leading-tight tracking-[0.06em]',
                  rung.reached ? 'text-foreground' : 'text-muted-foreground',
                )}
              >
                {rung.label}
              </p>
              <p className="mt-0.5 truncate font-mono text-[11px] text-muted-foreground">
                {rung.caption}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </>
  );
}

function ContainerTrack({ report }: { report: MissionReport }) {
  const ret = report.containerReturn;
  /* The span starts the day the shipment became somebody's job, not the day it
     was delivered. Free time formally starts at delivery — which is correct and
     useless on its own: measured that way the picture left out every day the
     shipment spent reaching the consignee, which is most of the run. */
  const startAt = report.overview.missionStartAt;

  // Without both ends there is no scale to draw — say so rather than draw a lie.
  if (startAt === null || ret.deadlineAt === null) {
    return (
      <div className="flex items-center rounded-lg border border-dashed border-border bg-card p-3.5">
        <ReportEmpty>
          {ret.deadlineAt === null
            ? 'The shipping line set no return deadline for this container, so there is no window to measure the run against.'
            : 'This mission has no recorded start, so there is no span to measure.'}
        </ReportEmpty>
      </div>
    );
  }

  const endAt = ret.returnedAt ?? Date.now();

  /* A sentence only where there is something the picture cannot say. The bar
     already reads "used 20h 09m · saved 6d 1h"; a box still out past its
     deadline is the case that needs the rate spelled out, because the figure on
     screen is still growing. */
  const caption =
    ret.returnedAt === null && endAt > ret.deadlineAt
      ? `Still accruing at ${ret.detentionRatePerDay} ${ret.detentionCurrency} per container-day until the box is back.`
      : undefined;

  return (
    <ReturnSpanBar
      startAt={startAt}
      endAt={endAt}
      deadlineAt={ret.deadlineAt}
      settled={ret.returnedAt !== null}
      detentionDays={ret.detentionDays}
      startLabel={`Created ${formatDate(startAt, 'dateTime')}`}
      endLabel={`Deadline ${formatDate(ret.deadlineAt, 'dateTime')}`}
      caption={caption}
    />
  );
}
