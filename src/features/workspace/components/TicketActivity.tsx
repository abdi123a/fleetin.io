import { Spinner } from '@/design-system';
import { CheckCircle2, Circle, MessageSquare } from '@/design-system/icons';
import { cn } from '@/utils';

import { useTask } from '../api/queries';
import { plainBody } from '../composer/tokens';
import { TICKET_STATUS_LABEL, type TaskStatus } from '../contracts';
import { PersonAvatar } from './PersonAvatar';

/**
 * Everything happening on the task, read-only, on the ticket.
 *
 * A ticket's reader is answering a person: "where is my container?" is
 * answered by what the desk has actually done, and until now the ticket showed
 * only the status word. The checklist, the conversation and the status trail
 * all live on the task; this is a window onto them, not a second copy.
 *
 * Nothing here is editable, deliberately. Two places to tick the same checkbox
 * is the double bookkeeping the whole feature exists to remove — the ticket is
 * where you see, the task is where you do, and the button to get there is one
 * click away above this.
 */
const EVENT_TEXT: Record<string, string> = {
  CREATED: 'raised the task',
  TITLE_CHANGED: 'renamed it',
  DESCRIPTION_CHANGED: 'edited the detail',
  PRIORITY_CHANGED: 'changed the priority',
  ASSIGNED: 'handed it to somebody',
  UNASSIGNED: 'took it off somebody',
  DUE_CHANGED: 'moved the due date',
  LINKED: 'linked a record',
  UNLINKED: 'unlinked a record',
  CHECKLIST_ADDED: 'added a step',
  CHECKLIST_DONE: 'ticked a step',
  CHECKLIST_REOPENED: 'reopened a step',
  FOLLOWER_ADDED: 'added a follower',
  FOLLOWER_REMOVED: 'removed a follower',
};

function when(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.round(hours / 24)}d ago`;
}

export function TicketActivity({ taskRef }: { taskRef?: string }) {
  const { data: task, isLoading } = useTask(taskRef);

  if (taskRef && isLoading) {
    return (
      <div className="flex justify-center py-6">
        <Spinner className="size-4 text-muted-foreground" />
      </div>
    );
  }

  const done = task?.checklist.filter((item) => item.done).length ?? 0;

  /* One rail, newest first. A status move and the comment explaining it are
     one thing that happened, and splitting them into two lists makes the
     reader interleave them by timestamp in their head. */
  /* Status moves and the ticket's own creation are NOT here — they are the
     Status history beside this, and telling the same story in two rails means
     a reader has to work out whether the second one is saying something new.
     This is what people DID and SAID; that is where it has BEEN. */
  const feed = [
    ...(task?.events ?? [])
      .filter((event) => event.kind !== 'STATUS_CHANGED')
      .map((event) => ({
      key: `e:${event.id}`,
      at: event.createdAt,
      actor: event.actor,
      kind: 'event' as const,
      status: null as TaskStatus | null,
      text: EVENT_TEXT[event.kind] ?? event.kind.toLowerCase().replace(/_/g, ' '),
    })),
    ...(task?.messages ?? [])
      .filter((message) => !message.deletedAt)
      .map((message) => ({
        key: `m:${message.id}`,
        at: message.createdAt,
        actor: message.author,
        kind: 'message' as const,
        status: null,
        /* Stored with `@[user:…]` tokens intact — rendered plain here, since
           this rail is a summary rather than the conversation itself. */
        text: plainBody(message.body),
      })),
  ].sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  return (
    <div className="space-y-4">
      {task && task.checklist.length > 0 ? (
        <div>
          <div className="mb-2 flex items-baseline gap-2">
            <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Steps
            </p>
            <span className="font-mono text-[11px] font-bold tabular-nums text-foreground">
              {done}/{task!.checklist.length}
            </span>
          </div>
          <ul className="space-y-1">
            {task!.checklist.map((item) => (
              <li key={item.id} className="flex items-start gap-2 text-sm">
                {item.done ? (
                  <CheckCircle2 className="mt-0.5 size-3.5 shrink-0 fill-success stroke-white" />
                ) : (
                  <Circle className="mt-0.5 size-3.5 shrink-0 text-border-strong" />
                )}
                <span
                  className={cn(
                    'min-w-0',
                    item.done ? 'text-muted-foreground line-through' : 'text-foreground',
                  )}
                >
                  {item.text}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div>
        {feed.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nothing has happened yet.</p>
        ) : (
          <ul className="space-y-2.5">
            {feed.slice(0, 12).map((entry) => (
              <li key={entry.key} className="flex items-start gap-2.5">
                {entry.actor ? (
                  <PersonAvatar person={entry.actor} size="xs" />
                ) : (
                  <span className="mt-0.5 size-6 shrink-0 rounded-full bg-muted" />
                )}
                <div className="min-w-0 flex-1">
                  <p className="text-[13px] leading-snug text-foreground">
                    <span className="font-semibold">
                      {entry.actor ? entry.actor.firstName : 'Fleetin'}
                    </span>{' '}
                    {entry.kind === 'message' ? (
                      <span className="inline-flex items-center gap-1 text-muted-foreground">
                        <MessageSquare className="size-3" aria-hidden />
                        said
                      </span>
                    ) : (
                      <span className="text-muted-foreground">{entry.text}</span>
                    )}
                    {entry.status ? (
                      /* The customer's word for it, since this is their page. */
                      <span className="ml-1 font-semibold text-foreground">
                        {TICKET_STATUS_LABEL[entry.status]}
                      </span>
                    ) : null}
                  </p>
                  {entry.kind === 'message' ? (
                    <p className="mt-0.5 whitespace-pre-wrap rounded-md bg-surface-sunken px-2.5 py-1.5 text-[13px] leading-snug text-foreground">
                      {entry.text}
                    </p>
                  ) : null}
                  <p className="mt-0.5 text-[10px] text-muted-foreground">{when(entry.at)}</p>
                </div>
              </li>
            ))}
          </ul>
        )}
        {feed.length > 12 ? (
          <p className="mt-2 text-[11px] text-muted-foreground">
            and {feed.length - 12} more on the task
          </p>
        ) : null}
      </div>
    </div>
  );
}
