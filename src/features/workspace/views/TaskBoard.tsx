import {
  DndContext, DragOverlay, PointerSensor, closestCorners, useSensor, useSensors,
  type DragEndEvent, type DragStartEvent,
} from '@dnd-kit/core';
import { useDroppable } from '@dnd-kit/core';
import { useSortable, SortableContext, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { buildPath, ROUTES } from '@/config/routes';
import { CheckCircle2, CircleDashed, PauseCircle, Plus, Timer, XCircle } from '@/design-system/icons';
import { cn } from '@/utils';

import { RaiseTaskDialog } from '../components/RaiseTaskDialog';
import { RecordChip } from '../composer/RecordChip';
import { PersonAvatar } from '../components/PersonAvatar';
import { DueMark, PriorityMark, TaskStatusSelect } from '../components/TaskMarks';
import { TASK_STATUS_LABEL, TASK_STATUSES, type TaskStatus, type WorkspaceTask } from '../contracts';

/**
 * The status PILL at the head of a column — colour and glyph.
 *
 * A pill on a quiet column, not a filled band across the whole width. The band
 * put four saturated stripes across the top of the board and made the columns
 * compete with the cards inside them; the reference tools all shrink the
 * colour down to a chip and leave the column itself nearly white, so the eye
 * lands on the work rather than on the furniture.
 *
 * Each carries a glyph as well as a hue — a hollow ring for untouched, a
 * filled one for under way, a tick for finished — because a column heading is
 * read from the corner of the eye and shape survives that better than colour
 * alone. The tokens are the same `--stage-*` ones the status badges use, so
 * the pill on a column and the badge on a card are the same object.
 */
const COLUMN_TONE: Record<TaskStatus, { pill: string; tint: string; icon: typeof CircleDashed }> = {
  OPEN: {
    pill: 'bg-stage-available-subtle text-stage-available-subtle-foreground',
    tint: 'bg-stage-available-subtle/25',
    icon: CircleDashed,
  },
  IN_PROGRESS: {
    pill: 'bg-stage-loaded-subtle text-stage-loaded-subtle-foreground',
    tint: 'bg-stage-loaded-subtle/25',
    icon: Timer,
  },
  WAITING: {
    pill: 'bg-warning-subtle text-warning-subtle-foreground',
    tint: 'bg-warning-subtle/25',
    icon: PauseCircle,
  },
  COMPLETED: {
    pill: 'bg-stage-closed-subtle text-stage-closed-subtle-foreground',
    tint: 'bg-stage-closed-subtle/25',
    icon: CheckCircle2,
  },
  CANCELLED: {
    pill: 'bg-muted text-muted-foreground',
    tint: 'bg-muted/30',
    icon: XCircle,
  },
};

/**
 * One task on the board.
 *
 * Title first and largest — it is the only thing on the card somebody reads
 * to decide whether this is the one they want. Everything else is a mark on
 * one wrapping line beneath it: the reference, the priority, the due pill, the
 * records it points at. The reference used to sit ABOVE the title in small
 * mono, which gave the card a heading nobody looks for and pushed the sentence
 * that matters down a line.
 *
 * The avatar is deliberately the only thing on the right. A face is the
 * fastest "is this mine" there is, and it needs a fixed place to be scanned
 * down a column.
 */
function Card({ task, dragging }: { task: WorkspaceTask; dragging?: boolean }) {
  return (
    <article
      className={cn(
        'p-2.5',
        /* The drag preview is the only place this draws its own frame — in the
           column the surrounding `li` carries it, so a card is one object. */
        dragging && 'rotate-1 rounded-card border border-border bg-card shadow-card',
      )}
    >
      <div className="flex items-start gap-2">
        <h4 className="min-w-0 flex-1 text-sm font-medium leading-snug text-foreground">
          {task.title}
        </h4>
        {task.assignee ? <PersonAvatar person={task.assignee} size="xs" className="shrink-0" /> : null}
      </div>

      {/* One line of marks, wrapping. Each already says what it is, so none of
          them carries a label — the same reasoning as the list's card. */}
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        <span className="font-mono text-[0.625rem] text-muted-foreground">{task.reference}</span>
        {task.priority !== 'NORMAL' ? <PriorityMark priority={task.priority} withLabel /> : null}
        <DueMark dueAt={task.dueAt} status={task.status} />
        {task.links.slice(0, 2).map((link) => (
          <RecordChip
            key={link.id}
            recordType={link.recordType}
            reference={link.recordRef}
            label={link.label}
            status={link.status}
            missing={link.missing}
            size="sm"
            static
          />
        ))}
        {task.links.length > 2 ? (
          <span className="text-[0.625rem] text-muted-foreground">+{task.links.length - 2}</span>
        ) : null}
      </div>
    </article>
  );
}

function SortableCard({
  task, onOpen, onStatus, busy,
}: {
  task: WorkspaceTask;
  onOpen: () => void;
  onStatus: (status: TaskStatus) => void;
  busy: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id });

  return (
    <li
      ref={setNodeRef}
      style={{ transform: CSS.Translate.toString(transform), transition }}
      className={cn(
        'group/card list-none overflow-hidden rounded-card border border-border bg-card shadow-xs transition-shadow duration-fast',
        isDragging ? 'opacity-40' : 'hover:shadow-card',
      )}
    >
      {/* The card body is the drag handle; the control under it is not, so the
          Select inside a draggable still opens instead of starting a drag. */}
      <div {...attributes} {...listeners} onClick={onOpen} className="cursor-grab active:cursor-grabbing">
        <Card task={task} />
      </div>

      {/*
       * The keyboard and touch path — drag is the enhancement, never the only
       * way to move a task (the plan's rule, and the reason this survives a
       * restyle that otherwise follows a tool which has no such control).
       *
       * Quiet by default: no border, no field background, so it reads as a
       * footer on the card rather than as a form control stapled underneath
       * one. It was a full-width bordered select outside the card, which made
       * every card look like two objects and doubled its height.
       */}
      <div className="border-t border-border-subtle">
        <TaskStatusSelect
          value={task.status}
          disabled={busy}
          onChange={onStatus}
          className={cn(
            'w-full [&_select]:h-7 [&_select]:border-transparent [&_select]:bg-transparent',
            '[&_select]:text-muted-foreground [&_select:hover]:bg-surface-sunken/60',
            '[&_select:hover]:text-foreground [&_select:focus]:text-foreground',
          )}
        />
      </div>
    </li>
  );
}

function Column({
  status, tasks, onOpen, onStatus, onAdd, busy,
}: {
  status: TaskStatus;
  tasks: WorkspaceTask[];
  onOpen: (task: WorkspaceTask) => void;
  onStatus: (task: WorkspaceTask, status: TaskStatus) => void;
  onAdd: (status: TaskStatus) => void;
  busy: boolean;
}) {
  const { setNodeRef, isOver } = useDroppable({ id: `column:${status}` });
  const tone = COLUMN_TONE[status];
  const Glyph = tone.icon;

  return (
    <section
      ref={setNodeRef}
      className={cn(
        'flex h-full w-72 shrink-0 flex-col rounded-card border transition-colors duration-fast',
        isOver ? 'border-primary bg-primary-subtle/40' : cn('border-transparent', tone.tint),
      )}
    >
      {/* The colour is the PILL, not the column. See `COLUMN_TONE`. */}
      <header className="flex shrink-0 items-center gap-2 px-2.5 pb-1.5 pt-2.5">
        <h3
          className={cn(
            'inline-flex items-center gap-1.5 rounded-full px-2 py-1 text-[0.6875rem] font-bold uppercase tracking-wide',
            tone.pill,
          )}
        >
          <Glyph className="size-3.5" aria-hidden />
          {TASK_STATUS_LABEL[status]}
        </h3>
        <span className="text-xs font-bold tabular-nums text-muted-foreground">{tasks.length}</span>
      </header>

      <SortableContext items={tasks.map((t) => t.id)} strategy={verticalListSortingStrategy}>
        {/* `min-h-0` is what makes the scroll work: a flex child's default
            `min-height:auto` refuses to shrink below its content, so without
            it `overflow-y-auto` never has anything to scroll. */}
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto px-2 pb-1">
          {tasks.length === 0 ? (
            <li className="rounded-card border border-dashed border-border/70 py-6 text-center text-xs text-muted-foreground">
              Nothing here
            </li>
          ) : (
            tasks.map((task) => (
              <SortableCard
                key={task.id}
                task={task}
                busy={busy}
                onOpen={() => onOpen(task)}
                onStatus={(next) => onStatus(task, next)}
              />
            ))
          )}
        </ul>
      </SortableContext>

      {/* Raise straight into this column. The status is the column, so the
          dialog opens with it already set — the whole point of adding from
          here rather than from the page's own button. */}
      <button
        type="button"
        onClick={() => onAdd(status)}
        className="flex shrink-0 items-center gap-1.5 rounded-b-card px-3 py-2 text-left text-xs font-medium text-muted-foreground transition-colors duration-fast hover:bg-surface-raised/70 hover:text-foreground"
      >
        <Plus className="size-3.5" aria-hidden />
        Add task
      </button>
    </section>
  );
}

export interface TaskBoardProps {
  tasks: WorkspaceTask[];
  busy?: boolean;
  onMove: (task: WorkspaceTask, status: TaskStatus) => void;
}

/**
 * The board.
 *
 * Columns are the status ladder, and dragging a card between them changes its
 * status — the one interaction people expect from a board and the reason it
 * was worth a dependency.
 *
 * Every card also keeps its status `Select`. That is not belt-and-braces: drag
 * is unusable by keyboard and awkward on a phone, and the house rule is that a
 * status picker shows the whole ladder. Drag is the enhancement.
 */
export function TaskBoard({ tasks, busy = false, onMove }: TaskBoardProps) {
  const navigate = useNavigate();
  const [draggingId, setDraggingId] = useState<string | null>(null);
  /* Which column's "Add task" was pressed — the dialog opens with that status
     already chosen, which is the only reason to add from a column at all. */
  const [adding, setAdding] = useState<TaskStatus | null>(null);
  /* A pointer must travel a little before it counts as a drag, or every click
     on a card becomes a one-pixel drag and the card never opens. */
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 6 } }));

  const columns = useMemo(
    () => TASK_STATUSES.map((status) => ({ status, tasks: tasks.filter((t) => t.status === status) })),
    [tasks],
  );
  const dragging = tasks.find((t) => t.id === draggingId) ?? null;

  function handleDragEnd(event: DragEndEvent) {
    setDraggingId(null);
    const task = tasks.find((t) => t.id === event.active.id);
    const overId = String(event.over?.id ?? '');
    if (!task || !overId) return;

    /* Dropped on a column, or on a card inside one. */
    const target = overId.startsWith('column:')
      ? (overId.slice('column:'.length) as TaskStatus)
      : tasks.find((t) => t.id === overId)?.status;

    if (target && target !== task.status) onMove(task, target);
  }


  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCorners}
      onDragStart={(event: DragStartEvent) => setDraggingId(String(event.active.id))}
      onDragEnd={handleDragEnd}
      onDragCancel={() => setDraggingId(null)}
    >
      {/*
       * The board is a FIXED FRAME, and both scrollbars live inside it.
       *
       * Sideways was already contained. Vertically it was not: the columns
       * were `flex-1` inside a box with no height, so the tallest column set
       * the board's height and the board set the page's — twelve cards in one
       * column made a 2000px page, and the column headers and the other four
       * columns scrolled away off the top. A board whose headings leave the
       * screen is a list wearing columns.
       *
       * Height comes off the viewport (`dvh`, so a phone's collapsing address
       * bar does not resize it mid-drag), less the chrome above: breadcrumb,
       * page header and filter band. Floored at 26rem so a short window still
       * shows a card or two rather than a sliver, and capped so a very tall
       * monitor does not stretch one column of three cards down a whole wall.
       */}
      <div className="h-[clamp(24rem,calc(100dvh-20rem),60rem)] w-0 min-w-full overflow-x-auto pb-2">
        <div className="flex h-full gap-3">
          {columns.map(({ status, tasks: columnTasks }) => (
            <Column
              key={status}
              status={status}
              tasks={columnTasks}
              busy={busy}
              onOpen={(task) => navigate(buildPath(ROUTES.workspaceTaskDetail, { reference: task.reference }))}
              onStatus={(task, next) => onMove(task, next)}
              onAdd={setAdding}
            />
          ))}
        </div>
      </div>

      <DragOverlay>{dragging ? <Card task={dragging} dragging /> : null}</DragOverlay>

      <RaiseTaskDialog
        open={adding !== null}
        onOpenChange={(next) => { if (!next) setAdding(null); }}
        status={adding ?? undefined}
        onCreated={(reference) => {
          setAdding(null);
          navigate(buildPath(ROUTES.workspaceTaskDetail, { reference }));
        }}
      />
    </DndContext>
  );
}
