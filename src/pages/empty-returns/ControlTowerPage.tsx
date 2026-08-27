import { useMemo } from 'react';

import { Button, Card, EmptyState, Input, Select, StatisticCard } from '@/design-system';
import { AlertTriangle, ArrowLeftRight, PackageOpen, Search, Timer, X } from '@/design-system/icons';
import {
  EMPTY_RETURN_RISK_FILTER_OPTIONS,
  EMPTY_RETURN_STAGE_FILTER_OPTIONS,
  detentionFor,
  formatDetention,
} from '@/data/emptyReturnData';
import { useEmptyContainers } from '@/features/empty-returns';
import {
  isAccruingDetention,
  riskOf,
  selectFilteredRecords,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnFilters, EmptyReturnRecord, ReturnRiskLevel } from '@/types/emptyReturn';

import { ContainerQueueSection } from './components/ContainerQueueSection';

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
 * into one list.
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

  const filtered = useMemo(
    () => selectFilteredRecords(records, filters, now),
    [records, filters, now],
  );

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
      closed: filtered
        .filter((record) => record.stage === 'closed')
        .sort((a, b) => (b.returnedAt ?? 0) - (a.returnedAt ?? 0)),
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
      {/* The four figures the morning is judged on. */}
      <div className="grid min-w-0 grid-cols-1 gap-3.5 sm:grid-cols-2 lg:grid-cols-4">
        <StatisticCard
          title="Return overdue"
          value={counts.overdue}
          subtitle={
            counts.overdue > 0
              ? `${formatDetention(counts.detentionExposure)} accruing`
              : 'No deadline missed'
          }
          /* Peach, not a solid red slab: the house tiles are the four pastel
             tones, and the detention figure underneath already says how bad it is. */
          variant={counts.overdue > 0 ? 'peach' : 'default'}
          icon={<AlertTriangle className="h-5 w-5" />}
          onClick={() => toggle({ risk: 'overdue' })}
        />
        <StatisticCard
          title="Critical"
          value={counts.critical}
          subtitle="Under 24h to the deadline"
          variant={counts.critical > 0 ? 'pink' : 'default'}
          icon={<Timer className="h-5 w-5" />}
          onClick={() => toggle({ risk: 'critical' })}
        />
        <StatisticCard
          title="Awaiting a decision"
          value={counts.awaiting}
          subtitle={
            counts.planned > 0
              ? `${counts.planned} already going back alone`
              : 'Empty, nothing chosen yet'
          }
          variant="blue"
          icon={<PackageOpen className="h-5 w-5" />}
          onClick={() => toggle({ stage: 'empty' })}
        />
        <StatisticCard
          title="Paired"
          value={counts.paired}
          subtitle="Empty returns avoided"
          variant="teal"
          icon={<ArrowLeftRight className="h-5 w-5" />}
          onClick={() => toggle({ stage: 'paired' })}
        />
      </div>

      {/* One toolbar, and one way back out of it. */}
      <Card className="min-w-0 rounded-lg border border-border/80 p-3">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <div className="min-w-0 flex-1 basis-56">
            <Input
              inputSize="sm"
              leadingIcon={<Search />}
              value={filters.q}
              onChange={(event) => setFilters({ q: event.target.value })}
              placeholder="Container, line, shipper, transporter, shipment…"
              aria-label="Search containers"
            />
          </div>
          <Select
            selectSize="sm"
            value={filters.stage}
            onChange={(event) => setFilters({ stage: event.target.value as typeof filters.stage })}
            options={[...EMPTY_RETURN_STAGE_FILTER_OPTIONS]}
            aria-label="Filter by stage"
            containerClassName="w-full sm:w-40"
          />
          <Select
            selectSize="sm"
            value={filters.risk}
            onChange={(event) => setFilters({ risk: event.target.value as typeof filters.risk })}
            options={[...EMPTY_RETURN_RISK_FILTER_OPTIONS]}
            aria-label="Filter by urgency"
            containerClassName="w-full sm:w-44"
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
          <span className="shrink-0 whitespace-nowrap text-xs tabular-nums text-muted-foreground">
            {filtered.length} of {records.length}
          </span>
        </div>
      </Card>

      <ContainerQueueSection
        title="Action required"
        hint="Overdue, or under 24 hours left — these cost money today."
        tone="text-destructive"
        rows={groups.action}
        now={now}
        onOpen={openRecord}
        resetKey={filters}
        emptyCopy="Nothing is critical or overdue. Good."
      />

      <ContainerQueueSection
        title="Monitor"
        hint="One to three days of decision window left."
        tone="text-warning-subtle-foreground"
        rows={groups.monitor}
        now={now}
        onOpen={openRecord}
        resetKey={filters}
        emptyCopy="Nothing inside the three-day window."
      />

      <ContainerQueueSection
        title="On track"
        hint="Three days or more, or already paired — nothing to do."
        tone="text-primary"
        rows={groups.onTrack}
        now={now}
        onOpen={openRecord}
        collapsible
        resetKey={filters}
        emptyCopy="No containers in this band."
      />

      <ContainerQueueSection
        title="Closed"
        hint="Paired out, or returned to the depot. History, kept."
        tone="text-muted-foreground"
        rows={groups.closed}
        now={now}
        onOpen={openRecord}
        collapsible
        resetKey={filters}
        emptyCopy="No cycles have closed yet."
      />

      <p className="text-xs text-muted-foreground">
        <b>Status</b> is what has been decided · <b>Urgency</b> is how long is left — Safe 3d+ ·
        Watch 1–3d · Critical under 24h · Overdue past the deadline. Click any card for that
        container&rsquo;s full history.
      </p>
    </div>
  );
}

export default ControlTowerPage;
