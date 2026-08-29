import { useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ROUTES } from '@/config/routes';

import { Button, Card, EmptyState, Input } from '@/design-system';
import { PackageOpen, Search, X } from '@/design-system/icons';
import { detentionFor, formatDetention } from '@/data/emptyReturnData';
import { useEmptyContainers } from '@/features/empty-returns';
import {
  isAccruingDetention,
  riskOf,
  selectFilteredRecords,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnFilters, EmptyReturnRecord, ReturnRiskLevel } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { ContainerQueueTable } from './components/ContainerQueueTable';
import { Mono } from './components/marks';

/**
 * Control Tower — *what needs my attention now?*
 *
 * The module's home, and the only view that asks anything of the operator.
 *
 * ## Built out of the app, not beside it
 *
 * Four `StatisticCard`s and a stack of row cards — the same two components the
 * Shipments directory is made of. An earlier pass hand-rolled its own KPI tiles
 * (including a solid-red one the house palette does not have) and a nine-column
 * table, and the page read as something imported from another product. Nothing
 * else in Fleetin is a table; the list idiom here is a card, and cards stack,
 * which is also what makes this work on a phone.
 *
 * ## The page in three moves
 *
 * **Four tiles.** How bad is the morning, readable at a glance. Each is a
 * filter, so a figure and the list it opens cannot disagree.
 *
 * **One toolbar.** Search and the two selects, with an explicit way back out.
 *
 * **Four bands, each paged.** Grouping by urgency is the editorial stance —
 * "act now" and "fine for a week" are different jobs and should not be sorted
 * into one list. The bands carry no explanatory line and the page carries no
 * legend: the band names and the RISK column already say what they say, and
 * spelling both out again cost the page a paragraph.
 *
 * Nothing was dropped along the way: every fact the old nine-column table
 * carried is on the card, and the rest is in the container's own dialog, one
 * click away.
 */

const ALL_FILTERS: EmptyReturnFilters = { q: '', stage: 'all', risk: 'all' };

export function ControlTowerPage() {
  const { records, now, isLoading } = useEmptyContainers();
  const filters = useEmptyReturnStore((state) => state.filters);
  const setFilters = useEmptyReturnStore((state) => state.setFilters);
  const applyFilterPreset = useEmptyReturnStore((state) => state.applyFilterPreset);
  const openRecord = useEmptyReturnStore((state) => state.openRecord);
  const selectEmpty = useEmptyReturnStore((state) => state.selectEmpty);

  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  /* `?match=…` is a legacy deep link from when matching was a popup. Matching
     is a page now (2026-08-29), so the parameter selects the container and
     forwards there rather than opening anything in place. */
  useEffect(() => {
    const value = searchParams.get('match');
    if (!value) return;
    if (value !== '1') selectEmpty(value);
    navigate(ROUTES.emptyReturnsMatching, { replace: true });
  }, [searchParams, navigate, selectEmpty]);

  /**
   * A row's "Find full load" / "Plan return" goes straight to the matching
   * popup, focused on the booking that was clicked — the operator asked about
   * *that* container, not the backlog. Everything else still opens the
   * container's own dialog.
   */
  const handleRowOpen = useCallback(
    (recordId: string, intent?: 'detail' | 'select' | 'return') => {
      if (intent === 'select' || intent === 'return') {
        /* Both branches land on the Matching page with this container
           selected — one decision surface, per the 2026-08-29 rule. */
        selectEmpty(recordId);
        navigate(
          intent === 'return'
            ? `${ROUTES.emptyReturnsMatching}?plan=${recordId}`
            : ROUTES.emptyReturnsMatching,
        );
        return;
      }
      openRecord(recordId, intent);
    },
    [openRecord, selectEmpty, navigate],
  );

  /* The calendar lives here now rather than in the sidebar. It answers "what
     happens next" about the same book of containers this page decides on, and
     splitting the two across the module's navigation made an operator leave
     the page to check a date and come back to a lost filter. */

  const filtered = useMemo(
    () => selectFilteredRecords(records, filters, now),
    [records, filters, now],
  );

  /* Open containers only. The Control Tower answers "what needs my attention
     now", and a closed cycle needs none — its history lives on the container's
     own dialog and in Cycles. The Closed band was removed on 2026-08-29. */
  const groups = useMemo(() => {
    const open = filtered.filter((record) => record.stage !== 'closed');
    return {
      action: open.filter((record) => {
        const risk = riskOf(record, now);
        return risk === 'overdue' || risk === 'critical';
      }),
      monitor: open.filter((record) => riskOf(record, now) === 'watch'),
      onTrack: open.filter((record) => {
        const risk = riskOf(record, now);
        return risk === 'safe' || risk === 'protected' || risk === null;
      }),
    };
  }, [filtered, now]);

  /* Counted off the whole book, never off the filtered view — a tile that
     restated the count of the filter it had just applied would only ever print
     the number the operator is already looking at. */
  const counts = useMemo(() => {
    const open = records.filter((record) => record.stage !== 'closed');
    const by = (level: ReturnRiskLevel) =>
      open.filter((record) => riskOf(record, now) === level).length;
    return {
      overdue: by('overdue'),
      critical: by('critical'),
      watch: by('watch'),
      awaiting: open.filter((record) => record.stage === 'empty').length,
      paired: open.filter((record) => record.stage === 'paired').length,
      planned: open.filter((record) => record.stage === 'return_planned').length,
      detentionExposure: open
        .filter((record) => isAccruingDetention(record, now))
        .reduce(
          (total: number, record: EmptyReturnRecord) =>
            total + detentionFor(now - (record.deadline ?? now)),
          0,
        ),
    };
  }, [records, now]);

  const filtersActive =
    filters.q.trim() !== '' || filters.stage !== 'all' || filters.risk !== 'all';

  /** A tile toggles: clicking the active one clears it, so there is no separate reset to hunt for. */
  const toggle = (preset: Partial<EmptyReturnFilters>) => {
    const next = { ...ALL_FILTERS, ...preset, q: filters.q };
    const isOn = filters.stage === next.stage && filters.risk === next.risk;
    applyFilterPreset(isOn ? { ...ALL_FILTERS, q: filters.q } : next);
  };

  if (!isLoading && records.length === 0) {
    return (
      <Card className="rounded-lg border border-border/80 p-12">
        <EmptyState
          icon={<PackageOpen />}
          title="No containers under management"
          description="A container appears here the moment a delivered booking is marked Empty Ready in Shipments. Nothing to decide yet."
        />
      </Card>
    );
  }

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      {/* v19's summary strip: one compact bar, five figures, search on the
          right. It replaced four large KPI tiles on 2026-08-29 — the tiles
          spent a third of the first screen restating what the band headings
          below already say, and pushed the actual queue under the fold. Each
          figure is still a filter, so a number and the list it opens cannot
          disagree. */}
      <Card className="min-w-0 rounded-card border border-border px-4 py-2.5">
        <div className="flex min-w-0 flex-wrap items-center gap-x-6 gap-y-2 text-xs">
          <SummaryFigure
            label="Action required"
            value={groups.action.length}
            tone={groups.action.length ? 'text-destructive' : 'text-muted-foreground'}
            strong
            active={filters.risk === 'all' && filters.stage === 'all'}
            onClick={() => applyFilterPreset({ ...ALL_FILTERS, q: filters.q })}
          />
          <SummaryFigure
            label="Return overdue"
            value={counts.overdue}
            tone="text-destructive"
            hint={counts.overdue > 0 ? `${formatDetention(counts.detentionExposure)} accruing` : undefined}
            active={filters.risk === 'overdue'}
            onClick={() => toggle({ risk: 'overdue' })}
          />
          <SummaryFigure
            label="Critical"
            value={counts.critical}
            tone="text-destructive"
            active={filters.risk === 'critical'}
            onClick={() => toggle({ risk: 'critical' })}
          />
          <SummaryFigure
            label="Watch"
            value={counts.watch}
            tone="text-stage-returning-subtle-foreground"
            active={filters.risk === 'watch'}
            onClick={() => toggle({ risk: 'watch' })}
          />
          <SummaryFigure
            label="On track"
            value={groups.onTrack.length}
            tone="text-stage-closed-subtle-foreground"
            active={filters.risk === 'safe'}
            onClick={() => toggle({ risk: 'safe' })}
          />
          <SummaryFigure
            label="Paired"
            value={counts.paired}
            tone="text-stage-paired-subtle-foreground"
            active={filters.stage === 'paired'}
            onClick={() => toggle({ stage: 'paired' })}
          />

          <div className="ml-auto flex min-w-0 flex-1 basis-56 items-center gap-2">
            <Input
              inputSize="sm"
              leadingIcon={<Search />}
              value={filters.q}
              onChange={(event) => setFilters({ q: event.target.value })}
              placeholder="Container, line, transporter, load…"
              aria-label="Search containers"
            />
            {filtersActive && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => applyFilterPreset(ALL_FILTERS)}
                className="h-8 shrink-0 gap-1 px-2 text-xs text-muted-foreground"
              >
                <X className="size-3.5" /> Clear
              </Button>
            )}
          </div>
        </div>
      </Card>

      <ContainerQueueTable
        title="Action required"
        tone="text-destructive"
        rows={groups.action}
        now={now}
        onOpen={handleRowOpen}
        resetKey={filters}
        emptyCopy="Nothing is critical or overdue. Good."
      />

      <ContainerQueueTable
        title="Monitor"
        tone="text-warning-subtle-foreground"
        rows={groups.monitor}
        now={now}
        onOpen={handleRowOpen}
        resetKey={filters}
        emptyCopy="Nothing inside the three-day window."
      />

      <ContainerQueueTable
        title="On track"
        tone="text-primary"
        rows={groups.onTrack}
        now={now}
        onOpen={handleRowOpen}
        collapsible
        resetKey={filters}
        emptyCopy="No containers in this band."
      />
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * One figure in the summary strip
 * ------------------------------------------------------------------------- */

/**
 * v19's summary bar reads as a sentence of numbers, not a row of tiles — the
 * label is small and quiet, the figure is the loud part, and the whole thing is
 * a filter toggle. Clicking the active one clears it, so there is no separate
 * reset to hunt for.
 */
function SummaryFigure({
  label,
  value,
  tone,
  hint,
  strong,
  active,
  onClick,
}: {
  label: string;
  value: number;
  tone: string;
  hint?: string;
  strong?: boolean;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex shrink-0 cursor-pointer items-baseline gap-1.5 rounded-md px-1.5 py-0.5 transition-colors',
        'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
        active ? 'bg-secondary' : 'hover:bg-surface-sunken',
      )}
    >
      <span
        className={cn(
          'whitespace-nowrap uppercase tracking-wide',
          strong ? 'text-[11px] font-extrabold' : 'text-[11px] font-semibold',
          /* A zero is not news. Every figure here greys out when it is empty so
             the operator's eye lands only on the bands that actually have work
             in them. */
          value === 0 ? 'text-muted-foreground' : tone,
        )}
      >
        {label}
      </span>
      <Mono className={cn('text-sm font-bold', value === 0 ? 'text-muted-foreground' : tone)}>
        {value}
      </Mono>
      {hint && <span className="whitespace-nowrap text-[10px] text-muted-foreground">{hint}</span>}
    </button>
  );
}

export default ControlTowerPage;
