import { format, parseISO, startOfDay, endOfDay } from 'date-fns';
import { Sparkles } from 'lucide-react';
import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react';
import { createPortal } from 'react-dom';

import { Button, DatePicker, IconButton, IconChip, Input, Label, Select } from '@/design-system';
import {
  ArrowRight,
  CheckCircle2,
  CornerDownLeft,
  FileText,
  Search,
  Trash2,
  Truck,
  X,
} from '@/design-system/icons';
import {
  formatDateTime,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord, FullLoadMission } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { CompanyName, Mono } from './atoms';

const FREEZONE_OPTIONS = [
  { value: 'all', label: 'All pickup freezones' },
  { value: 'LOC-00002', label: 'Djibouti Free Zone — Warehouse Block B-12' },
  { value: 'LOC-00001', label: 'Boulaos Industrial Yard' },
  { value: 'LOC-00003', label: 'PK12 Dry Port Yard' },
  { value: 'LOC-00004', label: 'Ali Sabieh Logistics Hub' },
  { value: 'LOC-00005', label: 'Nagad Inland Container Depot' },
] as const;

const SIZE_OPTIONS = [
  { value: 'all', label: 'All sizes' },
  { value: '20', label: '20′' },
  { value: '40', label: '40′' },
] as const;

const AVAILABILITY_SIZES = ['20GP', '40HC'] as const;
const AVAILABILITY_LINES = ['Maersk', 'Hapag-Lloyd', 'MSC', 'CMA CGM', 'ONE'] as const;

const DRAG_MIME = 'application/x-fleetin-empty-id';

export interface DualTransactionsRecommendationsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Fired after one or more cycles are accepted. */
  onAccepted?: (recordIds: string[]) => void;
}

interface FilterDraft {
  dateFrom: string;
  dateTo: string;
  freezoneId: string;
  size: string;
}

function todayIso(): string {
  return format(new Date(), 'yyyy-MM-dd');
}

function defaultDateToIso(): string {
  return format(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), 'yyyy-MM-dd');
}

function initialFilters(): FilterDraft {
  return {
    dateFrom: todayIso(),
    dateTo: defaultDateToIso(),
    freezoneId: 'all',
    size: 'all',
  };
}

function typeMatchesSize(type: string, size: string): boolean {
  if (size === 'all') return true;
  return type.startsWith(size);
}

function inDateRange(ts: number, from: string, to: string): boolean {
  if (!from && !to) return true;
  const day = startOfDay(new Date(ts)).getTime();
  if (from) {
    const fromTs = startOfDay(parseISO(from)).getTime();
    if (day < fromTs) return false;
  }
  if (to) {
    const toTs = endOfDay(parseISO(to)).getTime();
    if (day > toTs) return false;
  }
  return true;
}

function formatAppt(ts: number): string {
  const date = new Date(ts);
  const day = date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' });
  const time = date.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
  return `${day} · ${time}`;
}

function displayType(type: string): string {
  if (type === '20GP') return "20' GP";
  if (type === '40HC') return "40' HC";
  return type;
}

interface ConfirmedPair {
  mission: FullLoadMission;
  empty: EmptyReturnRecord;
}

const CONFIRM_EFFECTS = [
  'A dual transaction request for all the listed matches will be sent to the terminal.',
  'The return appointment, return hub, and assigned transporter of the empty will be updated to match the linked outgate.',
] as const;

/* ---------------------------------------------------------------------------
 * Confirm dialog
 * ------------------------------------------------------------------------- */

function ConfirmDualsDialog({
  open,
  pairs,
  submitting,
  onClose,
  onConfirm,
}: {
  open: boolean;
  pairs: ConfirmedPair[];
  submitting: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  if (!open) return null;

  return (
    <div
      className="absolute inset-0 z-50 flex items-center justify-center bg-overlay/70 p-4 backdrop-blur-[2px]"
      role="presentation"
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="confirm-duals-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-3xl flex-col overflow-hidden rounded-card border border-border bg-surface shadow-lg"
      >
        <header className="flex shrink-0 items-center gap-3 bg-primary-bold px-4 py-3 text-primary-bold-foreground">
          <button
            type="button"
            onClick={onClose}
            className="rounded-sm p-1.5 text-primary-bold-foreground/80 transition-colors hover:bg-primary-bold-foreground/10 hover:text-primary-bold-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-bold-foreground/40"
            aria-label="Close confirmation"
          >
            <X className="h-5 w-5" />
          </button>
          <h3
            id="confirm-duals-title"
            className="min-w-0 flex-1 text-sm font-semibold tracking-tight sm:text-base"
          >
            Confirm dual transaction requests
          </h3>
        </header>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto p-5 sm:p-6">
          <div className="rounded-card-nested border border-primary/20 bg-primary-subtle/40 px-4 py-3">
            <p className="type-body-sm font-medium text-foreground">
              If you trigger these requests, the following updates will occur:
            </p>
            <ul className="mt-3 grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {CONFIRM_EFFECTS.map((effect) => (
                <li key={effect} className="flex gap-2 type-body-xs text-muted-foreground">
                  <span
                    className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-primary"
                    aria-hidden
                  />
                  <span>{effect}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="space-y-3">
            {pairs.map(({ mission, empty }) => (
              <div
                key={`${mission.id}-${empty.id}`}
                className="grid grid-cols-1 items-stretch gap-2 overflow-hidden rounded-card-nested border border-border sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)]"
              >
                {/* Pickup — outbound full load (brand teal) */}
                <div className="min-w-0 space-y-1.5 bg-primary-bold/8 p-3 sm:p-4">
                  <span className="inline-flex items-center gap-1 rounded-sm bg-primary-bold px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary-bold-foreground">
                    <Truck className="h-3 w-3 shrink-0" aria-hidden />
                    Pickup
                  </span>
                  <Mono className="block type-body-sm text-foreground">
                    {mission.container}
                  </Mono>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {mission.locationName}
                  </p>
                  <Mono className="block text-[10px] text-primary">{mission.id}</Mono>
                </div>

                <div className="flex items-center justify-center bg-surface px-2 py-1 sm:py-0">
                  <IconChip size={36}>
                    <ArrowRight className="rotate-90 sm:rotate-0" aria-hidden />
                  </IconChip>
                </div>

                {/* Return — empty going back (recessed neutral) */}
                <div className="min-w-0 space-y-1.5 bg-muted/70 p-3 sm:p-4">
                  <span className="inline-flex items-center gap-1 rounded-sm bg-secondary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-secondary-foreground">
                    <CornerDownLeft className="h-3 w-3 shrink-0" aria-hidden />
                    Return
                  </span>
                  <Mono className="block type-body-sm text-foreground">
                    {empty.container}
                  </Mono>
                  <p className="truncate text-[11px] text-muted-foreground">
                    {empty.locationName}
                  </p>
                  <Mono className="block text-[10px] text-muted-foreground">{empty.id}</Mono>
                </div>
              </div>
            ))}
          </div>
        </div>

        <footer className="flex shrink-0 items-center justify-end gap-2 border-t border-border bg-surface-sunken/40 px-5 py-3 sm:px-6">
          <Button type="button" variant="ghost" onClick={onClose} disabled={submitting}>
            Close
          </Button>
          <Button
            type="button"
            variant="primary"
            trailingIcon={<ArrowRight className="h-3.5 w-3.5" />}
            isLoading={submitting}
            onClick={onConfirm}
          >
            Request duals
          </Button>
        </footer>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Cards
 * ------------------------------------------------------------------------- */

const MATCH_ROW_GRID =
  'grid grid-cols-1 items-stretch gap-2 sm:grid-cols-[minmax(0,1fr)_2rem_minmax(0,1fr)] sm:gap-3';

function MatchCardShell({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        'flex h-full min-h-[6.75rem] flex-col justify-between rounded-card-nested border px-3 py-2.5',
        className,
      )}
    >
      {children}
    </div>
  );
}

function OutgateCard({ mission }: { mission: FullLoadMission }) {
  return (
    <MatchCardShell className="border-border bg-surface shadow-xs">
      <div className="min-w-0 space-y-1">
        <div className="flex min-w-0 items-baseline gap-x-1.5">
          <Mono className="truncate type-body-sm text-foreground">
            {mission.container}
          </Mono>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            · {displayType(mission.type)}
          </span>
        </div>
        <div className="min-w-0 type-body-xs">
          <CompanyName name={mission.client} tone="strong" />
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {mission.line} · → {mission.locationName}
        </p>
      </div>
      <p className="mt-2 truncate text-[10px] font-medium text-primary">
        Appt {formatAppt(mission.pickupAt)}
      </p>
    </MatchCardShell>
  );
}

function ReturnCard({
  record,
  onRemove,
}: {
  record: EmptyReturnRecord;
  onRemove?: () => void;
}) {
  return (
    <MatchCardShell className="relative border-primary/25 bg-primary-subtle/40">
      {onRemove && (
        <IconButton
          type="button"
          aria-label={`Unmatch ${record.container}`}
          variant="ghost"
          size="sm"
          className="absolute right-1 top-1 h-7 w-7 text-muted-foreground hover:text-destructive"
          onClick={onRemove}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </IconButton>
      )}
      <div className="min-w-0 space-y-1 pr-7">
        <div className="flex min-w-0 items-baseline gap-x-1.5">
          <Mono className="truncate type-body-sm text-foreground">
            {record.container}
          </Mono>
          <span className="shrink-0 text-[11px] text-muted-foreground">
            · {displayType(record.type)}
          </span>
        </div>
        <div className="min-w-0 type-body-xs">
          <CompanyName name={record.client} tone="strong" />
        </div>
        <p className="truncate text-[11px] text-muted-foreground">
          {record.line} · {record.locationName}
        </p>
      </div>
      <p className="mt-2 truncate text-[10px] text-muted-foreground">
        {record.deadline ? `Deadline ${formatDateTime(record.deadline)}` : 'No deadline set'}
      </p>
    </MatchCardShell>
  );
}

function DropZone({
  active,
  onDropEmpty,
}: {
  active: boolean;
  onDropEmpty: (emptyId: string) => void;
}) {
  const [over, setOver] = useState(false);

  return (
    <div
      onDragOver={(event) => {
        event.preventDefault();
        event.dataTransfer.dropEffect = 'move';
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        const id =
          event.dataTransfer.getData(DRAG_MIME) || event.dataTransfer.getData('text/plain');
        if (id) onDropEmpty(id);
      }}
      className={cn(
        'flex h-full min-h-[6.75rem] flex-col items-center justify-center gap-1.5 rounded-card-nested border border-dashed px-3 py-2.5 text-center transition-colors',
        over || active
          ? 'border-primary bg-primary-subtle/50 text-primary'
          : 'border-border bg-surface-sunken/40 text-muted-foreground',
      )}
    >
      <FileText className="h-5 w-5 shrink-0 opacity-70" aria-hidden />
      <p className="text-[11px] font-semibold leading-snug">Drag & Drop Your Container Here</p>
    </div>
  );
}

function UnassignedCard({
  record,
  onRecommend,
  disabled,
}: {
  record: EmptyReturnRecord;
  onRecommend: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      draggable={!disabled}
      onDragStart={(event) => {
        event.dataTransfer.setData(DRAG_MIME, record.id);
        event.dataTransfer.setData('text/plain', record.id);
        event.dataTransfer.effectAllowed = 'move';
      }}
      className={cn(
        'rounded-card-nested border border-border bg-surface px-3 py-2.5 shadow-xs transition-shadow',
        !disabled && 'cursor-grab active:cursor-grabbing hover:shadow-sm',
        disabled && 'opacity-50',
      )}
    >
      <div className="flex flex-wrap items-baseline gap-x-1.5 gap-y-0.5">
        <Mono className="type-body-sm text-foreground">{record.container}</Mono>
        <span className="text-[11px] text-muted-foreground">· {displayType(record.type)}</span>
      </div>
      <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-0.5 type-body-xs">
        <CompanyName name={record.client} tone="strong" />
      </div>
      <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
        {record.line} · {record.locationName}
      </p>
      <Button
        type="button"
        size="sm"
        variant="subtle"
        fullWidth
        disabled={disabled}
        leadingIcon={<Sparkles className="h-3.5 w-3.5" />}
        className="mt-2.5"
        onClick={onRecommend}
      >
        Recommend Match
      </Button>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Modal
 * ------------------------------------------------------------------------- */

export function DualTransactionsRecommendationsModal({
  open,
  onOpenChange,
  onAccepted,
}: DualTransactionsRecommendationsModalProps) {
  const records = useEmptyReturnStore((state) => state.records);
  const missions = useEmptyReturnStore((state) => state.missions);
  const createCycle = useEmptyReturnStore((state) => state.createCycle);
  const notify = useEmptyReturnStore((state) => state.notify);

  const [draft, setDraft] = useState<FilterDraft>(initialFilters);
  const [applied, setApplied] = useState<FilterDraft>(initialFilters);
  /** missionId → empty record id */
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [search, setSearch] = useState('');
  const [clientFilter, setClientFilter] = useState<string | null>(null);
  const [dragActiveMission, setDragActiveMission] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [accepting, setAccepting] = useState(false);

  useEffect(() => {
    if (!open) return;
    const next = initialFilters();
    setDraft(next);
    setApplied(next);
    setMatches({});
    setSearch('');
    setClientFilter(null);
    setConfirmOpen(false);
    setAccepting(false);
  }, [open]);

  const outgates = useMemo(() => {
    return missions.filter((mission) => {
      if (applied.freezoneId !== 'all' && mission.locationId !== applied.freezoneId) return false;
      if (!typeMatchesSize(mission.type, applied.size)) return false;
      if (!inDateRange(mission.pickupAt, applied.dateFrom, applied.dateTo)) return false;
      return true;
    });
  }, [missions, applied]);

  const matchedEmptyIds = useMemo(() => new Set(Object.values(matches)), [matches]);

  const emptiesPool = useMemo(() => {
    return records.filter((record) => {
      if (record.status !== 'empty_ready') return false;
      if (record.exception) return false;
      if (applied.freezoneId !== 'all' && record.locationId !== applied.freezoneId) return false;
      if (!typeMatchesSize(record.type, applied.size)) return false;
      return true;
    });
  }, [records, applied]);

  const unassigned = useMemo(() => {
    const q = search.trim().toLowerCase();
    return emptiesPool.filter((record) => {
      if (matchedEmptyIds.has(record.id)) return false;
      if (clientFilter && record.client !== clientFilter) return false;
      if (!q) return true;
      return (
        record.container.toLowerCase().includes(q) ||
        record.client.toLowerCase().includes(q) ||
        record.line.toLowerCase().includes(q) ||
        record.locationName.toLowerCase().includes(q)
      );
    });
  }, [emptiesPool, matchedEmptyIds, search, clientFilter]);

  const clientTags = useMemo(() => {
    const names = new Set<string>();
    for (const record of emptiesPool) {
      if (!matchedEmptyIds.has(record.id)) names.add(record.client);
    }
    return Array.from(names).sort((a, b) => a.localeCompare(b));
  }, [emptiesPool, matchedEmptyIds]);

  const availability = useMemo(() => {
    return AVAILABILITY_LINES.map((line) => ({
      line,
      cells: AVAILABILITY_SIZES.map((size) =>
        emptiesPool.some((record) => record.line === line && record.type === size),
      ),
    }));
  }, [emptiesPool]);

  const emptyById = useMemo(() => {
    const map = new Map<string, EmptyReturnRecord>();
    for (const record of records) map.set(record.id, record);
    return map;
  }, [records]);

  const matchedCount = Object.keys(matches).length;

  const confirmedPairs = useMemo((): ConfirmedPair[] => {
    const pairs: ConfirmedPair[] = [];
    for (const [missionId, emptyId] of Object.entries(matches)) {
      const mission = missions.find((item) => item.id === missionId);
      const empty = emptyById.get(emptyId);
      if (mission && empty) pairs.push({ mission, empty });
    }
    return pairs;
  }, [matches, missions, emptyById]);

  const assignEmpty = useCallback((missionId: string, emptyId: string) => {
    setMatches((prev) => {
      const next = { ...prev };
      for (const [mid, eid] of Object.entries(next)) {
        if (eid === emptyId) delete next[mid];
      }
      next[missionId] = emptyId;
      return next;
    });
  }, []);

  const unmatch = useCallback((missionId: string) => {
    setMatches((prev) => {
      const next = { ...prev };
      delete next[missionId];
      return next;
    });
  }, []);

  const recommendForEmpty = useCallback(
    (empty: EmptyReturnRecord) => {
      const preferred = outgates.find(
        (mission) => !matches[mission.id] && mission.locationId === empty.locationId,
      );
      const fallback = outgates.find((mission) => !matches[mission.id]);
      const target = preferred ?? fallback;
      if (!target) {
        notify('No open outgate left to recommend against.');
        return;
      }
      assignEmpty(target.id, empty.id);
    },
    [assignEmpty, matches, notify, outgates],
  );

  const handleApply = () => {
    setApplied({ ...draft });
    setMatches({});
    setClientFilter(null);
  };

  const handleAcceptClick = () => {
    if (Object.keys(matches).length === 0) return;
    setConfirmOpen(true);
  };

  const handleRequestDuals = () => {
    const pairs = Object.entries(matches);
    if (pairs.length === 0) return;

    setAccepting(true);
    const createdIds: string[] = [];
    let created = 0;

    for (const [missionId, emptyId] of pairs) {
      const mission = missions.find((item) => item.id === missionId);
      if (!mission) continue;
      const result = createCycle(emptyId, mission);
      if (result) {
        created += 1;
        createdIds.push(emptyId);
      }
    }

    if (created > 0) {
      notify(
        created === 1
          ? 'Dual transaction requested — cycle created.'
          : `${created} dual transactions requested — cycles created.`,
      );
      setConfirmOpen(false);
      onAccepted?.(createdIds);
      onOpenChange(false);
    } else {
      notify('Could not request duals — refresh and try again.');
      setAccepting(false);
    }
  };

  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-overlay flex items-center justify-center bg-overlay/60 p-4 backdrop-blur-[2px] sm:p-6">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="dual-transactions-title"
        className="relative flex h-[min(92vh,880px)] w-full max-w-[1280px] flex-col overflow-hidden rounded-card border border-border bg-background shadow-lg"
      >
        {/* Header */}
        <header className="flex shrink-0 items-center gap-3 bg-primary-bold px-4 py-3 text-primary-bold-foreground sm:px-5">
          <button
            type="button"
            onClick={() => onOpenChange(false)}
            className="rounded-sm p-1.5 text-primary-bold-foreground/80 transition-colors hover:bg-primary-bold-foreground/10 hover:text-primary-bold-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-bold-foreground/40"
            aria-label="Cancel"
          >
            <X className="h-5 w-5" />
          </button>

          <h2
            id="dual-transactions-title"
            className="min-w-0 flex-1 truncate text-center text-sm font-semibold tracking-tight sm:text-base"
          >
            Dual Transactions Recommendations
          </h2>

          <Button
            type="button"
            size="sm"
            variant="secondary"
            trailingIcon={<ArrowRight className="h-3.5 w-3.5" />}
            disabled={matchedCount === 0 || accepting}
            onClick={handleAcceptClick}
            className="shrink-0 border-0 bg-primary text-primary-foreground hover:bg-primary-hover"
          >
            Accept{matchedCount > 0 ? ` (${matchedCount})` : ''}
          </Button>
        </header>

        <ConfirmDualsDialog
          open={confirmOpen}
          pairs={confirmedPairs}
          submitting={accepting}
          onClose={() => {
            if (!accepting) setConfirmOpen(false);
          }}
          onConfirm={handleRequestDuals}
        />

        {/* Body */}
        <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-[minmax(240px,280px)_minmax(0,1fr)_minmax(240px,300px)]">
          {/* Left — filters */}
          <aside className="flex min-h-0 flex-col border-b border-border bg-surface lg:border-b-0 lg:border-r">
            <div className="min-h-0 flex-1 space-y-5 overflow-y-auto p-4">
              <section className="space-y-3">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Find matches for these full container
                </h3>

                <div className="grid grid-cols-2 gap-2.5">
                  <div className="space-y-1.5">
                    <Label htmlFor="dual-date-from" className="text-[11px]">
                      Date from
                    </Label>
                    <DatePicker
                      value={draft.dateFrom}
                      onChange={(value) => setDraft((prev) => ({ ...prev, dateFrom: value }))}
                      displayFormat="MM/dd/yy"
                      isClearable={false}
                      className="w-full"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label htmlFor="dual-date-to" className="text-[11px]">
                      Date to
                    </Label>
                    <DatePicker
                      value={draft.dateTo}
                      onChange={(value) => setDraft((prev) => ({ ...prev, dateTo: value }))}
                      displayFormat="MM/dd/yy"
                      isClearable={false}
                      className="w-full"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dual-freezone" className="text-[11px]">
                    Empty Return Destination
                  </Label>
                  <Select
                    id="dual-freezone"
                    selectSize="sm"
                    value={draft.freezoneId}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, freezoneId: event.target.value }))
                    }
                    options={[...FREEZONE_OPTIONS]}
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="dual-size" className="text-[11px]">
                    Size
                  </Label>
                  <Select
                    id="dual-size"
                    selectSize="sm"
                    value={draft.size}
                    onChange={(event) =>
                      setDraft((prev) => ({ ...prev, size: event.target.value }))
                    }
                    options={[...SIZE_OPTIONS]}
                  />
                </div>

                <Button type="button" variant="subtle" fullWidth onClick={handleApply}>
                  Apply
                </Button>
              </section>

              <section className="space-y-2">
                <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                  Availability board
                </h3>
                <div className="overflow-hidden rounded-card-nested border border-border">
                  <table className="w-full text-left text-[10px]">
                    <thead className="bg-surface-sunken text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5 font-semibold">Line</th>
                        {AVAILABILITY_SIZES.map((size) => (
                          <th key={size} className="px-1.5 py-1.5 text-center font-semibold">
                            {size === '20GP' ? "20'" : '40 HC'}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-border/60">
                      {availability.map((row) => (
                        <tr key={row.line}>
                          <td className="truncate px-2 py-1.5 font-medium text-foreground">
                            {row.line}
                          </td>
                          {row.cells.map((ok, index) => (
                            <td
                              key={AVAILABILITY_SIZES[index]}
                              className="px-1.5 py-1.5 text-center"
                            >
                              {ok ? (
                                <CheckCircle2
                                  className="mx-auto h-3.5 w-3.5 text-success"
                                  aria-label="Available"
                                />
                              ) : (
                                <span className="text-muted-foreground/40">—</span>
                              )}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            </div>
          </aside>

          {/* Center — matching workspace */}
          <section className="flex min-h-0 flex-col border-b border-border bg-surface-sunken/30 lg:border-b-0">
            <div className={cn(MATCH_ROW_GRID, 'shrink-0 border-b border-border bg-surface px-4 py-2.5')}>
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Full Delivery
              </p>
              <span className="hidden sm:block" aria-hidden />
              <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Empty Return
              </p>
            </div>

            <div className="min-h-0 flex-1 space-y-3 overflow-y-auto p-4">
              {outgates.length === 0 ? (
                <div className="rounded-card-nested border border-border bg-surface px-4 py-8 text-center">
                  <p className="type-body-sm text-muted-foreground">
                    No outgate pickups for these filters. Widen the date range or freezone, then
                    Apply.
                  </p>
                </div>
              ) : (
                outgates.map((mission) => {
                  const emptyId = matches[mission.id];
                  const empty = emptyId ? emptyById.get(emptyId) : undefined;

                  return (
                    <div
                      key={mission.id}
                      className={MATCH_ROW_GRID}
                      onDragEnter={() => setDragActiveMission(mission.id)}
                      onDragLeave={() =>
                        setDragActiveMission((current) =>
                          current === mission.id ? null : current,
                        )
                      }
                    >
                      <OutgateCard mission={mission} />

                      <div className="flex items-center justify-center">
                        <ArrowRight
                          className="h-4 w-4 rotate-90 text-muted-foreground sm:rotate-0"
                          aria-hidden
                        />
                      </div>

                      {empty ? (
                        <ReturnCard record={empty} onRemove={() => unmatch(mission.id)} />
                      ) : (
                        <DropZone
                          active={dragActiveMission === mission.id}
                          onDropEmpty={(id) => {
                            setDragActiveMission(null);
                            assignEmpty(mission.id, id);
                          }}
                        />
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </section>

          {/* Right — unassigned */}
          <aside className="flex min-h-0 flex-col bg-surface lg:border-l lg:border-border">
            <div className="shrink-0 space-y-3 border-b border-border p-4">
              <h3 className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground">
                Unassigned Empty
              </h3>
              <Input
                inputSize="sm"
                placeholder="Search container..."
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                leadingIcon={<Search className="h-3.5 w-3.5" />}
                isClearable={Boolean(search)}
                onClear={() => setSearch('')}
              />
              {clientTags.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {clientTags.map((name) => {
                    const selected = clientFilter === name;
                    return (
                      <button
                        key={name}
                        type="button"
                        onClick={() => setClientFilter(selected ? null : name)}
                        className={cn(
                          'rounded-sm px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide transition-colors',
                          selected
                            ? 'bg-primary-subtle text-primary-subtle-foreground'
                            : 'text-primary/80 hover:bg-primary-subtle/60 hover:text-primary',
                        )}
                      >
                        {name}
                      </button>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="min-h-0 flex-1 space-y-2.5 overflow-y-auto p-4">
              {unassigned.length === 0 ? (
                <p className="type-body-sm text-muted-foreground">
                  No unassigned empties for these filters.
                </p>
              ) : (
                unassigned.map((record) => (
                  <UnassignedCard
                    key={record.id}
                    record={record}
                    disabled={outgates.every((mission) => matches[mission.id])}
                    onRecommend={() => recommendForEmpty(record)}
                  />
                ))
              )}
            </div>
          </aside>
        </div>
      </div>
    </div>,
    document.body,
  );
}

export default DualTransactionsRecommendationsModal;
