import type { ReactNode } from 'react';

import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  Package,
  PackageOpen,
  RotateCcw,
} from '@/design-system/icons';
import { CONTAINER_STAGE_META } from '@/data/emptyReturnData';
import { emptyDwellOf, formatSpan, formatStamp } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { Mono } from './marks';

/**
 * One container's whole story in three cards: where it came from, where it is,
 * what happens next.
 *
 * This is the diagram the product turns on, so it is drawn rather than
 * described. Read left to right:
 *
 * ```
 *   FULL  MSKU7070707  ──unloaded──▶  EMPTY  MSKU7070707  ──paired──▶  FULL  CMAU8110034
 *   (the same physical box, changing state)      (a different box, on a different shipment)
 * ```
 *
 * The first arrow is thin and neutral: same container, new state. The second is
 * the pairing connector and is labelled *different container* in as many words,
 * because the single most damaging misreading of this product is believing the
 * empty box becomes the next full box. It does not. It travels *with* a
 * different full-load operation so the empty leg is not driven on its own.
 *
 * The right-hand card is whichever branch the container took — a paired full
 * load, a planned or completed return, or the open question when nobody has
 * decided yet.
 */

interface FlowCardProps {
  label: string;
  tone: 'full' | 'empty' | 'paired' | 'return' | 'done' | 'undecided';
  children: ReactNode;
}

const TONE: Record<FlowCardProps['tone'], string> = {
  /* The app-wide container pair: teal slab while full, yellow dashed once
     empty, grey once home — the same colours the shipment view uses. */
  full: 'bg-container-full text-container-full-foreground border-container-full',
  empty:
    'border-2 border-dashed border-container-empty-border bg-container-empty-subtle/60 text-foreground',
  paired:
    'border-2 border-container-full-border bg-container-full-subtle text-container-full-subtle-foreground',
  return: 'border-2 border-warning bg-warning-subtle text-warning-subtle-foreground',
  done: 'border-2 border-container-returned-border bg-container-returned-subtle text-container-returned-subtle-foreground',
  undecided: 'border-2 border-dashed border-border-strong bg-surface-sunken text-muted-foreground',
};

function FlowCard({ label, tone, children }: FlowCardProps) {
  return (
    <div className={cn('min-w-40 flex-1 rounded-card-nested px-3.5 py-3', TONE[tone])}>
      {/* "Delivered full load", not "DELIVERED FULL LOAD". Three tracked
          all-caps card titles beside four more in the dialog around them left
          nothing quiet enough to read first. */}
      <div className="text-2xs font-bold opacity-70">{label}</div>
      <div className="mt-1">{children}</div>
    </div>
  );
}

/** Same container, new state. Deliberately quiet — nothing changed hands here. */
function UnloadArrow() {
  return (
    <div className="flex shrink-0 flex-row items-center justify-center gap-1.5 self-center px-1.5 @[36rem]/flow:flex-col @[36rem]/flow:gap-0">
      <ArrowRight
        className="size-4 rotate-90 text-border-strong @[36rem]/flow:rotate-0"
        aria-hidden
      />
      <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground">
        Unloaded
      </span>
    </div>
  );
}

/** Two different containers, linked. The label is the whole point of the mark. */
function PairArrow() {
  return (
    <div className="flex shrink-0 flex-row flex-wrap items-center justify-center gap-x-1.5 self-center px-1.5 @[36rem]/flow:flex-col @[36rem]/flow:gap-x-0">
      <ArrowLeftRight
        className="size-4 rotate-90 text-primary @[36rem]/flow:rotate-0"
        aria-hidden
      />
      <span className="text-[8px] font-bold uppercase tracking-wide text-primary">Paired</span>
      <span className="whitespace-nowrap text-[7px] text-muted-foreground">different container</span>
    </div>
  );
}

export interface OperationFlowProps {
  record: EmptyReturnRecord;
  now: number;
  className?: string;
}

export function OperationFlow({ record, now, className }: OperationFlowProps) {
  const next = record.nextFull;
  const returning = record.stage === 'return_planned' || record.stage === 'closed';
  const dwell = emptyDwellOf(record, now);

  return (
    /* Stacks below 36rem instead of scrolling sideways. Three cards at their
       160px minimum plus two arrows need ~560px, and inside a dialog on a phone
       there are 340. Sideways was the old answer and it hid the third card —
       the one that says what happens next — behind a drag nobody performs. The
       query is on the flow itself, not the viewport: this strip is dropped into
       a dialog, a row card and a page, each of which hands it a different
       width at the same screen size. */
    <div className={cn('@container/flow', className)}>
      <div className="flex flex-col items-stretch gap-1 @[36rem]/flow:flex-row">
      {/* PAST — the full load that produced this empty */}
      <FlowCard label="Delivered full load" tone="full">
        <div className="flex items-center gap-1.5">
          <Package className="size-3 shrink-0" aria-hidden />
          <Mono className="truncate text-sm font-bold">{record.container || '—'}</Mono>
        </div>
        <div className="mt-0.5 text-2xs opacity-80">
          <Mono>{record.shipmentReference ?? record.prevLoad}</Mono>
        </div>
        <div className="text-2xs opacity-70">Collected {formatStamp(record.fullPickupAt)}</div>
      </FlowCard>

      <UnloadArrow />

      {/* NOW — the same box, empty */}
      <FlowCard label={record.stage === 'closed' ? 'Empty' : 'Current'} tone="empty">
        <div className="flex items-center gap-1.5 text-container-empty-subtle-foreground">
          <PackageOpen className="size-3 shrink-0" aria-hidden />
          <Mono className="truncate text-sm font-bold text-foreground">
            {record.container || '—'}
          </Mono>
        </div>
        <div className="mt-0.5 truncate text-2xs text-muted-foreground">{record.locationName}</div>
        <div className="text-2xs text-muted-foreground">
          {record.stage === 'closed' || record.matchedAt || record.plannedReturnAt
            ? `Empty for ${formatSpan(dwell)} before the decision`
            : `Empty for ${formatSpan(now - (record.emptyReadyAt ?? now))}`}
        </div>
      </FlowCard>

      {next ? <PairArrow /> : <UnloadArrow />}

      {/* NEXT — the branch this container took */}
      {next ? (
        <FlowCard label="Paired full load" tone="paired">
          <div className="flex items-center gap-1.5">
            <Package className="size-3 shrink-0" aria-hidden />
            <Mono className="truncate text-sm font-bold">{next.container || '—'}</Mono>
          </div>
          <div className="mt-0.5 text-2xs">
            <Mono>{next.shipmentReference ?? next.missionId}</Mono>
          </div>
          <div className="truncate text-2xs text-muted-foreground">
            Pickup {formatStamp(next.pickupAt)}
          </div>
        </FlowCard>
      ) : returning ? (
        <FlowCard
          label={record.stage === 'closed' ? 'Returned' : CONTAINER_STAGE_META.return_planned.label}
          tone={record.stage === 'closed' ? 'done' : 'return'}
        >
          <div className="flex items-center gap-1.5">
            {record.stage === 'closed' ? (
              <CheckCircle2 className="size-3 shrink-0" aria-hidden />
            ) : (
              <RotateCcw className="size-3 shrink-0" aria-hidden />
            )}
            <Mono className="truncate text-sm font-bold">{record.container || '—'}</Mono>
          </div>
          <div className="mt-0.5 truncate text-2xs text-muted-foreground">{record.returnDepot}</div>
          <div className="text-2xs text-muted-foreground">
            {record.stage === 'closed'
              ? `Returned ${formatStamp(record.returnedAt)}`
              : record.plannedReturnAt
                ? `Planned ${formatStamp(record.plannedReturnAt)}`
                : `Deadline ${formatStamp(record.deadline)}`}
          </div>
        </FlowCard>
      ) : (
        <FlowCard label="Next decision" tone="undecided">
          <div className="text-xs font-semibold text-foreground">Nothing chosen yet</div>
          <div className="mt-0.5 text-2xs">Find a full load, or plan the empty return.</div>
        </FlowCard>
      )}
      </div>
    </div>
  );
}
