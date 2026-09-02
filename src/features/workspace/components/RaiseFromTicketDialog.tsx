import { useEffect, useState } from 'react';

import { CrewPicker, CrewStack } from '@/components/crew';
import {
  Button, DatePicker, Dialog, DialogBody, DialogContent, DialogHeader, HelpHint, Input, Spinner,
  Textarea,
} from '@/design-system';
import { useTeam } from '@/features/team';
import { cn } from '@/utils';

import { useRaiseTicketTask } from '../api/ticketQueries';
import { RecordChip } from '../composer/RecordChip';
import type { TaskPriority, WorkspaceTicket } from '../contracts';
import { PrioritySelect } from './TaskMarks';

/**
 * Hand the problem to somebody — where a ticket becomes work.
 *
 * The title and the detail arrive filled in with the ticket's own words and
 * can be edited, which is the difference between this and raising a task from
 * scratch. What the caller said is what the person fixing it needs at 7am, and
 * retyping it is how the two records start disagreeing about what was
 * reported.
 *
 * From here the ticket stops having a status of its own: the server refuses a
 * direct write and mirrors the task's instead. The line at the bottom says so,
 * because a status control that silently stops working is worse than one that
 * explains itself.
 */
export function RaiseFromTicketDialog({
  ticket,
  open,
  onOpenChange,
}: {
  ticket: WorkspaceTicket;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { data: team = [] } = useTeam();
  const raise = useRaiseTicketTask();

  const [title, setTitle] = useState(ticket.subject);
  const [description, setDescription] = useState(ticket.description);
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [priority, setPriority] = useState<TaskPriority>(ticket.priority);
  const [dueAt, setDueAt] = useState('');

  useEffect(() => {
    if (open) {
      setTitle(ticket.subject);
      setDescription(ticket.description);
      setPriority(ticket.priority);
      setAssigneeId(undefined);
      setDueAt('');
    }
  }, [open, ticket.subject, ticket.description, ticket.priority]);

  const assignee = team.find((member) => member.id === assigneeId);
  const canSubmit = title.trim().length > 0 && !raise.isPending;

  function submit() {
    if (!canSubmit) return;
    raise.mutate(
      {
        idOrRef: ticket.reference,
        payload: {
          title: title.trim(),
          description: description.trim() || undefined,
          assigneeId,
          priority,
          /* The picker hands back a date; the API wants an instant. End of
             day, because "due Friday" means by the end of Friday. */
          dueAt: dueAt ? new Date(`${dueAt}T23:59:59`).toISOString() : undefined,
        },
      },
      { onSuccess: () => onOpenChange(false) },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader title={`Raise the work for ${ticket.reference}`}>
          {ticket.recordRef && ticket.recordType ? (
            <RecordChip
              recordType={ticket.recordType}
              reference={ticket.recordRef}
              label={ticket.recordLabel}
              status={ticket.recordStatus}
              size="sm"
              static
            />
          ) : null}
        </DialogHeader>

        <DialogBody className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">What needs doing</span>
            <Input value={title} onChange={(event) => setTitle(event.target.value)} autoFocus />
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
                      <CrewStack
                        size="xs"
                        crew={[
                          {
                            id: assignee.id,
                            fullName: assignee.fullName,
                            avatarUrl: assignee.avatarUrl,
                          },
                        ]}
                      />
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

          <label className="block">
            <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-foreground">
              What the caller said
              <HelpHint label="What raising this does">
                From here the ticket follows this task: moving the task to In progress, Waiting,
                Completed or Cancelled moves{' '}
                <strong className="text-foreground">{ticket.reference}</strong> with it — there is
                nothing to update twice.
              </HelpHint>
            </span>
            <Textarea
              value={description}
              rows={4}
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>


          {raise.isError ? (
            <p className="rounded-sm bg-destructive-subtle px-3 py-2 text-xs text-destructive">
              {(raise.error as Error)?.message ?? 'Could not raise this task.'}
            </p>
          ) : null}
        </DialogBody>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button
            size="sm"
            shape="pill"
            disabled={!canSubmit}
            onClick={submit}
            leadingIcon={raise.isPending ? <Spinner className="size-3.5" /> : undefined}
          >
            Raise the task
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
