import type { TaskStatus } from '../contracts';
import { isTaskClosed } from '../contracts';

/**
 * How worried should somebody be about this task?
 *
 * Deliberately the same five-level shape the Empty Container module uses for a
 * container's return risk, on the same `--urgency-*` tokens. Those pages are
 * readable from across a desk because urgency is a *graded colour*, not a date
 * the reader has to compare against today — and a second grading vocabulary
 * for the same idea would mean learning the app twice.
 *
 * It reads the due date AND the status, because both matter: a completed task
 * that was due last week is not late, it is done.
 */
export type TaskUrgency = 'overdue' | 'today' | 'soon' | 'scheduled' | 'none' | 'done';

export interface UrgencyMeta {
  label: (dueAt: Date) => string;
  /** The pill. */
  className: string;
  /** For colouring a figure elsewhere without the pill around it. */
  textClassName: string;
  /** Overdue work should nag. Nothing else should. */
  pulse?: boolean;
}

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfToday(): number {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

export function taskUrgency(dueAt: string | null | undefined, status: TaskStatus): TaskUrgency {
  if (isTaskClosed(status)) return 'done';
  if (!dueAt) return 'none';

  const due = new Date(dueAt).getTime();
  const today = startOfToday();

  if (due < today) return 'overdue';
  if (due < today + DAY_MS) return 'today';
  /* Three days is the window where somebody can still act without rushing. */
  if (due < today + 3 * DAY_MS) return 'soon';
  return 'scheduled';
}

/** How many whole days late, for the label. */
export function daysOverdue(dueAt: string): number {
  return Math.max(1, Math.floor((startOfToday() - new Date(dueAt).getTime()) / DAY_MS) + 1);
}

const shortDate = (date: Date) =>
  date.toLocaleDateString(undefined, { day: 'numeric', month: 'short' });

export const TASK_URGENCY_META: Record<TaskUrgency, UrgencyMeta> = {
  overdue: {
    label: (due) => `${daysOverdue(due.toISOString())}d late`,
    className: 'bg-urgency-overdue-bg text-urgency-overdue-fg border-urgency-overdue-border',
    textClassName: 'text-destructive',
    pulse: true,
  },
  today: {
    label: () => 'Today',
    className: 'bg-urgency-at-risk-bg text-urgency-at-risk-fg border-urgency-at-risk-border',
    textClassName: 'text-urgency-at-risk-fg',
  },
  soon: {
    label: (due) => shortDate(due),
    className: 'bg-urgency-watch-bg text-urgency-watch-fg border-transparent',
    textClassName: 'text-urgency-watch-fg',
  },
  scheduled: {
    label: (due) => shortDate(due),
    className: 'bg-urgency-safe-bg text-urgency-safe-fg border-transparent',
    textClassName: 'text-urgency-safe-fg',
  },
  /* No deadline is not an urgency. It renders as a dash, the way a container
     with no return deadline does — a pill saying "None" is a pill saying
     nothing, in a column people scan for colour. */
  none: { label: () => '—', className: '', textClassName: 'text-muted-foreground' },
  done: {
    label: (due) => shortDate(due),
    className: 'bg-muted text-muted-foreground border-transparent',
    textClassName: 'text-muted-foreground',
  },
};

/** Worst first — the order a board should sort and a legend should list. */
export const TASK_URGENCY_ORDER: readonly TaskUrgency[] = [
  'overdue', 'today', 'soon', 'scheduled', 'none', 'done',
];
