import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import { CrewPicker, CrewStack } from '@/components/crew';
import { Button, DatePicker, Input, Spinner } from '@/design-system';
import { ArrowLeft, Check, Pencil, TriangleAlert } from '@/design-system/icons';
import { ROUTES } from '@/config/routes';
import { useTeam } from '@/features/team';
import {
  DueMark, MessageBody, PriorityMark, PrioritySelect, RecordChip,
  TaskChecklist, TaskFollowers, TaskStatusBadge, TaskStatusSelect, Thread,
  isOverdue, TASK_PRIORITY_LABEL, TASK_STATUS_LABEL,
  useTask, useUpdateTask, type TaskPriority, type TaskStatus,
} from '@/features/workspace';
import { cn, formatRelativeTime } from '@/utils';

/*
 * The task's masthead wears its status, the way a shipment's does.
 *
 * Same tokens, same grammar: teal is work in hand, green is under way, amber
 * is waiting on somebody else, the done tile is closed. A task detail that
 * opened on the identical white header whatever state it was in was the
 * "dead" part of this screen — the page told you nothing until you read it.
 */
const SLAB: Record<TaskStatus, { bg: string; fg: string; soft: string; ink: string }> = {
  OPEN: { bg: 'bg-tile-teal', fg: 'text-tile-teal-foreground', soft: 'text-tile-teal-foreground/80', ink: 'text-tile-teal' },
  IN_PROGRESS: { bg: 'bg-success', fg: 'text-success-foreground', soft: 'text-success-foreground/80', ink: 'text-success' },
  WAITING: { bg: 'bg-warning', fg: 'text-warning-foreground', soft: 'text-warning-foreground/80', ink: 'text-warning' },
  COMPLETED: { bg: 'bg-tile-done', fg: 'text-tile-done-foreground', soft: 'text-tile-done-foreground/80', ink: 'text-tile-done' },
  CANCELLED: { bg: 'bg-muted', fg: 'text-foreground', soft: 'text-muted-foreground', ink: 'text-muted-foreground' },
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[7rem_1fr] items-center gap-3 py-1.5">
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <div className="min-w-0">{children}</div>
    </div>
  );
}

/**
 * One task, in full.
 *
 * Two columns — the record on the left, the conversation on the right — rather
 * than the side sheet the rest of the app uses for a record preview. A sheet at
 * the house width is right for *looking at* a row; this is a place people work
 * in, and the whole reason the task exists is usually in the thread beside it.
 * On a narrow screen the columns stack, conversation last.
 *
 * Every control saves on change. There is no Save button because there is no
 * draft state worth losing: each field is its own small fact, and each writes
 * its own line into the history below.
 */
export function WorkspaceTaskDetailPage() {
  const { reference } = useParams<{ reference: string }>();
  const { data: task, isLoading, isError, error } = useTask(reference);
  const { data: team = [] } = useTeam();
  const update = useUpdateTask();

  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState('');

  useEffect(() => {
    if (task) setTitleDraft(task.title);
  }, [task?.id, task?.title]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-card border border-border py-20 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading task…
      </div>
    );
  }

  if (isError || !task) {
    return (
      <div className="rounded-card border border-destructive/30 bg-destructive-subtle p-8 text-center">
        <p className="text-sm font-medium text-destructive">That task could not be found.</p>
        <p className="mt-1 text-xs text-muted-foreground">{(error as Error)?.message}</p>
        <Link to={ROUTES.workspaceTasks} className="mt-4 inline-block text-xs font-medium text-primary-bold hover:underline">
          Back to all tasks
        </Link>
      </div>
    );
  }

  const save = (patch: Parameters<typeof update.mutate>[0]['patch']) =>
    update.mutate({ idOrRef: task.reference, patch });

  const slab = SLAB[task.status];
  const overdue = isOverdue(task);
  const taskAssignee = task.assignee;
  const assignee = taskAssignee ? team.find((m) => m.id === taskAssignee.id) : undefined;

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,22rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      {/* ── The record ─────────────────────────────────────────────────── */}
      <div className="min-w-0 space-y-4">
        <Link
          to={ROUTES.workspaceTasks}
          className="inline-flex items-center gap-1 text-xs text-muted-foreground transition-colors duration-fast hover:text-foreground"
        >
          <ArrowLeft className="size-3.5" aria-hidden /> All tasks
        </Link>

        <header className={cn('rounded-card px-4 py-3.5 shadow-sm transition-colors', slab.bg, slab.fg)}>
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn('font-mono text-xs font-semibold', slab.soft)}>{task.reference}</span>
            <span className={cn('rounded-full bg-white px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide', slab.ink)}>
              {TASK_STATUS_LABEL[task.status]}
            </span>
            {task.priority !== 'NORMAL' ? (
              <span className={cn('rounded-full border border-current px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide', slab.soft)}>
                {TASK_PRIORITY_LABEL[task.priority]}
              </span>
            ) : null}
            {overdue ? (
              <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-destructive-foreground">
                <TriangleAlert className="size-3" aria-hidden /> Overdue
              </span>
            ) : null}
          </div>

          <div className="group/title mt-1.5 flex items-start gap-2">
            {editingTitle ? (
              <>
                <Input
                  value={titleDraft}
                  autoFocus
                  className="bg-white text-foreground"
                  onChange={(event) => setTitleDraft(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter') { save({ title: titleDraft.trim() }); setEditingTitle(false); }
                    if (event.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false); }
                  }}
                />
                <Button
                  variant="secondary"
                  size="sm"
                  shape="pill"
                  className={cn('bg-white', slab.ink)}
                  onClick={() => { save({ title: titleDraft.trim() }); setEditingTitle(false); }}
                  leadingIcon={<Check className="h-3.5 w-3.5" />}
                >
                  Save
                </Button>
              </>
            ) : (
              <>
                <h2 className={cn('min-w-0 flex-1 text-xl font-extrabold leading-tight tracking-tight sm:text-2xl', slab.fg)}>
                  {task.title}
                </h2>
                <button
                  type="button"
                  onClick={() => setEditingTitle(true)}
                  aria-label="Rename this task"
                  className={cn(
                    'mt-1 rounded-sm p-1 opacity-0 transition-opacity duration-fast',
                    'focus-visible:opacity-100 group-hover/title:opacity-100',
                    slab.soft,
                  )}
                >
                  <Pencil className="size-4" aria-hidden />
                </button>
              </>
            )}
          </div>
        </header>

        <div className="rounded-card border border-border bg-surface-raised px-4 py-3">
          {/* The mark sits BESIDE the select, not inside it: a native <select>
              cannot colour its own options, and the house rule is that a status
              picker shows the whole ladder in one. So the control stays plain
              and the current state carries the colour next to it. */}
          <Field label="Status">
            <div className="flex flex-wrap items-center gap-2">
              <TaskStatusSelect
                value={task.status}
                disabled={update.isPending}
                onChange={(status: TaskStatus) => save({ status })}
                className="max-w-[11rem]"
              />
              <TaskStatusBadge status={task.status} />
            </div>
          </Field>

          <Field label="Priority">
            <div className="flex flex-wrap items-center gap-2">
              <PrioritySelect
                value={task.priority}
                disabled={update.isPending}
                onChange={(priority: TaskPriority) => save({ priority })}
                className="max-w-[11rem]"
              />
              <PriorityMark priority={task.priority} withLabel />
            </div>
          </Field>

          <Field label="Owner">
            <CrewPicker
              value={task.assignee ? [task.assignee.id] : []}
              busy={update.isPending}
              onChange={(ids) => save({ assigneeId: ids.length ? ids[ids.length - 1] : undefined })}
            >
              <button
                type="button"
                className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-2.5 py-1.5 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {taskAssignee ? (
                  <>
                    <CrewStack
                      size="xs"
                      crew={[{
                        id: taskAssignee.id,
                        fullName: `${taskAssignee.firstName} ${taskAssignee.lastName}`,
                        avatarUrl: assignee?.avatarUrl ?? taskAssignee.avatarUrl,
                      }]}
                    />
                    <span className="text-sm text-foreground">
                      {taskAssignee.firstName} {taskAssignee.lastName}
                    </span>
                  </>
                ) : (
                  <span className="text-sm italic text-muted-foreground">Unassigned</span>
                )}
              </button>
            </CrewPicker>
          </Field>

          <Field label="Watching">
            <TaskFollowers taskRef={task.reference} followers={task.followers} />
          </Field>

          <Field label="Due">
            <div className="flex items-center gap-2">
              <DatePicker
                value={task.dueAt ? task.dueAt.slice(0, 10) : ''}
                placeholder="No date"
                onChange={(date) => save({ dueAt: date ? new Date(`${date}T23:59:59`).toISOString() : undefined })}
              />
              <DueMark dueAt={task.dueAt} status={task.status} />
            </div>
          </Field>

          <Field label="Raised by">
            <span className="text-sm text-foreground">
              {task.createdBy.firstName} {task.createdBy.lastName}
              <span className="ml-2 text-xs text-muted-foreground">{formatRelativeTime(task.createdAt)}</span>
            </span>
          </Field>

          <Field label="About">
            {task.links.length > 0 ? (
              <div className="flex flex-wrap gap-1.5">
                {task.links.map((link) => (
                  <RecordChip
                    key={link.id}
                    recordType={link.recordType}
                    reference={link.recordRef}
                    label={link.label}
                    status={link.status}
                    parentRef={link.parentRef}
                    recordId={link.recordId}
                    missing={link.missing}
                  />
                ))}
              </div>
            ) : (
              <span className="text-sm italic text-muted-foreground">Nothing — this is standalone work</span>
            )}
          </Field>
        </div>

        {/* Under the fields and above the description: the steps ARE the work
            once a task has any, and burying them below prose puts the thing
            people tick at the bottom of the page. */}
        <TaskChecklist taskRef={task.reference} items={task.checklist} />

        {task.description ? (
          <div className="rounded-card border border-border bg-surface-raised px-4 py-3">
            {/* Through MessageBody, not raw: a description written in the
                composer holds the same tokens a message does, and printing it
                raw put a uuid on the page. */}
            <MessageBody body={task.description} />
          </div>
        ) : null}
      </div>

      {/* ── The conversation ───────────────────────────────────────────── */}
      <aside className={cn('min-w-0 rounded-card border border-border bg-surface-raised', 'flex max-h-[calc(100vh-12rem)] flex-col px-2 lg:sticky lg:top-4')}>
        <Thread messages={task.messages} events={task.events} taskId={task.id} className="min-h-0 flex-1" />
      </aside>

    </div>
  );
}

export default WorkspaceTaskDetailPage;
