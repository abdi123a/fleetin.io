import { useState } from 'react';

import { Spinner } from '@/design-system';
import { X } from '@/design-system/icons';
import { useAuthStore } from '@/stores';
import { cn, formatRelativeTime } from '@/utils';

import { Composer } from '../composer/Composer';
import { MessageBody } from '../composer/MessageBody';
import { PersonAvatar } from '../components/PersonAvatar';
import { usePostMessage, useThread } from '../api/queries';
import type { ChannelMessage } from '../contracts';

export interface ThreadPanelProps {
  messageId: string;
  channelId: string;
  channelName: string;
  onClose: () => void;
  className?: string;
}

function Line({ message }: { message: ChannelMessage }) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  return (
    <article className="flex gap-2.5 px-3 py-2">
      <PersonAvatar person={message.author} size="sm" className="shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-baseline gap-x-2">
          <span className="text-sm font-bold leading-tight text-foreground">
            {message.author.firstName} {message.author.lastName}
          </span>
          <time className="text-[0.6875rem] text-muted-foreground" dateTime={message.createdAt}>
            {formatRelativeTime(message.createdAt)}
          </time>
        </div>
        <MessageBody body={message.body} currentUserId={currentUserId} references={message.references} className="mt-0.5" />
      </div>
    </article>
  );
}

/**
 * A thread, in its own panel beside the channel.
 *
 * Replies never go back into the river — that is what keeps a busy channel
 * readable when two people have a long exchange about one container. The
 * channel shows the parent and a reply count; the detail lives here.
 */
export function ThreadPanel({ messageId, channelId, channelName, onClose, className }: ThreadPanelProps) {
  const { data, isLoading } = useThread(messageId);
  const post = usePostMessage();
  const [draft, setDraft] = useState('');

  function send(body: string) {
    if (!body.trim()) return;
    post.mutate(
      { body, channelId, parentMessageId: messageId },
      { onSuccess: () => setDraft('') },
    );
  }

  return (
    <aside className={cn('flex min-h-0 flex-col border-l border-border bg-surface-raised', className)}>
      <header className="flex shrink-0 items-center justify-between border-b border-border px-3 py-2.5">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold text-foreground">Thread</h3>
          <p className="truncate text-[0.6875rem] text-muted-foreground">{channelName}</p>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close thread"
          className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <X className="size-4" aria-hidden />
        </button>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading || !data ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Spinner className="size-3.5" /> Loading thread…
          </div>
        ) : (
          <>
            <Line message={data.parent} />
            <div className="relative py-2" role="separator">
              <span className="absolute inset-x-3 top-1/2 h-px bg-border" aria-hidden />
              <span className="relative ml-3 inline-block bg-surface-raised pr-2 text-[0.6875rem] font-medium text-muted-foreground">
                {data.replies.length === 0
                  ? 'No replies yet'
                  : `${data.replies.length} ${data.replies.length === 1 ? 'reply' : 'replies'}`}
              </span>
            </div>
            {data.replies.map((reply) => <Line key={reply.id} message={reply} />)}
          </>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-2">
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={send}
          busy={post.isPending}
          rows={2}
          placeholder="Reply…"
        />
      </div>
    </aside>
  );
}
