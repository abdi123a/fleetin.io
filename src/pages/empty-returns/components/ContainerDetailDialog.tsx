import { Fragment, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';

import {
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogBody,
  DialogContent,
  DialogHeader,
} from '@/design-system';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Info,
  RotateCcw,
  Undo2,
} from '@/design-system/icons';
import {
  CONTAINER_OUTCOME_LABEL,
  detentionFor,
  formatDetention,
  riskTextClass,
} from '@/data/emptyReturnData';
import { suggestLoadsFor, useEmptyContainerActions,
  useReturnProofPrompt, useEmptyContainers } from '@/features/empty-returns';
import { useShippingLines } from '@/features/shipping-lines/shippingLines';
import { StarRating } from '@/components/performance';
import { usePartners } from '@/features/partners/api/queries';
import { useBookings } from '@/features/bookings/api/queries';
import { summariseFleet } from '@/lib/rating';
import {
  achievedMarginOf,
  formatSpan,
  formatStamp,
  isAccruingDetention,
  rejectedLoadsFor,
  riskOf,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord, PairingSuggestion } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { formatContainerSize } from '@/data/emptyReturnData';

import { OperationFlow } from './OperationFlow';
import { IdentityFact, IdentityStrip, PartyName } from '@/components/common';

import { ContainerSizeTag, EmptyTag, Mono, RecordStateTag, SectionLabel } from './marks';
import { PairingCelebration } from './PairingCelebration';
import { PlanReturnContent } from './PlanReturnDialog';
import { SuggestionCard } from './SuggestionCard';

/**
 * One container — its history, and one door into the module's one decision
 * surface. Hosted once by the module chrome and driven by `store.openRecordId`,
 * so the Control Tower, the Calendar and Cycles all open the *same* dialog.
 *
 * ## The dossier, not the workbench
 *
 * This used to *be* the decision: an embedded recommendation card, its own
 * Confirm Pairing button, its own inline plan-return form — a second, smaller
 * copy of the Match Recommendations popup, styled differently, living inside
 * a "what happened" screen. The user's complaint was exactly this — two
 * screens for one decision, and colours that didn't agree — so as of
 * 2026-08-29 this dialog only *reports*: what the container is doing now, and
 * how many open full loads could take it. Deciding — confirming a pairing,
 * choosing a return slot — happens once, on the Matching PAGE. "Open in
 * Matching" and "Plan Empty Return" both select this container and navigate
 * there, the same door a Control Tower row's own buttons use.
 */

export function ContainerDetailDialog() {
  const openRecordId = useEmptyReturnStore((state) => state.openRecordId);
  const closeRecord = useEmptyReturnStore((state) => state.closeRecord);
  const openIntent = useEmptyReturnStore((state) => state.openRecordIntent);
  const rejected = useEmptyReturnStore((state) => state.rejected);
  const rejectPairing = useEmptyReturnStore((state) => state.rejectPairing);

  const { byId, loads, now } = useEmptyContainers();
  const actions = useEmptyContainerActions();
  const returnProof = useReturnProofPrompt();
  const record = byId(openRecordId);

  /* Publishes every carrier's mark into the company registry, which is what
     lets `PartyName` draw the line's logo below. Called here rather than on a
     view, because this dialog is hosted by the module chrome and opens from all
     five of them — the Control Tower's queue mounts the same hook for its rows,
     so a line opened from Cycles or the Calendar would otherwise have shown
     initials where the Control Tower showed a logo. One call: the dialog is a
     singleton, so this is not the forty-rows problem the queue table avoids. */
  useShippingLines();

  /* Which screen of the dialog is showing. Resets whenever the dialog opens on
     a different container — otherwise the next one opened arrives mid-flow. */
  const [step, setStep] = useState<'detail' | 'find' | 'return'>('detail');
  /* The pairing celebration OUTLIVES this dialog on purpose — see the note on
     the early return below. */
  const [celebration, setCelebration] = useState<{
    empty: string;
    full: string;
    load: string;
  } | null>(null);
  /* A dialog does not follow you between pages.
   *
   * This is mounted by the module chrome, so one component serves the Control
   * Tower, Matching, Cycles and the Calendar — and `openRecordId` lives in the
   * store, which the route change does not touch. Leave a container open on the
   * Control Tower, navigate to Matching, and the dossier arrives on top of the
   * workbench and covers it. That looked exactly like Matching had lost its own
   * screen. It became reachable the moment the dialog stopped navigating and
   * started being the place work gets done. */
  const { pathname } = useLocation();
  useEffect(() => {
    closeRecord();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  /* Seeded from the intent the opener passed — a row's "Find full load" lands
     on that step rather than on the dossier with one more click to make. */
  useEffect(() => {
    setStep(openIntent === 'select' ? 'find' : openIntent === 'return' ? 'return' : 'detail');
  }, [openRecordId, openIntent]);

  const rejectedIds = useMemo(
    () => (record ? rejectedLoadsFor(rejected, record.id) : []),
    [rejected, record],
  );
  const suggestions = useMemo(
    () => suggestLoadsFor(record, loads, now, rejectedIds),
    [record, loads, now, rejectedIds],
  );

  /* The one thing that survives the record closing.
   *
   * Confirming a pairing takes this container out of the pool, so `record`
   * becomes undefined on the very next render — and an early `return null` here
   * would unmount the celebration in the same tick it was asked for. The
   * Matching page never hit this because it owns the celebration itself and
   * stays mounted; here the dialog IS the surface, so it has to hand over to
   * the celebration on its way out. */
  if (!record) {
    return celebration ? (
      <PairingCelebration
        open
        onOpenChange={(next) => !next && setCelebration(null)}
        empty={celebration.empty}
        full={celebration.full}
        load={celebration.load}
      />
    ) : null;
  }

  const risk = riskOf(record, now);
  /* Not `now > deadline`: a container paired before its deadline has settled
     its clock and can never accrue detention, however long ago that date was. */
  const overdue = isAccruingDetention(record, now);
  const close = () => closeRecord();

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      {/* ── TWO STEPS, ONE DIALOG ──
       *
       * `Find Full Load` used to select this container, close the dossier and
       * navigate to the Matching page. The operator was reading a container,
       * asked to pair it, and got sent to a different screen that then had to
       * re-establish which container they meant — losing the dialog, the row
       * they clicked from, and their place in the queue.
       *
       * The Control Tower can now finish the job where it started. Matching is
       * not replaced: it stays the wide workbench for going through the yard,
       * and this is the contextual path for one box you are already looking at.
       * Both confirm through the same action and draw the same
       * `SuggestionCard`, so the two are one product with two doors. */}
      {step === 'find' ? (
        <FindLoadStep
          record={record}
          now={now}
          risk={risk}
          overdue={overdue}
          busy={actions.isBusy}
          suggestions={suggestions}
          onBack={() => setStep('detail')}
          onConfirm={async (suggestion) => {
            const ok = await actions.confirmPairing(record, suggestion.load);
            if (!ok) return;
            /* Same confetti the Matching page fires — one confirmation, one
               celebration, wherever the operator happened to be standing. */
            setCelebration({
              empty: record.container || record.bookingReference,
              full: suggestion.load.container || suggestion.load.id,
              load: suggestion.load.shipmentReference ?? suggestion.load.id,
            });
            setStep('detail');
            close();
          }}
          onReject={(suggestion) => rejectPairing(suggestion.load.id, record.id)}
          onPlanReturn={() => setStep('return')}
        />
      ) : step === 'return' ? (
        <PlanReturnContent
          record={record}
          now={now}
          busy={actions.isBusy}
          onClose={() => setStep('detail')}
          onConfirm={async (plannedAt) => {
            const ok = await actions.planReturn(record, plannedAt);
            if (ok) setStep('detail');
          }}
        />
      ) : (
      <DetailStep
        record={record}
        now={now}
        risk={risk}
        overdue={overdue}
        busy={actions.isBusy}
        suggestions={suggestions}
        onFindLoad={() => setStep('find')}
        onPlanReturn={() => setStep('return')}
        /* The depot's receipt is asked for first — the close is refused
           without it, and the dossier is where somebody is already looking at
           this container. `returnProof.dialog` is rendered below. */
        onConfirmReturn={() => returnProof.prompt(record)}
        onCancelPairing={() => actions.cancelPairing(record)}
      />
      )}
      {returnProof.dialog}
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
 * Find Full Load — the contextual half of Matching
 * ------------------------------------------------------------------------- */

/**
 * Every full load this container could travel out under, offered here.
 *
 * The same engine, the same ranking and the same `SuggestionCard` the Matching
 * page draws — the difference is the frame, not the content. Matching asks
 * "which of the yard's empties shall I place?"; this asks "where can THIS one
 * go?", which is the question somebody already has open a container to answer.
 */
function FindLoadStep({
  record,
  now,
  risk,
  overdue,
  busy,
  suggestions,
  onBack,
  onConfirm,
  onReject,
  onPlanReturn,
}: {
  record: EmptyReturnRecord;
  now: number;
  risk: ReturnType<typeof riskOf>;
  overdue: boolean;
  busy: boolean;
  suggestions: ReturnType<typeof suggestLoadsFor>;
  onBack: () => void;
  onConfirm: (suggestion: PairingSuggestion) => void;
  onReject: (suggestion: PairingSuggestion) => void;
  onPlanReturn: () => void;
}) {
  const clock = record.deadline
    ? overdue
      ? `${formatSpan(now - record.deadline)} overdue`
      : `${formatSpan(record.deadline - now)} to deadline`
    : 'no deadline';

  return (
    <DialogContent size="xl" aria-describedby={undefined}>
      <DialogHeader
        title={
          <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            <span className="text-base font-bold">Find Full Load</span>
          </span>
        }
      >
        {/* Which box this is about, on the header rather than repeated over
            each option — the answer is the same for all of them. */}
        <div className="mt-1 flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted-foreground">
          <EmptyTag small />
          <Mono className="font-bold text-foreground">
            {record.container || record.bookingReference}
          </Mono>
          <span>
            {record.line} · {formatContainerSize(record.size)} · {record.locationName}
          </span>
          <Mono className={cn('font-bold', riskTextClass(risk))}>{clock}</Mono>
        </div>
      </DialogHeader>

      <DialogBody className="space-y-2">
        {suggestions.length === 0 ? (
          /* No load, and therefore only one thing left to do — so the return
             stops being the alternative and becomes the recommendation. */
          <Card className="rounded-card border-2 border-border p-6 text-center">
            <p className="text-sm font-bold text-foreground">No viable full load found</p>
            <p className="mt-1 text-xs text-muted-foreground">
              No compatible full load can take this container before its return deadline.
            </p>
            <Button
              size="sm"
              onClick={onPlanReturn}
              disabled={busy}
              className="mt-3 bg-stage-returning text-stage-returning-foreground hover:brightness-105"
            >
              <RotateCcw className="size-3.5" /> Plan Empty Return
            </Button>
          </Card>
        ) : (
          suggestions.map((suggestion, index) => (
            <Fragment key={suggestion.load.id}>
              {index === 0 && (
                <h4 className="text-[10px] font-extrabold uppercase tracking-widest text-primary">
                  Recommended Shipment
                </h4>
              )}
              {index === 1 && (
                <div className="flex items-center gap-2 pt-1.5">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-muted-foreground">
                    Other compatible Shipments
                  </span>
                  <span aria-hidden className="h-px flex-1 bg-border" />
                </div>
              )}
              <SuggestionCard
                suggestion={suggestion}
                featured={index === 0}
                disabled={busy}
                onConfirm={() => onConfirm(suggestion)}
                onReject={() => onReject(suggestion)}
              />
            </Fragment>
          ))
        )}

        <div className="flex justify-between pt-1">
          <Button variant="ghost" size="sm" onClick={onBack} className="text-muted-foreground">
            Back to container
          </Button>
          {suggestions.length > 0 && (
            <Button
              variant="outline"
              size="sm"
              onClick={onPlanReturn}
              disabled={busy}
              className="border-warning text-warning-subtle-foreground hover:bg-warning-subtle"
            >
              <RotateCcw className="size-3.5" /> Plan Empty Return
            </Button>
          )}
        </div>
      </DialogBody>
    </DialogContent>
  );
}

/* ---------------------------------------------------------------------------
 * The container's own detail
 * ------------------------------------------------------------------------- */

interface DetailStepProps {
  record: EmptyReturnRecord;
  now: number;
  risk: ReturnType<typeof riskOf>;
  overdue: boolean;
  busy: boolean;
  suggestions: ReturnType<typeof suggestLoadsFor>;
  /**
   * The dialog's own steps. Neither navigates.
   *
   * Both used to select this container, close the dossier and send the operator
   * to the Matching page — for finding a load AND for planning a return. That
   * made the Control Tower a place you could only look at things: every actual
   * decision threw you onto another screen that then had to re-establish which
   * container you meant, and you lost the row you clicked from. Matching is
   * still the wide workbench for going through the yard; this is the
   * contextual path for the one box already in front of you.
   */
  onFindLoad: () => void;
  onPlanReturn: () => void;
  onConfirmReturn: () => void;
  onCancelPairing: () => void;
}

function DetailStep({
  record,
  now,
  risk,
  overdue,
  busy,
  suggestions,
  onFindLoad,
  onPlanReturn,
  onConfirmReturn,
  onCancelPairing,
}: DetailStepProps) {
  const [showActivity, setShowActivity] = useState(false);
  const detention = overdue ? detentionFor(now - (record.deadline ?? now)) : 0;
  const best = suggestions[0];

  /**
   * One operational line, never a mix of lifecycle labels.
   *
   * **Null once the record closes.** It used to read "Returned on time" here,
   * directly above a banner reading "Returned — 7d 8h before the return
   * deadline · no detention", under a title already wearing a grey RETURNED
   * tag. Three statements of one fact, and the one this replaced was the only
   * one of the three carrying no number — which is exactly the line the house
   * rule drops.
   */
  const headline =
    record.stage === 'closed'
      ? null
      : overdue
        ? {
            text: `Return overdue — ${formatSpan(now - (record.deadline ?? now))}`,
            tone: 'text-destructive',
          }
        : risk === 'protected'
          ? {
              /* The verdict, not the figure. This read "Paired — collected
                 2d 16h before the deadline" while the Decision window two
                 lines below carried the same span under "Margin achieved" —
                 one measurement, twice, on one surface. The headline says
                 whether the deadline held; the panel says by how much, where
                 it sits beside the deadline it is measured against. */
              text: 'Paired — the deadline is protected',
              tone: 'text-primary-subtle-foreground',
            }
          : record.stage === 'empty'
          ? {
              text: `Awaiting a decision — ${record.deadline ? `${formatSpan(record.deadline - now)} left` : 'no deadline recorded'}`,
              tone: riskTextClass(risk),
            }
          : record.stage === 'paired'
            ? { text: 'Paired — no action required', tone: 'text-primary-subtle-foreground' }
            : {
                text: record.plannedReturnAt
                  ? `Return planned for ${formatStamp(record.plannedReturnAt)}`
                  : 'Return planned',
                tone: 'text-warning-subtle-foreground',
              };

  const activity = [
    record.fullPickupAt && { at: record.fullPickupAt, text: 'Full load collected' },
    record.emptyReadyAt && { at: record.emptyReadyAt, text: 'Container became empty' },
    record.matchedAt && { at: record.matchedAt, text: `Pairing confirmed (${record.cycleId})` },
    /* The paired load's own pickup. The flow strip used to print this beside
       the card; the strip now carries no clock at all — every time this
       container has a moment for is here, in one ordered list, where two of
       them can actually be compared. */
    record.nextFull?.pickupAt && {
      at: record.nextFull.pickupAt,
      text: `Paired load collected${record.nextFull.container ? ` (${record.nextFull.container})` : ''}`,
    },
    record.plannedReturnAt && !record.nextFull && { at: record.plannedReturnAt, text: 'Empty return planned' },
    record.returnedAt && {
      at: record.returnedAt,
      text:
        record.outcome === 'paired'
          ? 'Cycle closed — the empty travelled out under the paired load'
          : record.outcome === 'returned_late'
            ? 'Empty return confirmed — after the deadline'
            : 'Empty return confirmed — on time',
    },
  ].filter((entry): entry is { at: number; text: string } => Boolean(entry));
  activity.sort((a, b) => a.at - b.at);

  return (
    <DialogContent size="xl" aria-describedby={undefined}>
      <DialogHeader
        title={
          <span className="flex flex-wrap items-center gap-2.5">
            <Mono className="text-lg font-bold">{record.container || record.bookingReference}</Mono>
            <RecordStateTag record={record} />
            {/* The size stays and the shipping line goes. Only one of the two
                decides anything: `incompatibilityReasons` gates a pairing on
                size and nothing else, while the line stopped vetoing on
                2026-08-30 — a container can be paired with a load on a
                different line. Sitting them side by side as `40' · CMA CGM`
                gave equal billing to a hard constraint and to a fact about
                ownership; the line is a party to the job, so it moved down to
                the identity strip where the other parties are named, with its
                own mark. */}
            <ContainerSizeTag size={record.size} />
          </span>
        }
      >
        {headline && (
          <div className={cn('text-sm font-semibold', headline.tone)}>{headline.text}</div>
        )}
      </DialogHeader>

      <DialogBody className="space-y-4">
        {/* ── THE DECISION, FIRST ──
            Reordered on 2026-08-30. The dialog used to open on the operation
            flow — history — then a loud red deadline panel, and only at the
            bottom the thing the operator is actually here to do, in an outline
            button labelled "instead". So the loudest element on screen was
            *information* and the quietest was the *action*, and the reader had
            no way to tell where to look.

            The order now answers the questions in the order they get asked:
            what do I do → why → what happened → the detail. */}
        {/* A summary, and one door — not the decision itself. Confirming a
            pairing or choosing a return slot happens once, in the Match
            Recommendations popup; this reports what that popup would show. */}
        {record.stage === 'empty' && (
          <Card variant="filled" padding="sm">
            <SectionLabel>What should happen next?</SectionLabel>

            {!best ? (
              <div className="mt-2.5 rounded-card-nested border border-dashed border-border bg-surface px-4 py-3 text-center">
                <p className="text-sm font-semibold text-foreground">No viable full load</p>
                <p className="mt-1 text-xs text-muted-foreground">
                  Nothing currently open can use this container before its return deadline.
                </p>
                <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
                  {/* Graded by urgency: "try again later" is sound advice at
                      three days out and negligence at three hours. */}
                  {risk === 'safe' && 'The decision window is still comfortable — check again later.'}
                  {risk === 'watch' && 'Prioritise pairing today, or plan the return now.'}
                  {risk === 'critical' &&
                    'Pair now if anything appears — otherwise plan the empty return immediately.'}
                  {risk === 'overdue' &&
                    'Detention is already accruing. Plan and confirm the empty return now.'}
                  {!risk &&
                    'This container has no return deadline recorded, so nothing can be timed against it.'}
                </p>
              </div>
            ) : (
              /* Same colours, same "N% match" phrasing as the popup's own
                 score pills — the summary should read like a preview of that
                 screen, not a different product describing it. */
              <div className="mt-2.5 flex flex-wrap items-center justify-between gap-3 rounded-card-nested border border-container-full-border/40 bg-container-full-subtle/40 px-3.5 py-3">
                <p className="min-w-0 text-xs text-foreground">
                  <span className="font-bold">{suggestions.length}</span> open full load
                  {suggestions.length === 1 ? '' : 's'} could take this container — best{' '}
                  <span
                    className={cn(
                      'font-bold',
                      best.tight || best.frictions.length > 0
                        ? 'text-warning-subtle-foreground'
                        : 'text-success-subtle-foreground',
                    )}
                  >
                    {best.score}% match
                  </span>
                  .
                </p>
                <Button
                  variant="primary"
                  size="sm"
                  onClick={onFindLoad}
                  disabled={busy}
                  className="shrink-0 gap-1.5"
                >
                  <ArrowLeftRight className="size-3.5" /> Find Full Load
                </Button>
              </div>
            )}

            {/* The other branch of the same decision — send it back instead.
                Same popup, same colour, just the plan-return dialog open on
                arrival — never a second inline form living in this dialog. */}
            {/* Weighted by whether there is a choice to make. With a viable
                load this is the second of two doors and stays quiet; with none,
                it is the only thing the operator can do, so it stops whispering
                "instead" from behind an outline and becomes the primary. */}
            <Button
              variant={best ? 'outline' : 'primary'}
              size="sm"
              onClick={onPlanReturn}
              disabled={busy}
              className={cn(
                'mt-2.5 w-full',
                best
                  ? 'border-warning text-warning-subtle-foreground hover:bg-warning-subtle'
                  : /* Same reason as Confirm below: the queue's "Plan empty
                       return" is this button, and it is amber there. */
                    'bg-stage-returning text-stage-returning-foreground hover:brightness-105',
              )}
            >
              <RotateCcw /> {best ? 'Plan Empty Return instead' : 'Plan Empty Return'}
            </Button>
          </Card>
        )}

        {/* ── THE VERDICT, AND THE ONE THING LEFT TO DO ──
         *
         * It said "Paired" twice: the dialog's own headline already reads
         * "Paired — collected 1d 5h before the deadline" two lines above this,
         * so repeating the word here spent the loudest element on the panel
         * restating the quietest. This says only the half the headline does not
         * — that nothing is owed, and who owns what happens next.
         *
         * The undo lives INSIDE the panel rather than as a ghost button
         * floating under it. It is the one action a paired container has, and
         * centred on its own row it read as a caption that happened to be
         * clickable. */}
        {record.stage === 'paired' && (
          <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-card-nested border border-primary bg-primary-subtle px-4 py-2.5">
            <div className="min-w-0">
              <div className="text-sm font-bold text-primary-subtle-foreground">
                No action required
              </div>
              <div className="text-2xs text-muted-foreground">
                Execution is handled by the Shipment module.
              </div>
            </div>
            <Button
              variant="outline"
              size="xs"
              onClick={onCancelPairing}
              disabled={busy}
              className="shrink-0 bg-card text-muted-foreground hover:text-destructive"
            >
              <Undo2 /> Cancel this pairing
            </Button>
          </div>
        )}

        {/* The return colour, not the brand teal. This button and the queue's
            "Confirm return" fire the same thing, and wearing two different
            colours for one action is how an operator learns to hesitate over
            which one they are pressing. `--stage-returning` is the colour the
            return flow owns everywhere else. */}
        {record.stage === 'return_planned' && (
          <Button
            variant="primary"
            size="sm"
            onClick={onConfirmReturn}
            disabled={busy}
            fullWidth
            className="bg-stage-returning text-stage-returning-foreground hover:brightness-105"
          >
            <CheckCircle2 /> Confirm the empty is back
          </Button>
        )}

        {/* ── WHY ── the clock this decision is being made against. */}
        {/* The deadline block — loud when it matters, one quiet strip when it does not. */}
        {record.stage === 'closed' ? (
          <div
            className={cn(
              'flex items-center gap-2 rounded-card-nested border px-4 py-2.5 text-xs',
              record.outcome === 'returned_late'
                ? 'border-destructive-subtle bg-destructive-subtle text-destructive-subtle-foreground'
                : 'border-success bg-success-subtle text-success-subtle-foreground',
            )}
          >
            {record.outcome === 'returned_late' ? (
              <AlertTriangle className="size-4 shrink-0" aria-hidden />
            ) : (
              <CheckCircle2 className="size-4 shrink-0" aria-hidden />
            )}
            <span>
              <b>{record.outcome ? CONTAINER_OUTCOME_LABEL[record.outcome] : 'Closed'}</b>
              {record.deadline && record.returnedAt && (
                <>
                  {' — '}
                  {record.returnedAt <= record.deadline
                    ? `${formatSpan(record.deadline - record.returnedAt)} before the return deadline · no detention`
                    : `${formatSpan(record.returnedAt - record.deadline)} after the deadline · detention ${formatDetention(detentionFor(record.returnedAt - record.deadline))}`}
                </>
              )}
            </span>
          </div>
        ) : (
          <Card
            variant="flat"
            padding="sm"
            className={cn(overdue && 'border-destructive bg-destructive-subtle')}
          >
            <SectionLabel className={overdue ? 'text-destructive' : undefined}>
              {overdue ? 'Return deadline' : 'Decision window'}
            </SectionLabel>
            <div className="mt-2 flex flex-wrap gap-x-8 gap-y-2">
              <Figure
                label={
                  overdue ? 'Overdue by' : risk === 'protected' ? 'Margin achieved' : 'Time remaining'
                }
              >
                <Mono className={cn('text-lg font-bold', riskTextClass(risk))}>
                  {!record.deadline
                    ? 'No deadline'
                    : risk === 'protected'
                      ? formatSpan(achievedMarginOf(record))
                      : formatSpan(record.deadline - now)}
                </Mono>
              </Figure>
              <Figure label="Return deadline">
                <Mono className="font-semibold text-foreground">{formatStamp(record.deadline)}</Mono>
              </Figure>
              {/* Only once the box is actually BACK.
                  `achievedMarginOf` is `deadline − (returnedAt ?? pickupAt)`,
                  so on a paired-but-not-yet-returned container it is the same
                  subtraction as this figure — the panel printed `1d 5h` and
                  `+1d 5h` side by side under two labels, and a reader has to
                  stop and work out whether they are two facts. Once the return
                  is recorded the two genuinely differ: one measures the pickup,
                  the other the depot. */}
              {record.returnedAt && record.nextFull?.pickupAt && record.deadline && (
                <Figure label="Margin after pickup">
                  <Mono
                    className={cn(
                      'font-bold',
                      record.deadline - record.nextFull.pickupAt < 6 * 3_600_000
                        ? 'text-warning-subtle-foreground'
                        : 'text-success-subtle-foreground',
                    )}
                  >
                    +{formatSpan(record.deadline - record.nextFull.pickupAt)}
                  </Mono>
                </Figure>
              )}
              {/* No "Urgency" figure here. The dialog's own headline already
                  reads "Return overdue — 25d 18h" in the same red, so a chip
                  restating it was the third time this panel said one thing. */}
              <Figure label="Estimated detention">
                {detention > 0 ? (
                  <span className="font-bold text-destructive">{formatDetention(detention)}</span>
                ) : (
                  <span className="text-xs text-muted-foreground">
                    None — starts after the deadline
                  </span>
                )}
              </Figure>
            </div>
          </Card>
        )}

        {/* ── WHAT HAPPENED ── the history behind it, below the decision. */}
        <section>
          <SectionLabel>Operation flow</SectionLabel>
          <OperationFlow record={record} now={now} className="mt-2" />
          {/* The parties, in the app's identity strip rather than a run-on
              line of 10px grey — every part of that line weighed the same, so
              the two names anyone actually reads had to be hunted out of it. */}
          {/* Three companies and the truck. The shipping line joins the two
              parties it has always belonged beside: it owns the box, the depot
              the box goes back to is theirs, and the detention this dialog
              counts is owed to them — so it is a party to the job, not a
              specification of the equipment.

              The Shipment link left this strip. It named `375792` roughly forty
              pixels below the flow card already naming `375792`, and only one
              of the two could be clicked; now the flow card is the one that
              can, which is also where a reader looking for "which load did this
              empty come off?" already is. */}
          {/* The rating sits UNDER the transporter's name, as one star and the
              figure.
              It has been in three places. Beside the name, five stars wide, it
              doubled that cell and pushed the vehicle plate onto its own row.
              On a labelled line of its own below the strip it stopped setting
              the layout but needed the words "Transporter rating" to say whose
              it was — a whole row of dialog for one number that was already
              standing next to its owner two lines earlier. Under the name it
              needs no label at all: the cell says TRANSPORTER, the star says
              this is a rating, and the figure is the fact. */}
          <IdentityStrip className="mt-3">
            <PartyName label="Shipper" name={record.client} />
            <PartyName
              label="Transporter"
              name={record.transporter}
              meta={<TransporterRating name={record.transporter} />}
            />
            <PartyName label="Shipping line" name={record.line} />
            {record.truck && <IdentityFact label="Vehicle Plate Number" value={record.truck} mono />}
          </IdentityStrip>
        </section>

        <Collapsible open={showActivity} onOpenChange={setShowActivity}>
          <CollapsibleTrigger asChild>
            <Button variant="ghost" size="xs" className="text-muted-foreground">
              <Info /> Activity ({activity.length})
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <ol className="mt-1 space-y-0.5 border-l-2 border-border-subtle pl-3 text-xs text-muted-foreground">
              {activity.map((entry) => (
                <li key={`${entry.at}-${entry.text}`}>
                  <Mono className="text-muted-foreground">{formatStamp(entry.at)}</Mono> — {entry.text}
                </li>
              ))}
            </ol>
          </CollapsibleContent>
        </Collapsible>

        {/* No footer. It held a lone `StageChip`, and the chip restated
            something the body had already said in every one of the four
            stages: "Returned" under a RETURNED tag and a Returned banner,
            "Empty" under an EMPTY tag, "Paired" under the full-width
            "Paired — no action required" panel, "Return planned" under the
            button offering to confirm the return. A whole bar for a fifth
            copy. */}
      </DialogBody>
    </DialogContent>
  );
}

/* ---------------------------------------------------------------------------
 * Small shared bits
 * ------------------------------------------------------------------------- */

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      {/* A figure's label is a caption, not a banner — sentence case and quiet,
          so the number above it is the thing the eye lands on. */}
      <div className="text-2xs font-medium text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}

/**
 * The carrier's standing, beside their name on the container that is about to
 * go back to them.
 *
 * The star is the marks this carrier's drivers were given in their delivery
 * debriefs — nothing about closing this container moves it, and nothing should:
 * whether the box came home late is a fact the empty-return screens already
 * carry, and turning that fact into a verdict about the carrier is not the
 * system's call to make. It is here because an operator deciding what to do
 * with a container wants to know who they are dealing with.
 *
 * The record names its carrier as a company string and carries no partner id
 * (the load was delivered under that name), so the id is resolved here off the
 * partner list the app already holds. An unmatched name simply renders nothing
 * rather than an invented zero.
 */
function TransporterRating({ name }: { name: string }) {
  const { data: partnersResponse } = usePartners();
  const partnerId = useMemo(() => {
    const wanted = name.trim().toLowerCase();
    return (partnersResponse?.items ?? []).find(
      (partner) => partner.companyLegalName.trim().toLowerCase() === wanted,
    )?.id;
  }, [partnersResponse, name]);

  const { data: bookingPage } = useBookings({ partnerId }, { enabled: Boolean(partnerId) });
  const summary = useMemo(
    () => summariseFleet(bookingPage?.items ?? []),
    [bookingPage],
  );

  if (!partnerId || !summary.rated) return null;
  return <StarRating value={summary.overall} size="sm" variant="compact" />;
}
