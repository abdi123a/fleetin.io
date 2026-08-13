import { useMemo } from 'react';

import { PageHeader } from '@/components';
import { EMPTY_RETURN_HUB } from '@/data/emptyReturnData';
import { Button, Card, Checkbox, Tooltip } from '@/design-system';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  CornerDownLeft,
  Repeat,
  X,
} from '@/design-system/icons';
import {
  evaluateMission,
  formatDateTime,
  riskOf,
  selectMatchingContext,
  slackOf,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord, FullLoadMission, MissionChip } from '@/types/emptyReturn';
import { cn } from '@/utils';

import {
  CompanyName,
  DeadlineStatusLabel,
  Mono,
  PanelHeading,
  RiskBadge,
  SlackValue,
} from './components/atoms';

/**
 * Manual matching — pairing one ready empty with one open full-load mission.
 *
 * The screen is an argument laid out left to right: which empties are waiting,
 * everything known about the one you picked, and the missions that could absorb
 * it. The middle panel is deliberately the loudest object on the page, because
 * every decision made on the right is a decision about the container named
 * there — a dispatcher who loses track of *which* box they are placing has
 * already made the mistake this module exists to prevent.
 *
 * The editorial position, and the reason the six chips are not six gates: only
 * a matching Location ID and a clean exception flag disable the button. A type
 * mismatch, a missing Delivery Order, an unconfirmed booking or release, even
 * an infeasible deadline — all of them inform and none of them block. The
 * system filters and displays; Operations decides, and the preparation
 * checklist is where the missing paperwork actually stops the truck.
 */

/* ---------------------------------------------------------------------------
 * Empty selector card
 * ------------------------------------------------------------------------- */

interface EmptySelectorCardProps {
  record: EmptyReturnRecord;
  isSelected: boolean;
  now: number;
  onSelect: (recordId: string) => void;
}

/**
 * One waiting empty, as a pickable card.
 *
 * The exception line sits beside the risk pill rather than under it as a chip:
 * two chips in a 3-column card read as two states, and a flagged container has
 * exactly one — the pill still tells you how the clock is going, the red text
 * tells you matching has been called off regardless.
 */
function EmptySelectorCard({ record, isSelected, now, onSelect }: EmptySelectorCardProps) {
  return (
    <button
      type="button"
      onClick={() => onSelect(record.id)}
      aria-pressed={isSelected}
      className={cn(
        // `w-56 shrink-0` below `md`: the list is a swipe rail there, not a
        // stack. See the rail's own note on the page.
        'w-56 shrink-0 snap-start rounded-card-nested border bg-surface p-3 text-left transition-shadow md:w-full',
        'hover:shadow-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        isSelected ? 'border-primary ring-1 ring-primary' : 'border-border',
      )}
    >
      <Mono className="block type-body-sm text-foreground">{record.container}</Mono>

      <span className="mt-0.5 flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
        <span>
          {record.type} · {record.locationId} ·
        </span>
        <CompanyName name={record.transporter} tone="muted" />
      </span>

      <span className="mt-1 flex flex-wrap items-center justify-between gap-x-2 gap-y-1">
        <RiskBadge risk={riskOf(record, now)} />
        {record.exception && (
          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-destructive">
            <AlertTriangle className="h-2.5 w-2.5 shrink-0" aria-hidden />
            {record.exception}
          </span>
        )}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Selected empty — the feature panel
 * ------------------------------------------------------------------------- */

interface SelectedEmptyPanelProps {
  record: EmptyReturnRecord;
  now: number;
}

/**
 * The container under consideration, on the page's one brand slab.
 *
 * `bg-primary-bold` rather than a card: this panel has to be unmistakably the
 * subject, and the bold brand teal is the one surface role that holds the same
 * value in both themes — so the slab reads identically light and dark instead
 * of flipping with the page. Nothing here carries a semantic text colour:
 * `text-warning` is amber-500 in light mode and amber-400 in dark, so a slack
 * figure tinted by rule would be legible on exactly one of the two. The meaning
 * moves onto the risk badge beside the number, which brings its own background
 * and reads anywhere.
 */
function SelectedEmptyPanel({ record, now }: SelectedEmptyPanelProps) {
  const rows = [
    { label: 'Current location', value: `${record.locationName} (${record.locationId})` },
    { label: 'Empty ready since', value: <Mono>{formatDateTime(record.emptyReadyAt)}</Mono> },
    { label: 'Return Deadline', value: <Mono>{formatDateTime(record.deadline)}</Mono> },
    {
      label: 'Deadline verification',
      value: <DeadlineStatusLabel state={record.deadlineStatus} plain />,
    },
    { label: 'Predicted Gate-In', value: <Mono>{formatDateTime(record.predictedGateIn)}</Mono> },
    {
      label: 'Responsible transporter',
      value: <CompanyName name={record.transporter} tone="inverse" />,
    },
    { label: 'Return Hub', value: EMPTY_RETURN_HUB },
  ];

  return (
    <section className="min-w-0 self-start rounded-card bg-primary-bold p-4 text-primary-bold-foreground sm:p-5 md:col-span-8 lg:col-span-4">
      <p className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-widest text-primary-bold-foreground/75">
        <CornerDownLeft className="h-3 w-3 shrink-0" aria-hidden />
        Empty container to return
      </p>

      <Mono className="block text-2xl font-bold text-primary-bold-foreground">
        {record.container}
      </Mono>
      <p className="mb-4 type-body-sm text-primary-bold-foreground/70">
        {record.type} · {record.line}
      </p>

      <dl className="space-y-2 text-xs">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5 border-b border-primary-bold-foreground/20 pb-1.5"
          >
            <dt className="shrink-0 text-primary-bold-foreground/70">{row.label}</dt>
            {/* Flex, not a bare block: the transporter row's value is a logo +
                name pair, and only a flex item will shrink far enough to let
                that name truncate instead of running past the slab's edge. */}
            <dd className="flex min-w-0 justify-end text-right font-medium text-primary-bold-foreground">
              {row.value}
            </dd>
          </div>
        ))}
      </dl>

      <div className="mt-4 flex items-center justify-between gap-3 rounded-card-nested bg-primary-bold-foreground/15 px-3 py-2.5">
        <div className="min-w-0">
          <p className="text-[10px] uppercase tracking-wide text-primary-bold-foreground/70">
            Deadline slack
          </p>
          <SlackValue
            value={slackOf(record, now)}
            tone="plain"
            className="text-xl text-primary-bold-foreground"
          />
        </div>
        {/* Seated on an opaque surface chip, not straight onto the slab. In dark
            mode the badge's subtle fills are 14%-alpha color-mixes, so on the
            brand teal they composite against teal instead of a card and lose
            their edge. This gives them the surface they were tuned for. */}
        <span className="shrink-0 rounded-full bg-surface p-0.5">
          <RiskBadge risk={riskOf(record, now)} />
        </span>
      </div>

      <p className="mt-3 text-[10px] text-primary-bold-foreground/65">
        Rule: same transporter as the original delivery. Mission selection is manual — the system
        filters and displays, Operations decides.
      </p>
    </section>
  );
}

/* ---------------------------------------------------------------------------
 * Mission card
 * ------------------------------------------------------------------------- */

interface EligibilityChipProps {
  chip: MissionChip;
}

/** One of the six verdicts. Icon and fill carry it; three of the labels never change. */
function EligibilityChip({ chip }: EligibilityChipProps) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 text-[10px] font-semibold',
        chip.ok
          ? 'border-success/30 bg-success-subtle text-success-subtle-foreground'
          : 'border-destructive/30 bg-destructive-subtle text-destructive-subtle-foreground',
      )}
    >
      {chip.ok ? (
        <CheckCircle2 className="h-2.5 w-2.5 shrink-0" aria-hidden />
      ) : (
        <X className="h-2.5 w-2.5 shrink-0" aria-hidden />
      )}
      {chip.label}
    </span>
  );
}

interface MissionCardProps {
  mission: FullLoadMission;
  empty: EmptyReturnRecord;
  now: number;
  onCreate: (mission: FullLoadMission) => void;
}

/**
 * One open full load, with the six things worth knowing before pairing it.
 *
 * The chips are always all six and always in the same order, so the row can be
 * read as a shape rather than parsed as sentences — a dispatcher comparing four
 * missions is looking for which position went red, not for the word "Booking".
 */
function MissionCard({ mission, empty, now, onCreate }: MissionCardProps) {
  const verdict = evaluateMission(mission, empty, now);

  const createButton = (
    <Button
      size="sm"
      variant="primary"
      disabled={!verdict.eligible}
      leadingIcon={<Repeat />}
      onClick={() => onCreate(mission)}
      className="w-full sm:w-auto"
    >
      Create Cycle
    </Button>
  );

  return (
    <Card padding="md">
      {/* The button takes its own row on a phone rather than sharing the top
          line. Beside the text it claimed roughly half of a 320px card and left
          the mission's own identity — container, line, client, destination —
          wrapping four words at a time down the other half. */}
      <div className="flex flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-start sm:justify-between">
        <div className="min-w-0 sm:flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <Mono className="type-body-sm text-foreground">{mission.container}</Mono>
            <span className="type-body-xs text-muted-foreground">
              {mission.type} · {mission.line} · <Mono>{mission.id}</Mono>
            </span>
          </div>

          <div className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 type-body-xs">
            <CompanyName name={mission.client} tone="strong" />
            <span className="text-muted-foreground">
              → {mission.locationName} ({mission.locationId})
            </span>
          </div>

          <p className="mt-0.5 text-[11px] text-muted-foreground">
            Pickup: {formatDateTime(mission.pickupAt)} · window {mission.window} ·{' '}
            {mission.pickupHub}
          </p>
        </div>

        {/* The tooltip needs a wrapper: a disabled button emits no pointer events of its own. */}
        {verdict.blockedReason ? (
          <Tooltip content={verdict.blockedReason}>
            <span className="w-full sm:w-auto sm:shrink-0">{createButton}</span>
          </Tooltip>
        ) : (
          <span className="w-full sm:w-auto sm:shrink-0">{createButton}</span>
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-1.5">
        {verdict.chips.map((chip) => (
          <EligibilityChip key={chip.id} chip={chip} />
        ))}
      </div>

      {verdict.showDocumentsNote && (
        <p className="mt-2 rounded-sm border border-warning/30 bg-warning-subtle px-2 py-1 text-[11px] text-warning-subtle-foreground">
          Selection possible — the missing documents will block the move to &quot;Ready to
          Dispatch&quot; via the checklist.
        </p>
      )}
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * Page
 * ------------------------------------------------------------------------- */

export interface EmptyReturnMatchingPageProps {
  /**
   * Where a freshly created cycle hands off to — the Cycles view.
   *
   * The store has already consumed the mission, cleared the filters, opened the
   * new row and fired the toast by the time this runs, so the host only has to
   * change the view. Left as a prop because this file does not own routing:
   * pass `() => navigate(ROUTES.emptyReturnsCycles)` from the route host, or
   * `() => setView('cycles')` if the module ends up on in-page tabs.
   */
  onCycleCreated?: (recordId: string) => void;
}

export function EmptyReturnMatchingPage({ onCycleCreated }: EmptyReturnMatchingPageProps) {
  const records = useEmptyReturnStore((state) => state.records);
  const missions = useEmptyReturnStore((state) => state.missions);
  const matchSelectionId = useEmptyReturnStore((state) => state.matchSelectionId);
  const sameLocationOnly = useEmptyReturnStore((state) => state.sameLocationOnly);
  const now = useEmptyReturnStore((state) => state.now);
  const setMatchSelection = useEmptyReturnStore((state) => state.setMatchSelection);
  const setSameLocationOnly = useEmptyReturnStore((state) => state.setSameLocationOnly);
  const createCycle = useEmptyReturnStore((state) => state.createCycle);

  const { eligible, selected, candidates } = useMemo(
    () => selectMatchingContext(records, missions, matchSelectionId, sameLocationOnly),
    [records, missions, matchSelectionId, sameLocationOnly],
  );

  const handleCreate = (mission: FullLoadMission) => {
    if (!selected) return;
    if (createCycle(selected.id, mission)) {
      onCycleCreated?.(selected.id);
    }
  };

  return (
    <div className="space-y-5 pb-12">
      <PageHeader
        title="Empty Return Matching"
        description="Pair a ready empty container with an open full load mission at the same location. The system filters and displays — Operations decides."
      />

      {/* Twelve columns from `md`, not `lg`.
          The three panels are a left-to-right argument — what is waiting, what
          you picked, what could take it — and a tablet has the width to hold at
          least the first two of those side by side. Stacking everything until
          1024px put the picked container a full screen above the missions being
          judged against it, which is exactly the connection the layout is for. */}
      <div className="grid gap-5 md:grid-cols-12">
        {/* ── Empties waiting ──
            `min-w-0` is load-bearing, not defensive: a grid item defaults to
            `min-width: auto`, so the scroll rail below would size its track to
            all three cards laid end to end and push the column past the
            viewport instead of scrolling inside it. */}
        <div className="min-w-0 md:col-span-4 lg:col-span-3">
          <PanelHeading level={2} className="mb-2">
            Empty Ready ({eligible.length})
          </PanelHeading>

          {eligible.length === 0 ? (
            <Card padding="sm">
              <p className="type-body-sm text-muted-foreground">
                No empty ready. Confirm an unloading in the Cycles view.
              </p>
            </Card>
          ) : (
            /* A swipe rail on a phone, a column from `md`.
               Stacked full-width, every extra empty pushed the selected panel
               and the missions further down — on a busy morning the operator
               scrolled past the entire queue to reach the decision. Sideways,
               the queue costs one row of height however long it gets, and the
               panel it feeds stays on screen. */
            <div className="flex snap-x snap-proximity gap-2 overflow-x-auto pb-2 md:flex-col md:overflow-visible md:pb-0">
              {eligible.map((record) => (
                <EmptySelectorCard
                  key={record.id}
                  record={record}
                  isSelected={selected?.id === record.id}
                  now={now}
                  onSelect={setMatchSelection}
                />
              ))}
            </div>
          )}
        </div>

        {selected && (
          <>
            <SelectedEmptyPanel record={selected} now={now} />

            {/* ── Missions that could absorb it ── */}
            <div className="min-w-0 space-y-3 md:col-span-12 lg:col-span-5">
              <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
                <PanelHeading
                  level={2}
                  icon={<ArrowRight className="h-3 w-3 shrink-0" aria-hidden />}
                >
                  Open Full Load Missions ({candidates.length})
                </PanelHeading>

                <Checkbox
                  id="empty-return-same-location-only"
                  checkboxSize="sm"
                  label="Same Location ID only"
                  checked={sameLocationOnly}
                  onChange={(event) => setSameLocationOnly(event.target.checked)}
                />
              </div>

              {candidates.length === 0 ? (
                <Card padding="md">
                  <p className="type-body-sm text-muted-foreground">
                    No compatible mission. Keep searching until the safety cutoff, then trigger a
                    standalone return.
                  </p>
                </Card>
              ) : (
                candidates.map((mission) => (
                  <MissionCard
                    key={mission.id}
                    mission={mission}
                    empty={selected}
                    now={now}
                    onCreate={handleCreate}
                  />
                ))
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

export default EmptyReturnMatchingPage;
