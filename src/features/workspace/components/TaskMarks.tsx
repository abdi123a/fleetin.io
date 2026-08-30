import { Select } from '@/design-system';
import { ArrowDown, ArrowUp, Minus, TriangleAlert } from '@/design-system/icons';
import { cn } from '@/utils';

import {
  isTaskClosed, TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, TASK_STATUSES,
  type TaskPriority, type TaskStatus,
} from '../contracts';

/* ── Status ─────────────────────────────────────────────────────────────── */

/*
 * Solid pills, the same weight the shipment and booking cards use for their
 * own ladder — a washed-out subtle badge on a white row reads as decoration
 * and the board stops being scannable from across a desk.
 *
 * The hues follow the app's existing grammar rather than inventing one:
 * teal is work in hand, **amber is waiting on somebody else** (the same amber
 * a container owing a return wears), green is done, slate is closed with
 * nothing owed. Open is deliberately quiet — it is the resting state, and if
 * every row shouted none of them would.
 */
const STATUS_TONE: Record<TaskStatus, string> = {
  OPEN: 'bg-secondary text-secondary-foreground',
  IN_PROGRESS: 'bg-primary text-primary-foreground',
  WAITING: 'bg-warning text-warning-foreground',
  COMPLETED: 'bg-success text-success-foreground',
  CANCELLED: 'bg-muted text-muted-foreground line-through',
};

export function TaskStatusBadge({
  status, className, size = 'sm',
}: { status: TaskStatus; className?: string; size?: 'sm' | 'md' }) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full font-semibold uppercase tracking-wide',
        size === 'sm' ? 'px-2 py-0.5 text-[0.625rem]' : 'px-3 py-1 text-xs',
        STATUS_TONE[status],
        className,
      )}
    >
      {TASK_STATUS_LABEL[status]}
    </span>
  );
}

/**
 * The whole ladder in a `Select`, house rule — never "next step + a revert
 * list". A reader who wants to know where a task can go should be able to read
 * the options, and one that is not allowed should see it disabled with the
 * reason rather than absent.
 */
export function TaskStatusSelect({
  value, onChange, disabled, size = 'sm', className,
}: {
  value: TaskStatus;
  onChange: (next: TaskStatus) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <Select
      selectSize={size}
      value={value}
      disabled={disabled}
      aria-label="Task status"
      containerClassName={className}
      onChange={(event) => onChange(event.target.value as TaskStatus)}
      options={TASK_STATUSES.map((status) => ({ value: status, label: TASK_STATUS_LABEL[status] }))}
    />
  );
}

/* ── Priority ───────────────────────────────────────────────────────────── */

/*
 * Arrows and one alert mark, not four coloured flags.
 *
 * The curated icon set has no `Flag`, and that turned out to be the better
 * answer: a flag only carries meaning through its colour, and in a palette
 * where hue is semantic that would spend `--destructive` on a sorting hint.
 * Direction reads at a glance and survives being printed.
 */
const PRIORITY_MARK: Record<TaskPriority, { icon: typeof ArrowUp; tone: string; filled?: boolean }> = {
  /* Urgent is the one that gets a filled plate. Everything else is an arrow:
     if all four were coloured chips, the one that matters would not stand out. */
  URGENT: { icon: TriangleAlert, tone: 'bg-destructive text-destructive-foreground', filled: true },
  HIGH: { icon: ArrowUp, tone: 'text-warning-bold' },
  NORMAL: { icon: Minus, tone: 'text-muted-foreground' },
  LOW: { icon: ArrowDown, tone: 'text-muted-foreground' },
};

export function PriorityMark({
  priority, withLabel = false, className,
}: { priority: TaskPriority; withLabel?: boolean; className?: string }) {
  const { icon: Icon, tone, filled } = PRIORITY_MARK[priority];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 text-xs font-medium',
        filled && 'rounded-full px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className={withLabel || filled ? '' : 'sr-only'}>{TASK_PRIORITY_LABEL[priority]}</span>
    </span>
  );
}

export function PrioritySelect({
  value, onChange, disabled, size = 'sm', className,
}: {
  value: TaskPriority;
  onChange: (next: TaskPriority) => void;
  disabled?: boolean;
  size?: 'sm' | 'md';
  className?: string;
}) {
  return (
    <Select
      selectSize={size}
      value={value}
      disabled={disabled}
      aria-label="Priority"
      containerClassName={className}
      onChange={(event) => onChange(event.target.value as TaskPriority)}
      options={TASK_PRIORITIES.map((p) => ({ value: p, label: TASK_PRIORITY_LABEL[p] }))}
    />
  );
}

/* ── Due date ───────────────────────────────────────────────────────────── */

/**
 * A due date that says how it is going, not just when it is.
 *
 * "Overdue" and "Today" are the only two states anybody scans a list for, so
 * they are words rather than a date the reader has to compare against today's.
 */
export function DueMark({
  dueAt, status, className,
}: { dueAt: string | null; status: TaskStatus; className?: string }) {
  if (!dueAt) return <span className={cn('text-xs text-muted-foreground', className)}>—</span>;

  const due = new Date(dueAt);
  const closed = isTaskClosed(status);
  const startOfToday = new Date();
  startOfToday.setHours(0, 0, 0, 0);
  const startOfTomorrow = new Date(startOfToday);
  startOfTomorrow.setDate(startOfTomorrow.getDate() + 1);

  const overdue = !closed && due < startOfToday;
  const today = !closed && due >= startOfToday && due < startOfTomorrow;

  const text = overdue ? 'Overdue' : today ? 'Today' : due.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });

  return (
    <span
      title={due.toLocaleString()}
      className={cn(
        'inline-flex items-center gap-1 text-xs tabular-nums',
        overdue ? 'font-semibold text-destructive' : today ? 'font-semibold text-warning-bold' : 'text-muted-foreground',
        className,
      )}
    >
      {overdue ? <TriangleAlert className="size-3.5 shrink-0" aria-hidden /> : null}
      {text}
    </span>
  );
}
