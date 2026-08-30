import * as Popover from '@radix-ui/react-popover';
import { useState } from 'react';
import { Link } from 'react-router-dom';

import { IconButton, Spinner, Tooltip } from '@/design-system';
import { AtSign, Bell, Check, CornerDownLeft, ListChecks, UserPlus } from '@/design-system/icons';
import { buildPath, ROUTES } from '@/config/routes';
import { usePermissions } from '@/hooks/usePermissions';
import { useAuthStore } from '@/stores';
import { cn, formatRelativeTime } from '@/utils';

import { useMarkNotificationsRead, useWorkspaceNotifications, useWorkspaceUnread } from '../api/queries';

const KIND_ICON: Record<string, typeof AtSign> = {
  MENTIONED: AtSign,
  ASSIGNED: ListChecks,
  UNASSIGNED: ListChecks,
  TASK_UPDATED: ListChecks,
  COMMENT_ADDED: CornerDownLeft,
  REPLY_ADDED: CornerDownLeft,
  COMMENT_ASSIGNED: UserPlus,
  COMMENT_RESOLVED: Check,
};

const KIND_TEXT: Record<string, string> = {
  MENTIONED: 'mentioned you',
  ASSIGNED: 'assigned you a task',
  UNASSIGNED: 'took a task off you',
  TASK_UPDATED: 'updated a task',
  COMMENT_ADDED: 'commented',
  REPLY_ADDED: 'replied to you',
  COMMENT_ASSIGNED: 'asked you to handle a comment',
  COMMENT_RESOLVED: 'resolved what you asked',
};

/**
 * The header bell, finally connected to something.
 *
 * It rendered with no `onClick` from the day the shell was built — decorative
 * furniture that implied a feature. It now reads real rows, and read state is
 * stored server-side so it survives a refresh and a second device.
 *
 * The Settings notification matrix still writes channel preferences to
 * localStorage and is read by nothing; it does not govern this. That screen is
 * a known gap, not configuration.
 *
 * Renders nothing for a portal account or one without `workspace.view` — a
 * bell that is always empty is worse than no bell.
 */
export function NotificationBell() {
  const { can } = usePermissions();
  const role = useAuthStore((state) => state.user?.role);
  const [open, setOpen] = useState(false);

  const isPortal = role === 'SHIPPER' || role === 'TRANSPORTER' || role === 'CLIENT';
  const allowed = !isPortal && can('workspace.view');

  const { data: unread } = useWorkspaceUnread(allowed);
  const { data: notifications = [], isLoading } = useWorkspaceNotifications(allowed && open);
  const markRead = useMarkNotificationsRead();

  if (!allowed) return null;

  const count = unread?.unread ?? 0;

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        /* Opening it IS reading it — leaving the badge lit after somebody has
           looked is how a notification count stops meaning anything. */
        if (next && count > 0) markRead.mutate(undefined);
      }}
    >
      <Tooltip content="Notifications">
        <Popover.Trigger asChild>
          <IconButton aria-label={count > 0 ? `Notifications, ${count} unread` : 'Notifications'} size="sm" shape="pill" className="relative">
            <Bell />
            {count > 0 ? (
              <span className="absolute -right-0.5 -top-0.5 flex min-w-[1.125rem] items-center justify-center rounded-full bg-destructive px-1 text-[0.625rem] font-semibold leading-4 text-destructive-foreground">
                {count > 99 ? '99+' : count}
              </span>
            ) : null}
          </IconButton>
        </Popover.Trigger>
      </Tooltip>

      <Popover.Portal>
        <Popover.Content
          align="end"
          sideOffset={8}
          className="z-popover w-[min(24rem,calc(100vw-1.5rem))] overflow-hidden rounded-card border border-border bg-surface-raised shadow-card"
        >
          <header className="flex items-center justify-between border-b border-border px-3 py-2">
            <span className="text-xs font-semibold text-foreground">Notifications</span>
            <Link
              to={ROUTES.workspaceInbox}
              onClick={() => setOpen(false)}
              className="text-[0.6875rem] font-medium text-primary-bold hover:underline"
            >
              Open Inbox
            </Link>
          </header>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Spinner className="size-3.5" /> Loading…
            </div>
          ) : notifications.length === 0 ? (
            <p className="px-3 py-8 text-center text-xs text-muted-foreground">Nothing yet.</p>
          ) : (
            <ul className="max-h-96 divide-y divide-border overflow-y-auto">
              {notifications.map((notification) => {
                const Icon = KIND_ICON[notification.kind] ?? ListChecks;
                const actor = notification.actor
                  ? `${notification.actor.firstName} ${notification.actor.lastName}`.trim()
                  : 'Fleetin';
                const row = (
                  <div className={cn('flex items-start gap-2.5 px-3 py-2', !notification.readAt && 'bg-primary-subtle/40')}>
                    <Icon className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                    <p className="min-w-0 flex-1 text-[0.6875rem] text-muted-foreground">
                      <span className="font-semibold text-foreground">{actor}</span> {KIND_TEXT[notification.kind] ?? ''}
                      {notification.task ? (
                        <> · <span className="font-mono">{notification.task.reference}</span> {notification.task.title}</>
                      ) : null}
                    </p>
                    <time className="shrink-0 text-[0.625rem] tabular-nums text-muted-foreground" dateTime={notification.createdAt}>
                      {formatRelativeTime(notification.createdAt)}
                    </time>
                  </div>
                );
                return (
                  <li key={notification.id}>
                    {notification.task ? (
                      <Link
                        to={buildPath(ROUTES.workspaceTaskDetail, { reference: notification.task.reference })}
                        onClick={() => setOpen(false)}
                        className="block transition-colors duration-fast hover:bg-surface-sunken"
                      >
                        {row}
                      </Link>
                    ) : row}
                  </li>
                );
              })}
            </ul>
          )}
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
