import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  Select,
} from '@/design-system';
import { ArrowDown, ArrowUp, Check, ListChecks, Minus, Ticket, Timer, TriangleAlert } from '@/design-system/icons';
import { cn } from '@/utils';

import { TASK_URGENCY_META, taskUrgency } from './taskUrgency';

import {
  TASK_PRIORITIES, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL, TASK_STATUSES,
  type TaskPriority, type TaskStatus, type WorkspaceTask,
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
  /* Sky: raised, nobody has picked it up — the same colour a container wears
     when it is available and waiting to be taken. Grey said "nothing here",
     which is exactly wrong for the state most of the board is in. */
  OPEN: 'bg-stage-available-subtle text-stage-available-subtle-foreground border border-stage-available-border',
  /* Green is "work is happening" throughout this app — the shipment ladder
     collapses three transit rungs into one green for that reason. */
  IN_PROGRESS: 'bg-stage-loaded-subtle text-stage-loaded-subtle-foreground border border-stage-loaded-border',
  /* Amber is "waiting on somebody else", the same amber a box owing a return
     wears. The two systems agree here on purpose. */
  WAITING: 'bg-warning-subtle text-warning-subtle-foreground border border-warning',
  COMPLETED: 'bg-stage-closed-subtle text-stage-closed-subtle-foreground border border-stage-closed-border',
  CANCELLED: 'bg-muted text-muted-foreground border border-border line-through',
};

export function TaskStatusBadge({
  status, className, size = 'sm', label,
}: {
  status: TaskStatus;
  className?: string;
  size?: 'sm' | 'md';
  /**
   * Say it in another vocabulary. Tickets share this ladder and this colour
   * but not every word — a task is COMPLETED, the complaint behind it is
   * *Resolved*. One enum, one tone map, two readings of it.
   */
  label?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center rounded-full font-semibold uppercase tracking-wide',
        size === 'sm' ? 'px-2 py-0.5 text-[0.625rem]' : 'px-3 py-1 text-xs',
        STATUS_TONE[status],
        className,
      )}
    >
      {label ?? TASK_STATUS_LABEL[status]}
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
/*
 * Graded, on the same `--urgency-*` tokens the container risk badge uses.
 *
 * Urgent is solid and shouts. High is a warning wash. Normal and Low are
 * quiet on purpose — if all four were loud, none of them would be, and a
 * board where every row is coloured tells the reader nothing about which one
 * to open first.
 */
const PRIORITY_MARK: Record<TaskPriority, { icon: typeof ArrowUp; tone: string; pill: boolean }> = {
  URGENT: {
    icon: TriangleAlert,
    tone: 'bg-urgency-overdue-bg text-urgency-overdue-fg border-urgency-overdue-border',
    pill: true,
  },
  HIGH: {
    icon: ArrowUp,
    tone: 'bg-urgency-watch-bg text-urgency-watch-fg border-transparent',
    pill: true,
  },
  /* Normal and Low get colours too, but *cool* ones — sky for the default and
     a settled slate-teal for low. They still read as quieter than High and
     Urgent because the eye goes to warm before cool, so the ranking survives
     while every row still says something. Grey said "no value set", which was
     wrong: Normal is a choice. */
  NORMAL: {
    icon: Minus,
    tone: 'bg-stage-available-subtle text-stage-available-subtle-foreground border-stage-available-border',
    pill: true,
  },
  LOW: {
    icon: ArrowDown,
    tone: 'bg-muted text-muted-foreground border-border',
    pill: true,
  },
};

export function PriorityMark({
  priority, withLabel = false, className,
}: { priority: TaskPriority; withLabel?: boolean; className?: string }) {
  const { icon: Icon, tone, pill } = PRIORITY_MARK[priority];
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap text-xs font-medium',
        pill && 'rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-semibold',
        tone,
        className,
      )}
    >
      <Icon className="size-3.5 shrink-0" aria-hidden />
      <span className={withLabel || pill ? '' : 'sr-only'}>{TASK_PRIORITY_LABEL[priority]}</span>
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

/* ── Where the work came from ───────────────────────────────────────────── */

/**
 * The reference, tinted by who is waiting.
 *
 * The board mixes two kinds of row that are read completely differently —
 * internal work Fleetin set itself, and work answering a customer who rang —
 * and nothing in the list said which was which. A ticket-raised task carried
 * the same grey `TSK-` as every other row, so "the container is damaged" from
 * a shipper looked exactly like "Chase the stationery supplier".
 *
 * **Ink, not a pill.** This was a filled chip, and a filled chip on every row
 * of a table whose other four columns are also filled chips is one more object
 * in a cell that had too many — it made the row harder to read, not easier.
 * The reference was already there and already its own mark; colouring it costs
 * nothing and adds nothing to the row.
 *
 * Teal for our own work, amber for somebody waiting on us — the same amber
 * this app uses everywhere for an outstanding obligation. The glyph carries
 * the same split, because a distinction told only in colour is no distinction
 * to a reader who cannot see the difference between these two.
 */
export function TaskOriginRef({
  reference, ticket, className,
}: {
  reference: string;
  ticket: WorkspaceTask['ticket'];
  className?: string;
}) {
  const Icon = ticket ? Ticket : ListChecks;
  return (
    <span
      title={
        ticket
          ? `Raised from ${ticket.reference} — ${ticket.subject}`
          : 'Raised inside Fleetin'
      }
      className={cn(
        'inline-flex shrink-0 items-center gap-1 font-mono text-[0.6875rem] font-semibold',
        ticket ? 'text-warning-subtle-foreground' : 'text-primary-subtle-foreground',
        className,
      )}
    >
      <Icon className="size-3 shrink-0" aria-hidden />
      {reference}
      <span className="sr-only">{ticket ? ` — from ticket ${ticket.reference}` : ' — internal'}</span>
    </span>
  );
}

/**
 * Change the status without opening the task.
 *
 * The badge IS the control — the same shape and the same colour it had when it
 * was only a label, so the column stays scannable and the cell keeps holding
 * exactly one object. Moving a task on used to mean opening it, changing a
 * field and coming back, for a list whose whole job is triage.
 *
 * The **whole ladder**, current rung marked, in the order it runs — the house
 * rule, and the same shape `BookingStatusPicker` uses on a shipment card.
 * Never "next step plus a list of reverts": a reader knows what state the work
 * is in, not which direction this app thinks its ladder runs.
 *
 * Radix opens on `pointerdown` while the row behind listens on `click`, so
 * both have to be stopped or the task detail opens behind the menu.
 */
export function TaskStatusPicker({
  status, onChange, disabled, label, className,
}: {
  status: TaskStatus;
  onChange: (next: TaskStatus) => void;
  disabled?: boolean;
  /** Another vocabulary for the same ladder — a ticket is *Resolved*. */
  label?: string;
  className?: string;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label={`Status — ${label ?? TASK_STATUS_LABEL[status]}. Change it`}
          onPointerDown={(event) => event.stopPropagation()}
          onClick={(event) => event.stopPropagation()}
          className={cn(
            'cursor-pointer rounded-full transition-opacity duration-fast hover:opacity-80',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring',
            'disabled:cursor-not-allowed disabled:opacity-60',
            className,
          )}
        >
          <TaskStatusBadge status={status} label={label} />
        </button>
      </DropdownMenuTrigger>

      <DropdownMenuContent
        align="start"
        className="w-48"
        onClick={(event) => event.stopPropagation()}
      >
        {TASK_STATUSES.map((rung) => (
          <DropdownMenuItem
            key={rung}
            onSelect={() => {
              if (rung !== status) onChange(rung);
            }}
            className="gap-2"
          >
            <TaskStatusBadge status={rung} />
            {rung === status ? (
              <Check className="ml-auto size-3.5 shrink-0 text-primary" aria-hidden />
            ) : null}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

/* ── Due date ───────────────────────────────────────────────────────────── */

/**
 * A due date as a graded urgency pill — the same shape, and the same tokens,
 * as the Empty Container module's `RiskBadge`.
 *
 * The Timer is what makes it scannable: a column of dates asks the reader to
 * do arithmetic against today, while a column of pills answers "which of these
 * is on fire" from across the room. Overdue pulses, and nothing else does, so
 * the one thing that needs somebody now is the one thing that moves.
 */
export function DueMark({
  dueAt, status, className,
}: { dueAt: string | null; status: TaskStatus; className?: string }) {
  const level = taskUrgency(dueAt, status);
  const meta = TASK_URGENCY_META[level];

  if (!dueAt || level === 'none') {
    return <span className={cn('text-xs text-muted-foreground', className)}>—</span>;
  }

  const due = new Date(dueAt);

  return (
    <span
      title={due.toLocaleString()}
      className={cn(
        'inline-flex items-center gap-1 whitespace-nowrap rounded-md border px-1.5 py-0.5 text-[0.6875rem] font-semibold tabular-nums',
        meta.className,
        meta.pulse && 'animate-pulse motion-reduce:animate-none',
        className,
      )}
    >
      <Timer className="size-[11px] shrink-0" aria-hidden />
      {meta.label(due)}
    </span>
  );
}
