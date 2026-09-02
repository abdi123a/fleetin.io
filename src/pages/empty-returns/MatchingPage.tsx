import { Fragment, useEffect, useMemo, useState, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { format, parse } from 'date-fns';

import { buildPath, ROUTES } from '@/config/routes';

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
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  RotateCcw,
} from '@/design-system/icons';
import {
  detentionFor,
  formatContainerSize,
  formatDetention,
  riskTextClass,
} from '@/data/emptyReturnData';
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

import { TablePager, usePagedRows } from '@/components';
import { CompanyName, EmptyTag, FullTag, Mono, RiskBadge } from './components/marks';
import { PairingCelebration } from './components/PairingCelebration';

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
  const navigate = useNavigate();

  /* The selection follows the queue: an id that no longer exists (its container
     was just paired) falls back to the top of the list rather than emptying the
     right-hand column and looking broken. */
  /* Eight fits a phone screen without becoming a scroll of its own; the reader
     can widen it from the pager. */
  const [emptiesPageSize, setEmptiesPageSize] = useState(8);
  const pagedAwaiting = usePagedRows(awaiting, { pageSize: emptiesPageSize });

  const selected = useMemo(
    () => awaiting.find((record) => record.id === selectedId) ?? awaiting[0] ?? null,
    [awaiting, selectedId],
  );

  /**
   * Whether the reader has actually *picked* one — not merely what is showing.
   *
   * `selected` falls back to the first empty in the pile so the wide layout is
   * never a blank right-hand panel. That fallback is exactly wrong for the
   * narrow two-step flow: keyed off it, step one would be skipped on arrival
   * and the pile would never be reachable at all. The step is a question about
   * what the reader chose, so it asks the choice.
   */
  const hasPicked = Boolean(selectedId && awaiting.some((record) => record.id === selectedId));

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

  /*
   * Where the operator came from, if they came from a shipment.
   *
   * Matching became a full page on 2026-08-29, and a page has no "close" — so
   * somebody who opened it from a booking to solve one container's problem
   * confirmed the pairing and was left standing on the Empty Container board
   * with no way back to the job they were doing. This is that way back.
   */
  const cameFrom = searchParams.get('from');

  return (
    <div className="flex w-full min-w-0 flex-col gap-4">
      {cameFrom && (
        <Link
          to={buildPath(ROUTES.shipmentOverview, { id: cameFrom })}
          className="inline-flex w-fit items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors duration-fast hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden />
          Back to shipment <Mono className="font-semibold">{cameFrom}</Mono>
        </Link>
      )}
      {/* Confirming a pairing is the one moment here that PREVENTS a cost, and
          it used to be acknowledged by a thin strip above the workbench — the
          weight this app gives a saved filter. It interrupts now: a burst, the
          two boxes welded together, and the detention that will not be spent.
          See `PairingCelebration` for why it stops short of congratulating
          anybody. */}
      <PairingCelebration
        open={lastPairing !== null}
        onOpenChange={(next) => !next && setLastPairing(null)}
        empty={lastPairing?.empty ?? ''}
        full={lastPairing?.full ?? ''}
        load={lastPairing?.load ?? ''}
        backTo={cameFrom}
        onBack={
          cameFrom
            ? () => {
                setLastPairing(null);
                navigate(buildPath(ROUTES.shipmentOverview, { id: cameFrom }));
              }
            : undefined
        }
      />

      {/* ── One workbench, two ways to stand at it ────────────────────────────
          Wide, it is the pile beside the opportunities and both are in view.
          Narrow, that same markup stacked the matches *underneath* every empty
          in the yard — seventy-nine cards deep on the live book — so choosing a
          container appeared to do nothing and the panel that answers the whole
          question was unreachable without scrolling to the end of the page.

          So below `lg` it becomes two steps: the pile, then the matches for
          what you picked, with a way back. Not a second layout — the same two
          panels, one of them hidden. The desktop arrangement is untouched, and
          because the switch is pure CSS there is no width state to disagree
          with what is actually on screen. */}
      <div className="grid min-w-0 grid-cols-1 items-start gap-5 lg:grid-cols-5">
        {/* ── The pile ─────────────────────────────────────────────────────── */}
        <div className={cn('min-w-0 space-y-2 lg:col-span-2', hasPicked && 'hidden lg:block')}>
          <div className="flex items-baseline justify-between gap-2">
            <h3 className="text-xs font-bold uppercase tracking-widest text-muted-foreground">
              Select an empty container
            </h3>
            <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
              {awaiting.length}
            </span>
          </div>
          {pagedAwaiting.rows.map((record) => {
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
                  /* The container-empty ground, at full strength.
                     Every card in this column is an EMPTY, so the column sits on
                     the empty colour and the reader sees which half of the
                     workbench is supply before reading a word. Nothing here is
                     dimmed with an opacity modifier: `--container-empty-subtle`
                     and `-border` are already the calibrated quiet steps of that
                     hue, and knocking them down again is what made the column
                     look washed out.

                     Selection is a border job, not a fill job — sky, the v19
                     "available" hue — so picking one does not read as the same
                     signal as the load it might carry. */
                  'border-container-empty-border bg-container-empty-subtle',
                  active
                    ? 'border-2 border-stage-available shadow-sm'
                    : 'hover:border-stage-available hover:shadow-sm',
                )}
              >
                {active && (
                  <div className="mb-1 text-[9px] font-extrabold tracking-widest text-stage-available-subtle-foreground">
                    ✓ SELECTED
                  </div>
                )}
                {/* Identity and urgency on one line, hard against the two edges.

                    Wraps rather than competes: the badge and the number were
                    sharing one line, so on a phone the badge won and the
                    container read "MAEU-58565…" — the identity cut to make room
                    for its status. */}
                <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1.5">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <EmptyTag small />
                    <Mono className="min-w-0 text-sm font-bold text-foreground [overflow-wrap:anywhere]">
                      {record.container || record.bookingReference}
                    </Mono>
                  </span>
                  <RiskBadge risk={risk} className="shrink-0" />
                </div>
                {/* One line, not a spec sheet. Eleven of these stack in a column
                    the operator scans, so height is the scarce resource — three
                    ruled label/value rows per card tripled every card to line up
                    values nobody compares across cards. */}
                {/* The amber's own ink, not `muted-foreground`. That grey is
                    calibrated for a white page; on this ground it reads as text
                    that landed on the card by accident. */}
                <div className="mt-1 truncate text-[11px] font-medium text-container-empty-subtle-foreground">
                  {record.line} · {formatContainerSize(record.size)} · {record.locationName}
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

          {/* The yard is not a scroll. Paged like every other long list in the
              app, so the column has an end and the pager says how far in you
              are. */}
          {awaiting.length > 0 && (
            <TablePager
              paged={pagedAwaiting}
              noun="empties"
              pageSize={emptiesPageSize}
              onPageSizeChange={setEmptiesPageSize}
              pageSizeOptions={[8, 16, 32, 64]}
            />
          )}
        </div>

        {/* ── The opportunities ────────────────────────────────────────────── */}
        <div className={cn('min-w-0 space-y-2 lg:col-span-3', !hasPicked && 'hidden lg:block')}>
          {/* Step two's way back. Only where there are steps — on a wide screen
              the pile never left, so a "back" would point at nothing. */}
          {selected && (
            <Button
              variant="outline"
              size="sm"
              shape="pill"
              onClick={() => selectEmpty(null)}
              leadingIcon={<ArrowLeft className="size-3.5" />}
              className="text-xs lg:hidden"
            >
              Choose another container
            </Button>
          )}
          {/* ── What we are matching, as a header rather than a centrepiece ──
              This block used to be centred, which read as a title on the wide
              layout and as a stray centred paragraph on a phone — a left-aligned
              back button above it, left-aligned links below it, and this in the
              middle. Centring also fought the container number: the identity
              moved horizontally as the deadline text beside it changed length.

              It is a header strip now: identity on the left, deadline under it,
              one alignment shared by every element in the column at every
              width. The little vertical rule that used to tie it to the section
              label went with it — it only made sense pointing down the centre. */}
          {selected && (
            <div className="rounded-card border border-border/70 bg-surface-sunken/40 px-3 py-2.5">
              <div className="text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
                Matching for
              </div>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
                <EmptyTag small />
                <Mono className="min-w-0 font-bold text-foreground [overflow-wrap:anywhere]">
                  {selected.container || selected.bookingReference}
                </Mono>
              </div>
              <Mono className={cn('mt-0.5 block text-xs font-bold', riskTextClass(riskOf(selected, now)))}>
                {selected.deadline === null
                  ? 'no deadline'
                  : selected.deadline < now
                    ? `${formatSpan(now - selected.deadline)} past return deadline`
                    : `${formatSpan(selected.deadline - now)} before return deadline`}
              </Mono>
            </div>
          )}

          {selected && (
            <h4 className="pt-1 text-[9px] font-extrabold uppercase tracking-widest text-muted-foreground">
              Shipment opportunities
            </h4>
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
                        {load.line} · {formatContainerSize(load.size)}
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
              {record.line} · {formatContainerSize(record.size)}
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

/**
 * The compatibility checklist — what this particular pairing turns on.
 *
 * The shipping line is **read**, not asserted. It used to be hardcoded to
 * `Same shipping line ✓`, which was safe only while the line was a gate: once
 * it stopped being one (2026-08-30, see `incompatibilityReasons`) a cross-line
 * pairing started reaching this card, and a hardcoded tick would have printed
 * a claim about the paperwork that was simply false. It now says which case it
 * is — and when the lines differ that is a *note*, not a warning, because
 * nothing is wrong: the tone stays with the passing items and only the wording
 * changes.
 *
 * Size and the deadline are still the gates, so those two can be asserted:
 * nothing incompatible on either reaches a suggestion at all.
 */
function CompatChecklist({ suggestion }: { suggestion: PairingSuggestion }) {
  const tight = suggestion.tight;
  const { line: emptyLine } = suggestion.record;
  const { line: loadLine } = suggestion.load;
  const sameLine = Boolean(emptyLine) && emptyLine === loadLine;
  const items: { ok: boolean; label: string }[] = [
    {
      ok: true,
      label: sameLine
        ? 'Same shipping line'
        : `Across lines — ${emptyLine ?? 'unrecorded'} → ${loadLine ?? 'unrecorded'}`,
    },
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
/**
 * One fact, label inline.
 *
 * A ruled label-left/value-right sheet was tried here and reverted: this card
 * is a row in a list the operator scans, and five ruled rows made it three
 * times as tall to align values nobody compares across cards. Height is the
 * scarce resource on this page, not alignment.
 */
function SpecRow({
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
        /* Every card here is a FULL load, so it sits on the full ground —
           empty on the left, full on the right, and the trade the page exists
           to make is legible from across the room. At full strength: the border
           carried a `/40` and the rules a `/25`, which is what made this side
           look faded next to the other.

           Violet stays the pairing hue and rides on top as the border: a
           pairing is the product's whole point, not a shade of "full". */
        'min-w-0 overflow-hidden rounded-card border bg-container-full-subtle',
        featured
          ? 'border-stage-paired ring-1 ring-stage-paired'
          : 'border-container-full-border',
      )}
    >
      {/* ── WHAT THIS IS ──
          The match score is pinned right on this line and cannot wrap away from
          it. It used to be `ml-auto` inside a wrapping row, so on a narrow card
          it dropped to a line of its own and floated under the reference with
          nothing to align to. */}
      <div className="flex min-w-0 items-center justify-between gap-2 border-b border-container-full-border px-3 py-2">
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
            {load.line} · {formatContainerSize(load.size)}
          </span>
        </div>
        <span className="shrink-0 rounded-full border border-stage-paired-border bg-stage-paired-subtle px-2 py-0.5 text-[10px] font-bold text-stage-paired-subtle-foreground">
          Match {score}%
        </span>
      </div>

      {/* ── THE FACTS ──
          Label left, value right, ruled between — the same spec sheet the empty
          cards opposite now use, so the two halves of the pairing are read the
          same way. Inline `label value` pairs in a two-column grid put every
          value at a different x, which is exactly the thing that makes a card
          feel unorganised: nothing to run the eye down. */}
      <dl className="grid grid-cols-1 gap-x-5 gap-y-1 px-3 py-2 sm:grid-cols-2">
        <SpecRow label="Container">
          <Mono className="font-bold text-foreground">{load.container || '—'}</Mono>
        </SpecRow>
        <SpecRow label="Pickup">
          <Mono className="font-semibold text-foreground">{formatStamp(load.pickupAt)}</Mono>
        </SpecRow>
        <SpecRow label="From">
          <span className="truncate font-semibold text-foreground" title={load.pickupHub}>
            {load.pickupHub}
          </span>
        </SpecRow>
        <SpecRow label="Margin">
          <Mono
            className={cn(
              'font-bold',
              tight
                ? 'text-stage-returning-subtle-foreground'
                : 'text-stage-closed-subtle-foreground',
            )}
          >
            +{formatSpan(marginMs)}
          </Mono>
        </SpecRow>
        <SpecRow label="Transporter" className="sm:col-span-2">
          {load.transporter ? (
            <CompanyName name={load.transporter} className="min-w-0 font-semibold text-foreground" />
          ) : (
            <span className="font-semibold text-foreground">Not assigned yet</span>
          )}
        </SpecRow>
      </dl>

      {/* ── WHY, AND WHAT TO DO ──
          The reasons sit on the same line as the decision they justify, and the
          actions are a normal card footer: secondary left, primary right. They
          used to be a column pinned to the top-right of a tall card, which left
          "Not this one" floating halfway up beside the facts. */}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-container-full-border px-3 py-1.5">
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
