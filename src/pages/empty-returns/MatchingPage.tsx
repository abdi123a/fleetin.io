import { useMemo, useState } from 'react';

import { TablePager, usePagedRows } from '@/components/common/TablePager';
import {
  Badge,
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  EmptyState,
} from '@/design-system';
import { ArrowLeftRight, Info, MapPin, PackageOpen, RotateCcw } from '@/design-system/icons';
import { riskTextClass } from '@/data/emptyReturnData';
import {
  incompatibleLoadsFor,
  suggestLoadsFor,
  useEmptyContainerActions,
  useEmptyContainers,
} from '@/features/empty-returns';
import {
  formatSpan,
  rejectedLoadsFor,
  riskOf,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { IncompatibleLoadList, PairingSuggestionCard } from './components/PairingSuggestionCard';
import { CompanyName, EmptyTag, Mono, RiskBadge } from './components/marks';

/**
 * Matching — *which empty containers are available, and where can they be used?*
 *
 * A two-column workbench: the containers awaiting a decision on the left, the
 * opportunities for the selected one on the right. The Control Tower's dialog
 * answers the same question for one container you arrived with in mind; this
 * page is for working *down* the pile.
 *
 * ## Responsive by construction
 *
 * The two columns are a 12-column grid that collapses to one on anything under
 * a laptop, and **every flex child carries `min-w-0`**. That is not decoration:
 * without it a location like "Djibouti International Free Trade Zone (DIFTZ) —
 * PK12 Freezone" sets the column's intrinsic width and pushes the whole page
 * off the right edge of a phone, which is exactly what it used to do.
 *
 * ## Demand is never entered here
 *
 * Every opportunity on the right is a real open shipment created in the
 * Shipment module. There is no full-load inventory to maintain in this product,
 * and adding one would be a second place the truth could live.
 *
 * The right column always ends in something. If nothing can take the container
 * it says so, says *why* under a disclosure, and offers the other branch —
 * "no match" is not an answer an operator can act on and "plan the return
 * instead" is.
 */
export function MatchingPage() {
  const { awaiting, loads, now } = useEmptyContainers();
  const selectedId = useEmptyReturnStore((state) => state.selectedEmptyId);
  const selectEmpty = useEmptyReturnStore((state) => state.selectEmpty);
  const openRecord = useEmptyReturnStore((state) => state.openRecord);
  const rejected = useEmptyReturnStore((state) => state.rejected);
  const rejectPairing = useEmptyReturnStore((state) => state.rejectPairing);
  const actions = useEmptyContainerActions();

  const [showIncompatible, setShowIncompatible] = useState(false);
  const paged = usePagedRows(awaiting, { pageSize: 8 });

  /* The selection follows the queue: an id that no longer exists (its container
     was just paired) falls back to the top of the list rather than emptying the
     right-hand column and looking broken. */
  const selected = useMemo(
    () => awaiting.find((record) => record.id === selectedId) ?? awaiting[0] ?? null,
    [awaiting, selectedId],
  );

  const rejectedIds = useMemo(
    () => (selected ? rejectedLoadsFor(rejected, selected.id) : []),
    [rejected, selected],
  );
  const suggestions = useMemo(
    () => suggestLoadsFor(selected, loads, now, rejectedIds),
    [selected, loads, now, rejectedIds],
  );
  const incompatible = useMemo(
    () => incompatibleLoadsFor(selected, loads, now),
    [selected, loads, now],
  );

  if (awaiting.length === 0) {
    return (
      <Card className="rounded-lg border border-border/80 p-12">
        <EmptyState
          icon={<PackageOpen />}
          title="No container is waiting on a decision"
          description="A container appears here the moment a delivered booking is marked Empty Ready in Shipments. Everything under management is either paired or already going back."
        />
      </Card>
    );
  }

  return (
    <div className="grid w-full min-w-0 grid-cols-1 gap-5 lg:grid-cols-12">
      {/* ── The pile ─────────────────────────────────────────────────────── */}
      <div className="min-w-0 space-y-3 lg:col-span-5 xl:col-span-4">
        <h2 className="flex items-center gap-2 text-base font-bold text-foreground">
          Awaiting a decision
          <Badge variant="subtle" intent="primary" size="sm" className="font-bold">
            {awaiting.length}
          </Badge>
        </h2>

        <div className="space-y-2.5">
          {paged.rows.map((record) => (
            <ContainerOption
              key={record.id}
              record={record}
              now={now}
              selected={selected?.id === record.id}
              onSelect={() => selectEmpty(record.id)}
            />
          ))}
        </div>

        {awaiting.length > paged.pageSize && <TablePager paged={paged} noun="containers" />}
      </div>

      {/* ── The opportunities ────────────────────────────────────────────── */}
      <div className="min-w-0 space-y-3 lg:col-span-7 xl:col-span-8">
        {selected && (
          <div className="min-w-0 rounded-lg border border-border/80 bg-secondary/40 px-4 py-3">
            <div className="flex min-w-0 flex-wrap items-center gap-2">
              <span className="shrink-0 text-xs font-bold uppercase tracking-wide text-muted-foreground">
                Matching for
              </span>
              <EmptyTag small className="shrink-0" />
              <Mono className="truncate text-sm font-bold text-foreground">
                {selected.container || selected.bookingReference}
              </Mono>
              {selected.deadline && (
                <span
                  className={cn(
                    'shrink-0 font-mono text-xs font-bold',
                    riskTextClass(riskOf(selected, now)),
                  )}
                >
                  {selected.deadline < now
                    ? `${formatSpan(now - selected.deadline)} past the deadline`
                    : `${formatSpan(selected.deadline - now)} left`}
                </span>
              )}
            </div>
            <p className="mt-1 text-xs text-muted-foreground">
              {suggestions.length > 0
                ? `${suggestions.length} open shipment${suggestions.length === 1 ? '' : 's'} could take this container.`
                : 'No open shipment can take this container before its deadline.'}
            </p>
          </div>
        )}

        {selected && suggestions.length === 0 ? (
          <Card className="rounded-lg border border-border/80 p-8 text-center">
            <p className="text-sm font-bold text-foreground">No shipment opportunity</p>
            <p className="mx-auto mt-1 max-w-md text-xs text-muted-foreground">
              Nothing currently open can collect this container before its return deadline. The
              other branch is the answer.
            </p>
            <Button
              variant="primary"
              size="sm"
              onClick={() => openRecord(selected.id, 'return')}
              disabled={actions.isBusy}
              className="mt-4 gap-1.5 rounded-lg"
            >
              <RotateCcw className="size-3.5" /> Plan empty return
            </Button>
          </Card>
        ) : (
          selected &&
          suggestions.map((suggestion, index) => (
            <PairingSuggestionCard
              key={suggestion.load.id}
              suggestion={suggestion}
              featured={index === 0}
              disabled={actions.isBusy}
              onConfirm={() => void actions.confirmPairing(selected, suggestion.load)}
              onReject={() => rejectPairing(suggestion.load.id, selected.id)}
            />
          ))
        )}

        {selected && incompatible.length > 0 && (
          <Collapsible open={showIncompatible} onOpenChange={setShowIncompatible}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="sm" className="h-8 gap-1.5 px-2 text-xs text-muted-foreground">
                <Info className="size-3.5" /> Why not the other {incompatible.length} shipment
                {incompatible.length === 1 ? '' : 's'}?
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <IncompatibleLoadList loads={incompatible} />
            </CollapsibleContent>
          </Collapsible>
        )}

        <p className="text-xs text-muted-foreground">
          Opportunities come straight from created shipments — there is no separate full-load
          inventory here. Confirming a pairing commits that load and ends this module&rsquo;s work
          on the container.
        </p>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * One container in the pile
 * ------------------------------------------------------------------------- */

function ContainerOption({
  record,
  now,
  selected,
  onSelect,
}: {
  record: EmptyReturnRecord;
  now: number;
  selected: boolean;
  onSelect: () => void;
}) {
  const risk = riskOf(record, now);

  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        'w-full min-w-0 rounded-lg border p-3 text-left shadow-2xs transition duration-200',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
        selected
          ? 'border-primary bg-primary-subtle/40 ring-1 ring-primary/25'
          : 'border-border/80 bg-card hover:border-primary/40 hover:shadow-md',
      )}
    >
      <div className="flex min-w-0 items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5">
          {selected && <ArrowLeftRight className="size-3.5 shrink-0 text-primary" aria-hidden />}
          <Mono className="truncate text-sm font-bold text-foreground">
            {record.container || record.bookingReference}
          </Mono>
        </span>
        <RiskBadge risk={risk} className="shrink-0" />
      </div>

      <div className="mt-1 truncate text-[11px] text-muted-foreground">
        {record.size} · {record.line}
      </div>

      <div className="mt-0.5 flex min-w-0 items-center gap-1 text-[11px] text-muted-foreground">
        <MapPin className="size-3 shrink-0" aria-hidden />
        <span className="truncate" title={record.locationName}>
          {record.locationName}
        </span>
      </div>

      <div className="mt-1.5 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1 border-t border-border/60 pt-1.5 text-[11px]">
        <CompanyName name={record.client} className="min-w-0 text-muted-foreground" />
        {record.deadline && (
          <Mono className={cn('shrink-0 font-bold', riskTextClass(risk))}>
            {record.deadline < now
              ? `${formatSpan(now - record.deadline)} overdue`
              : `${formatSpan(record.deadline - now)} left`}
          </Mono>
        )}
      </div>
    </button>
  );
}

export default MatchingPage;
