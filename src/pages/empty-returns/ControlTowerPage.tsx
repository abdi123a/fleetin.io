import { useCallback, useEffect, useMemo, useRef } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { ROUTES } from '@/config/routes';

import { FilterBar, FilterMenu } from '@/components/common';
import { Card, EmptyState } from '@/design-system';
import { PackageOpen } from '@/design-system/icons';
import { detentionFor } from '@/data/emptyReturnData';
import { useEmptyContainers } from '@/features/empty-returns';
import {
  isAccruingDetention,
  riskOf,
  selectFilteredRecords,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnFilters, EmptyReturnRecord, ReturnRiskLevel } from '@/types/emptyReturn';

import { ContainerQueueTable } from './components/ContainerQueueTable';

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

  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  /* `?match=…` is a legacy deep link from when matching was a popup. Matching
     is a page now (2026-08-29), so the parameter selects the container and
     forwards there rather than opening anything in place. */
  useEffect(() => {
    const value = searchParams.get('match');
    if (!value) return;
    if (value !== '1') selectEmpty(value);
    /* `from=` rides along — it is the shipment the operator left, and Matching
       draws a way back to it. Dropping it here was why there was none. */
    const from = searchParams.get('from');
    navigate(
      from ? `${ROUTES.emptyReturnsMatching}?from=${encodeURIComponent(from)}` : ROUTES.emptyReturnsMatching,
      { replace: true },
    );
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

  /* In the URL beside the filters, so a link to this view reproduces the order
     it was read in as well as what was in it. */
  const sortParam = searchParams.get('sort') as SortKey | null;
  const sort: SortKey = sortParam && sortParam in SORTS ? sortParam : 'urgency';

  const setSort = (next: SortKey) => {
    const params = new URLSearchParams(searchParams);
    if (next === 'urgency') params.delete('sort');
    else params.set('sort', next);
    setSearchParams(params, { replace: true });
  };

  /* Open containers only. The Control Tower answers "what needs my attention
     now", and a closed cycle needs none — its history lives on the container's
     own dialog and in Cycles. The Closed band was removed on 2026-08-29.

     ONE list, not a stack of bands. The page used to render a table per urgency
     band, so "All" meant three tables and the calm one behind a fold — you had
     to open a second control to see containers you had already asked for. The
     tabs above are the band control now; below them is simply the list they
     asked for, in the order the sort says. */
  const visible = useMemo(() => {
    const open = filtered.filter((record) => record.stage !== 'closed');
    return [...open].sort(SORTS[sort].compare(now));
  }, [filtered, now, sort]);

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
      /* The two bands, counted off the whole open book like everything else
         here. Taking them off `groups` (the filtered view) made a segment
         restate the filter it had just applied: clicking "On track 6" redrew it
         as "On track 1". */
      action: open.filter((record) => {
        const level = riskOf(record, now);
        return level === 'overdue' || level === 'critical';
      }).length,
      onTrack: open.filter((record) => {
        const level = riskOf(record, now);
        return level === 'safe' || level === 'protected' || level === null;
      }).length,
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

  /**
   * `/` puts the cursor in the search box.
   *
   * This page is a triage queue: the operator arrives knowing a container
   * number and wants to type it, and reaching for the mouse to click a field
   * that is always in the same place is the kind of friction that makes a
   * console feel slow. Ignored while another field already has focus, so
   * typing a slash into the search box types a slash.
   */
  const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== '/' || event.metaKey || event.ctrlKey || event.altKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable) return;
      if (target && ['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName)) return;
      event.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, []);

  /** What the search actually narrowed, out of the open book. */
  const matchCount = visible.length;
  const openTotal = useMemo(
    () => records.filter((record) => record.stage !== 'closed').length,
    [records],
  );

  const filtersActive =
    filters.q.trim() !== '' || filters.stage !== 'all' || filters.risk !== 'all';

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

  /* One list, read by both the tab bar and the phone's select — two controls
     that must always offer exactly the same bands in the same order. "Paired"
     is a stage rather than an urgency, which is why it used to sit apart as a
     loose pill; as the last tab it keeps that distinction (it is after the
     three that are one scale) without needing a second container shape to say
     so. */
  const activeBand: BandKey =
    filters.stage === 'paired'
      ? 'paired'
      : filters.risk === 'all'
        ? 'all'
        : (filters.risk as BandKey);

  const bandCount = (key: BandKey): number =>
    key === 'all'
      ? openTotal
      : key === 'action'
        ? counts.action
        : key === 'watch'
          ? counts.watch
          : key === 'on_track'
            ? counts.onTrack
            : counts.paired;

  const applyBand = (key: BandKey) => {
    if (key === 'all') {
      applyFilterPreset({ ...ALL_FILTERS, q: filters.q });
      return;
    }
    if (key === 'paired') {
      setFilters({ risk: 'all', stage: 'paired' });
      return;
    }
    setFilters({ risk: key, stage: 'all' });
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-5">
      {/* The app's one filter bar — the same component Shippers, Partners,
          Vehicles and Drivers use. It began here as a hand-built tab row and
          was lifted into `@/components/common` so the five list pages cannot
          drift apart again; this page now consumes what it invented.

          Every figure is still a filter, so a number and the list it opens
          cannot disagree — and every count is off the whole book, never off the
          filtered view, or a tab would only ever print the number you are
          already looking at. */}
      <FilterBar
        label="Filter containers by band"
        tabs={BANDS.map((band) => ({
          key: band.key,
          label: band.label,
          tone: band.tone,
          count: bandCount(band.key),
        }))}
        active={activeBand}
        onSelect={applyBand}
        search={{
          value: filters.q,
          onChange: (value) => setFilters({ q: value }),
          placeholder: 'Search containers…',
          matched: matchCount,
          total: openTotal,
          inputRef: searchRef,
        }}
      >
        {/* One list needs a way to say what "first" means. Ordering used to be
            implicit in the band a container sat in; with the bands gone it
            becomes a control, and the default reproduces the old arrangement —
            worst at the top — so nothing moved for anyone who never touches it. */}
        <FilterMenu
          groups={[
            {
              key: 'sort',
              label: 'Sort by',
              value: sort,
              onChange: (value) => setSort(value as SortKey),
              options: (Object.keys(SORTS) as SortKey[]).map((key) => ({
                value: key,
                label: SORTS[key].label,
              })),
              defaultValue: 'urgency',
            },
          ]}
          onReset={() => applyFilterPreset(ALL_FILTERS)}
          resetActive={filtersActive}
        />
      </FilterBar>

      {/* No band heading: the tab above already names the band and prints its
          count, and repeating it here was the same three words twice on one
          screen. What survives is the composition — a number the tab cannot
          carry — and only when there is one. */}
      {activeBand === 'action' && counts.overdue > 0 && (
        <p className="type-body-xs -mb-2 text-muted-foreground">
          {counts.overdue} overdue
          {counts.critical > 0 ? ` · ${counts.critical} critical` : ''}
        </p>
      )}

      <ContainerQueueTable
        rows={visible}
        now={now}
        onOpen={handleRowOpen}
        resetKey={`${activeBand}:${sort}:${filters.q}`}
        emptyCopy={BANDS.find((band) => band.key === activeBand)?.emptyCopy ?? 'Nothing here.'}
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
/**
 * One band of the queue, as a segment of a single control.
 *
 * A segmented control rather than loose chips, because these four are one
 * choice on one axis — the loose row let a stage filter sit among them looking
 * like a fifth band. `hint` carries a band's composition (what "action
 * required" is actually made of) and shows only when the band has something in
 * it: two permanently-zero chips were what made the old strip read as noise.
 */
type BandKey = 'all' | 'action' | 'watch' | 'on_track' | 'paired';

const BANDS: { key: BandKey; label: string; tone?: string; emptyCopy: string }[] = [
  { key: 'all', label: 'All', emptyCopy: 'No open containers.' },
  {
    key: 'action',
    label: 'Action required',
    tone: 'text-destructive',
    emptyCopy: 'Nothing is critical or overdue. Good.',
  },
  {
    key: 'watch',
    label: 'Monitor',
    tone: 'text-stage-returning-subtle-foreground',
    emptyCopy: 'Nothing inside the three-day window.',
  },
  {
    key: 'on_track',
    label: 'On track',
    tone: 'text-primary',
    emptyCopy: 'Nothing waiting — every open container needs action.',
  },
  {
    key: 'paired',
    label: 'Paired',
    tone: 'text-stage-paired-subtle-foreground',
    emptyCopy: 'Nothing is paired to an upcoming load.',
  },
];

/* ---------------------------------------------------------------------------
 * Sorting
 * -------------------------------------------------------------------------
 *
 * `urgency` is the default and is what makes a single list work: with every
 * band in one table, the worst container has to arrive at the top by itself
 * rather than by living in a separate table above the others. It ranks by risk
 * first and settles ties on the deadline, so two overdue boxes are ordered by
 * which has been overdue longer.
 *
 * The rest exist because a queue is not always read the same way. Chasing one
 * line's boxes is a different job from working the clock, and both are
 * different from checking what a transporter is holding.
 */
type SortKey = 'urgency' | 'deadline' | 'longest' | 'container' | 'line' | 'transporter';

/** Worst first. `null` is a container with no deadline, which cannot be late. */
const RISK_RANK: Record<string, number> = {
  overdue: 0,
  critical: 1,
  watch: 2,
  safe: 3,
  protected: 4,
};

function rankOf(record: EmptyReturnRecord, now: number): number {
  const level = riskOf(record, now);
  return level === null ? 5 : (RISK_RANK[level] ?? 5);
}

/** Ascending, with "no deadline" always last rather than at epoch zero. */
function byDeadline(a: EmptyReturnRecord, b: EmptyReturnRecord): number {
  return (a.deadline ?? Number.POSITIVE_INFINITY) - (b.deadline ?? Number.POSITIVE_INFINITY);
}

const SORTS: Record<
  SortKey,
  { label: string; compare: (now: number) => (a: EmptyReturnRecord, b: EmptyReturnRecord) => number }
> = {
  urgency: {
    label: 'Most urgent',
    compare: (now) => (a, b) => rankOf(a, now) - rankOf(b, now) || byDeadline(a, b),
  },
  deadline: { label: 'Deadline soonest', compare: () => byDeadline },
  longest: {
    /* Oldest stripped date first — the box that has been sitting in the free
       zone the longest, which is not always the one closest to its deadline. */
    label: 'Longest standing',
    compare: () => (a, b) =>
      (a.emptyReadyAt ?? Number.POSITIVE_INFINITY) - (b.emptyReadyAt ?? Number.POSITIVE_INFINITY),
  },
  container: {
    label: 'Container number',
    compare: () => (a, b) =>
      (a.container || a.bookingReference).localeCompare(b.container || b.bookingReference),
  },
  line: { label: 'Shipping line', compare: () => (a, b) => a.line.localeCompare(b.line) },
  transporter: {
    label: 'Transporter',
    compare: () => (a, b) => a.transporter.localeCompare(b.transporter),
  },
};

export default ControlTowerPage;
