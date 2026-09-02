import { cn } from '@/utils';

import { TICKET_PRIORITY_LABEL, type TaskPriority } from '../contracts';

/**
 * Priority, loud.
 *
 * A support queue is triaged on this one field, and in a subtle badge it was
 * the quietest thing in the row — "High" in pale amber beside a bold title
 * reads as a footnote about the title rather than the reason to open it first.
 * Filled, it is the first mark the eye lands on, which is the correct order
 * for a list somebody scans to decide what to do next.
 *
 * Only the top two are filled. If every priority shouts, none of them does:
 * Medium is the default and most of the queue sits there, so it takes the
 * quiet treatment and the two that mean "before the others" take the colour.
 */
const PRIORITY_TONE: Record<TaskPriority, string> = {
  URGENT: 'bg-destructive text-destructive-foreground',
  HIGH: 'bg-warning text-warning-foreground',
  NORMAL: 'bg-secondary text-secondary-foreground',
  LOW: 'bg-transparent text-muted-foreground ring-1 ring-inset ring-border',
};

export function TicketPriorityBadge({
  priority,
  className,
}: {
  priority: TaskPriority;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center gap-1 rounded-full px-2 py-0.5',
        'text-[10px] font-extrabold uppercase tracking-wider',
        PRIORITY_TONE[priority],
        className,
      )}
    >
      {TICKET_PRIORITY_LABEL[priority]}
    </span>
  );
}

/**
 * How long it has been sitting there.
 *
 * The second triage signal after priority, and the one a status cannot give:
 * a Medium ticket open for nine days is a worse problem than a High one opened
 * this morning, and nothing else in the row says so. Quiet under a week, red
 * past it — the point where a customer has rung twice.
 */
export function TicketAge({ createdAt, closed }: { createdAt: string; closed: boolean }) {
  const days = Math.floor((Date.now() - new Date(createdAt).getTime()) / 86_400_000);
  if (closed || days < 1) return null;
  return (
    <span
      className={cn(
        'shrink-0 text-[11px] font-semibold tabular-nums',
        days >= 7 ? 'text-destructive' : 'text-muted-foreground',
      )}
      title={`Open for ${days} day${days === 1 ? '' : 's'}`}
    >
      {days}d open
    </span>
  );
}
