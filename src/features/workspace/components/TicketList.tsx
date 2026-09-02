import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { DataTable, FilterBar, TablePager } from '@/components';
import { Button, Spinner } from '@/design-system';
import { cn } from '@/utils';
import { AlertTriangle, Calendar, Clock, LifeBuoy, Plus, User } from '@/design-system/icons';
import { ROUTES, buildPath } from '@/config/routes';

import { useTicketSummary, useTickets } from '../api/ticketQueries';
import { TICKET_STATUS_LABEL, type WorkspaceTicket } from '../contracts';
import { LogTicketDialog } from './LogTicketDialog';
import { PersonAvatar } from './PersonAvatar';
import { RaiseFromTicketDialog } from './RaiseFromTicketDialog';
import { TaskStatusBadge } from './TaskMarks';
import { TicketAge, TicketPriorityBadge } from './TicketMarks';

type Scope = 'mine' | 'open' | 'unassigned' | 'closed' | 'all';

/**
 * The ticket queue.
 *
 * Deliberately the same shape as the task list — one band of scope tabs, one
 * search, one table — because it is the same kind of screen and an operator
 * moves between them all day. What differs is the unit: a row here is a
 * problem somebody reported, and the column that matters most is whether
 * anybody has been given it yet.
 *
 * "Unassigned" is the queue this page exists for. It is not "a task with no
 * owner" — it is a complaint with no task at all, which is the only state
 * where a customer is waiting and nobody inside Fleetin has picked the phone
 * call up.
 */
export function TicketList() {
  const navigate = useNavigate();
  /* Mine first, because the question this screen is opened with is "what is
   on my desk" — the whole queue is one tab away. */
  const [scope, setScope] = useState<Scope>('mine');
  const [q, setQ] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [logging, setLogging] = useState(false);
  const [raising, setRaising] = useState<WorkspaceTicket | null>(null);

  const { data: summary } = useTicketSummary();
  const { data, isLoading } = useTickets({
    scope,
    q: q.trim() || undefined,
    page,
    pageSize,
  });

  const rows = data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-end gap-3">
        <Button
          size="sm"
          shape="pill"
          leadingIcon={<Plus className="size-3.5" />}
          onClick={() => setLogging(true)}
        >
          Create ticket
        </Button>
      </div>

      {/* One band, tabs and search together — the same control the directories
          use, because this is the same kind of screen. */}
      <FilterBar
        label="Filter tickets"
        tabs={[
          { key: 'mine', label: 'My tickets', count: summary?.mine ?? 0 },
          { key: 'open', label: 'Open', count: summary?.open ?? 0 },
          /* The queue this page exists for: a complaint with no task at all,
             which is the only state where a customer is waiting and nobody
             inside Fleetin has picked the call up. */
          { key: 'unassigned', label: 'Unassigned', count: summary?.unassigned ?? 0, tone: 'warning' },
          { key: 'closed', label: 'Closed', count: summary?.closed ?? 0 },
          { key: 'all', label: 'All', count: summary?.all ?? 0 },
        ]}
        active={scope}
        onSelect={(next) => {
          setScope(next as Scope);
          setPage(1);
        }}
        search={{
          value: q,
          onChange: (value) => {
            setQ(value);
            setPage(1);
          },
          placeholder: 'Search tickets and references…',
        }}
      />

      {isLoading ? (
        <div className="flex justify-center py-16">
          <Spinner className="size-5 text-muted-foreground" />
        </div>
      ) : (
        <DataTable
          rows={rows}
          rowKey={(ticket) => ticket.id}
          onRowClick={(ticket) =>
            navigate(buildPath(ROUTES.workspaceTicketDetail, { reference: ticket.reference }))
          }
          emptyCopy={
            scope === 'unassigned'
              ? 'Every reported problem has been handed to somebody.'
              : scope === 'mine'
                ? 'Nothing is on your desk.'
                : 'No tickets yet. Create one when somebody reports a problem.'
          }
          breakpoint="56rem"
          columns={[
            {
              /* Priority has its own column now. Stacked into the title cell it
                 was one of four things in that box — badge, title, reference,
                 record chip — and a cell carrying four facts is a cell nobody
                 reads. Alone in a column it can also be compared down the page,
                 which is the only reason a queue sorts by it. */
              key: 'priority',
              label: 'Priority',
              width: 'w-[11%]',
              cardLabel: 'Priority',
              cell: (ticket) => <TicketPriorityBadge priority={ticket.priority} />,
            },
            {
              key: 'ticket',
              label: 'Ticket',
              icon: LifeBuoy,
              width: 'w-[31%]',
              card: 'identity',
              /* The reference and the complaint, and nothing else. What it is
                 about, who reported it and what they said are all one click
                 away on the ticket itself — printing them here made the row a
                 summary of the page rather than a way into it. */
              cell: (ticket) => (
                <div className="min-w-0">
                  <p className="min-w-0 truncate text-[15px] font-bold leading-tight text-foreground">
                    {ticket.subject}
                  </p>
                  <p className="mt-0.5 flex min-w-0 items-center gap-2">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {ticket.reference}
                    </span>
                    <TicketAge
                      createdAt={ticket.createdAt}
                      closed={ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED'}
                    />
                  </p>
                </div>
              ),
            },
            {
              key: 'status',
              label: 'Status',
              width: 'w-[13%]',
              cardLabel: 'Status',
              /* The ticket's own word for the shared state — a task is
                 Completed, a complaint is Resolved. */
              cell: (ticket) => (
                <TaskStatusBadge status={ticket.status} label={TICKET_STATUS_LABEL[ticket.status]} />
              ),
            },
            {
              /* The column the page is for: has anybody been given this? */
              key: 'work',
              label: 'Assigned',
              icon: User,
              width: 'w-[21%]',
              cardLabel: 'Assigned',
              cell: (ticket) =>
                ticket.task ? (
                  <div className="min-w-0">
                    <div className="flex min-w-0 items-center gap-1.5">
                      <span className="font-mono text-[11px] font-bold text-muted-foreground">
                        {ticket.task.reference}
                      </span>
                      {ticket.task.assignee ? (
                        <>
                          <PersonAvatar person={ticket.task.assignee} size="xs" />
                          <span className="min-w-0 truncate text-xs text-foreground">
                            {ticket.task.assignee.firstName} {ticket.task.assignee.lastName}
                          </span>
                        </>
                      ) : (
                        <span className="text-xs text-muted-foreground">Nobody yet</span>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Amber, because this row is the queue's actual news: a
                     complaint that is real, open, and nobody's. An outline
                     button said "an action is available here", which is the
                     same thing every other row says. */
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-7 border-warning bg-warning-subtle text-[11px] font-semibold text-warning-subtle-foreground hover:bg-warning-subtle"
                    leadingIcon={<AlertTriangle className="size-3" />}
                    onClick={(event) => {
                      event.stopPropagation();
                      setRaising(ticket);
                    }}
                  >
                    Raise the work
                  </Button>
                ),
            },
            {
              /* When it came in, and how long it has been sitting. The list
                 could say what state a ticket was in but not for how long,
                 which is half of "how is it going" — a Medium open nine days
                 needs a person more than a High raised this morning. */
              key: 'created',
              label: 'Created',
              icon: Calendar,
              width: 'w-[13%]',
              cardLabel: 'Created',
              cell: (ticket) => (
                <div className="min-w-0">
                  <p className="text-xs font-semibold text-foreground">
                    {new Date(ticket.createdAt).toLocaleDateString()}
                  </p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    {new Date(ticket.createdAt).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                    })}
                  </p>
                </div>
              ),
            },
            {
              /* The promise, and whether it has been broken. Comes off the
                 task, because the due date belongs to the work — a ticket has
                 no deadline of its own until somebody takes it on. */
              key: 'due',
              label: 'Due',
              icon: Clock,
              width: 'w-[11%]',
              cardLabel: 'Due',
              cell: (ticket) => {
                const closed =
                  ticket.status === 'COMPLETED' || ticket.status === 'CANCELLED';
                if (!ticket.task?.dueAt) {
                  return <span className="text-[11px] text-muted-foreground">No date</span>;
                }
                const due = new Date(ticket.task.dueAt);
                const overdue = !closed && due.getTime() < Date.now();
                const days = Math.round((due.getTime() - Date.now()) / 86_400_000);
                return (
                  <div className="min-w-0">
                    <p
                      className={cn(
                        'text-xs font-semibold',
                        overdue ? 'text-destructive' : 'text-foreground',
                      )}
                    >
                      {due.toLocaleDateString()}
                    </p>
                    {!closed ? (
                      <p
                        className={cn(
                          'mt-0.5 text-[11px]',
                          overdue ? 'font-semibold text-destructive' : 'text-muted-foreground',
                        )}
                      >
                        {overdue
                          ? `${Math.abs(days)}d late`
                          : days === 0
                            ? 'today'
                            : `in ${days}d`}
                      </p>
                    ) : null}
                  </div>
                );
              },
            },
          ]}
        />
      )}

      {data && data.total > 0 ? (
        <TablePager
          paged={{
            page: data.page,
            pageCount: data.pageCount,
            total: data.total,
            rangeStart: (data.page - 1) * data.pageSize + 1,
            rangeEnd: Math.min(data.page * data.pageSize, data.total),
            setPage,
          }}
          noun="tickets"
          pageSize={pageSize}
          onPageSizeChange={setPageSize}
          pageSizeOptions={[25, 50, 100]}
        />
      ) : null}

      <LogTicketDialog
        open={logging}
        onOpenChange={setLogging}
        onCreated={(reference) =>
          navigate(buildPath(ROUTES.workspaceTicketDetail, { reference }))
        }
      />
      {raising ? (
        <RaiseFromTicketDialog
          ticket={raising}
          open
          onOpenChange={(next) => {
            if (!next) setRaising(null);
          }}
        />
      ) : null}
    </div>
  );
}
