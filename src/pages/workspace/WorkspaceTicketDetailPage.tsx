import { useNavigate, useParams } from 'react-router-dom';

import { Avatar, Button, Card, HelpHint, IconChip, Spinner } from '@/design-system';
import { AlertTriangle, ArrowLeft, ArrowRight, Mail, Phone, Plus } from '@/design-system/icons';
import { ROUTES, buildPath } from '@/config/routes';
import {
  PersonAvatar,
  RecordChip,
  TASK_STATUS_LABEL,
  TICKET_CHANNEL_LABEL,
  TICKET_STATUS_LABEL,
  TaskStatusBadge,
  TicketActivity,
  TicketAge,
  TicketPriorityBadge,
  TicketStatusHistory,
  useTicket,
} from '@/features/workspace';

/**
 * A titled stretch of the one card.
 *
 * These were nine separate bordered boxes — masthead, four sections, four rail
 * cards — and a page of frames is a page whose structure you have to decode
 * before you can read it. A rule and a small-caps title separate two things
 * just as well and cost no border, no shadow and no gap.
 */
function Block({
  title,
  action,
  children,
}: {
  title: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="border-t border-border/70 px-4 py-4 sm:px-5">
      <div className="mb-2.5 flex items-center justify-between gap-2">
        <h3 className="text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
          {title}
        </h3>
        {action}
      </div>
      {children}
    </section>
  );
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-xs text-muted-foreground">{label}</span>
      <span className="min-w-0 text-right text-[13px] font-semibold text-foreground">
        {children}
      </span>
    </div>
  );
}

/**
 * One ticket, in two columns.
 *
 * The single narrow column this replaced read as a form somebody had to scroll
 * — every section the same weight, the status a word in a row of words. A
 * ticket is a *dossier*: the reader wants the state, the owner and the history
 * to stay put while they read the complaint, which is what a rail is for.
 *
 * Left is the story — what it is about, what the customer said, what we are
 * doing, what has happened. Right is the standing answer to "where is this?":
 * status, the one action, the dates, and where it has been.
 *
 * ## One status
 *
 * Every badge here reads the TASK's status when there is a task, never the
 * ticket's own column. The server keeps that column in step, but a page that
 * renders its own copy can still show a stale word in the seconds between a
 * write and a refetch, and "Ticket: Open / Task: Completed" on one screen
 * destroys trust in both.
 */
export function WorkspaceTicketDetailPage() {
  const { reference } = useParams<{ reference: string }>();
  const navigate = useNavigate();
  const { data: ticket, isLoading } = useTicket(reference);

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Spinner className="size-5 text-muted-foreground" />
      </div>
    );
  }
  if (!ticket) {
    return <p className="py-20 text-center text-sm text-muted-foreground">No such ticket.</p>;
  }

  const status = ticket.task?.status ?? ticket.status;
  const openedByName = `${ticket.openedBy.firstName} ${ticket.openedBy.lastName}`;

  /**
   * The three states worth a colour, and nothing else.
   *
   * Everything on this page was one weight of grey, so the page said nothing
   * about whether it needed a person — and a queue's whole job is to say that.
   * Colour is spent only where it means *act*: nobody owns it, the promised
   * date has gone, or it is blocked on a third party. A resolved ticket goes
   * quiet on purpose; a page where every state is coloured is a page where
   * colour has stopped meaning anything.
   */
  const closed = status === 'COMPLETED' || status === 'CANCELLED';
  const unowned = !closed && !ticket.task?.assignee;
  const overdue =
    !closed && Boolean(ticket.task?.dueAt) && new Date(ticket.task!.dueAt!).getTime() < Date.now();

  return (
    <div className="@container/ticket space-y-3">
      <Button
        variant="ghost"
        size="sm"
        className="-ml-2 h-8"
        leadingIcon={<ArrowLeft className="size-3.5" />}
        onClick={() => navigate(ROUTES.workspaceTickets)}
      >
        All tickets
      </Button>

      {/* Two columns from 44rem, not 62. The rail is 17rem; at 62 the page
          sat in one column at every width the sidebar leaves — which is how a
          screen ends up with everything on the left and nothing on the right. */}
      <div className="grid min-w-0 items-start gap-3 @[44rem]/ticket:grid-cols-[minmax(0,1fr)_17rem]">
        <Card className="min-w-0 overflow-hidden rounded-lg border border-border/80 bg-card p-0">
          {/* ── MASTHEAD ── the complaint, and how bad it is */}
          <header className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2 px-4 py-4 sm:px-5">
            <div className="min-w-0">
              <p className="font-mono text-[11px] font-bold tracking-wide text-muted-foreground">
                {ticket.reference}
              </p>
              <h2 className="mt-0.5 text-xl font-bold leading-tight text-foreground">
                {ticket.subject}
              </h2>
              <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
                <span>
                  Created {new Date(ticket.createdAt).toLocaleString()} · by {openedByName}
                </span>
                <TicketAge createdAt={ticket.createdAt} closed={closed} />
              </p>
            </div>
            <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
              {unowned ? (
                /* The one thing a ticket can be that no status word covers:
                   raised, real, and nobody's. */
                <span className="inline-flex items-center gap-1 rounded-full bg-warning px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-warning-foreground">
                  <AlertTriangle className="size-3" aria-hidden />
                  Unassigned
                </span>
              ) : null}
              {overdue ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-destructive px-2 py-0.5 text-[10px] font-extrabold uppercase tracking-wider text-destructive-foreground">
                  Overdue
                </span>
              ) : null}
              <TicketPriorityBadge priority={ticket.priority} />
              <TaskStatusBadge status={status} size="md" label={TICKET_STATUS_LABEL[status]} />
            </div>
          </header>


          {/* ── RELATED TO ── the Fleetin object, first and clickable */}
          {ticket.recordType && ticket.recordRef ? (
            <Block title="Related to">
              <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                <RecordChip
                  recordType={ticket.recordType}
                  reference={ticket.recordRef}
                  label={ticket.recordLabel}
                  status={ticket.recordStatus}
                  parentRef={ticket.recordParentRef}
                  recordId={ticket.recordId ?? undefined}
                  missing={ticket.recordMissing}
                  size="md"
                />
                {ticket.recordParentRef ? (
                  <span className="text-xs text-muted-foreground">
                    Shipment{' '}
                    <span className="font-mono font-semibold text-foreground">
                      {ticket.recordParentRef}
                    </span>
                  </span>
                ) : null}
              </div>
            </Block>
          ) : null}

          {/* ── CUSTOMER REPORT ── who rang, and what they said */}
          <Block title="Customer report">
            {ticket.reporterName || ticket.reporterContact ? (
              /* The caller as a person, the way a record page names one — a
                 mark, a name, and how to reach them. Set as three grey rows it
                 read as metadata about the ticket rather than the human on the
                 other end of it. */
              <div className="mb-3 flex items-center gap-3 rounded-md border border-border/60 bg-surface-sunken px-3 py-2.5">
                <Avatar name={ticket.reporterName ?? 'Caller'} size="sm" shape="circle" />
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-foreground">
                    {ticket.reporterName ?? 'Caller not named'}
                  </p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-muted-foreground">
                    {ticket.reporterContact ? (
                      <span className="inline-flex items-center gap-1">
                        <Mail className="size-3" aria-hidden />
                        {ticket.reporterContact}
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1">
                      <Phone className="size-3" aria-hidden />
                      {TICKET_CHANNEL_LABEL[ticket.channel]}
                    </span>
                  </p>
                </div>
              </div>
            ) : null}

            <blockquote className="border-l-2 border-primary/50 bg-surface-sunken py-2.5 pl-3 pr-2">
              <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">
                {ticket.description}
              </p>
            </blockquote>
          </Block>

          {/* ── WORK ── what Fleetin is doing about it */}
          <Block
            title="Work"
            action={
              ticket.task ? (
                <HelpHint label="How the ticket and the task stay in step">
                  This ticket follows{' '}
                  <strong className="text-foreground">{ticket.task.reference}</strong>. Move the
                  task to {TASK_STATUS_LABEL.IN_PROGRESS}, {TASK_STATUS_LABEL.WAITING},{' '}
                  {TASK_STATUS_LABEL.COMPLETED} or {TASK_STATUS_LABEL.CANCELLED} and this moves
                  with it — there is nothing to update twice.
                </HelpHint>
              ) : null
            }
          >
            {ticket.task ? (
              <div className="flex items-start gap-3">
                <IconChip icon={ArrowRight} size={36} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-foreground">{ticket.task.title}</p>
                  <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1.5">
                    <span className="font-mono text-[11px] text-muted-foreground">
                      {ticket.task.reference}
                    </span>
                    {ticket.task.assignee ? (
                      <span className="flex items-center gap-1.5 text-[13px] text-foreground">
                        <PersonAvatar person={ticket.task.assignee} size="xs" />
                        {ticket.task.assignee.firstName} {ticket.task.assignee.lastName}
                      </span>
                    ) : (
                      <span className="text-[13px] text-muted-foreground">Nobody yet</span>
                    )}
                    <TaskStatusBadge status={ticket.task.status} />
                  </div>
                </div>
              </div>
            ) : (
              <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-warning bg-warning-subtle px-3 py-2.5">
                <p className="flex items-center gap-2 text-sm font-semibold text-warning-subtle-foreground">
                  <AlertTriangle className="size-4 shrink-0" aria-hidden />
                  Nobody has been given this yet.
                </p>
                <Button
                  size="sm"
                  shape="pill"
                  leadingIcon={<Plus className="size-3.5" />}
                  onClick={() => navigate(ROUTES.workspaceTickets)}
                >
                  Raise the work
                </Button>
              </div>
            )}
          </Block>

          {/* ── ACTIVITY ── the steps and what was said, read-only */}
          <Block title="Activity">
            <TicketActivity
              taskRef={ticket.task?.reference}
              openedAt={ticket.createdAt}
              openedBy={ticket.openedBy}
            />
          </Block>
        </Card>

        {/* ── THE RAIL ── where this stands, kept in view.
            Two cards, not four: status, the action and the dates are one
            answer to one question, and a frame between each of them was three
            borders to separate five lines of text. */}
        <aside className="min-w-0 space-y-3 @[44rem]/ticket:sticky @[44rem]/ticket:top-4">
          <Card className="rounded-lg border border-border/80 bg-card p-4">
            <div className="flex flex-wrap items-center gap-2">
              <TaskStatusBadge status={status} size="md" label={TICKET_STATUS_LABEL[status]} />
              <TicketPriorityBadge priority={ticket.priority} />
            </div>

            {ticket.task ? (
              <Button
                variant="outline"
                size="sm"
                className="mt-3 h-8 w-full"
                trailingIcon={<ArrowRight className="size-3.5" />}
                onClick={() =>
                  navigate(
                    buildPath(ROUTES.workspaceTaskDetail, { reference: ticket.task!.reference }),
                  )
                }
              >
                Open {ticket.task.reference}
              </Button>
            ) : null}

            <div className="mt-3 divide-y divide-border/50 border-t border-border/70 pt-1">
              <Fact label="Created">{new Date(ticket.createdAt).toLocaleDateString()}</Fact>
              {ticket.closedAt ? (
                <Fact label="Resolved">{new Date(ticket.closedAt).toLocaleDateString()}</Fact>
              ) : null}
              <Fact label="Assigned to">
                {ticket.task?.assignee ? (
                  `${ticket.task.assignee.firstName} ${ticket.task.assignee.lastName}`
                ) : (
                  <span className={unowned ? 'text-warning-subtle-foreground' : undefined}>
                    Nobody yet
                  </span>
                )}
              </Fact>
              <Fact label="Due">
                {ticket.task?.dueAt ? (
                  <span className={overdue ? 'text-destructive' : undefined}>
                    {new Date(ticket.task.dueAt).toLocaleDateString()}
                  </span>
                ) : (
                  <span className="font-normal text-muted-foreground">No date</span>
                )}
              </Fact>
              <Fact label="Logged by">{ticket.openedBy.firstName}</Fact>
            </div>
          </Card>

          <Card className="rounded-lg border border-border/80 bg-card p-4">
            <h3 className="mb-3 text-[10px] font-bold uppercase tracking-[0.09em] text-muted-foreground">
              Status history
            </h3>
            <TicketStatusHistory
              taskRef={ticket.task?.reference}
              openedAt={ticket.createdAt}
              openedByName={openedByName}
            />
          </Card>
        </aside>
      </div>
    </div>
  );
}

export default WorkspaceTicketDetailPage;
