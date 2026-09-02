import { useEffect, useState } from 'react';

import { CrewPicker, CrewStack } from '@/components/crew';
import {
  Button, Dialog, DialogBody, DialogContent, DialogHeader, HelpHint, Input, Select, Spinner,
  Textarea,
} from '@/design-system';
import { useTeam } from '@/features/team';
import { cn } from '@/utils';

import { useCreateTicket } from '../api/ticketQueries';
import { TICKET_CHANNEL_LABEL, TICKET_PRIORITIES, TICKET_PRIORITY_LABEL } from '../contracts';
import type { TaskPriority, TicketChannel } from '../contracts';
import { RecordPicker, type PickedRecord } from './RecordPicker';

/**
 * Create a ticket — five fields, in the order the call happens.
 *
 * It began longer: who rang, their number, which channel it came in by, then
 * the problem. All true, none of it what the form is for. A ticket is worth
 * having the moment somebody types the title, and every field before that one
 * is a reason to abandon the form and carry on with the phone call. Caller
 * details are editable on the ticket afterwards, where there is time.
 *
 * **Assign to is the important one.** Naming somebody here raises the task in
 * the same call — the ticket stops being a note and becomes work on their
 * board, with the notification they would have got either way. Leaving it
 * empty is equally valid: the ticket sits in Unassigned until somebody picks
 * it up, which is the queue that page exists for.
 */
export function LogTicketDialog({
  open,
  onOpenChange,
  record,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Pre-attached when created from a record's own Tickets tab. */
  record?: PickedRecord;
  onCreated?: (reference: string) => void;
}) {
  const create = useCreateTicket();
  const { data: team = [] } = useTeam();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [priority, setPriority] = useState<TaskPriority>('NORMAL');
  const [about, setAbout] = useState<PickedRecord | null>(record ?? null);
  const [assigneeId, setAssigneeId] = useState<string | undefined>();
  const [reporterName, setReporterName] = useState('');
  const [channel, setChannel] = useState<TicketChannel>('PHONE');
  const [reporterContact, setReporterContact] = useState('');

  useEffect(() => {
    if (!open) {
      setTitle('');
      setDescription('');
      setPriority('NORMAL');
      setAbout(record ?? null);
      setAssigneeId(undefined);
      setReporterName('');
      setReporterContact('');
      setChannel('PHONE');
    }
  }, [open, record]);

  const assignee = team.find((member) => member.id === assigneeId);
  const canSubmit = title.trim().length > 0 && !create.isPending;

  function submit() {
    if (!canSubmit) return;
    create.mutate(
      {
        subject: title.trim(),
        /* The API insists on an account of the problem; a title-only ticket
           repeats itself rather than being rejected at the form. */
        description: description.trim() || title.trim(),
        priority,
        recordType: about?.recordType,
        recordId: about?.recordId,
        reporterName: reporterName.trim() || undefined,
        reporterContact: reporterContact.trim() || undefined,
        channel,
        assigneeId,
      },
      {
        onSuccess: (ticket) => {
          onOpenChange(false);
          onCreated?.(ticket.reference);
        },
      },
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader title="Create ticket" />

        <DialogBody className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">
              Title <span className="text-destructive">*</span>
            </span>
            <Input
              value={title}
              autoFocus
              placeholder="Missing Proof of Delivery"
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && canSubmit) {
                  event.preventDefault();
                  submit();
                }
              }}
            />
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">Description</span>
            <Textarea
              value={description}
              rows={3}
              placeholder="What they told you, in their words."
              onChange={(event) => setDescription(event.target.value)}
            />
          </label>

          {/* Who said it, and how. Two fields on one line rather than the
              three-field block this form began with — a name and a channel are
              worth thirty seconds; a contact number and a full account of the
              call are worth reaching for the ticket afterwards. */}
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Reported by</span>
              <Input
                value={reporterName}
                placeholder="Ahmed Abdi · GL FZCO"
                onChange={(event) => setReporterName(event.target.value)}
              />
            </label>
            <label className="block">
              <span className="mb-1.5 block text-xs font-medium text-foreground">Contact</span>
              <Input
                value={reporterContact}
                placeholder="+253 77 …"
                onChange={(event) => setReporterContact(event.target.value)}
              />
            </label>
            <label className="block">
              {/* "Contact method", not "Came in by" — it is what the field
                  means, and the shorter phrase was a description of the ticket
                  rather than a label for the answer. */}
              <span className="mb-1.5 block text-xs font-medium text-foreground">
                Contact method
              </span>
              <Select
                value={channel}
                onChange={(event) => setChannel(event.target.value as TicketChannel)}
              >
                {(Object.keys(TICKET_CHANNEL_LABEL) as TicketChannel[]).map((key) => (
                  <option key={key} value={key}>
                    {TICKET_CHANNEL_LABEL[key]}
                  </option>
                ))}
              </Select>
            </label>
          </div>

          <fieldset>
            <legend className="mb-1.5 block text-xs font-medium text-foreground">Priority</legend>
            {/* Radios, not a dropdown. Four options that are read as a scale
                should be visible as one — a select hides three of them and
                makes the choice a menu you have to open to compare. */}
            <div className="flex flex-wrap gap-2">
              {TICKET_PRIORITIES.map((key) => (
                <label
                  key={key}
                  className={cn(
                    'flex cursor-pointer items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-semibold transition-colors',
                    priority === key
                      ? 'border-primary bg-primary-subtle text-primary-subtle-foreground'
                      : 'border-border text-muted-foreground hover:bg-muted',
                  )}
                >
                  <input
                    type="radio"
                    name="ticket-priority"
                    value={key}
                    checked={priority === key}
                    onChange={() => setPriority(key)}
                    className="sr-only"
                  />
                  {TICKET_PRIORITY_LABEL[key]}
                </label>
              ))}
            </div>
          </fieldset>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-foreground">Related to</span>
            {/* Anything in Fleetin, not just a shipment — a ticket always
                points at the thing that has the problem. */}
            <RecordPicker value={about} onChange={setAbout} />
          </div>

          <div>
            <span className="mb-1.5 flex items-center gap-1 text-xs font-medium text-foreground">
              Assign to
              <HelpHint label="What assigning does">
                Naming somebody creates a task for them on the board, with the notification they
                would get either way — and from then on the task's status is this ticket's. Leave
                it empty and the ticket waits in <strong className="text-foreground">Unassigned</strong>{' '}
                until somebody picks it up.
              </HelpHint>
            </span>
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
            {assignee ? (
              /* Only once it says something this reader does not already know:
                 that picking a name has just created work for them. */
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Creates a task for {assignee.fullName.split(' ')[0]}.
              </p>
            ) : null}
          </div>

          {create.isError ? (
            <p className="rounded-sm bg-destructive-subtle px-3 py-2 text-xs text-destructive">
              {(create.error as Error)?.message ?? 'Could not create this ticket.'}
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
            leadingIcon={create.isPending ? <Spinner className="size-3.5" /> : undefined}
          >
            Create ticket
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
