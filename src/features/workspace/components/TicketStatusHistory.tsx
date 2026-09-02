import { Spinner } from '@/design-system';
import { cn } from '@/utils';

import { useTask } from '../api/queries';
import { TICKET_STATUS_LABEL, type TaskStatus } from '../contracts';

function ago(iso: string): string {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60_000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

/**
 * Where this has been, newest first.
 *
 * The one question a ticket is re-opened to answer weeks later — "when did we
 * start on it, and who moved it?" — and the only place it can be answered from
 * is the task's own event rail. Rendered as a rail with a ringed dot per move,
 * because a status history read as a list of sentences is a paragraph; read as
 * a line with stops on it, the shape carries the sequence and the words only
 * have to carry the names.
 *
 * Read-only, like everything else the ticket borrows from the task.
 */
export function TicketStatusHistory({
  taskRef,
  openedAt,
  openedByName,
}: {
  taskRef?: string;
  /** The ticket's own beginning, which no task event carries. */
  openedAt: string;
  openedByName: string;
}) {
  const { data: task, isLoading } = useTask(taskRef);

  if (taskRef && isLoading) {
    return (
      <div className="flex justify-center py-4">
        <Spinner className="size-4 text-muted-foreground" />
      </div>
    );
  }

  const moves = (task?.events ?? [])
    .filter((event) => event.kind === 'STATUS_CHANGED')
    .map((event) => ({
      id: event.id,
      at: event.createdAt,
      who: event.actor ? `${event.actor.firstName} ${event.actor.lastName}` : 'Fleetin',
      from: event.fromValue as TaskStatus | null,
      to: event.toValue as TaskStatus | null,
    }))
    .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());

  const rows = [
    ...moves,
    { id: 'opened', at: openedAt, who: openedByName, from: null, to: null as TaskStatus | null },
  ];

  return (
    <ol className="relative space-y-4">
      {rows.map((row, index) => (
        <li key={row.id} className="relative flex gap-3">
          {/* The rail. Drawn per-row rather than as one absolute line so the
              last stop ends at its own dot instead of running past it. */}
          {index < rows.length - 1 ? (
            <span
              aria-hidden
              className="absolute left-[7px] top-4 h-[calc(100%+0.5rem)] w-px bg-border"
            />
          ) : null}
          <span
            aria-hidden
            className={cn(
              'relative mt-0.5 grid size-3.5 shrink-0 place-items-center rounded-full ring-2',
              row.to ? 'ring-primary' : 'ring-border-strong',
            )}
          >
            <span
              className={cn(
                'size-1.5 rounded-full',
                row.to ? 'bg-primary' : 'bg-border-strong',
              )}
            />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-[13px] font-semibold leading-tight text-foreground">
              {row.to ? (
                <>
                  {row.from ? (
                    <span className="font-normal text-muted-foreground">
                      {TICKET_STATUS_LABEL[row.from]}{' '}
                      <span aria-hidden>→</span>{' '}
                    </span>
                  ) : null}
                  {TICKET_STATUS_LABEL[row.to]}
                </>
              ) : (
                'Ticket created'
              )}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              {row.who} · {ago(row.at)}
            </p>
          </div>
        </li>
      ))}
    </ol>
  );
}
