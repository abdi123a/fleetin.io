import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, type DataColumn } from '@/components/common/DataTable';
import { FilterBar } from '@/components/common/FilterBar';
import { TablePager } from '@/components/common/TablePager';
import { Avatar, Spinner } from '@/design-system';
import { CalendarDays, ListChecks, TriangleAlert, UserRound } from '@/design-system/icons';
import { buildPath, ROUTES } from '@/config/routes';
import { resolveAssetUrl } from '@/services/api.client';

import { useTaskSummary, useTasks } from '../api/queries';
import type { TaskFilters } from '../api/workspaceService';
import { RecordChip } from '../composer/RecordChip';
import type { TaskStatus, WorkspaceTask } from '../contracts';
import { DueMark, PriorityMark, TaskStatusBadge } from './TaskMarks';

/** The four cuts anybody actually takes of a task list. */
const SCOPES = [
  { key: 'open' as const, label: 'Open' },
  { key: 'overdue' as const, label: 'Overdue' },
  { key: 'unassigned' as const, label: 'Unassigned' },
  { key: 'all' as const, label: 'All' },
];
type Scope = (typeof SCOPES)[number]['key'];

const OPEN_STATUSES: TaskStatus[] = ['OPEN', 'IN_PROGRESS', 'WAITING'];

export interface TaskListProps {
  /** Fixed part of the query — which of the three views this is. */
  baseFilters?: TaskFilters;
  emptyCopy?: string;
}

export function TaskList({ baseFilters = {}, emptyCopy = 'No tasks here yet.' }: TaskListProps) {
  const navigate = useNavigate();
  const [scope, setScope] = useState<Scope>('open');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const filters = useMemo<TaskFilters>(() => {
    const next: TaskFilters = { ...baseFilters, page, pageSize: 25 };
    if (search.trim()) next.q = search.trim();
    if (scope === 'open') next.status = OPEN_STATUSES;
    if (scope === 'overdue') next.due = 'overdue';
    /* `unassigned` is the point of the assignee filter, not an afterthought:
       it is the only way to see work nobody has picked up. */
    if (scope === 'unassigned') { next.assigneeId = 'unassigned'; next.status = OPEN_STATUSES; }
    return next;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(baseFilters), scope, search, page]);

  const { data, isLoading, isError, error, refetch } = useTasks(filters);
  /* Scope totals come from their own endpoint: the list is paginated, so it
     cannot count the scopes it is not showing, and a tab printing (0)
     because nobody counted would be a lie rather than a placeholder. */
  const { data: summary } = useTaskSummary(baseFilters);

  const columns: DataColumn<WorkspaceTask>[] = [
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
                  /* The whole row already navigates to the task. A link inside
                     it would be a second target on the same spot, and the task
                     detail carries the real links to these records. */
                  static
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
      width: 'w-[20%]',
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
      width: 'w-[12%]',
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

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const pageSize = data?.pageSize ?? 25;

  return (
    <div className="flex w-full min-w-0 flex-col gap-3">
      <FilterBar
        label="Task scope"
        tabs={SCOPES.map((s) => ({
          key: s.key,
          label: s.label,
          count: summary?.[s.key] ?? 0,
          tone: s.key === 'overdue' && (summary?.overdue ?? 0) > 0 ? 'text-destructive' : undefined,
        }))}
        active={scope}
        onSelect={(key) => { setScope(key); setPage(1); }}
        search={{
          value: search,
          onChange: (value) => { setSearch(value); setPage(1); },
          placeholder: 'Search tasks',
          matched: search ? total : undefined,
        }}
      />

      {isLoading ? (
        <div className="flex items-center justify-center gap-2 rounded-card border border-border py-16 text-sm text-muted-foreground">
          <Spinner className="size-4" /> Loading tasks…
        </div>
      ) : (
        <>
          <DataTable
            columns={columns}
            rows={rows}
            rowKey={(task) => task.id}
            /* Five columns; below this the cards read better than a squeezed table. */
            breakpoint="64rem"
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
    </div>
  );
}
