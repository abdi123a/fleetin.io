import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import { DataTable, type DataColumn } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { TablePager } from '@/components/common/TablePager';
import { Avatar, Checkbox, Spinner } from '@/design-system';
import { CalendarDays, ListChecks, TriangleAlert, UserRound } from '@/design-system/icons';
import { buildPath, ROUTES } from '@/config/routes';
import { resolveAssetUrl } from '@/services/api.client';
import { useAuthStore } from '@/stores';
import { cn } from '@/utils';

import { Select } from '@/design-system';

import { useTaskSummary, useTasks, useUpdateTask } from '../api/queries';
import { TASK_VIEWS, ViewTabs, type TaskView } from './ViewTabs';
import { TaskBoard } from '../views/TaskBoard';
import { TaskCalendar } from '../views/TaskCalendar';
import { TaskWorkload } from '../views/TaskWorkload';
import { BulkActionBar } from './BulkActionBar';
import type { TaskFilters } from '../api/workspaceService';
import { RecordChip } from '../composer/RecordChip';
import type { TaskStatus, WorkspaceTask } from '../contracts';
import { DueMark, PriorityMark, TaskStatusBadge } from './TaskMarks';

/**
 * Every cut of the list, in ONE band.
 *
 * This started as four scope tabs with a row of quick-filter chips beneath
 * them — two controls, stacked, asking the same kind of question, and the
 * reader had to work out which of the two was live. Overdue and Unassigned
 * appeared in both. One row: pick a cut, and the count beside it is real.
 */
const SCOPES = [
  { key: 'open' as const, label: 'Open' },
  { key: 'overdue' as const, label: 'Overdue' },
  { key: 'today' as const, label: 'Due today' },
  { key: 'unassigned' as const, label: 'Unassigned' },
  { key: 'urgent' as const, label: 'Urgent' },
  { key: 'following' as const, label: 'Following' },
  { key: 'all' as const, label: 'All' },
];
type Scope = (typeof SCOPES)[number]['key'];

const OPEN_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING'];

/** The server's ceiling on one page — see `QueryTasksDto`. */
const BOARD_PAGE_SIZE = 100;

/**
 * Four ways of looking at the same query.
 *
 * A `?view=` parameter rather than four routes: these are one list drawn four
 * ways, not four screens, and a filtered board stays linkable this way.
 */
/**
 * Whose work — the three nav rows this page replaced.
 *
 * "My Tasks", "Assigned by Me" and "All Tasks" were three sidebar rows and
 * three routes for one screen with one filter changed. As a control on the
 * page they cost one line instead of three rows, and they compose with the
 * state bands below instead of being a separate axis you navigate away to.
 */
const SCOPES_WHO = [
  { key: 'all' as const, label: 'Everyone' },
  { key: 'mine' as const, label: 'My tasks' },
  { key: 'raised' as const, label: 'Raised by me' },
];
type Who = (typeof SCOPES_WHO)[number]['key'];

export interface TaskListProps {
  /** Fixed part of the query — which of the three views this is. */
  baseFilters?: TaskFilters;
  emptyCopy?: string;
}

export function TaskList({ baseFilters = {}, emptyCopy = 'No tasks here yet.' }: TaskListProps) {
  const navigate = useNavigate();
  const me = useAuthStore((state) => state.user?.id);
  const [searchParams, setSearchParams] = useSearchParams();
  const [scope, setScope] = useState<Scope>('open');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const updateTask = useUpdateTask();

  /* The view lives in the URL so a filtered board can be pasted into a
     message. An unrecognised value falls back rather than blanking the page. */
  const viewParam = searchParams.get('view') as TaskView | null;
  const view: TaskView = viewParam && TASK_VIEWS.includes(viewParam) ? viewParam : 'list';
  const whoParam = searchParams.get('scope') as Who | null;
  const who: Who = SCOPES_WHO.some((s) => s.key === whoParam) ? (whoParam as Who) : 'all';

  /** Both live in the URL, so a filtered board can be pasted into a message. */
  const setParam = (key: 'view' | 'scope', value: string, fallback: string) =>
    setSearchParams(
      (params) => {
        if (value === fallback) params.delete(key);
        else params.set(key, value);
        return params;
      },
      { replace: true },
    );

  const filters = useMemo<TaskFilters>(() => {
    const next: TaskFilters = { ...baseFilters, page, pageSize: 25 };
    /* Whose work, before which state — `baseFilters` still wins where a host
       pins the page (a record's "2 open" link, for instance). */
    if (who === 'mine' && me && !next.assigneeId) next.assigneeId = me;
    if (who === 'raised' && me && !next.createdById) next.createdById = me;
    if (search.trim()) next.q = search.trim();
    if (scope === 'open') next.status = OPEN_STATUSES;
    if (scope === 'overdue') next.due = 'overdue';
    /* `unassigned` is the point of the assignee filter, not an afterthought:
       it is the only way to see work nobody has picked up. */
    if (scope === 'unassigned') { next.assigneeId = 'unassigned'; next.status = OPEN_STATUSES; }
    /* The three narrow cuts all imply open work: "Urgent" meaning "urgent, and
       also the twelve urgent things we finished last month" would be useless. */
    if (scope === 'today') { next.due = 'today'; next.status = OPEN_STATUSES; }
    if (scope === 'urgent') { next.priority = ['URGENT']; next.status = OPEN_STATUSES; }
    if (scope === 'following' && me) { next.followerId = me; next.status = OPEN_STATUSES; }

    /* Board and calendar draw every column at once, so a 25-row page would
       show a third of the work and call it the board. 100 is the server's own
       ceiling (`QueryTasksDto`), not a number chosen here — asking for more is
       a 400, and the banner below says so when a board is actually clipped. */
    if (view === 'board' || view === 'calendar') {
      next.pageSize = BOARD_PAGE_SIZE;
      next.page = 1;
      if (view === 'board' && scope === 'open') delete next.status;
    }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(baseFilters), scope, search, page, view, who, me]);

  const { data, isLoading, isError, error, refetch } = useTasks(filters);
  /* Scope totals come from their own endpoint: the list is paginated, so it
     cannot count the scopes it is not showing, and a tab printing (0)
     because nobody counted would be a lie rather than a placeholder. */
  /* The bands count the SAME list the rows come from — scoped, but without
     the state cut, which is the thing each band is counting. */
  const summaryFilters = useMemo<TaskFilters>(() => {
    const next: TaskFilters = { ...baseFilters };
    if (who === 'mine' && me && !next.assigneeId) next.assigneeId = me;
    if (who === 'raised' && me && !next.createdById) next.createdById = me;
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(baseFilters), who, me]);
  const { data: summary } = useTaskSummary(summaryFilters);

  const rowsOnPage = data?.items ?? [];
  const allSelected = rowsOnPage.length > 0 && rowsOnPage.every((task) => selected.includes(task.id));

  function toggle(id: string) {
    setSelected((current) =>
      current.includes(id) ? current.filter((value) => value !== id) : [...current, id],
    );
  }

  const columns: DataColumn<WorkspaceTask>[] = [
    {
      key: 'select',
      label: 'Select',
      /*
       * A PERCENTAGE, and the six must sum to 100.
       *
       * `table-fixed` distributes any shortfall across the columns, so a `3rem`
       * checkbox column beside percentages adding to 87 was handed a share of
       * the missing 13 and came out three times its declared width — a stripe
       * of empty space with a tick dropped at its left edge.
       */
      width: 'w-[5%]',
      align: 'center',
      /* The heading is the select-all, so the column reads as a finished
         column rather than as a blank cell the table forgot to fill. */
      header: (
        <SelectBox
          label={allSelected ? 'Clear the selection' : 'Select every task on this page'}
          checked={allSelected}
          indeterminate={!allSelected && rowsOnPage.some((task) => selected.includes(task.id))}
          onToggle={() => setSelected(allSelected ? [] : rowsOnPage.map((task) => task.id))}
        />
      ),
      card: 'hidden',
      cell: (task) => (
        <SelectBox
          label={`Select ${task.reference}`}
          checked={selected.includes(task.id)}
          onToggle={() => toggle(task.id)}
        />
      ),
    },
    {
      key: 'title',
      label: 'Task',
      width: 'w-[34%]',
      card: 'identity',
      cell: (task) => (
        <div className="min-w-0">
          <div className="flex items-baseline gap-2">
            <span className="shrink-0 font-mono text-[0.6875rem] text-muted-foreground">{task.reference}</span>
            <span className="truncate text-sm font-medium text-foreground">{task.title}</span>
          </div>
          {task.links.length > 0 ? (
            <div className="mt-1 flex flex-wrap gap-1">
              {task.links.slice(0, 3).map((link) => (
                <RecordChip
                  key={link.id}
                  recordType={link.recordType}
                  reference={link.recordRef}
                  label={link.label}
                  status={link.status}
                  parentRef={link.parentRef}
                  recordId={link.recordId}
                  missing={link.missing}
                  size="sm"
                />
              ))}
              {task.links.length > 3 ? (
                <span className="text-[0.6875rem] text-muted-foreground">+{task.links.length - 3}</span>
              ) : null}
            </div>
          ) : null}
        </div>
      ),
    },
    {
      key: 'status',
      label: 'Status',
      icon: ListChecks,
      width: 'w-[13%]',
      card: 'trailing',
      cell: (task) => <TaskStatusBadge status={task.status} />,
    },
    {
      key: 'priority',
      label: 'Priority',
      icon: TriangleAlert,
      width: 'w-[11%]',
      cell: (task) => <PriorityMark priority={task.priority} withLabel />,
    },
    {
      key: 'assignee',
      label: 'Owner',
      icon: UserRound,
      width: 'w-[22%]',
      cell: (task) =>
        task.assignee ? (
          <span className="flex items-center gap-1.5">
            <Avatar
              size="xs"
              name={`${task.assignee.firstName} ${task.assignee.lastName}`}
              src={resolveAssetUrl(task.assignee.avatarUrl ?? undefined)}
            />
            <span className="truncate text-xs text-foreground">
              {task.assignee.firstName} {task.assignee.lastName}
            </span>
          </span>
        ) : (
          <span className="text-xs italic text-muted-foreground">Unassigned</span>
        ),
    },
    {
      key: 'dueAt',
      label: 'Due',
      icon: CalendarDays,
      width: 'w-[15%]',
      cell: (task) => <DueMark dueAt={task.dueAt} status={task.status} />,
    },
  ];

  if (isError) {
    return (
      <div className="rounded-card border border-destructive/30 bg-destructive-subtle p-6 text-center">
        <p className="text-sm font-medium text-destructive">Could not load tasks.</p>
        <p className="mt-1 text-xs text-muted-foreground">{(error as Error)?.message}</p>
        <button
          type="button"
          onClick={() => refetch()}
          className="mt-3 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-xs font-medium text-foreground hover:bg-surface-sunken"
        >
          Try again
        </button>
      </div>
    );
  }

  const rows = rowsOnPage;
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 25;

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <ViewTabs
        value={view}
        onChange={(next) => { setParam('view', next, 'list'); setSelected([]); }}
      />

      <FilterBar
        label="Task scope"
        /* "Unassigned" is dropped whenever the list is pinned to one person —
           by the host (a record's "2 open" link) or by the scope control. A
           task assigned to you is by definition not unassigned, so the band
           asks for a set that cannot exist; it printed "Unassigned 1" beside
           "All 0" before the count was fixed, and even a correct 0 is a
           permanent zero taking up a band.

           The condition has to test BOTH sources: when "My tasks" moved from
           a route into `?scope=`, the pin moved out of `baseFilters` and this
           check silently stopped firing. */
        tabs={SCOPES.filter((s) => !(s.key === 'unassigned' && (baseFilters.assigneeId || who === 'mine'))).map((s) => ({
          key: s.key,
          label: s.label,
          count: summary?.[s.key] ?? 0,
          tone: s.key === 'overdue' && (summary?.overdue ?? 0) > 0 ? 'text-destructive' : undefined,
        }))}
        active={scope}
        onSelect={(key) => { setScope(key); setPage(1); setSelected([]); }}
        search={{
          value: search,
          onChange: (value) => { setSearch(value); setPage(1); },
          placeholder: 'Search tasks',
          matched: search ? total : undefined,
        }}
      >
        {/* Whose work, beside the search — where the reference tools put the
            grouping control, and where the view switcher used to sit before it
            was promoted to a tab strip of its own. */}
        <Select
          selectSize="sm"
          aria-label="Whose tasks"
          value={who}
          containerClassName="w-36 shrink-0"
          onChange={(event) => {
            setParam('scope', event.target.value, 'all');
            setPage(1);
            setSelected([]);
          }}
          options={SCOPES_WHO.map((s) => ({ value: s.key, label: s.label }))}
        />
      </FilterBar>

      {/* Workload asks its own question of its own endpoint — the task query
          above says nothing about a teammate with no tasks on this page. */}
      {view === 'workload' ? (
        <TaskWorkload />
      ) : isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-card border border-border py-16 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading tasks…
        </div>
      ) : view === 'board' || view === 'calendar' ? (
        <>
          {total > rows.length ? (
            <p className="rounded-card border border-warning bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground">
              Showing the first <span className="font-bold tabular-nums">{rows.length}</span> of{' '}
              <span className="font-bold tabular-nums">{total}</span> — narrow the filters, or use the
              list to page through the rest.
            </p>
          ) : null}
          {rows.length === 0 ? (
            /* The list has always said why it is empty; the board and the
               calendar drew a bare grid and left the reader wondering whether
               the data had gone missing. Same sentence, same answer. */
            <p className="rounded-card border border-dashed border-border bg-surface-sunken px-4 py-12 text-center text-sm text-muted-foreground">
              {emptyCopy}
            </p>
          ) : view === 'board' ? (
            <TaskBoard
              tasks={rows}
              busy={updateTask.isPending}
              onMove={(task, status) => updateTask.mutate({ idOrRef: task.id, patch: { status } })}
            />
          ) : (
            <>
              <TaskCalendar tasks={rows} />
              {/* A task with no due date is not on a calendar — and a reader
                  looking at eleven open tasks and an empty grid deserves to be
                  told that rather than left to work it out. */}
              {rows.every((task) => !task.dueAt) ? (
                <p className="rounded-card border border-warning bg-warning-subtle px-3 py-2 text-xs text-warning-subtle-foreground">
                  None of these {rows.length === 1 ? 'tasks has' : 'tasks have'} a due date, so
                  nothing lands on the calendar. The list and board show them all.
                </p>
              ) : null}
            </>
          )}
        </>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(task) => task.id}
            /*
             * A designed card, not the one assembled from column slots.
             *
             * The generic card stacks PRIORITY / OWNER / DUE as a labelled
             * grid under the title — three extra lines and a rule, ~190px a
             * row. Twenty-five of those is a 4,700px page, which is the
             * "unlimited long page" complaint: the list was paginated all
             * along, but one page was four screens tall.
             *
             * Every one of those values is a mark that says what it is without
             * a label — a red "2d late" pill needs "DUE" above it about as
             * much as a stop sign needs a caption. On one line the row is
             * ~76px and a full page fits in two screens.
             */
            renderCard={(task) => (
              /* A `div` with the role, not a `button`: the row carries a
                 checkbox and a record chip, and an input or an anchor inside a
                 button is invalid HTML that browsers resolve by dropping one
                 of them. `DataTable`'s own generated card does the same, for
                 the same reason. Keyboard parity is kept by hand. */
              <div
                role="button"
                tabIndex={0}
                onClick={() => navigate(buildPath(ROUTES.workspaceTaskDetail, { reference: task.reference }))}
                onKeyDown={(event) => {
                  if (event.target !== event.currentTarget) return;
                  if (event.key === 'Enter' || event.key === ' ') {
                    event.preventDefault();
                    navigate(buildPath(ROUTES.workspaceTaskDetail, { reference: task.reference }));
                  }
                }}
                className="flex w-full cursor-pointer flex-col gap-1.5 rounded-card-nested border border-border bg-card px-3 py-2.5 text-left transition-colors duration-fast hover:bg-surface-sunken/60 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring"
              >
                <div className="flex min-w-0 items-start gap-2">
                  <SelectBox
                    label={`Select ${task.reference}`}
                    checked={selected.includes(task.id)}
                    onToggle={() => toggle(task.id)}
                    className="mt-0.5"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="mr-1.5 font-mono text-[0.6875rem] text-muted-foreground">{task.reference}</span>
                    <span className="text-sm font-medium text-foreground">{task.title}</span>
                  </span>
                  <TaskStatusBadge status={task.status} />
                </div>

                {/* One line of marks: priority, owner, due, and whatever the
                    task is about. Each already says what it is. */}
                <div className="flex flex-wrap items-center gap-x-2 gap-y-1 pl-6">
                  <PriorityMark priority={task.priority} withLabel />
                  {task.assignee ? (
                    <span className="flex items-center gap-1 text-xs text-muted-foreground">
                      <Avatar
                        size="xs"
                        name={`${task.assignee.firstName} ${task.assignee.lastName}`}
                        src={resolveAssetUrl(task.assignee.avatarUrl ?? undefined)}
                      />
                      {task.assignee.firstName}
                    </span>
                  ) : (
                    <span className="text-xs italic text-muted-foreground">Unassigned</span>
                  )}
                  <DueMark dueAt={task.dueAt} status={task.status} />
                  {task.links.slice(0, 2).map((link) => (
                    <RecordChip
                      key={link.id}
                      recordType={link.recordType}
                      reference={link.recordRef}
                      label={link.label}
                      status={link.status}
                      parentRef={link.parentRef}
                      recordId={link.recordId}
                      missing={link.missing}
                      size="sm"
                    />
                  ))}
                  {task.links.length > 2 ? (
                    <span className="text-[0.6875rem] text-muted-foreground">+{task.links.length - 2}</span>
                  ) : null}
                </div>
              </div>
            )}
            /*
             * 56rem, not 64rem. At 64 the module's own width — 1600px capped,
             * inside two levels of page padding — landed at ~1023px on a
             * 1120px window, one pixel under the threshold, so the list drew
             * CARDS at a width where the table fits: ~190px per row instead of
             * ~48px, and twenty-two tasks became a four-thousand-pixel page.
             *
             * Measured against what the columns cannot shrink below: an avatar
             * and a full name in Owner (~150px, has 179), a status badge
             * (~100px, has 116), a due pill (~80px, has 107). The title is the
             * only one that truncates, which is what a title column is for.
             */
            breakpoint="56rem"
            onRowClick={(task) => navigate(buildPath(ROUTES.workspaceTaskDetail, { reference: task.reference }))}
            emptyCopy={emptyCopy}
          />

          {total > pageSize ? (
            <TablePager
              noun="tasks"
              paged={{
                page,
                setPage,
                pageCount: data?.pageCount ?? 1,
                rangeStart: (page - 1) * pageSize + 1,
                rangeEnd: Math.min(page * pageSize, total),
                total,
              }}
            />
          ) : null}
        </>
      )}

      {view !== 'workload' ? (
        <BulkActionBar
          ids={selected}
          onClear={() => setSelected([])}
          /* "Select all" only exists once one row is ticked. As a standing
             control above the list it was an orphan line asking a question
             nobody had yet. */
          onSelectAll={allSelected ? undefined : () => setSelected(rows.map((task) => task.id))}
          pageCount={rows.length}
        />
      ) : null}
    </div>
  );
}

/**
 * A tick that does not also open the row.
 *
 * Both call sites had hand-rolled versions of this and one of them was wrong:
 * the card's wrapper called `toggle` on its own click **and** let the input's
 * `onChange` call it too, so every click toggled twice and the box never
 * changed — the "it's not even working". One component, one toggle, and the
 * wrapper's only job is to keep the click off the row behind it.
 *
 * The wrapper is what stops propagation rather than the input, because the
 * label's click also reaches the row, and a checkbox you can only hit dead
 * centre is a checkbox people miss. Padding gives it a target bigger than the
 * 16px box without making the box itself bigger.
 */
function SelectBox({
  label, checked, indeterminate, onToggle, className,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <span
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
      className={cn('-m-1.5 inline-flex shrink-0 p-1.5', className)}
    >
      <Checkbox
        checkboxSize="sm"
        aria-label={label}
        checked={checked}
        indeterminate={indeterminate}
        onChange={onToggle}
      />
    </span>
  );
}

