import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { ROUTES } from '@/config/routes';
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
import type { EmptyReturnRecord } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { OperationFlow } from './OperationFlow';
import { IdentityFact, IdentityStrip, PartyName } from '@/components/common';

import { ContainerSizeTag, Mono, RecordStateTag, SectionLabel } from './marks';

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
  const rejected = useEmptyReturnStore((state) => state.rejected);
  const selectEmpty = useEmptyReturnStore((state) => state.selectEmpty);

  const navigate = useNavigate();
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

  const rejectedIds = useMemo(
    () => (record ? rejectedLoadsFor(rejected, record.id) : []),
    [rejected, record],
  );
  const suggestions = useMemo(
    () => suggestLoadsFor(record, loads, now, rejectedIds),
    [record, loads, now, rejectedIds],
  );

  if (!record) return null;

  const risk = riskOf(record, now);
  /* Not `now > deadline`: a container paired before its deadline has settled
     its clock and can never accrue detention, however long ago that date was. */
  const overdue = isAccruingDetention(record, now);
  const close = () => closeRecord();

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      <DetailStep
        record={record}
        now={now}
        risk={risk}
        overdue={overdue}
        busy={actions.isBusy}
        suggestions={suggestions}
        /* Matching is a page now, not a popup (2026-08-29). Select the
           container so the page opens on it, close the dossier, and navigate. */
        onOpenMatching={(intent) => {
          selectEmpty(record.id);
          close();
          navigate(intent === 'return' ? `${ROUTES.emptyReturnsMatching}?plan=${record.id}` : ROUTES.emptyReturnsMatching);
        }}
        /* The depot's receipt is asked for first — the close is refused
           without it, and the dossier is where somebody is already looking at
           this container. `returnProof.dialog` is rendered below. */
        onConfirmReturn={() => returnProof.prompt(record)}
        onCancelPairing={() => actions.cancelPairing(record)}
      />
      {returnProof.dialog}
    </Dialog>
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
  /** Selects this container and navigates to the Matching page. */
  onOpenMatching: (intent: 'match' | 'return') => void;
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
  onOpenMatching,
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
              text: (() => {
                const margin = achievedMarginOf(record);
                return margin === null
                  ? 'Paired — the deadline is protected'
                  : `Paired — collected ${formatSpan(margin)} before the deadline`;
              })(),
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
                  onClick={() => onOpenMatching('match')}
                  disabled={busy}
                  className="shrink-0 gap-1.5"
                >
                  <ArrowLeftRight className="size-3.5" /> Open in Matching
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
              onClick={() => onOpenMatching('return')}
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

        {record.stage === 'paired' && (
          <div className="space-y-2">
            <div className="rounded-card-nested border border-primary bg-primary-subtle px-4 py-2.5 text-center">
              <div className="text-sm font-bold text-primary-subtle-foreground">
                Paired — no action required
              </div>
              <div className="text-2xs text-muted-foreground">
                Execution is handled by the Shipment module.
              </div>
            </div>
            <Button
              variant="ghost"
              size="xs"
              onClick={onCancelPairing}
              disabled={busy}
              className="w-full text-muted-foreground hover:text-destructive"
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
              {record.nextFull?.pickupAt && record.deadline && (
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
