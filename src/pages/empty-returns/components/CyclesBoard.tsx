import { useCallback, useMemo, useState, type KeyboardEvent, type ReactNode } from 'react';

import {
  Button,
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  IconChip,
  Input,
  Select,
  Skeleton,
  TableBody,
  TableCaption,
  TableCell,
  TableHead,
  TableHeader,
  TableRoot,
  TableRow,
  Tooltip,
} from '@/design-system';
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ChevronsUpDown,
  Filter,
  Layers,
  MapPin,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  X,
} from '@/design-system/icons';
import { TablePager, usePagedRows } from '@/components';
import {
  EMPTY_RETURN_RISK_FILTER_OPTIONS,
  EMPTY_RETURN_STATUS_FILTER_OPTIONS,
} from '@/data/emptyReturnData';
import { isCritical, riskOf, slackOf } from '@/stores/emptyReturn.store';
import type {
  EmptyReturnFilters,
  EmptyReturnRecord,
  EmptyReturnRiskFilter,
  EmptyReturnStatusFilter,
  ReturnRiskLevel,
} from '@/types/emptyReturn';
import { cn } from '@/utils';

import { CompanyName, Mono } from './atoms';
import { ContainerSwap, DeadlineCell, LifecycleChip, UrgencyBadge } from './ui';
import { URGENCY_TOKENS } from './ui/urgencyTokens';

/* ---------------------------------------------------------------------------
 * Types
 * ------------------------------------------------------------------------- */

export type SortKey = 'deadline' | 'reference' | 'urgency' | 'party';
export type SortDir = 'asc' | 'desc';
export interface SortState {
  key: SortKey;
  dir: SortDir;
}

export interface CyclesBoardProps {
  /** Every record the module knows about, before any filter. */
  records: EmptyReturnRecord[];
  /** The rows to show, already filtered and sorted by the page. */
  rows: EmptyReturnRecord[];
  /** Same as `rows` but with the urgency filter lifted — the cut counts. */
  rowsBeforeRisk: EmptyReturnRecord[];
  now: number;

  filters: EmptyReturnFilters;
  onFiltersChange: (patch: Partial<EmptyReturnFilters>) => void;

  partyFilter: string;
  onPartyFilterChange: (value: string) => void;
  parties: readonly string[];

  locationFilter: string;
  onLocationFilterChange: (value: string) => void;
  locations: readonly { id: string; name: string }[];

  sort: SortState;
  onSortChange: (sort: SortState) => void;

  onClearFilters: () => void;
  anyFilterActive: boolean;

  isLoading: boolean;
  isError: boolean;
  isRefreshing: boolean;
  onRefresh: () => void;
  refreshLabel: string;

  expandedId: string | null;
  onOpenRecord: (id: string | null) => void;
  onCreate: () => void;
}

/** The slices a dispatcher actually works in, worst first. */
const URGENCY_CUTS: readonly {
  value: EmptyReturnRiskFilter;
  label: string;
  match: (risk: ReturnRiskLevel | null) => boolean;
  rail: string;
}[] = [
  { value: 'all', label: 'All', match: () => true, rail: 'bg-border-strong' },
  {
    value: 'overdue',
    label: 'Overdue',
    match: (risk) => risk === 'overdue',
    rail: URGENCY_TOKENS.overdue.solid,
  },
  {
    value: 'crit',
    label: 'Critical + at risk',
    match: (risk) => isCritical(risk),
    rail: URGENCY_TOKENS.at_risk.solid,
  },
  {
    value: 'watch',
    label: 'Watch',
    match: (risk) => risk === 'watch',
    rail: URGENCY_TOKENS.watch.solid,
  },
  {
    value: 'safe',
    label: 'Safe',
    match: (risk) => risk === 'safe',
    rail: URGENCY_TOKENS.safe.solid,
  },
  {
    value: 'protected',
    label: 'Returned on time',
    match: (risk) => risk === 'protected',
    rail: URGENCY_TOKENS.protected.solid,
  },
];

const countFormatter = new Intl.NumberFormat('en-US');

/**
 * Filter dropdowns: two to a row on a phone, their own natural width above it.
 * One control per line is four lines of chrome before the first cycle.
 */
const FILTER_SELECT = 'shrink-0 grow basis-[calc(50%-0.25rem)] sm:grow-0 sm:basis-auto';

/* ---------------------------------------------------------------------------
 * Board
 * ------------------------------------------------------------------------- */

/**
 * The Cycles board: one card that holds every control and the list itself.
 *
 * The page used to stack three separate panels — a filter box, a "showing N of
 * N" line, and a table that then rendered all 450 rows in a single column. That
 * is three borders to cross before the first row and no way to hold a place in
 * the list. Here the urgency cuts, the search row, the active filters and the
 * pager are all edges of the same card, and the list is paged, so a row always
 * has an address: this cut, this page.
 */
export function CyclesBoard({
  records,
  rows,
  rowsBeforeRisk,
  now,
  filters,
  onFiltersChange,
  partyFilter,
  onPartyFilterChange,
  parties,
  locationFilter,
  onLocationFilterChange,
  locations,
  sort,
  onSortChange,
  onClearFilters,
  anyFilterActive,
  isLoading,
  isError,
  isRefreshing,
  onRefresh,
  refreshLabel,
  expandedId,
  onOpenRecord,
  onCreate,
}: CyclesBoardProps) {
  const [pageSize, setPageSize] = useState(25);

  // Counts answer "how many rows would this cut give me", so they're taken
  // from the list with every other filter applied but urgency lifted.
  const cutCounts = useMemo(() => {
    const risks = rowsBeforeRisk.map((record) => riskOf(record, now));
    return URGENCY_CUTS.map((cut) => risks.filter((risk) => cut.match(risk)).length);
  }, [rowsBeforeRisk, now]);

  // Any change to what the list contains sends the reader back to page 1 —
  // page 9 of the old list is not page 9 of the new one.
  const resetKey = `${filters.q}|${filters.status}|${filters.risk}|${partyFilter}|${locationFilter}|${sort.key}|${sort.dir}|${rows.length}`;
  const paged = usePagedRows(rows, { pageSize, resetKey });

  const toggleSort = useCallback(
    (key: SortKey) => {
      onSortChange(
        sort.key === key ? { key, dir: sort.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: 'asc' },
      );
    },
    [sort, onSortChange],
  );

  const activeChips = useMemo(() => {
    const chips: { id: string; label: string; onClear: () => void }[] = [];
    if (filters.q) {
      chips.push({ id: 'q', label: `“${filters.q}”`, onClear: () => onFiltersChange({ q: '' }) });
    }
    if (filters.status !== 'all') {
      const opt = EMPTY_RETURN_STATUS_FILTER_OPTIONS.find((o) => o.value === filters.status);
      chips.push({
        id: 'status',
        label: `Status: ${opt?.label ?? filters.status}`,
        onClear: () => onFiltersChange({ status: 'all' }),
      });
    }
    if (filters.risk !== 'all') {
      const opt = EMPTY_RETURN_RISK_FILTER_OPTIONS.find((o) => o.value === filters.risk);
      chips.push({
        id: 'risk',
        label: `Urgency: ${opt?.label ?? filters.risk}`,
        onClear: () => onFiltersChange({ risk: 'all' }),
      });
    }
    if (partyFilter !== 'all') {
      chips.push({
        id: 'party',
        label: `Party: ${partyFilter}`,
        onClear: () => onPartyFilterChange('all'),
      });
    }
    if (locationFilter !== 'all') {
      chips.push({
        id: 'loc',
        // The yard name, matching the dropdown — never the raw id.
        label: `Location: ${locations.find((l) => l.id === locationFilter)?.name ?? locationFilter}`,
        onClear: () => onLocationFilterChange('all'),
      });
    }
    return chips;
  }, [
    filters,
    partyFilter,
    locationFilter,
    locations,
    onFiltersChange,
    onPartyFilterChange,
    onLocationFilterChange,
  ]);

  return (
    <div className="min-w-0 overflow-hidden rounded-lg border border-border bg-card shadow-2xs">
      {/* ── Urgency cuts: the first slice, before any dropdown is opened ──
          `w-0 min-w-full` is load-bearing, not decoration. The six buttons are
          all `shrink-0`, so the strip's min-content is ~700px; the app shell
          sizes pages by min-content, which would drag the whole board off a
          phone screen. `w-0` makes the strip contribute nothing to that
          measurement, `min-w-full` gives it the card's width to actually
          render in, and the buttons scroll inside it. */}
      <div className="flex w-0 min-w-full items-stretch gap-1 overflow-x-auto border-b border-border px-2 py-2">
        {URGENCY_CUTS.map((cut, index) => (
          <CutButton
            key={cut.value}
            label={cut.label}
            count={cutCounts[index] ?? 0}
            rail={cut.rail}
            active={filters.risk === cut.value}
            onClick={() => onFiltersChange({ risk: cut.value })}
          />
        ))}
      </div>

      {/* ── Search + the four narrowings + refresh ── */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2.5">
        <div className="min-w-0 flex-1 basis-full sm:basis-64">
          <Input
            inputSize="sm"
            value={filters.q}
            onChange={(event) => onFiltersChange({ q: event.target.value })}
            onClear={() => onFiltersChange({ q: '' })}
            isClearable
            leadingIcon={<Search className="size-4 text-muted-foreground" aria-hidden />}
            placeholder="Search container, cycle, chain, party or line"
            aria-label="Search empty returns"
            className="bg-background"
          />
        </div>

        <Select
          selectSize="sm"
          containerClassName={cn(FILTER_SELECT, 'sm:w-[8.75rem]')}
          options={[...EMPTY_RETURN_STATUS_FILTER_OPTIONS]}
          value={filters.status}
          onChange={(event) =>
            onFiltersChange({ status: event.target.value as EmptyReturnStatusFilter })
          }
          aria-label="Filter by status"
        />
        <Select
          selectSize="sm"
          containerClassName={cn(FILTER_SELECT, 'sm:w-[10rem]')}
          options={[
            { value: 'all', label: 'All parties' },
            ...parties.map((p) => ({ value: p, label: p })),
          ]}
          value={partyFilter}
          onChange={(event) => onPartyFilterChange(event.target.value)}
          aria-label="Filter by party"
        />
        <Select
          selectSize="sm"
          containerClassName={cn(FILTER_SELECT, 'sm:w-[9.5rem]')}
          options={[
            { value: 'all', label: 'All locations' },
            ...locations.map((l) => ({ value: l.id, label: l.name })),
          ]}
          value={locationFilter}
          onChange={(event) => onLocationFilterChange(event.target.value)}
          aria-label="Filter by location"
        />

        <Tooltip content={refreshLabel}>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="size-8 shrink-0 px-0"
            aria-label="Refresh"
            onClick={onRefresh}
          >
            <RefreshCw className={cn('size-3.5', isRefreshing && 'animate-spin')} aria-hidden />
          </Button>
        </Tooltip>
      </div>

      {/* ── What is currently narrowing the list ── */}
      {activeChips.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5 border-b border-border bg-muted/25 px-3 py-2">
          <span className="mr-0.5 inline-flex items-center gap-1 text-[11px] font-semibold text-muted-foreground">
            <Filter className="size-3" aria-hidden />
            Filtered by
          </span>
          {activeChips.map((chip) => (
            <button
              key={chip.id}
              type="button"
              onClick={chip.onClear}
              className="inline-flex h-6 items-center gap-1 rounded-md border border-border bg-background px-2 text-[11px] font-medium text-foreground transition-colors hover:border-border-strong hover:bg-muted"
            >
              <span>{chip.label}</span>
              <X className="size-3 text-muted-foreground" aria-hidden />
            </button>
          ))}
          <button
            type="button"
            onClick={onClearFilters}
            className="ml-1 text-[11px] font-semibold text-primary hover:underline"
          >
            Clear all
          </button>
        </div>
      )}

      {/* ── The list ── */}
      {isLoading ? (
        <CyclesLoadingRows />
      ) : isError ? (
        <CyclesErrorCard onRetry={onRefresh} />
      ) : rows.length === 0 ? (
        anyFilterActive ? (
          <CyclesEmptyFiltered onClear={onClearFilters} />
        ) : (
          <CyclesEmpty onCreate={onCreate} />
        )
      ) : (
        <>
          {/* Table from tablet up. A 768px screen has room for the reference,
              the swap and the clock side by side; giving it the phone's
              stacked cards wasted half its width on nothing. */}
          <div className="hidden md:block">
            {/* The app's own table shell, not a hand-rolled one. `TableBody`
                brings the system's `divide-y divide-border` and `TableRow` its
                hover — which is what was missing: at `border-border/70` the
                rows blurred into one another and a cycle was hard to pick out
                of the run. */}
            <TableRoot className="table-fixed text-left">
              <TableCaption>
                Empty return cycles, page {paged.page} of {paged.pageCount}
              </TableCaption>
              <TableHeader>
                <TableRow className="hover:bg-transparent">
                  <SortHead
                    label="Cycle"
                    sortKey="reference"
                    sort={sort}
                    onSort={toggleSort}
                    className="w-[8.5rem] lg:w-[9.75rem]"
                  />
                  {/* Wide enough for two container numbers and the yard name
                      beneath them, and no wider — on a 1600px screen the
                      surplus belongs between the row's identity and its
                      clock, not stretched through the middle of the swap. */}
                  <ColHead
                    label="Empty → full load"
                    className="w-[18.75rem] lg:w-[20rem] xl:w-[23rem]"
                  />
                  <SortHead
                    label="Parties"
                    sortKey="party"
                    sort={sort}
                    onSort={toggleSort}
                    className="hidden xl:table-cell"
                  />
                  <SortHead
                    label="Deadline"
                    sortKey="deadline"
                    sort={sort}
                    onSort={toggleSort}
                    className="w-[7.5rem] lg:w-[8rem]"
                  />
                  <SortHead
                    label="Urgency"
                    sortKey="urgency"
                    sort={sort}
                    onSort={toggleSort}
                    className="w-[7rem]"
                  />
                  <TableHead className="w-9 px-1 lg:w-11 lg:px-2">
                    <span className="sr-only">Actions</span>
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paged.rows.map((record) => (
                  <CycleTableRow
                    key={record.id}
                    record={record}
                    now={now}
                    open={expandedId === record.id}
                    onOpen={onOpenRecord}
                  />
                ))}
              </TableBody>
            </TableRoot>
          </div>

          {/* Phones only: the same row, stacked */}
          <div className="divide-y divide-border/70 md:hidden">
            {paged.rows.map((record) => (
              <CycleCard key={record.id} record={record} now={now} onOpen={onOpenRecord} />
            ))}
          </div>
        </>
      )}

      {/* ── Range, page size and page numbers ── */}
      {!isLoading && !isError && rows.length > 0 && (
        <TablePager
          paged={paged}
          noun="cycles"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          summary={
            anyFilterActive
              ? `filtered from ${countFormatter.format(records.length)}`
              : undefined
          }
          className="border-t-0 px-3 py-2.5"
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Cut button
 * ------------------------------------------------------------------------- */

function CutButton({
  label,
  count,
  rail,
  active,
  onClick,
}: {
  label: string;
  count: number;
  rail: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'group/cut inline-flex shrink-0 items-center gap-2 rounded-md border px-2.5 py-1.5 transition-colors',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-1',
        active
          ? 'border-primary/40 bg-primary-subtle text-primary-subtle-foreground'
          : 'border-transparent text-muted-foreground hover:bg-muted hover:text-foreground',
      )}
    >
      <span className={cn('h-4 w-[3px] shrink-0 rounded-full', rail)} aria-hidden />
      <span className="whitespace-nowrap text-xs font-semibold">{label}</span>
      <span
        className={cn(
          'rounded-full px-1.5 py-0.5 text-[11px] font-bold leading-none tabular-nums',
          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {countFormatter.format(count)}
      </span>
    </button>
  );
}

/* ---------------------------------------------------------------------------
 * Headers
 * ------------------------------------------------------------------------- */

/** The system head, at this board's tighter gutter. */
const HEAD_BASE = 'px-3 lg:px-4';

function ColHead({ label, className }: { label: string; className?: string }) {
  return <TableHead className={cn(HEAD_BASE, className)}>{label}</TableHead>;
}

function SortHead({
  label,
  sortKey,
  sort,
  onSort,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSort: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Arrow = !active ? ChevronsUpDown : sort.dir === 'asc' ? ArrowUp : ArrowDown;

  return (
    <TableHead
      className={cn('p-0', className)}
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          'flex w-full items-center gap-1 px-3 py-2.5 text-left transition-colors hover:text-foreground lg:px-4',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
          active && 'text-foreground',
        )}
      >
        {label}
        <Arrow className={cn('size-3 shrink-0', active ? 'opacity-100' : 'opacity-40')} aria-hidden />
      </button>
    </TableHead>
  );
}

/* ---------------------------------------------------------------------------
 * Parties
 * ------------------------------------------------------------------------- */

/**
 * Shipper and transporter as two marks, nothing written out.
 *
 * The names were costing thirteen rems a row to say what the logos already
 * say — and on a list this long the reader is matching a shape, not reading a
 * company name twenty-five times. The names live in the tooltip and in the
 * detail dialog, which is where someone who needs to read them is going.
 */
function PartyMarks({ client, transporter }: { client: string; transporter: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <Tooltip content={`Shipper: ${client}`}>
        <span className="inline-flex">
          <CompanyName name={client} showName={false} size="xs" />
        </span>
      </Tooltip>
      <Tooltip content={`Transporter: ${transporter}`}>
        <span className="inline-flex">
          <CompanyName name={transporter} showName={false} size="xs" />
        </span>
      </Tooltip>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Desktop row
 * ------------------------------------------------------------------------- */

function CycleTableRow({
  record,
  now,
  open,
  onOpen,
}: {
  record: EmptyReturnRecord;
  now: number;
  open: boolean;
  onOpen: (id: string | null) => void;
}) {
  const slack = slackOf(record, now);
  const risk = riskOf(record, now);
  // The booking reference is the row's stable name; the cycle it belongs to
  // is shown beneath it, not instead of it.
  const reference = record.bookingReference || record.id;
  const alerts = record.exception ? [record.exception] : [];

  const onKeyDown = (event: KeyboardEvent<HTMLTableRowElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(record.id);
    }
  };

  return (
    <TableRow
      clickable
      selected={open}
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`Open cycle ${reference}`}
      onKeyDown={onKeyDown}
      onClick={() => onOpen(record.id)}
      className="h-[3.75rem] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    >
      {/* Cycle identity. The chain line is its own truncating block so a long
          reference never pushes the column wider than its share. */}
      <TableCell className="min-w-0 px-3 lg:px-4">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Mono className="block truncate text-xs font-bold text-foreground">{reference}</Mono>
          <span className="block truncate text-[11px] text-muted-foreground">
            {record.cycleId ? (
              <>
                <Mono className="text-[11px]">{record.cycleId}</Mono>
                {record.chainId && (
                  <>
                    {' · '}
                    <Mono className="text-[11px]">{record.chainId}</Mono>
                  </>
                )}
                {record.seq != null && <> · cycle {record.seq}</>}
              </>
            ) : (
              'Awaiting match'
            )}
          </span>
        </div>
      </TableCell>

      {/* The swap, with stage and yard on the line beneath it.
          Both used to be columns of their own, and both cost the swap the
          width it needed while truncating anyway — "Damerjog Co…" told the
          reader nothing. Here the three read as one sentence: this box for
          that load, currently at this stage, in this yard. */}
      <TableCell className="min-w-0 overflow-hidden px-3 lg:px-4">
        <div className="flex min-w-0 flex-col items-start gap-1">
          <ContainerSwap
            empty={record.container}
            full={record.nextFull?.container}
            onSelectTarget={() => onOpen(record.id)}
          />
          <span className="flex min-w-0 max-w-full items-center gap-1.5 text-[11px] text-muted-foreground">
            <LifecycleChip
              status={record.status}
              className="shrink-0 border-transparent bg-transparent px-0 py-0 text-[11px] text-muted-foreground"
            />
            <span aria-hidden className="text-border-strong">
              ·
            </span>
            <MapPin className="size-3 shrink-0" aria-hidden />
            <span className="truncate">{record.locationName}</span>
          </span>
        </div>
      </TableCell>

      {/* Who it belongs to — the two marks only */}
      <TableCell className="hidden px-3 xl:table-cell lg:px-4">
        <PartyMarks client={record.client} transporter={record.transporter} />
      </TableCell>

      <TableCell className="px-3 lg:px-4">
        <DeadlineCell deadline={record.deadline} slack={slack} risk={risk} />
      </TableCell>

      <TableCell className="px-3 lg:px-4">
        <UrgencyBadge risk={risk} alerts={alerts} />
      </TableCell>

      <TableCell className="px-1 lg:px-2" onClick={(event) => event.stopPropagation()}>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-8 p-0 text-muted-foreground hover:text-foreground"
              aria-label={`Actions for ${reference}`}
            >
              <MoreHorizontal className="size-4" aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-44">
            <DropdownMenuItem onClick={() => onOpen(record.id)}>View full details</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </TableCell>
    </TableRow>
  );
}

/* ---------------------------------------------------------------------------
 * Narrow-screen row
 * ------------------------------------------------------------------------- */

function CycleCard({
  record,
  now,
  onOpen,
}: {
  record: EmptyReturnRecord;
  now: number;
  onOpen: (id: string | null) => void;
}) {
  const slack = slackOf(record, now);
  const risk = riskOf(record, now);
  // The booking reference is the row's stable name; the cycle it belongs to
  // is shown beneath it, not instead of it.
  const reference = record.bookingReference || record.id;
  const alerts = record.exception ? [record.exception] : [];

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      onOpen(record.id);
    }
  };

  // A div, not a button: `ContainerSwap` carries its own "Select target"
  // button and a button inside a button is invalid.
  return (
    <div
      role="button"
      tabIndex={0}
      aria-haspopup="dialog"
      aria-label={`Open cycle ${reference}`}
      onClick={() => onOpen(record.id)}
      onKeyDown={onKeyDown}
      className="flex w-full min-w-0 cursor-pointer flex-col gap-3 p-4 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
    >
      <div className="flex min-w-0 items-start justify-between gap-2">
        <div className="flex min-w-0 flex-col gap-0.5">
          <Mono className="block truncate text-sm font-bold text-foreground">{reference}</Mono>
          <span className="block truncate text-[11px] text-muted-foreground">
            {record.chainId ? `${record.chainId} · cycle ${record.seq ?? 1}` : 'Not chained'}
          </span>
        </div>
        <UrgencyBadge risk={risk} alerts={alerts} />
      </div>

      {/* Wraps rather than scrolls: at 375px the swap alone fills the width,
          so the marks drop to their own line instead of off the card. */}
      <div className="flex min-w-0 max-w-full flex-wrap items-center gap-x-3 gap-y-2">
        <ContainerSwap empty={record.container} full={record.nextFull?.container} />
        <PartyMarks client={record.client} transporter={record.transporter} />
      </div>

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border/60 pt-2.5">
        <div className="flex items-center gap-2">
          <LifecycleChip status={record.status} />
          <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="size-3 shrink-0" aria-hidden />
            {record.locationName}
          </span>
        </div>
        <DeadlineCell deadline={record.deadline} slack={slack} risk={risk} />
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * States
 * ------------------------------------------------------------------------- */

function CyclesLoadingRows() {
  return (
    <div className="divide-y divide-border/60" aria-busy="true" aria-label="Loading empty returns">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex h-[3.75rem] items-center justify-between gap-4 px-4">
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-28 rounded-sm" shape="text" />
            <Skeleton className="h-7 w-52 rounded-md" shape="block" />
          </div>
          <div className="flex items-center gap-3">
            <Skeleton className="h-4 w-32 rounded-sm" shape="text" />
            <Skeleton className="h-6 w-24 rounded-md" shape="block" />
          </div>
        </div>
      ))}
    </div>
  );
}

function StateShell({ children }: { children: ReactNode }) {
  return (
    <div className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      {children}
    </div>
  );
}

function CyclesEmpty({ onCreate }: { onCreate: () => void }) {
  return (
    <StateShell>
      <IconChip icon={Layers} className="shadow-xs" />
      <h3 className="text-base font-bold text-foreground">No empty return cycles yet</h3>
      <p className="max-w-md text-xs text-muted-foreground">
        When shipments finish unloading or new container returns are logged, they appear here for
        pairing into chained return cycles.
      </p>
      <Button type="button" size="sm" className="mt-2 shadow-xs" onClick={onCreate}>
        <Plus className="size-4" aria-hidden />
        New return cycle
      </Button>
    </StateShell>
  );
}

function CyclesEmptyFiltered({ onClear }: { onClear: () => void }) {
  return (
    <StateShell>
      <IconChip icon={Filter} tint="neutral" />
      <h3 className="text-base font-bold text-foreground">No cycles match these filters</h3>
      <p className="max-w-sm text-xs text-muted-foreground">
        Widen the search, or drop the urgency, status, party and location narrowings.
      </p>
      <Button type="button" variant="outline" size="sm" className="mt-2" onClick={onClear}>
        Clear all filters
      </Button>
    </StateShell>
  );
}

function CyclesErrorCard({ onRetry }: { onRetry: () => void }) {
  return (
    <div className="m-4 flex flex-wrap items-center justify-between gap-3 rounded-md border border-destructive/30 bg-destructive/10 p-4">
      <div className="flex items-center gap-3">
        <AlertTriangle className="size-5 shrink-0 text-destructive" aria-hidden />
        <div>
          <p className="text-sm font-semibold text-destructive">
            Could not load empty return cycles.
          </p>
          <p className="text-xs text-destructive/80">Check the connection and try again.</p>
        </div>
      </div>
      <Button type="button" variant="outline" size="sm" onClick={onRetry}>
        Retry
      </Button>
    </div>
  );
}
