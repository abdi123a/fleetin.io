import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { Button, Card, Spinner } from '@/design-system';
import { LifeBuoy, Plus } from '@/design-system/icons';
import { ROUTES, buildPath } from '@/config/routes';

import { useTickets } from '../api/ticketQueries';
import { TICKET_STATUS_LABEL, type RecordType } from '../contracts';
import { LogTicketDialog } from './LogTicketDialog';
import { PersonAvatar } from './PersonAvatar';
import { TaskStatusBadge } from './TaskMarks';
import { TicketPriorityBadge } from './TicketMarks';

/**
 * What has been reported about THIS record — a shipment, a container, a
 * transporter, a driver, an invoice.
 *
 * Drop-in: the record page passes what it is and this asks the queue. It is
 * the same list as the Tickets screen, filtered to one row of the system, so a
 * shipper page can answer "what have they complained about?" without anybody
 * leaving it.
 *
 * Deliberately read-mostly. Creating from here pre-attaches the record, which
 * is the whole convenience; everything else — reassigning, moving the status —
 * happens on the task, and the row links to the ticket that links to it.
 */
export function RecordTickets({
  recordType,
  recordId,
  recordRef,
  label,
  className,
}: {
  recordType: RecordType;
  /** A uuid or a reference — the query accepts either. */
  recordId: string;
  recordRef: string;
  label?: string | null;
  className?: string;
}) {
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const { data, isLoading } = useTickets({ scope: 'all', recordType, recordId });
  const tickets = data?.items ?? [];

  return (
    <Card className={className}>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 pb-3">
        <h3 className="flex items-center gap-2 text-sm font-bold text-foreground">
          <LifeBuoy className="size-4 text-primary" aria-hidden />
          Tickets
          {tickets.length > 0 ? (
            <span className="font-mono text-xs font-bold text-muted-foreground">
              {tickets.length}
            </span>
          ) : null}
        </h3>
        <Button
          variant="outline"
          size="sm"
          className="h-8"
          leadingIcon={<Plus className="size-3.5" />}
          onClick={() => setCreating(true)}
        >
          Create ticket
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Spinner className="size-4 text-muted-foreground" />
        </div>
      ) : tickets.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">
          Nothing has been reported about {recordRef}.
        </p>
      ) : (
        <ul className="divide-y divide-border/60">
          {tickets.map((ticket) => (
            <li key={ticket.id}>
              <button
                type="button"
                onClick={() =>
                  navigate(
                    buildPath(ROUTES.workspaceTicketDetail, { reference: ticket.reference }),
                  )
                }
                className="flex w-full flex-wrap items-center gap-x-3 gap-y-1 px-1 py-2.5 text-left transition-colors hover:bg-muted/40"
              >
                <TicketPriorityBadge priority={ticket.priority} />
                <span className="font-mono text-[11px] text-muted-foreground">
                  {ticket.reference}
                </span>
                <span className="min-w-0 flex-1 truncate text-sm font-semibold text-foreground">
                  {ticket.subject}
                </span>
                {/* Who has it and where it stands — the two facts a record page
                    is asking, and the only two it has room for. */}
                {ticket.task?.assignee ? (
                  <span className="flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground">
                    <PersonAvatar person={ticket.task.assignee} size="xs" />
                    {ticket.task.assignee.firstName}
                  </span>
                ) : (
                  <span className="shrink-0 text-xs text-muted-foreground">Unassigned</span>
                )}
                <TaskStatusBadge
                  status={ticket.status}
                  label={TICKET_STATUS_LABEL[ticket.status]}
                />
              </button>
            </li>
          ))}
        </ul>
      )}

      <LogTicketDialog
        open={creating}
        onOpenChange={setCreating}
        record={{ recordType, recordId, recordRef, label }}
      />
    </Card>
  );
}
