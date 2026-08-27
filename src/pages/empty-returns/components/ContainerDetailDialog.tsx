import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { format, parse } from 'date-fns';

import { ROUTES, buildPath } from '@/config/routes';
import {
  Button,
  Card,
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
  DatePicker,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  TimePicker,
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
import {
  defaultPlannedReturn,
  incompatibleLoadsFor,
  suggestLoadsFor,
  useEmptyContainerActions,
  useEmptyContainers,
} from '@/features/empty-returns';
import {
  achievedMarginOf,
  formatSpan,
  formatStamp,
  isAccruingDetention,
  rejectedLoadsFor,
  riskOf,
  useEmptyReturnStore,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord, FullLoadMission } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { OperationFlow } from './OperationFlow';
import { IncompatibleLoadList, PairingSuggestionCard } from './PairingSuggestionCard';
import {
  CompanyName,
  EmptyTag,
  FullTag,
  LocationLine,
  Mono,
  RiskBadge,
  SectionLabel,
  StageChip,
} from './marks';

/**
 * One container, and the single decision it is waiting on.
 *
 * Hosted once by the module chrome and driven by `store.openRecordId`, so the
 * Control Tower, the Calendar, Matching and Cycles all open the *same* dialog.
 * Five views with five slightly different container panels is how a product
 * starts disagreeing with itself.
 *
 * It is a small state machine because the decision is a small state machine:
 *
 * ```
 *   detail ──▶ select ──▶ confirm ──▶ success
 *      │                                  │
 *      └──────▶ return ───────────────────┘
 * ```
 *
 * `success` exists on purpose. Confirming a pairing is the moment the module's
 * job ends, and saying so — with both container numbers, the margin won and the
 * fact that execution now belongs to Shipments — is what stops an operator
 * hunting for the next button. There is no next button.
 */

type Mode = 'detail' | 'select' | 'confirm' | 'success' | 'return';

export function ContainerDetailDialog() {
  const openRecordId = useEmptyReturnStore((state) => state.openRecordId);
  const openRecordIntent = useEmptyReturnStore((state) => state.openRecordIntent);
  const closeRecord = useEmptyReturnStore((state) => state.closeRecord);
  const rejected = useEmptyReturnStore((state) => state.rejected);
  const rejectPairing = useEmptyReturnStore((state) => state.rejectPairing);

  const { byId, loads, now } = useEmptyContainers();
  const actions = useEmptyContainerActions();
  const record = byId(openRecordId);

  const [mode, setMode] = useState<Mode>('detail');
  const [candidate, setCandidate] = useState<FullLoadMission | null>(null);
  /** The pairing that was just confirmed — held so `success` survives the refetch. */
  const [confirmed, setConfirmed] = useState<{ load: FullLoadMission; marginMs: number } | null>(
    null,
  );

  // Reopening on a different container, or with a different intent, restarts
  // the machine — otherwise a dialog opened on "Find Full Load" would inherit
  // whatever step the previous container was left on.
  useEffect(() => {
    if (!openRecordId) return;
    setMode(openRecordIntent === 'select' ? 'select' : openRecordIntent === 'return' ? 'return' : 'detail');
    setCandidate(null);
    setConfirmed(null);
  }, [openRecordId, openRecordIntent]);

  const rejectedIds = useMemo(
    () => (record ? rejectedLoadsFor(rejected, record.id) : []),
    [rejected, record],
  );
  const suggestions = useMemo(
    () => suggestLoadsFor(record, loads, now, rejectedIds),
    [record, loads, now, rejectedIds],
  );
  const incompatible = useMemo(
    () => incompatibleLoadsFor(record, loads, now),
    [record, loads, now],
  );

  if (!record) return null;

  const risk = riskOf(record, now);
  /* Not `now > deadline`: a container paired before its deadline has settled
     its clock and can never accrue detention, however long ago that date was. */
  const overdue = isAccruingDetention(record, now);
  const close = () => closeRecord();

  const handleConfirm = async (load: FullLoadMission) => {
    const marginMs = record.deadline ? record.deadline - Math.max(load.pickupAt, now) : 0;
    const ok = await actions.confirmPairing(record, load);
    if (ok) {
      setConfirmed({ load, marginMs });
      setMode('success');
    }
  };

  return (
    <Dialog open onOpenChange={(next) => !next && close()}>
      {mode === 'select' && (
        <SelectStep
          record={record}
          now={now}
          suggestions={suggestions}
          incompatible={incompatible}
          busy={actions.isBusy}
          onPick={(load) => {
            setCandidate(load);
            setMode('confirm');
          }}
          onReject={(load) => rejectPairing(load.id, record.id)}
          onPlanReturn={() => setMode('return')}
          onBack={() => setMode('detail')}
        />
      )}

      {mode === 'confirm' && candidate && (
        <ConfirmStep
          record={record}
          load={candidate}
          now={now}
          busy={actions.isBusy}
          onBack={() => setMode('select')}
          onConfirm={() => handleConfirm(candidate)}
        />
      )}

      {mode === 'success' && confirmed && (
        <SuccessStep record={record} load={confirmed.load} marginMs={confirmed.marginMs} onClose={close} />
      )}

      {mode === 'return' && (
        <PlanReturnStep
          record={record}
          now={now}
          busy={actions.isBusy}
          onBack={() => setMode('detail')}
          onPlan={async (plannedAt) => {
            const ok = await actions.planReturn(record, plannedAt);
            if (ok) setMode('detail');
          }}
        />
      )}

      {mode === 'detail' && (
        <DetailStep
          record={record}
          now={now}
          risk={risk}
          overdue={overdue}
          busy={actions.isBusy}
          onFindLoad={() => setMode('select')}
          onPlanReturn={() => setMode('return')}
          onConfirmReturn={async () => {
            const ok = await actions.confirmReturn(record);
            if (ok) close();
          }}
          onCancelPairing={() => actions.cancelPairing(record)}
        />
      )}
    </Dialog>
  );
}

/* ---------------------------------------------------------------------------
 * The container header every step shares
 * ------------------------------------------------------------------------- */

function ContainerLine({ record, now }: { record: EmptyReturnRecord; now: number }) {
  const overdue = isAccruingDetention(record, now);
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
      <EmptyTag small />
      <Mono className="text-sm font-bold text-foreground">{record.container || '—'}</Mono>
      <span>
        {record.line} · {record.size}
      </span>
      <LocationLine className="min-w-0">{record.locationName}</LocationLine>
      {record.deadline && (
        <Mono className={cn('font-bold', riskTextClass(riskOf(record, now)))}>
          {overdue
            ? `${formatSpan(now - record.deadline)} overdue`
            : `${formatSpan(record.deadline - now)} to deadline`}
        </Mono>
      )}
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * Step — find a full load
 * ------------------------------------------------------------------------- */

interface SelectStepProps {
  record: EmptyReturnRecord;
  now: number;
  suggestions: ReturnType<typeof suggestLoadsFor>;
  incompatible: ReturnType<typeof incompatibleLoadsFor>;
  busy: boolean;
  onPick: (load: FullLoadMission) => void;
  onReject: (load: FullLoadMission) => void;
  onPlanReturn: () => void;
  onBack: () => void;
}

function SelectStep({
  record,
  now,
  suggestions,
  incompatible,
  busy,
  onPick,
  onReject,
  onPlanReturn,
  onBack,
}: SelectStepProps) {
  const [showIncompatible, setShowIncompatible] = useState(false);
  const risk = riskOf(record, now);

  return (
    <DialogContent size="lg" aria-describedby={undefined}>
      <DialogHeader title="Find Full Load">
        <ContainerLine record={record} now={now} />
      </DialogHeader>

      <DialogBody className="space-y-2.5">
        {suggestions.length === 0 ? (
          <Card variant="filled" padding="md" className="text-center">
            <p className="text-sm font-semibold text-foreground">No viable full load</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Nothing currently open can use this container before its return deadline.
            </p>
            <p className="mx-auto mt-2 max-w-md text-xs text-muted-foreground">
              {/* The recommendation is graded by urgency, because "try again
                  later" is sound advice at three days out and negligence at three hours. */}
              {risk === 'safe' && 'The decision window is still comfortable — check again later.'}
              {risk === 'watch' && 'Prioritise pairing today, or plan the return now.'}
              {risk === 'critical' &&
                'Pair now if anything appears — otherwise plan the empty return immediately.'}
              {risk === 'overdue' &&
                'Detention is already accruing. Plan and confirm the empty return now.'}
              {!risk && 'This container has no return deadline recorded, so nothing can be timed against it.'}
            </p>
            <Button variant="outline" size="sm" className="mt-3" onClick={onPlanReturn}>
              <RotateCcw /> Plan Empty Return
            </Button>
          </Card>
        ) : (
          suggestions.map((suggestion, index) => (
            <div key={suggestion.load.id} className="space-y-1.5">
              {index === 0 && <SectionLabel className="text-primary">Recommendation</SectionLabel>}
              {index === 1 && <SectionLabel className="pt-1">Other options</SectionLabel>}
              <PairingSuggestionCard
                suggestion={suggestion}
                featured={index === 0}
                actionLabel={index === 0 ? 'Confirm Pairing' : 'Choose'}
                disabled={busy}
                onConfirm={() => onPick(suggestion.load)}
                onReject={() => onReject(suggestion.load)}
              />
            </div>
          ))
        )}

        {incompatible.length > 0 && (
          <Collapsible open={showIncompatible} onOpenChange={setShowIncompatible}>
            <CollapsibleTrigger asChild>
              <Button variant="ghost" size="xs" className="text-muted-foreground">
                <Info /> Why not the others? ({incompatible.length})
              </Button>
            </CollapsibleTrigger>
            <CollapsibleContent className="pt-2">
              <IncompatibleLoadList loads={incompatible} />
            </CollapsibleContent>
          </Collapsible>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onBack}>
          Back
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ---------------------------------------------------------------------------
 * Step — confirm the pairing
 * ------------------------------------------------------------------------- */

interface ConfirmStepProps {
  record: EmptyReturnRecord;
  load: FullLoadMission;
  now: number;
  busy: boolean;
  onBack: () => void;
  onConfirm: () => void;
}

/**
 * The confirmation, drawn as the two containers it actually is.
 *
 * Empty on top, full underneath, the pairing mark between them and both numbers
 * in full. This is the last screen before a vehicle is committed, so it is also
 * the last chance to notice that the wrong box is about to travel.
 */
function ConfirmStep({ record, load, now, busy, onBack, onConfirm }: ConfirmStepProps) {
  const marginMs = record.deadline ? record.deadline - Math.max(load.pickupAt, now) : null;

  return (
    <DialogContent size="md" aria-describedby={undefined}>
      <DialogHeader title="Confirm Pairing" />
      <DialogBody className="space-y-3">
        <div className="rounded-card-nested border-2 border-dashed border-info bg-info-subtle/40 px-4 py-3">
          <div className="text-2xs font-extrabold uppercase tracking-widest text-info-subtle-foreground">
            Empty container
          </div>
          <Mono className="text-sm font-bold text-foreground">{record.container || '—'}</Mono>
          <div className="text-xs text-muted-foreground">
            {record.line} · {record.size} · {record.locationName}
          </div>
        </div>

        <div className="flex items-center justify-center gap-2 text-xs font-bold text-primary">
          <ArrowLeftRight className="size-3.5" aria-hidden /> PAIRED WITH
          <span className="font-normal text-muted-foreground">(a different container)</span>
        </div>

        <div className="rounded-card-nested border-2 border-primary bg-primary-subtle px-4 py-3">
          <div className="text-2xs font-extrabold uppercase tracking-widest text-primary-subtle-foreground">
            Upcoming full load
          </div>
          <Mono className="text-sm font-bold text-foreground">{load.container || '—'}</Mono>
          <div className="text-xs text-muted-foreground">
            <Mono className="font-semibold">{load.shipmentReference ?? load.id}</Mono> · {load.line} ·{' '}
            {load.size}
          </div>
          <div className="text-xs text-muted-foreground">
            {load.pickupHub} · <Mono>{formatStamp(load.pickupAt)}</Mono>
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 rounded-card-nested border border-border bg-surface-sunken px-4 py-2.5 text-xs">
          <div>
            <div className="text-2xs uppercase text-muted-foreground">Return deadline</div>
            <Mono className="font-semibold text-foreground">{formatStamp(record.deadline)}</Mono>
          </div>
          <div>
            <div className="text-2xs uppercase text-muted-foreground">Margin</div>
            <Mono
              className={cn(
                'font-bold',
                marginMs !== null && marginMs < 6 * 3_600_000
                  ? 'text-warning-subtle-foreground'
                  : 'text-success-subtle-foreground',
              )}
            >
              {marginMs === null ? '—' : `+${formatSpan(marginMs)}`}
            </Mono>
          </div>
        </div>

        <p className="text-2xs text-muted-foreground">
          Confirming records the decision and commits this load. Moving the truck is handled in
          Shipments — there is nothing further to do here.
        </p>
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button variant="primary" size="sm" onClick={onConfirm} disabled={busy}>
          <CheckCircle2 /> Confirm Pairing
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ---------------------------------------------------------------------------
 * Step — the decision is made
 * ------------------------------------------------------------------------- */

function SuccessStep({
  record,
  load,
  marginMs,
  onClose,
}: {
  record: EmptyReturnRecord;
  load: FullLoadMission;
  marginMs: number;
  onClose: () => void;
}) {
  return (
    <DialogContent size="md" aria-describedby={undefined} hideCloseButton>
      <DialogHeader title="Pairing confirmed" />
      <DialogBody className="space-y-3">
        <div className="flex items-center justify-center gap-2 rounded-card-nested border border-success bg-success-subtle px-4 py-3 text-sm font-semibold text-success-subtle-foreground">
          <CheckCircle2 className="size-5 shrink-0" aria-hidden />
          One empty return avoided — the deadline is protected.
        </div>

        <dl className="space-y-1.5 text-xs">
          <Row label="Empty container">
            <span className="inline-flex items-center gap-1.5">
              <EmptyTag small />
              <Mono className="font-bold">{record.container || '—'}</Mono>
            </span>
          </Row>
          <Row label="Goes out under">
            <span className="inline-flex items-center gap-1.5">
              <FullTag small />
              <Mono className="font-bold">{load.container || '—'}</Mono>
            </span>
          </Row>
          <Row label="Shipment">
            <Mono className="font-semibold">{load.shipmentReference ?? load.id}</Mono>
          </Row>
          <Row label="Pickup">
            <Mono>{formatStamp(load.pickupAt)}</Mono>
          </Row>
          <Row label="Margin before deadline">
            <Mono className="font-bold text-success-subtle-foreground">+{formatSpan(marginMs)}</Mono>
          </Row>
        </dl>

        <p className="text-2xs text-muted-foreground">
          Empty Container Management handles the pairing decision, not transport execution. The
          truck, the driver and the gate-in all live on the shipment.
        </p>
      </DialogBody>

      <DialogFooter>
        {load.shipmentId && (
          <Button variant="outline" size="sm" asChild>
            <Link to={buildPath(ROUTES.shipmentOverview, { id: load.shipmentId })}>
              <ExternalLink /> Open the shipment
            </Link>
          </Button>
        )}
        <Button variant="primary" size="sm" onClick={onClose}>
          Done
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ---------------------------------------------------------------------------
 * Step — plan the empty return
 * ------------------------------------------------------------------------- */

function PlanReturnStep({
  record,
  now,
  busy,
  onBack,
  onPlan,
}: {
  record: EmptyReturnRecord;
  now: number;
  busy: boolean;
  onBack: () => void;
  onPlan: (plannedAt: number) => void;
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
    <DialogContent size="md" aria-describedby={undefined}>
      <DialogHeader title="Plan Empty Return">
        <ContainerLine record={record} now={now} />
      </DialogHeader>

      <DialogBody className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Matching stops for this container and it goes back to the depot on its own. Record when it
          is actually going, so the calendar and the deadline agree.
        </p>

        <dl className="space-y-1.5 text-xs">
          <Row label="Currently at">{record.locationName}</Row>
          <Row label="Returns to">{record.returnDepot}</Row>
          <Row label="Return deadline">
            <Mono>{formatStamp(record.deadline)}</Mono>
          </Row>
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
            {/* A warning rather than a block: the slot may genuinely be the
                earliest one available, and refusing to record reality does not
                make the box come back sooner. */}
            This slot falls after the return deadline — detention of{' '}
            {formatDetention(detentionFor(plannedAt - (record.deadline ?? plannedAt)))} would be expected.
          </p>
        )}
      </DialogBody>

      <DialogFooter>
        <Button variant="ghost" size="sm" onClick={onBack} disabled={busy}>
          Back
        </Button>
        <Button variant="primary" size="sm" onClick={() => onPlan(plannedAt)} disabled={busy}>
          <RotateCcw /> Confirm the plan
        </Button>
      </DialogFooter>
    </DialogContent>
  );
}

/* ---------------------------------------------------------------------------
 * Step — the container's own detail
 * ------------------------------------------------------------------------- */

interface DetailStepProps {
  record: EmptyReturnRecord;
  now: number;
  risk: ReturnType<typeof riskOf>;
  overdue: boolean;
  busy: boolean;
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
  onFindLoad,
  onPlanReturn,
  onConfirmReturn,
  onCancelPairing,
}: DetailStepProps) {
  const [showActivity, setShowActivity] = useState(false);
  const detention = overdue ? detentionFor(now - (record.deadline ?? now)) : 0;

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
            <EmptyTag />
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

        {/* The action area — one decision, never a menu of them. */}
        {record.stage === 'empty' && (
          <Card variant="filled" padding="sm">
            <SectionLabel>What should happen next?</SectionLabel>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <button
                type="button"
                onClick={onFindLoad}
                disabled={busy}
                className="rounded-card-nested bg-primary-bold px-4 py-3 text-left text-primary-bold-foreground transition-opacity duration-fast hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  <ArrowLeftRight className="size-4" aria-hidden /> Find Full Load
                </span>
                <span className="mt-0.5 block text-2xs opacity-80">
                  Pair this empty with an upcoming full-load operation.
                </span>
              </button>
              <button
                type="button"
                onClick={onPlanReturn}
                disabled={busy}
                className="rounded-card-nested border-2 border-warning bg-surface px-4 py-3 text-left text-warning-subtle-foreground transition-colors duration-fast hover:bg-warning-subtle focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:opacity-50"
              >
                <span className="flex items-center gap-1.5 text-sm font-bold">
                  <RotateCcw className="size-4" aria-hidden /> Plan Empty Return
                </span>
                <span className="mt-0.5 block text-2xs">
                  Send it back before the shipping line&rsquo;s deadline.
                </span>
              </button>
            </div>
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

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4 border-b border-border-subtle pb-1.5 last:border-0">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="text-right font-medium text-foreground">{children}</dd>
    </div>
  );
}

function Figure({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-2xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
