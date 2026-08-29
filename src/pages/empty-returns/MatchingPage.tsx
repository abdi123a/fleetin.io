import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { useSearchParams } from 'react-router-dom';
import { format, parse } from 'date-fns';

import {
  Button,
  Card,
  DatePicker,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  EmptyState,
  TimePicker,
} from '@/design-system';
import { AlertTriangle, ArrowLeftRight, CheckCircle2, RotateCcw, X } from '@/design-system/icons';
import { detentionFor, formatDetention, riskTextClass } from '@/data/emptyReturnData';
import {
  defaultPlannedReturn,
  incompatibleLoadsFor,
  suggestLoadsFor,
  useEmptyContainerActions,
  useEmptyContainers,
} from '@/features/empty-returns';
import { formatSpan, formatStamp, rejectedLoadsFor, riskOf, useEmptyReturnStore } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord, PairingSuggestion, SuggestionLabel } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { CompanyName, EmptyTag, FullTag, Mono, RiskBadge } from './components/marks';

/**
 * Matching — *which empty containers are available, and where can they be used?*
 *
 * Restored on 2026-08-29 from the v19 design, and since that same day the
 * module's **only** matching surface: the Match Recommendations popup was
 * deleted outright at the user's instruction, so there is one place a pairing
 * is made and no second screen to drift from it.
 *
 * It works one container at a time, deeply. Pick a box on the left, read every
 * opportunity for it on the right — the score, the margin, the compatibility
 * checklist, and under a disclosure the reason each refused load was refused.
 * Planning the return instead is the other branch and asks for a real slot.
 *
 * ## Demand is never entered here
 *
 * Every opportunity on the right is a real open shipment created in the
 * Shipment module. There is no full-load inventory to maintain in this product,
 * and adding one would be a second place the truth could live.
 */

const LABEL_STYLE: Record<SuggestionLabel, string> = {
  RECOMMENDED: 'bg-primary-bold text-primary-bold-foreground border-primary-bold',
  ALTERNATIVE: 'bg-card text-muted-foreground border-border',
  /* Amber, not red: a tight pairing is a real option somebody may have to take,
     and colouring it as a failure pushes them into a worse one. */
  'LAST OPTION': 'bg-stage-returning-subtle text-stage-returning-subtle-foreground border-stage-returning-border',
};

export function MatchingPage() {
  const { awaiting, loads, now } = useEmptyContainers();
  const selectedId = useEmptyReturnStore((state) => state.selectedEmptyId);
  const selectEmpty = useEmptyReturnStore((state) => state.selectEmpty);
  const rejected = useEmptyReturnStore((state) => state.rejected);
  const rejectPairing = useEmptyReturnStore((state) => state.rejectPairing);
  const actions = useEmptyContainerActions();

  /** v19's confirmation banner — the pairing that was just committed, drawn. */
  const [lastPairing, setLastPairing] = useState<{ empty: string; full: string; load: string } | null>(
    null,
  );
  const [showIncompatible, setShowIncompatible] = useState(false);
  /** The container a "Plan empty return" click is asking a slot for. */
  const [planTarget, setPlanTarget] = useState<EmptyReturnRecord | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();

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

  /* `?plan=<id>` opens the plan-return dialog straight away — what a row's
     "Plan empty return" button and the dossier's own link send. */
  useEffect(() => {
    const id = searchParams.get('plan');
    if (!id) return;
    const record = awaiting.find((r) => r.id === id);
    if (record) setPlanTarget(record);
    const next = new URLSearchParams(searchParams);
    next.delete('plan');
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams, awaiting]);

  if (awaiting.length === 0) {
    return (
      <Card className="rounded-card border border-border p-12">
        <EmptyState
          icon={<CheckCircle2 />}
          title="No container is waiting on a decision"
          description="A container appears here the moment a delivered booking is marked Empty Ready in Shipments. Everything under management is either paired or already going back."
        />
      </Card>
    );
  }

  const confirm = async (suggestion: PairingSuggestion) => {
    if (!selected) return;
    const ok = await actions.confirmPairing(selected, suggestion.load);
    if (ok) {
      setLastPairing({
        empty: selected.container || selected.bookingReference,
        full: suggestion.load.container || suggestion.load.id,
        load: suggestion.load.shipmentReference ?? suggestion.load.id,
      });
    }
  };

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {/* v19's confirmation banner. It draws the two containers rather than
          naming them in prose, because "which box went out under which" is the
          one fact an operator re-checks after committing. */}
      {lastPairing && (
        <div className="rounded-card border border-stage-closed-border bg-stage-closed-subtle px-4 py-3 text-xs text-stage-closed-subtle-foreground">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            <b>Pairing confirmed</b>
            <button
              type="button"
              onClick={() => setLastPairing(null)}
              aria-label="Dismiss"
              className="ml-auto rounded-sm p-0.5 opacity-70 transition-opacity hover:opacity-100"
            >
              <X className="size-3.5" />
            </button>
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-md border-2 border-dashed border-stage-available-border bg-card px-2.5 py-1">
              <EmptyTag small />
              <Mono className="font-bold text-foreground">{lastPairing.empty}</Mono>
            </span>
            {/* ⇄, not →. The module's own legend reserves the thin arrow for
                "same container, unloaded" and the double arrow for a pairing
                between two DIFFERENT containers — which is exactly what this
                banner just confirmed. A → here contradicted the Cycles legend
                two clicks away. */}
            <ArrowLeftRight className="size-4 shrink-0 text-stage-paired-subtle-foreground" aria-hidden />
            <span className="inline-flex items-center gap-1.5 rounded-md bg-container-full px-2.5 py-1 text-container-full-foreground">
              <Mono className="font-bold">{lastPairing.full}</Mono>
              <span className="text-[10px] opacity-80">{lastPairing.load}</span>
            </span>
          </div>
        </div>
      )}

      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-5">
        {/* ── The pile ─────────────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-2 lg:col-span-2">
          <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
            Select an empty container
          </h3>
          {awaiting.map((record) => {
            const risk = riskOf(record, now);
            const active = selected?.id === record.id;
            return (
              <button
                key={record.id}
                type="button"
                onClick={() => selectEmpty(record.id)}
                aria-pressed={active}
                className={cn(
                  'w-full min-w-0 cursor-pointer rounded-card border p-3 text-left transition',
                  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  /* The card wears what is in the box. Every card in this
                     column is an EMPTY container, so the whole column sits on
                     the empty ground — the reader sees which half of the
                     workbench is supply before reading a single word, and the
                     two halves stop being two identical stacks of white cards.
                     Selection is then a border job, not a fill job: sky, the
                     v19 "available" hue, so picking one does not read as the
                     same signal as the load it might carry. */
                  'bg-container-empty-subtle',
                  active
                    ? 'border-2 border-stage-available shadow-2xs'
                    : 'border-container-empty-border/40 hover:border-stage-available hover:shadow-sm',
                )}
              >
                {active && (
                  <div className="mb-1 text-[9px] font-extrabold tracking-widest text-stage-available-subtle-foreground">
                    ✓ SELECTED
                  </div>
                )}
                <div className="flex min-w-0 items-center justify-between gap-2">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <EmptyTag small />
                    <Mono className="truncate text-sm font-bold text-foreground">
                      {record.container || record.bookingReference}
                    </Mono>
                  </span>
                  <RiskBadge risk={risk} className="shrink-0" />
                </div>
                <div className="mt-1 truncate text-[11px] text-muted-foreground">
                  {record.line} · {record.size} · {record.locationName}
                </div>
                <div className={cn('font-mono text-[11px] font-bold', riskTextClass(risk))}>
                  {record.deadline === null
                    ? 'No deadline recorded'
                    : record.deadline < now
                      ? `${formatSpan(now - record.deadline)} past return deadline`
                      : `${formatSpan(record.deadline - now)} remaining`}
                </div>
              </button>
            );
          })}
        </div>

        {/* ── The opportunities ────────────────────────────────────────────── */}
        <div className="min-w-0 space-y-2 lg:col-span-3">
          {selected && (
            <div className="pb-1 text-center">
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
                Matching for
              </div>
              <div className="mt-0.5 flex flex-wrap items-center justify-center gap-2">
                <EmptyTag small />
                <Mono className="font-bold text-foreground">
                  {selected.container || selected.bookingReference}
                </Mono>
                <Mono className={cn('text-xs font-bold', riskTextClass(riskOf(selected, now)))}>
                  {selected.deadline === null
                    ? 'no deadline'
                    : selected.deadline < now
                      ? `${formatSpan(now - selected.deadline)} past return deadline`
                      : `${formatSpan(selected.deadline - now)} before return deadline`}
                </Mono>
              </div>
              <div className="mt-1 flex flex-col items-center">
                <span className="h-2.5 w-px bg-border-strong" aria-hidden />
                <span className="text-[8px] font-bold uppercase tracking-widest text-muted-foreground">
                  shipment opportunities
                </span>
                <span className="h-2.5 w-px bg-border-strong" aria-hidden />
              </div>
            </div>
          )}

          {selected &&
            suggestions.map((suggestion, index) => (
              <Fragment key={suggestion.load.id}>
                {index === 0 && (
                  <h4 className="text-[9px] font-extrabold uppercase tracking-widest text-primary">
                    System recommendation
                  </h4>
                )}
                {index === 1 && (
                  <h4 className="pt-1.5 text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
                    Other shipment opportunities
                  </h4>
                )}
                <SuggestionCard
                  suggestion={suggestion}
                  featured={index === 0}
                  disabled={actions.isBusy}
                  onConfirm={() => void confirm(suggestion)}
                  onReject={() => rejectPairing(suggestion.load.id, selected.id)}
                />
              </Fragment>
            ))}

          {selected && suggestions.length === 0 && (
            <Card className="rounded-card border-2 border-border p-6 text-center">
              <p className="text-sm font-bold text-foreground">No shipment opportunity</p>
              <p className="mt-1 text-xs text-muted-foreground">
                No created shipment can use this container before its return deadline.
              </p>
              <div className="mt-3 inline-block rounded-card-nested bg-surface-sunken px-4 py-2 text-left text-xs">
                <Mono className="font-bold text-foreground">
                  {selected.container || selected.bookingReference}
                </Mono>
                <div className="text-[10px] text-muted-foreground">
                  Return deadline{' '}
                  <Mono className="font-semibold">{formatStamp(selected.deadline)}</Mono>
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-1.5 text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
                  Recommended action
                </div>
                <Button
                  variant="primary"
                  size="sm"
                  leadingIcon={<RotateCcw className="size-3.5" />}
                  disabled={actions.isBusy}
                  onClick={() => setPlanTarget(selected)}
                  className="bg-stage-returning text-stage-returning-foreground hover:brightness-105"
                >
                  Plan empty return
                </Button>
              </div>
            </Card>
          )}

          {/* "No match" with no reason is the difference between a system an
              operator trusts and one they work around. */}
          {selected && incompatible.length > 0 && (
            <div className="pt-1.5">
              <button
                type="button"
                onClick={() => setShowIncompatible((value) => !value)}
                className="text-[11px] font-semibold text-muted-foreground transition-colors hover:text-foreground"
              >
                Why? · View incompatible shipments · {incompatible.length}{' '}
                {showIncompatible ? '▾' : '›'}
              </button>
              {showIncompatible &&
                incompatible.map(({ load, issues }) => (
                  <div
                    key={load.id}
                    className="mt-1.5 rounded-card border border-border-subtle bg-card p-3 opacity-80"
                  >
                    <div className="flex min-w-0 flex-wrap items-center gap-2">
                      <FullTag small />
                      <Mono className="text-xs font-bold text-foreground">
                        {load.shipmentReference ?? load.id}
                      </Mono>
                      <span className="text-[11px] text-muted-foreground">
                        {load.line} · {load.size}
                      </span>
                    </div>
                    <div className="mt-1 text-[10px] text-destructive">
                      {issues.map((issue) => (
                        <span key={issue} className="mr-3">
                          · {issue}
                        </span>
                      ))}
                    </div>
                  </div>
                ))}
            </div>
          )}
        </div>
      </div>

      {planTarget && (
        <PlanReturnDialog
          record={planTarget}
          now={now}
          busy={actions.isBusy}
          onClose={() => setPlanTarget(null)}
          onConfirm={async (plannedAt) => {
            const ok = await actions.planReturn(planTarget, plannedAt);
            if (ok) setPlanTarget(null);
          }}
        />
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Plan the empty return — always asks for the slot
 * ------------------------------------------------------------------------- */

/**
 * Never silent. The user's standing rule (2026-08-29): planning a return must
 * ask for a date and a time, because staging one invisibly commits a slot the
 * operator never saw. Defaults to `defaultPlannedReturn` and warns — but does
 * not block — when the chosen slot falls past the deadline, since that slot may
 * genuinely be the earliest one available and refusing to record reality does
 * not make the box come back sooner.
 */
function PlanReturnDialog({
  record,
  now,
  busy,
  onClose,
  onConfirm,
}: {
  record: EmptyReturnRecord;
  now: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (plannedAt: number) => void;
}) {
  const suggested = defaultPlannedReturn(record, now);
  const [date, setDate] = useState(() => format(new Date(suggested), 'yyyy-MM-dd'));
  const [time, setTime] = useState(() => format(new Date(suggested), 'hh:mm a'));

  const plannedAt = useMemo(() => {
    const parsed = parse(`${date} ${time}`, 'yyyy-MM-dd hh:mm a', new Date());
    return Number.isNaN(parsed.getTime()) ? suggested : parsed.getTime();
  }, [date, time, suggested]);

  const afterDeadline = Boolean(record.deadline && plannedAt > record.deadline);

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="md" aria-describedby={undefined}>
        <DialogHeader title="Plan empty return">
          <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
            <EmptyTag small />
            <Mono className="text-sm font-bold text-foreground">
              {record.container || record.bookingReference}
            </Mono>
            <span>
              {record.line} · {record.size}
            </span>
          </div>
        </DialogHeader>

        <DialogBody className="space-y-3">
          <p className="text-xs text-muted-foreground">
            Matching stops for this container and it goes back to the depot on its own. Record when
            it is actually going, so the calendar and the deadline agree.
          </p>

          <dl className="space-y-1.5 text-xs">
            <div className="flex justify-between gap-4 border-b border-border-subtle pb-1.5">
              <dt className="text-muted-foreground">Returns to</dt>
              <dd className="text-right font-medium text-foreground">{record.returnDepot}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted-foreground">Return deadline</dt>
              <dd className="text-right font-medium text-foreground">
                <Mono>{formatStamp(record.deadline)}</Mono>
              </dd>
            </div>
          </dl>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs">
              <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                Return date
              </span>
              <DatePicker value={date} onChange={setDate} isClearable={false} className="mt-1" />
            </label>
            <label className="block text-xs">
              <span className="text-2xs font-bold uppercase tracking-wider text-muted-foreground">
                Return time
              </span>
              <TimePicker value={time} onChange={setTime} className="mt-1" />
            </label>
          </div>

          {afterDeadline && (
            <p className="flex items-start gap-2 rounded-card-nested border border-destructive-subtle bg-destructive-subtle px-3 py-2 text-xs text-destructive-subtle-foreground">
              <AlertTriangle className="mt-0.5 size-3.5 shrink-0" aria-hidden />
              This slot falls after the return deadline — detention of{' '}
              {formatDetention(detentionFor(plannedAt - (record.deadline ?? plannedAt)))} would be
              expected.
            </p>
          )}
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" size="sm" onClick={onClose} disabled={busy}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            leadingIcon={<RotateCcw className="size-3.5" />}
            onClick={() => onConfirm(plannedAt)}
            disabled={busy}
            className="bg-stage-returning text-stage-returning-foreground hover:brightness-105"
          >
            Confirm the plan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
 * One opportunity
 * ------------------------------------------------------------------------- */

/** v19's compatibility checklist — the three facts the gate actually turned on. */
function CompatChecklist({ suggestion }: { suggestion: PairingSuggestion }) {
  const tight = suggestion.tight;
  const items: { ok: boolean; label: string }[] = [
    { ok: true, label: 'Same shipping line' },
    { ok: true, label: 'Same container size' },
    { ok: !tight, label: tight ? 'Tight window — under 6h of margin' : 'Pickup beats the deadline' },
  ];
  return (
    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
      {items.map((item) => (
        <span
          key={item.label}
          className={cn(
            'inline-flex items-center gap-1 text-[10px] font-semibold',
            item.ok ? 'text-stage-closed-subtle-foreground' : 'text-stage-returning-subtle-foreground',
          )}
        >
          {item.ok ? (
            <CheckCircle2 className="size-3 shrink-0" aria-hidden />
          ) : (
            <AlertTriangle className="size-3 shrink-0" aria-hidden />
          )}
          {item.label}
        </span>
      ))}
    </div>
  );
}

/**
 * One datum on a suggestion card — label and value on the SAME line.
 *
 * Stacked was tried and made the card twice as tall as it needed to be: six
 * facts became twelve lines, and a card that is one row of a scannable list
 * cannot afford that. Inline halves the height and still keeps the label, which
 * matters — "4646" and "+3d 18h" mean nothing on their own.
 */
function Datum({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn('flex min-w-0 items-baseline gap-1.5', className)}>
      <dt className="shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </dt>
      <dd className="min-w-0 truncate text-[11px]">{children}</dd>
    </div>
  );
}

function SuggestionCard({
  suggestion,
  featured,
  disabled,
  onConfirm,
  onReject,
}: {
  suggestion: PairingSuggestion;
  featured: boolean;
  disabled: boolean;
  onConfirm: () => void;
  onReject: () => void;
}) {
  const { load, score, label, marginMs, tight } = suggestion;

  return (
    <Card
      className={cn(
        /* The other half of the workbench, and the other half of the pairing:
           every card here is a FULL load, so it sits on the full ground. Empty
           on the left, full on the right — the trade the page exists to make is
           legible from across the room.

           Padding lives on the bands below, not here: the card used one `p-4`
           box with everything inside a single column, so the header, the facts
           and the actions all shared one undifferentiated block and the reader
           had to find the structure themselves. */
        'min-w-0 overflow-hidden rounded-card border bg-container-full-subtle',
        /* Violet stays the pairing hue and rides on top as the border. The
           scale's own note is the reason: a pairing is the product's whole
           point, it is not a shade of "full", and teal made it look like one. */
        featured
          ? 'border-stage-paired ring-1 ring-stage-paired/25'
          : 'border-container-full-border/40',
      )}
    >
      {/* ── WHAT THIS IS ──
          The match score is pinned right on this line and cannot wrap away from
          it. It used to be `ml-auto` inside a wrapping row, so on a narrow card
          it dropped to a line of its own and floated under the reference with
          nothing to align to. */}
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-container-full-border/25 px-3 py-2">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span
            className={cn(
              'rounded-sm border px-1.5 py-0.5 text-[9px] font-extrabold tracking-wider',
              LABEL_STYLE[label],
            )}
          >
            {label}
          </span>
          <Mono className="text-sm font-bold text-foreground">
            {load.shipmentReference ?? load.id}
          </Mono>
          <span className="truncate text-xs text-muted-foreground">
            {load.line} · {load.size}
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-stage-paired-border bg-stage-paired-subtle px-2 py-0.5 text-[10px] font-bold text-stage-paired-subtle-foreground">
          Match {score}%
        </span>
      </div>

      {/* ── THE FACTS ──
          Two dense columns, one line each. This card is a row in a list the
          operator scans, so height is the scarce resource: labels sit inline
          rather than stacked, the gutter is `px-3`, and rows are `gap-y-1`. */}
      <dl className="grid grid-cols-1 gap-x-5 gap-y-1 px-3 py-2 sm:grid-cols-2">
        <Datum label="Container">
          <Mono className="font-bold text-foreground">{load.container || '—'}</Mono>
        </Datum>
        <Datum label="Pickup">
          <Mono className="font-semibold text-foreground">{formatStamp(load.pickupAt)}</Mono>
        </Datum>
        <Datum label="From">
          <span className="truncate font-semibold text-foreground" title={load.pickupHub}>
            {load.pickupHub}
          </span>
        </Datum>
        <Datum label="Margin">
          <Mono
            className={cn(
              'font-semibold',
              tight
                ? 'text-stage-returning-subtle-foreground'
                : 'text-stage-closed-subtle-foreground',
            )}
          >
            +{formatSpan(marginMs)}
          </Mono>
        </Datum>
        {/* Spans both columns because the carrier's name is the longest value
            on the card. The "Assigned in the Shipment module" line that used to
            sit under it is gone: it was the same sentence on every card, so it
            cost a row per card and told the reader nothing about this one. */}
        <Datum label="Transporter" className="sm:col-span-2">
          {load.transporter ? (
            <CompanyName name={load.transporter} className="min-w-0 font-semibold text-foreground" />
          ) : (
            <span className="font-semibold text-foreground">Not assigned yet</span>
          )}
        </Datum>
      </dl>

      {/* ── WHY, AND WHAT TO DO ──
          The reasons sit on the same line as the decision they justify, and the
          actions are a normal card footer: secondary left, primary right. They
          used to be a column pinned to the top-right of a tall card, which left
          "Not this one" floating halfway up beside the facts. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-container-full-border/25 px-3 py-1.5">
        <CompatChecklist suggestion={suggestion} />
        <div className="flex shrink-0 items-center gap-2">
          <Button
            size="sm"
            variant="ghost"
            disabled={disabled}
            onClick={onReject}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            Not this one
          </Button>
          {/* The button that makes the pairing wears the pairing's colour —
              `cn` runs `twMerge`, so these replace the variant's own fill
              rather than racing it. */}
          <Button
            size="sm"
            variant="primary"
            disabled={disabled}
            onClick={onConfirm}
            className="h-7 bg-stage-paired px-3 text-stage-paired-foreground hover:bg-stage-paired/90 active:bg-stage-paired/80"
          >
            Confirm pairing
          </Button>
        </div>
      </div>
    </Card>
  );
}

export default MatchingPage;
