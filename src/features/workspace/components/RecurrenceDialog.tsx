import { useEffect, useState } from 'react';

import { CrewPicker, CrewStack } from '@/components/crew';
import {
  Button, Dialog, DialogBody, DialogContent, DialogFooter, DialogHeader, Input, Select,
} from '@/design-system';
import { useTeam } from '@/features/team';

import { useCreateRecurrence, useUpdateRecurrence } from '../api/queries';
import type { RecurrencePayload } from '../api/workspaceService';
import {
  RECURRENCE_FREQUENCY_LABEL, TASK_PRIORITIES, TASK_PRIORITY_LABEL,
  type RecurrenceFrequency, type TaskPriority, type TaskRecurrence,
} from '../contracts';
import { describeRecurrence } from './recurrenceLabel';

const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

export interface RecurrenceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Editing an existing rule, or seeding a new one from a task. */
  rule?: TaskRecurrence;
  seed?: { title: string; priority: TaskPriority; assigneeId?: string };
}

/**
 * A repeating job, in five fields.
 *
 * The preview line is the whole point of the form: `frequency` × `interval` ×
 * `weekday` × `dayOfMonth` is four controls that between them can express
 * something nobody meant, and "Every 2 weeks on Tuesday" read back in English
 * is the only check a person can actually perform on it.
 *
 * What is deliberately absent: an end date, an exception calendar, "skip
 * weekends". A desk of eight can disable a rule.
 */
export function RecurrenceDialog({ open, onOpenChange, rule, seed }: RecurrenceDialogProps) {
  const { data: team = [] } = useTeam();
  const create = useCreateRecurrence();
  const update = useUpdateRecurrence();
  const busy = create.isPending || update.isPending;

  const [title, setTitle] = useState('');
  const [frequency, setFrequency] = useState<RecurrenceFrequency>('WEEKLY');
  const [interval, setInterval] = useState(1);
  const [weekday, setWeekday] = useState(1);
  const [dayOfMonth, setDayOfMonth] = useState(1);
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [assigneeId, setAssigneeId] = useState<string | undefined>();

  useEffect(() => {
    if (!open) return;
    setTitle(rule?.title ?? seed?.title ?? '');
    setFrequency(rule?.frequency ?? 'WEEKLY');
    setInterval(rule?.interval ?? 1);
    setWeekday(rule?.weekday ?? 1);
    setDayOfMonth(rule?.dayOfMonth ?? 1);
    setPriority(rule?.priority ?? seed?.priority ?? 'NORMAL');
    setAssigneeId(rule?.assignee?.id ?? seed?.assigneeId);
  }, [open, rule, seed]);

  const assignee = team.find((member) => member.id === assigneeId);
  const preview = describeRecurrence({
    frequency,
    interval,
    weekday: frequency === 'WEEKLY' ? weekday : null,
    dayOfMonth: frequency === 'MONTHLY' ? dayOfMonth : null,
  });

  function submit() {
    if (!title.trim()) return;
    const payload: RecurrencePayload = {
      title: title.trim(),
      frequency,
      interval,
      priority,
      assigneeId,
      weekday: frequency === 'WEEKLY' ? weekday : undefined,
      dayOfMonth: frequency === 'MONTHLY' ? dayOfMonth : undefined,
    };
    const done = { onSuccess: () => onOpenChange(false) };
    if (rule) update.mutate({ id: rule.id, patch: payload }, done);
    else create.mutate(payload, done);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader title={rule ? 'Edit repeating task' : 'Repeat this task'} />

        <DialogBody className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">What gets filed each time</span>
            <Input
              value={title}
              autoFocus
              placeholder="Review outstanding transporter balances"
              onChange={(event) => setTitle(event.target.value)}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Repeats</span>
              <Select
                value={frequency}
                onChange={(event) => setFrequency(event.target.value as RecurrenceFrequency)}
                options={(Object.keys(RECURRENCE_FREQUENCY_LABEL) as RecurrenceFrequency[]).map((key) => ({
                  value: key,
                  label: RECURRENCE_FREQUENCY_LABEL[key],
                }))}
              />
            </label>

            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Every</span>
              <Input
                type="number"
                min={1}
                max={52}
                value={String(interval)}
                onChange={(event) => setInterval(Math.max(1, Number(event.target.value) || 1))}
              />
            </label>

            {frequency === 'WEEKLY' ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">On</span>
                <Select
                  value={String(weekday)}
                  onChange={(event) => setWeekday(Number(event.target.value))}
                  options={WEEKDAYS.map((day, index) => ({ value: String(index), label: day }))}
                />
              </label>
            ) : frequency === 'MONTHLY' ? (
              <label className="block">
                <span className="mb-1.5 block text-xs font-medium text-foreground">Day</span>
                <Input
                  type="number"
                  min={1}
                  max={31}
                  value={String(dayOfMonth)}
                  onChange={(event) => setDayOfMonth(Math.min(31, Math.max(1, Number(event.target.value) || 1)))}
                />
              </label>
            ) : (
              <span />
            )}
          </div>

          {/* Read the four controls back as one sentence — see the note above. */}
          <p className="rounded-card border border-primary/30 bg-primary-subtle px-3 py-2 text-sm font-medium text-primary-subtle-foreground">
            {preview}
            {frequency === 'MONTHLY' && dayOfMonth > 28
              ? ' — short months fire on their last day'
              : ''}
          </p>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Priority</span>
              <Select
                value={priority}
                onChange={(event) => setPriority(event.target.value as TaskPriority)}
                options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABEL[p] }))}
              />
            </label>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-foreground">Assign each one to</span>
              <CrewPicker
                value={assigneeId ? [assigneeId] : []}
                onChange={(ids) => setAssigneeId(ids.at(-1))}
              >
                <button
                  type="button"
                  className="flex h-10 w-full items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                >
                  {assignee ? (
                    <>
                      <CrewStack size="xs" crew={[{ id: assignee.id, fullName: assignee.fullName, avatarUrl: assignee.avatarUrl }]} />
                      <span className="truncate text-sm text-foreground">{assignee.fullName}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Nobody — it lands unassigned</span>
                  )}
                </button>
              </CrewPicker>
            </div>
          </div>
        </DialogBody>

        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={busy}>Cancel</Button>
          <Button onClick={submit} disabled={busy || !title.trim()}>
            {rule ? 'Save rule' : 'Create rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
