import { useMemo, useState } from 'react';
import { format, parse } from 'date-fns';

import {
  Button,
  DatePicker,
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  TimePicker,
} from '@/design-system';
import { AlertTriangle, RotateCcw } from '@/design-system/icons';
import { defaultPlannedReturn } from '@/features/empty-returns';
import { detentionFor, formatContainerSize, formatDetention } from '@/data/emptyReturnData';
import { formatStamp } from '@/stores/emptyReturn.store';
import type { EmptyReturnRecord } from '@/types/emptyReturn';

import { EmptyTag, Mono } from './marks';

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
interface PlanReturnProps {
  record: EmptyReturnRecord;
  now: number;
  busy: boolean;
  onClose: () => void;
  onConfirm: (plannedAt: number) => void;
}

export function PlanReturnContent({
  record,
  now,
  busy,
  onClose,
  onConfirm,
}: PlanReturnProps) {
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
  );
}

/**
 * The same form as its own dialog, for a caller that is not already inside one.
 *
 * Two exports because this form now has two hosts: the Matching page opens it
 * standalone, and the container dossier shows it as a STEP — and a `<Dialog>`
 * nested inside a `<Dialog>` mounts a second overlay on top of the first, which
 * dims the dossier behind its own child. The content is the shared part; the
 * wrapper belongs to whoever is not already providing one.
 */
export function PlanReturnDialog(props: PlanReturnProps) {
  return (
    <Dialog open onOpenChange={(next) => !next && props.onClose()}>
      <PlanReturnContent {...props} />
    </Dialog>
  );
}
