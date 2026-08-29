import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';

import { ROUTES, buildPath } from '@/config/routes';
import {
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
} from '@/design-system';
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  ExternalLink,
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
import { suggestLoadsFor, useEmptyContainerActions, useEmptyContainers } from '@/features/empty-returns';
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
import { CompanyName, Mono, RecordStateTag, RiskBadge, SectionLabel, StageChip } from './marks';

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
  const record = byId(openRecordId);

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
        onConfirmReturn={async () => {
          const ok = await actions.confirmReturn(record);
          if (ok) close();
        }}
        onCancelPairing={() => actions.cancelPairing(record)}
      />
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

  /** One operational line, never a mix of lifecycle labels. */
  const headline =
    record.stage === 'closed'
      ? record.outcome === 'paired'
        ? { text: 'Paired — the empty return was avoided', tone: 'text-primary-subtle-foreground' }
        : record.outcome === 'returned_late'
          ? {
              text: `Returned late — ${formatSpan((record.returnedAt ?? now) - (record.deadline ?? now))} after the deadline`,
              tone: 'text-destructive',
            }
          : { text: 'Returned on time', tone: 'text-success-subtle-foreground' }
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
            <span className="text-sm font-normal text-muted-foreground">
              {record.size} · {record.line}
            </span>
          </span>
        }
      >
        <div className={cn('text-sm font-semibold', headline.tone)}>{headline.text}</div>
      </DialogHeader>

      <DialogBody className="space-y-4">
        <section>
          <SectionLabel>Operation flow</SectionLabel>
          <OperationFlow record={record} now={now} className="mt-2 overflow-x-auto pb-1" />
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-2xs text-muted-foreground">
            <span className="inline-flex items-center gap-1.5">
              Shipper <CompanyName name={record.client} />
            </span>
            <span className="inline-flex items-center gap-1.5">
              Transporter <CompanyName name={record.transporter} />
            </span>
            {record.truck && <span>Truck {record.truck}</span>}
            {record.shipmentId && (
              <Link
                to={buildPath(ROUTES.shipmentOverview, { id: record.shipmentId })}
                className="inline-flex items-center gap-1 font-semibold text-primary hover:underline"
              >
                <ExternalLink className="size-3" aria-hidden />
                {record.shipmentReference ?? 'Open the shipment'}
              </Link>
            )}
          </div>
        </section>

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
              <Figure label="Urgency">
                <RiskBadge risk={risk} />
              </Figure>
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
            <Button
              variant="outline"
              size="sm"
              onClick={() => onOpenMatching('return')}
              disabled={busy}
              className="mt-2 w-full border-warning text-warning-subtle-foreground hover:bg-warning-subtle"
            >
              <RotateCcw /> Plan Empty Return instead
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

        {record.stage === 'return_planned' && (
          <Button variant="primary" size="sm" onClick={onConfirmReturn} disabled={busy} fullWidth>
            <CheckCircle2 /> Confirm the empty is back
          </Button>
        )}
      </DialogBody>

      <DialogFooter>
        <StageChip record={record} />
      </DialogFooter>
    </DialogContent>
  );
}

/* ---------------------------------------------------------------------------
 * Small shared bits
 * ------------------------------------------------------------------------- */

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
