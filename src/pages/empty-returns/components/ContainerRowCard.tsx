import { Button, Card, CornerBadge } from '@/design-system';
import {
  ArrowLeftRight,
  ArrowRight,
  CheckCircle2,
  ChevronRight,
  MapPin,
  Package,
  RotateCcw,
} from '@/design-system/icons';
import { detentionFor, formatDetention, riskTextClass } from '@/data/emptyReturnData';
import { useEmptyContainerActions } from '@/features/empty-returns';
import {
  achievedMarginOf,
  formatSpan,
  formatStamp,
  isAccruingDetention,
  riskOf,
} from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord } from '@/types/emptyReturn';
import { cn } from '@/utils';

import { CompanyName, EmptyTag, Mono, RiskBadge, StageChip } from './marks';

/**
 * One container, as a row card.
 *
 * This is the app's own list idiom — the same shape `MissionRowCard` gives a
 * shipment: a corner badge carrying the reference, a header line with the
 * company and the status, a tinted strip for the route, and a meta line with
 * the actions. Empty Container Management used a nine-column table instead,
 * which is why it read as something bolted on from outside: nothing else in
 * Fleetin is a table.
 *
 * A card also solves the thing a table could not. Cards stack, so the same
 * component works on a phone with no horizontal scrollbar and no column
 * squeezed to 90px — and every long name truncates inside its own line instead
 * of pushing the next cell off the edge.
 *
 * **Nothing was dropped to get here.** All of it is on the card:
 *
 * | Line   | Carries                                                             |
 * |--------|---------------------------------------------------------------------|
 * | corner | the container number                                                |
 * | 1      | shipper, size, shipping line, stage, urgency                        |
 * | 2      | where the box is now → where it must go back, or what it is paired with |
 * | 3      | the deadline, detention, transporter, truck, source shipment, the one action |
 */

export interface ContainerRowCardProps {
  record: EmptyReturnRecord;
  now: number;
  onOpen: (recordId: string, intent?: 'detail' | 'select' | 'return') => void;
}

export function ContainerRowCard({ record, now, onOpen }: ContainerRowCardProps) {
  const risk = riskOf(record, now);
  const accruing = isAccruingDetention(record, now);
  const settled = record.stage === 'closed';

  return (
    <Card
      onClick={() => onOpen(record.id)}
      className={cn(
        'group relative cursor-pointer overflow-hidden rounded-lg border border-border/80 bg-card text-foreground shadow-2xs transition duration-200',
        'hover:border-primary/40 hover:shadow-md',
        accruing && 'border-destructive/40 bg-urgency-overdue-row',
      )}
    >
      <div className="absolute left-0 top-0 z-10 select-none">
        {/* Orange, not red: the primitive reserves solid red and the house law
            gives orange the "this is asking for something" job. */}
        <CornerBadge
          label={record.container || record.bookingReference}
          intent={accruing ? 'orange' : 'teal'}
          position="top"
        />
      </div>

      <div className="space-y-2 px-4 pb-3 pt-9">
        {/* LINE 1 — who it belongs to, and where it stands */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5">
          <div className="flex min-w-0 flex-1 items-center gap-2">
            <CompanyName
              name={record.client}
              size="sm"
              className="min-w-0 text-sm font-extrabold leading-tight text-foreground"
            />
            <EmptyTag small className="shrink-0" />
            <span className="shrink-0 whitespace-nowrap text-[11px] text-muted-foreground">
              {record.size} · {record.line}
            </span>
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <StageChip record={record} />
            <RiskBadge risk={risk} settled={settled} />
          </div>
        </div>

        {/* LINE 2 — the movement this container is in */}
        {record.nextFull ? (
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-primary/25 bg-primary-subtle/50 px-3 py-1.5 text-xs">
            <ArrowLeftRight className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="shrink-0 font-semibold text-primary-subtle-foreground">
              Paired with
            </span>
            <Package className="size-3.5 shrink-0 text-primary" aria-hidden />
            <Mono className="truncate font-bold text-foreground">
              {record.nextFull.container || 'container tbc'}
            </Mono>
            <span className="shrink-0 text-muted-foreground">on</span>
            <Mono className="truncate font-semibold text-primary">
              {record.nextFull.shipmentReference ?? record.nextFull.missionId}
            </Mono>
          </div>
        ) : (
          <div className="flex min-w-0 items-center gap-2 rounded-lg border border-border/50 bg-secondary/40 px-3 py-1.5 text-xs">
            <MapPin className="size-3.5 shrink-0 text-primary" aria-hidden />
            <span className="truncate font-semibold text-foreground" title={record.locationName}>
              {record.locationName}
            </span>
            {/* A container whose return depot is the yard it is already standing
                in has no leg to draw. Printing the same long name twice with an
                arrow between them reads as a route and is the opposite of one. */}
            {record.returnDepot === record.locationName ? (
              <span className="shrink-0 text-muted-foreground">· goes back here</span>
            ) : (
              <>
                <ArrowRight className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <MapPin className="size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                <span className="truncate font-semibold text-foreground" title={record.returnDepot}>
                  {record.returnDepot}
                </span>
              </>
            )}
          </div>
        )}

        {/* LINE 3 — the clock, the parties, and the one move */}
        <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1.5 border-t border-border/60 pt-1.5">
          <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-1.5 text-[11px] text-muted-foreground">
            <DeadlinePhrase record={record} now={now} />
            <span aria-hidden>·</span>
            <span className="truncate font-semibold text-foreground">{record.transporter}</span>
            {record.truck && (
              <>
                <span aria-hidden>·</span>
                <Mono className="shrink-0 font-semibold text-foreground">{record.truck}</Mono>
              </>
            )}
            <span aria-hidden>·</span>
            <span className="shrink-0">
              from{' '}
              <Mono className="font-semibold text-foreground">
                {record.shipmentReference ?? record.prevLoad}
              </Mono>
            </span>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <NextAction record={record} now={now} onOpen={onOpen} />
            <Button
              variant="outline"
              size="sm"
              onClick={(event) => {
                event.stopPropagation();
                onOpen(record.id);
              }}
              className="h-7 shrink-0 cursor-pointer gap-1 rounded-lg border-border/80 px-2.5 text-xs transition group-hover:border-primary/40 group-hover:bg-primary group-hover:text-primary-foreground"
            >
              <span>View</span>
              <ChevronRight className="size-3" />
            </Button>
          </div>
        </div>
      </div>
    </Card>
  );
}

/* ---------------------------------------------------------------------------
 * The clock, in one phrase
 * ------------------------------------------------------------------------- */

/**
 * The deadline as a sentence fragment rather than a column.
 *
 * Three readings, and only one of them is ever true at a time: a settled
 * container reports the margin it achieved, an overdue one reports what it is
 * costing, and a live one reports what is left. The date itself moves to the
 * hover title — it is the number nobody scans and everybody wants once.
 */
function DeadlinePhrase({ record, now }: { record: EmptyReturnRecord; now: number }) {
  const risk = riskOf(record, now);
  const title = record.deadline ? `Return deadline ${formatStamp(record.deadline)}` : undefined;

  if (!record.deadline) {
    return <span className="shrink-0 font-semibold text-destructive">No return deadline</span>;
  }

  if (record.returnedAt) {
    const late = record.returnedAt > record.deadline;
    return (
      <span
        title={title}
        className={cn(
          'shrink-0 font-semibold',
          late ? 'text-destructive' : 'text-success-subtle-foreground',
        )}
      >
        {late ? `Back ${formatSpan(record.returnedAt - record.deadline)} late` : 'Back on time'}
      </span>
    );
  }

  if (risk === 'protected') {
    const margin = achievedMarginOf(record);
    return (
      <span title={title} className="shrink-0 font-semibold text-primary-subtle-foreground">
        {margin === null ? 'Deadline settled' : `${formatSpan(margin)} to spare`}
      </span>
    );
  }

  const remaining = record.deadline - now;
  const detention = isAccruingDetention(record, now) ? detentionFor(-remaining) : 0;

  return (
    <span title={title} className={cn('shrink-0 font-semibold', riskTextClass(risk))}>
      {remaining < 0 ? `${formatSpan(remaining)} overdue` : `${formatSpan(remaining)} left`}
      {detention > 0 && <> · {formatDetention(detention)}</>}
    </span>
  );
}

/* ---------------------------------------------------------------------------
 * One action per card
 * ------------------------------------------------------------------------- */

/**
 * The single next move, and silence when there is none.
 *
 * A container inside its window is offered pairing, because pairing is the
 * outcome worth chasing. One already overdue is offered the return instead: the
 * pairing ship has sailed and pretending otherwise costs another day. A paired
 * or closed container gets nothing at all — this used to print "Paired ·
 * Execution is in Shipments" on hundreds of consecutive rows, a sentence the
 * eye has to step over to find the handful that need something.
 */
function NextAction({
  record,
  now,
  onOpen,
}: {
  record: EmptyReturnRecord;
  now: number;
  onOpen: ContainerRowCardProps['onOpen'];
}) {
  const actions = useEmptyContainerActions();
  const risk = riskOf(record, now);

  if (record.stage === 'closed' || record.stage === 'paired') return null;

  if (record.stage === 'return_planned') {
    return (
      <Button
        variant="primary"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          void actions.confirmReturn(record);
        }}
        disabled={actions.isBusy}
        className="h-7 shrink-0 gap-1 rounded-lg px-2.5 text-xs"
      >
        <CheckCircle2 className="size-3" /> Confirm return
      </Button>
    );
  }

  if (risk === 'overdue') {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={(event) => {
          event.stopPropagation();
          onOpen(record.id, 'return');
        }}
        disabled={actions.isBusy}
        className="h-7 shrink-0 gap-1 rounded-lg border-warning px-2.5 text-xs text-warning-subtle-foreground"
      >
        <RotateCcw className="size-3" /> Plan return
      </Button>
    );
  }

  return (
    <Button
      variant="primary"
      size="sm"
      onClick={(event) => {
        event.stopPropagation();
        onOpen(record.id, 'select');
      }}
      disabled={actions.isBusy}
      className="h-7 shrink-0 gap-1 rounded-lg px-2.5 text-xs"
    >
      <ArrowLeftRight className="size-3" /> Find full load
    </Button>
  );
}
