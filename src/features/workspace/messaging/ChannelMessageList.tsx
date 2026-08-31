import { useMemo } from 'react';

import { Spinner, Tooltip } from '@/design-system';
import { CornerDownLeft, Pencil, Trash2, UserPlus } from '@/design-system/icons';
import { CrewPicker } from '@/components/crew';
import { useAuthStore } from '@/stores';
import { cn } from '@/utils';

import { MessageBody } from '../composer/MessageBody';
import { PersonAvatar } from '../components/PersonAvatar';
import type { ChannelMessage } from '../contracts';

/** Two messages group when the same person sends them close together. */
const GROUP_WINDOW_MS = 5 * 60 * 1000;

function dayLabel(iso: string): string {
  const date = new Date(iso);
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const yesterday = new Date(start); yesterday.setDate(yesterday.getDate() - 1);
  if (date >= start) return 'Today';
  if (date >= yesterday) return 'Yesterday';
  return date.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' });
}

function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

interface Row {
  message: ChannelMessage;
  /** Repeat the avatar and name, or continue the previous person's block. */
  showAuthor: boolean;
  /** A day divider goes above this row. */
  day: string | null;
  /** The "New messages" rule goes above this row. */
  firstUnread: boolean;
}

export interface ChannelMessageListProps {
  messages: ChannelMessage[];
  /** Where the reader had got to. Drives the unread rule. */
  lastReadAt?: string | null;
  loading?: boolean;
  emptyCopy?: string;
  onOpenThread: (message: ChannelMessage) => void;
  onEdit: (id: string, body: string) => void;
  onWithdraw: (id: string) => void;
  onAssign: (id: string, assigneeId: string | null) => void;
  busy?: boolean;
  className?: string;
}

/**
 * A conversation's messages.
 *
 * **Your own messages sit on the right, in a filled brand bubble** — the
 * WhatsApp arrangement rather than Slack's flat single column. Slack can get
 * away with one column because it leans on avatars, but side is a far faster
 * read than a face: you know which half of the thread is yours without
 * looking at anything. Yours drop the avatar and the name entirely, because
 * the side already said it.
 *
 * Three things keep it readable at length:
 *
 * **Author grouping.** Consecutive messages from one person inside five
 * minutes drop the repeated avatar and name.
 *
 * **Day dividers**, so "10:14" means something.
 *
 * **A "New messages" rule** at `lastReadAt` — the single most useful line in
 * a chat app, because it answers the only question somebody opening a busy
 * room actually has.
 *
 * Record chips invert inside your own bubble: their normal sunken-grey plate
 * reads as a hole on teal, so they become white-on-teal, the pair `IconChip`'s
 * `on-teal` variant already uses.
 */
export function ChannelMessageList({
  messages, lastReadAt, loading, emptyCopy, onOpenThread, onEdit, onWithdraw, onAssign, busy, className,
}: ChannelMessageListProps) {
  const currentUserId = useAuthStore((state) => state.user?.id);

  const rows = useMemo<Row[]>(() => {
    const readCutoff = lastReadAt ? new Date(lastReadAt).getTime() : null;
    let unreadMarked = false;

    return messages.map((message, index) => {
      const previous = messages[index - 1];
      const sameAuthor = previous?.author.id === message.author.id;
      const closeInTime =
        previous !== undefined &&
        new Date(message.createdAt).getTime() - new Date(previous.createdAt).getTime() < GROUP_WINDOW_MS;

      const day = dayLabel(message.createdAt);
      const previousDay = previous ? dayLabel(previous.createdAt) : null;

      /* Only the FIRST unread gets the rule, and never one of your own
         messages — you have obviously read what you just wrote. */
      const isUnread =
        readCutoff !== null &&
        new Date(message.createdAt).getTime() > readCutoff &&
        message.author.id !== currentUserId;
      const firstUnread = isUnread && !unreadMarked;
      if (firstUnread) unreadMarked = true;

      return {
        message,
        day: day !== previousDay ? day : null,
        /* A day divider always restarts the block. */
        showAuthor: !sameAuthor || !closeInTime || day !== previousDay,
        firstUnread,
      };
    });
  }, [messages, lastReadAt, currentUserId]);

  if (loading) {
    return (
      <div className={cn('flex flex-1 items-center justify-center gap-2 text-sm text-muted-foreground', className)}>
        <Spinner className="size-4" /> Loading messages…
      </div>
    );
  }

  if (messages.length === 0) {
    return (
      <div className={cn('flex flex-1 flex-col items-center justify-center gap-1 px-6 text-center', className)}>
        <p className="text-sm font-medium text-foreground">{emptyCopy ?? 'Nothing here yet.'}</p>
        <p className="text-xs text-muted-foreground">
          Type <kbd className="rounded-sm bg-surface-sunken px-1 font-mono">/</kbd> to reference a shipment, vehicle or driver.
        </p>
      </div>
    );
  }

  return (
    <div className={cn('flex-1 overflow-y-auto px-2 py-3', className)}>
      {rows.map(({ message, showAuthor, day, firstUnread }) => {
        const mine = message.author.id === currentUserId;
        return (
        <div key={message.id}>
          {day ? (
            <div className="relative py-3" role="separator" aria-label={day}>
              <span className="absolute inset-x-0 top-1/2 h-px bg-border" aria-hidden />
              <span className="relative mx-auto block w-fit rounded-full border border-border bg-surface-raised px-2.5 py-0.5 text-[0.6875rem] font-medium text-muted-foreground">
                {day}
              </span>
            </div>
          ) : null}

          {firstUnread ? (
            <div className="relative py-2" role="separator" aria-label="New messages">
              <span className="absolute inset-x-0 top-1/2 h-px bg-destructive" aria-hidden />
              <span className="relative ml-auto block w-fit rounded-full bg-destructive px-2 py-0.5 text-[0.625rem] font-bold uppercase tracking-wide text-destructive-foreground">
                New
              </span>
            </div>
          ) : null}

          <article
            className={cn(
              'group/msg relative flex gap-3 px-2',
              showAuthor ? 'mt-2.5 pt-0.5' : 'mt-0.5',
              mine && 'flex-row-reverse',
            )}
          >
            {/* Yours carries no face — the side is the identity. */}
            {/* Top-aligned with the NAME, not nudged down beside the bubble.
                The old `mt-4` left it floating level with the text and reading
                as a detached dot; sitting at the head of the block is what
                makes it read as "this person said this". */}
            {!mine && showAuthor ? (
              <PersonAvatar person={message.author} size="md" className="shrink-0" />
            ) : !mine ? (
              /* Same width as the avatar, so a grouped message keeps the
                 text edge of the one above it. */
              <span className="w-9 shrink-0" aria-hidden />
            ) : null}

            <div className={cn('flex min-w-0 max-w-[min(42rem,80%)] flex-col', mine && 'items-end')}>
              {showAuthor ? (
                <div className={cn('flex flex-wrap items-baseline gap-x-2 px-1 pb-0.5', mine && 'flex-row-reverse')}>
                  {!mine ? (
                    <span className="text-sm font-bold leading-tight text-foreground">
                      {message.author.firstName} {message.author.lastName}
                    </span>
                  ) : null}
                  <time className="text-[0.6875rem] text-muted-foreground" dateTime={message.createdAt}>
                    {clockTime(message.createdAt)}
                  </time>
                  {message.editedAt ? <span className="text-[0.6875rem] text-muted-foreground">edited</span> : null}
                </div>
              ) : null}

              <div
                className={cn(
                  'w-fit max-w-full rounded-lg px-3 py-2 shadow-xs transition-colors duration-fast',
                  mine
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-surface-raised text-foreground',
                  /* A tail on the first bubble of a block, square on the rest —
                     the shape that makes a run of messages read as one turn. */
                  showAuthor && (mine ? 'rounded-tr-sm' : 'rounded-tl-sm'),
                )}
              >
                <MessageBody body={message.body} currentUserId={currentUserId} inverted={mine} references={message.references} />
              </div>

              {(message._count?.replies ?? 0) > 0 ? (
                <button
                  type="button"
                  onClick={() => onOpenThread(message)}
                  className="mt-0.5 inline-flex items-center gap-1 rounded-sm px-1 py-0.5 text-xs font-semibold text-primary-bold transition-colors duration-fast hover:bg-primary-subtle"
                >
                  {message._count?.replies} {message._count?.replies === 1 ? 'reply' : 'replies'}
                </button>
              ) : null}

              {/* A grouped message has no header, so the clock lives here. */}
              {!showAuthor ? (
                <time
                  className="px-1 pt-0.5 text-[0.625rem] text-muted-foreground opacity-0 transition-opacity duration-fast group-hover/msg:opacity-100"
                  dateTime={message.createdAt}
                >
                  {clockTime(message.createdAt)}
                </time>
              ) : null}
            </div>

            <div
              className={cn(
                'absolute top-0 flex items-center gap-0.5 rounded-md border border-border bg-surface-raised p-0.5 opacity-0 shadow-xs transition-opacity duration-fast focus-within:opacity-100 group-hover/msg:opacity-100',
                mine ? 'left-2' : 'right-2',
              )}
            >
              <Tooltip content="Reply in thread">
                <button
                  type="button"
                  onClick={() => onOpenThread(message)}
                  aria-label="Reply in thread"
                  className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground"
                >
                  <CornerDownLeft className="size-3.5" aria-hidden />
                </button>
              </Tooltip>

              <CrewPicker
                value={message.assignee ? [message.assignee.id] : []}
                busy={busy}
                align={mine ? 'start' : 'end'}
                onChange={(ids) => onAssign(message.id, ids.at(-1) ?? null)}
              >
                <button
                  type="button"
                  aria-label="Assign this message to somebody"
                  className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground"
                >
                  <UserPlus className="size-3.5" aria-hidden />
                </button>
              </CrewPicker>

              {mine ? (
                <>
                  <Tooltip content="Edit">
                    <button
                      type="button"
                      onClick={() => onEdit(message.id, message.body)}
                      aria-label="Edit this message"
                      className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                  </Tooltip>
                  <Tooltip content="Withdraw">
                    <button
                      type="button"
                      onClick={() => onWithdraw(message.id)}
                      aria-label="Withdraw this message"
                      className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:bg-destructive-subtle hover:text-destructive"
                    >
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </Tooltip>
                </>
              ) : null}
            </div>
          </article>
        </div>
        );
      })}
    </div>
  );
}
