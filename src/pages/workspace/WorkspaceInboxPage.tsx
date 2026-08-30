import { useMemo } from 'react';
import { Link } from 'react-router-dom';

import { Avatar, Button, Spinner } from '@/design-system';
import { AtSign, Check, CornerDownLeft, ListChecks, UserPlus } from '@/design-system/icons';
import { buildPath, ROUTES } from '@/config/routes';
import {
  DueMark, MessageBody, PriorityMark, RecordChip, TaskStatusBadge,
  useMarkNotificationsRead, useResolveMessage, useWorkspaceInbox,
  type WorkspaceNotification,
} from '@/features/workspace';
import { resolveAssetUrl } from '@/services/api.client';
import { useAuthStore } from '@/stores';
import { cn, formatRelativeTime } from '@/utils';

const KIND_MARK: Record<string, { icon: typeof AtSign; text: string }> = {
  MENTIONED: { icon: AtSign, text: 'mentioned you' },
  ASSIGNED: { icon: ListChecks, text: 'assigned you a task' },
  UNASSIGNED: { icon: ListChecks, text: 'took a task off you' },
  TASK_UPDATED: { icon: ListChecks, text: 'updated a task' },
  COMMENT_ADDED: { icon: CornerDownLeft, text: 'commented' },
  REPLY_ADDED: { icon: CornerDownLeft, text: 'replied to you' },
  COMMENT_ASSIGNED: { icon: UserPlus, text: 'asked you to handle a comment' },
  COMMENT_RESOLVED: { icon: Check, text: 'resolved what you asked' },
};

/** Today / Yesterday / a date — the grouping every inbox uses because it works. */
function dayLabel(iso: string): string {
  const date = new Date(iso);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const yesterday = new Date(start); yesterday.setDate(yesterday.getDate() - 1);
  if (date >= start) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, { day: 'numeric', month: 'long' });
}

function NotificationRow({ notification }: { notification: WorkspaceNotification }) {
  const mark = KIND_MARK[notification.kind] ?? { icon: ListChecks, text: notification.kind.toLowerCase() };
  const Icon = mark.icon;
  const actor = notification.actor
    ? `${notification.actor.firstName} ${notification.actor.lastName}`.trim()
    : 'Fleetin';
  const unread = !notification.readAt;

  const body = (
    <div className={cn('flex items-start gap-2.5 px-3 py-2', unread && 'bg-primary-subtle/40')}>
      <Icon className={cn('mt-0.5 size-4 shrink-0', unread ? 'text-primary-bold' : 'text-muted-foreground')} aria-hidden />
      <div className="min-w-0 flex-1">
        <p className={cn('text-xs', unread ? 'font-medium text-foreground' : 'text-muted-foreground')}>
          <span className="font-semibold text-foreground">{actor}</span> {mark.text}
          {notification.task ? <> · <span className="font-mono">{notification.task.reference}</span> {notification.task.title}</> : null}
        </p>
        {notification.message ? (
          <MessageBody body={notification.message.body} className="mt-0.5 line-clamp-2 text-[0.6875rem] text-muted-foreground" />
        ) : null}
      </div>
      <time className="shrink-0 text-[0.6875rem] tabular-nums text-muted-foreground" dateTime={notification.createdAt}>
        {formatRelativeTime(notification.createdAt)}
      </time>
    </div>
  );

  return notification.task ? (
    <Link
      to={buildPath(ROUTES.workspaceTaskDetail, { reference: notification.task.reference })}
      className="block transition-colors duration-fast hover:bg-surface-sunken"
    >
      {body}
    </Link>
  ) : (
    body
  );
}

/**
 * "What needs my attention?" — the one question this screen answers.
 *
 * Deliberately not an activity feed of everything everybody did. Two panels:
 * what the reader owes (tasks and assigned comments, side by side because to
 * the person who owes them there is no difference), and what has happened to
 * them since they last looked.
 */
export function WorkspaceInboxPage() {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { data, isLoading } = useWorkspaceInbox();
  const markRead = useMarkNotificationsRead();
  const resolve = useResolveMessage();

  const grouped = useMemo(() => {
    const buckets = new Map<string, WorkspaceNotification[]>();
    for (const notification of data?.notifications ?? []) {
      const key = dayLabel(notification.createdAt);
      buckets.set(key, [...(buckets.get(key) ?? []), notification]);
    }
    return [...buckets.entries()];
  }, [data?.notifications]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-card border border-border py-20 text-sm text-muted-foreground">
        <Spinner className="size-4" /> Loading your inbox…
      </div>
    );
  }

  const counts = data?.counts;
  const owed = data?.tasks ?? [];
  const comments = data?.assignedComments ?? [];

  return (
    <div className="grid min-w-0 gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,26rem)]">
      <div className="min-w-0 space-y-5">
        <section className="rounded-card border border-border bg-surface-raised">
          <header className="flex items-baseline justify-between border-b border-border px-4 py-2.5">
            <h3 className="text-sm font-semibold text-foreground">Yours to do</h3>
            {counts && counts.overdue > 0 ? (
              <span className="text-xs font-semibold text-destructive">{counts.overdue} overdue</span>
            ) : null}
          </header>

          {owed.length === 0 && comments.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing is waiting on you.</p>
          ) : (
            <ul className="divide-y divide-border">
              {owed.map((task) => (
                <li key={task.id}>
                  <Link
                    to={buildPath(ROUTES.workspaceTaskDetail, { reference: task.reference })}
                    className="flex items-center gap-3 px-4 py-2.5 transition-colors duration-fast hover:bg-surface-sunken"
                  >
                    <PriorityMark priority={task.priority} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{task.title}</p>
                      <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
                        <span className="font-mono text-[0.6875rem] text-muted-foreground">{task.reference}</span>
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
                      </div>
                    </div>
                    <TaskStatusBadge status={task.status} />
                    <DueMark dueAt={task.dueAt} status={task.status} />
                  </Link>
                </li>
              ))}

              {/* Assigned comments — lighter than a task, same obligation. */}
              {comments.map((message) => (
                <li key={message.id} className="flex items-start gap-3 px-4 py-2.5">
                  <Avatar
                    size="xs"
                    name={`${message.author.firstName} ${message.author.lastName}`}
                    src={resolveAssetUrl(message.author.avatarUrl ?? undefined)}
                    className="mt-0.5"
                  />
                  <div className="min-w-0 flex-1">
                    <MessageBody body={message.body} currentUserId={currentUserId} className="line-clamp-2" />
                    <p className="mt-0.5 text-[0.6875rem] text-muted-foreground">
                      {message.assignedBy ? `Asked by ${message.assignedBy.firstName} ${message.assignedBy.lastName}` : 'Assigned to you'}
                      {message.task ? <> · <span className="font-mono">{message.task.reference}</span></> : null}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="xs"
                    shape="pill"
                    disabled={resolve.isPending}
                    onClick={() => resolve.mutate({ id: message.id, resolved: true })}
                    leadingIcon={<Check className="h-3.5 w-3.5" />}
                  >
                    Resolve
                  </Button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <aside className="min-w-0 rounded-card border border-border bg-surface-raised">
        <header className="flex items-center justify-between border-b border-border px-4 py-2.5">
          <h3 className="text-sm font-semibold text-foreground">Activity</h3>
          {counts && counts.unread > 0 ? (
            <button
              type="button"
              onClick={() => markRead.mutate(undefined)}
              className="text-xs font-medium text-primary-bold transition-colors duration-fast hover:underline"
            >
              Mark all read
            </button>
          ) : null}
        </header>

        {grouped.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nothing new.</p>
        ) : (
          <div className="max-h-[calc(100vh-16rem)] overflow-y-auto">
            {grouped.map(([day, items]) => (
              <div key={day}>
                <p className="sticky top-0 z-10 bg-surface-raised px-3 py-1.5 text-[0.6875rem] font-medium uppercase tracking-wide text-muted-foreground">
                  {day}
                </p>
                <ul className="divide-y divide-border">
                  {items.map((notification) => (
                    <li key={notification.id}>
                      <NotificationRow notification={notification} />
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
      </aside>
    </div>
  );
}

export default WorkspaceInboxPage;
