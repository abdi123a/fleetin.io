import { useEffect, useState } from 'react';

import { CrewPicker, CrewStack } from '@/components/crew';
import {
  Button, Dialog, DialogBody, DialogContent, DialogHeader, DatePicker, Input, Spinner,
} from '@/design-system';
import { useTeam } from '@/features/team';
import { cn } from '@/utils';

import { useCreateTask } from '../api/queries';
import { Composer } from '../composer/Composer';
import { RecordChip } from '../composer/RecordChip';
import type { RecordType, TaskPriority, TaskStatus } from '../contracts';
import { TASK_STATUS_LABEL } from '../contracts';
import { PrioritySelect } from './TaskMarks';

export interface RaiseTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-attached record when raised from a shipment, vehicle or driver page. */
  record?: { recordType: RecordType; recordId: string; recordRef: string; label?: string | null };
  /** Files the task straight into this column — set by the board's "Add task". */
  status?: TaskStatus;
  onCreated?: (reference: string) => void;
}

/**
 * Raise — the fast path from noticing a problem to somebody owning it.
 *
 * Four fields and nothing else. This form is opened from a record page by
 * somebody who is mid-task and has just spotted something; every extra field
 * is a reason to close it and carry on, and the thing never gets written down.
 * Description, links and the conversation all live on the task afterwards.
 */
export function RaiseTaskDialog({ open, onOpenChange, record, status, onCreated }: RaiseTaskDialogProps) {
  const { data: team = [] } = useTeam();
  const create = useCreateTask();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [dueAt, setDueAt] = useState('');

  useEffect(() => {
    if (!open) {
      setTitle(''); setDescription(''); setAssigneeId(undefined); setPriority('NORMAL'); setDueAt('');
    }
  }, [open]);

  const assignee = team.find((m) => m.id === assigneeId);
  const canSubmit = title.trim().length > 0 && !create.isPending;

  /* The Composer hands back a materialised body; typing straight into the
     title and pressing Enter has no tokens to swap, so `description` is used
     as-is in that path. */
  function submit(body?: string) {
    if (!canSubmit) return;
    const detail = (body ?? description).trim();
    create.mutate(
      {
        title: title.trim(),
        description: detail || undefined,
        assigneeId,
        priority,
        status,
        /* The picker hands back a date; the API wants an instant. End of day,
           because "due Friday" means by the end of Friday, not 00:00. */
        dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : undefined,
        links: record ? [{ recordType: record.recordType, recordId: record.recordId }] : undefined,
      },
      {
        onSuccess: (task) => {
          onOpenChange(false);
          onCreated?.(task.reference);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader
          title={
            record
              ? `Raise on ${record.recordRef}`
              : status && status !== 'OPEN'
                ? `Raise in ${TASK_STATUS_LABEL[status]}`
                : 'Raise a task'
          }
        />

        <DialogBody className="space-y-4">
          {record ? (
            <div className="flex items-center gap-2 rounded-card border border-border bg-surface-sunken px-3 py-2">
              <span className="text-xs text-muted-foreground">About</span>
              <RecordChip
                recordType={record.recordType}
                reference={record.recordRef}
                label={record.label}
              />
            </div>
          ) : null}

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">What needs attention?</span>
            <Input
              value={title}
              autoFocus
              placeholder="Broken container door — needs the garage"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) { event.preventDefault(); submit(); }
              }}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-3">
            <div>
              <span className="mb-1.5 block text-xs font-medium text-foreground">Assign to</span>
              <CrewPicker
                value={assigneeId ? [assigneeId] : []}
                onChange={(ids) => setAssigneeId(ids.length ? ids[ids.length - 1] : undefined)}
              >
                <button
                  type="button"
                  className={cn(
                    'flex h-10 w-full items-center gap-2 rounded-md border border-border bg-surface-raised px-3 text-left',
                    'transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
                  )}
                >
                  {assignee ? (
                    <>
                      <CrewStack size="xs" crew={[{ id: assignee.id, fullName: assignee.fullName, avatarUrl: assignee.avatarUrl }]} />
                      <span className="truncate text-sm text-foreground">{assignee.fullName}</span>
                    </>
                  ) : (
                    <span className="text-sm text-muted-foreground">Nobody yet</span>
                  )}
                </button>
              </CrewPicker>
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-foreground">Priority</span>
              <PrioritySelect value={priority} onChange={setPriority} size="md" />
            </div>

            <div>
              <span className="mb-1.5 block text-xs font-medium text-foreground">Due</span>
              <DatePicker value={dueAt} onChange={setDueAt} placeholder="No date" />
            </div>
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-foreground">Detail</span>
            <Composer
              value={description}
              onChange={setDescription}
              onSubmit={submit}
              showSubmit={false}
              rows={3}
              placeholder="Optional. Type / to reference another record, @ to name someone"
            />
          </div>

          {create.isError ? (
            <p className="rounded-sm bg-destructive-subtle px-3 py-2 text-xs text-destructive">
              {(create.error as Error)?.message ?? 'Could not raise this task.'}
            </p>
          ) : null}
        </DialogBody>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            shape="pill"
            disabled={!canSubmit}
            onClick={() => submit()}
            leadingIcon={create.isPending ? <Spinner className="size-3.5" /> : undefined}
          >
            Raise
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
