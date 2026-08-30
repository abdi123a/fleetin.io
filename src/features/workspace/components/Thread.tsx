import { useMemo, useState } from 'react';

import { useConfirm } from '@/design-system';
import { useAuthStore } from '@/stores';
import { cn, formatRelativeTime } from '@/utils';

import {
  useAssignMessage, useEditMessage, usePostMessage, useResolveMessage, useWithdrawMessage,
} from '../api/queries';
import { Composer } from '../composer/Composer';
import { TASK_STATUS_LABEL, type RecordType, type TaskEvent, type WorkspaceMessage } from '../contracts';
import { MessageRow } from './MessageRow';

type ThreadTab = 'open' | 'mine' | 'resolved';

const TABS: { key: ThreadTab; label: string }[] = [
  { key: 'open', label: 'Open' },
  { key: 'mine', label: 'Assigned to me' },
  { key: 'resolved', label: 'Resolved' },
];

export interface ThreadProps {
  messages: WorkspaceMessage[];
  /** Interleaved into the stream, not hidden behind a second tab. */
  events?: TaskEvent[];
  taskId?: string;
  recordType?: RecordType;
  recordId?: string;
  className?: string;
}

/** "Brian changed status: Open → In Progress" — one line, inline. */
function EventLine({ event }: { event: TaskEvent }) {
  const actor = event.actor ? `${event.actor.firstName} ${event.actor.lastName}`.trim() : 'Fleetin';
  const pretty = (value: string | null) =>
    value && value in TASK_STATUS_LABEL ? TASK_STATUS_LABEL[value as keyof typeof TASK_STATUS_LABEL] : value;

  const what: Record<string, string> = {
    CREATED: 'raised this',
    TITLE_CHANGED: 'renamed it',
    DESCRIPTION_CHANGED: 'edited the description',
    STATUS_CHANGED: 'changed status',
    PRIORITY_CHANGED: 'changed priority',
    ASSIGNED: 'assigned it',
    UNASSIGNED: 'unassigned it',
    DUE_CHANGED: 'changed the due date',
    LINKED: 'changed the linked records',
    UNLINKED: 'removed a link',
  };

  const showsTransition = event.fromValue && event.toValue;

  return (
    <div className="flex flex-wrap items-baseline gap-x-1.5 px-3 py-1 text-[0.6875rem] text-muted-foreground">
      <span className="font-medium text-foreground">{actor}</span>
      <span>{what[event.kind] ?? event.kind.toLowerCase().replace(/_/g, ' ')}</span>
      {showsTransition ? (
        <span className="font-medium text-foreground">
          {pretty(event.fromValue)} → {pretty(event.toValue)}
        </span>
      ) : null}
      <time dateTime={event.createdAt} className="ml-auto tabular-nums">
        {formatRelativeTime(event.createdAt)}
      </time>
    </div>
  );
}

/**
 * The conversation on a task or a record.
 *
 * Two things it does that a plain comment list does not:
 *
 * **Tabs.** Open / Assigned to me / Resolved. A long thread where three
 * comments are somebody's job and twenty are chatter is unreadable without
 * them.
 *
 * **Events inline.** "changed status: Open → In Progress" sits in the stream
 * rather than behind a History tab, because the reason somebody changed it is
 * usually the comment directly above.
 */
export function Thread({ messages, events = [], taskId, recordType, recordId, className }: ThreadProps) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [tab, setTab] = useState<ThreadTab>('open');
  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<string | null>(null);

  const post = usePostMessage();
  const edit = useEditMessage();
  const withdraw = useWithdrawMessage();
  const assign = useAssignMessage();
  const resolve = useResolveMessage();
  const { confirm, confirmDialog } = useConfirm();

  const busy = post.isPending || edit.isPending || withdraw.isPending || assign.isPending || resolve.isPending;

  const { roots, repliesOf, counts } = useMemo(() => {
    const live = messages.filter((m) => !m.deletedAt);
    const replies = new Map<string, WorkspaceMessage[]>();
    for (const message of live) {
      if (!message.parentMessageId) continue;
      const bucket = replies.get(message.parentMessageId) ?? [];
      bucket.push(message);
      replies.set(message.parentMessageId, bucket);
    }

    const top = live.filter((m) => !m.parentMessageId);
    return {
      roots: top,
      repliesOf: replies,
      counts: {
        open: top.filter((m) => !m.resolvedAt).length,
        mine: top.filter((m) => m.assignee?.id === currentUserId && !m.resolvedAt).length,
        resolved: top.filter((m) => Boolean(m.resolvedAt)).length,
      },
    };
  }, [messages, currentUserId]);

  const visible = useMemo(() => {
    if (tab === 'mine') return roots.filter((m) => m.assignee?.id === currentUserId && !m.resolvedAt);
    if (tab === 'resolved') return roots.filter((m) => Boolean(m.resolvedAt));
    return roots.filter((m) => !m.resolvedAt);
  }, [roots, tab, currentUserId]);

  /* Events only belong in the unfiltered view: interleaved into "Assigned to
     me" they would be noise between the three things somebody actually owes. */
  const stream = useMemo(() => {
    type StreamItem =
      | { at: number; node: 'message'; message: WorkspaceMessage }
      | { at: number; node: 'event'; event: TaskEvent };

    const items: StreamItem[] = [
      ...visible.map((m): StreamItem => ({ at: new Date(m.createdAt).getTime(), node: 'message', message: m })),
      ...(tab === 'open'
        ? events.map((e): StreamItem => ({ at: new Date(e.createdAt).getTime(), node: 'event', event: e }))
        : []),
    ];
    return items.sort((a, b) => a.at - b.at);
  }, [visible, events, tab]);

  async function handleWithdraw(id: string) {
    const ok = await confirm({
      title: 'Withdraw this message?',
      description: 'It stays in the thread as a tombstone so the replies around it still make sense.',
      confirmLabel: 'Withdraw',
      destructive: true,
    });
    if (ok) withdraw.mutate(id);
  }

  function send() {
    if (!draft.trim()) return;
    post.mutate(
      { body: draft, taskId, recordType, recordId, parentMessageId: replyTo ?? undefined },
      { onSuccess: () => { setDraft(''); setReplyTo(null); } },
    );
  }

  return (
    <section className={cn('flex min-h-0 flex-col', className)}>
      <div className="flex shrink-0 items-center gap-1 border-b border-border px-1">
        {TABS.map(({ key, label }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={cn(
              'relative px-2.5 py-2 text-xs font-medium transition-colors duration-fast',
              tab === key ? 'text-primary-bold' : 'text-muted-foreground hover:text-foreground',
            )}
          >
            {label}
            {counts[key] > 0 ? <span className="ml-1.5 tabular-nums text-muted-foreground">{counts[key]}</span> : null}
            {tab === key ? <span className="absolute inset-x-1 -bottom-px h-0.5 rounded-full bg-primary" /> : null}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-1 overflow-y-auto py-2">
        {stream.length === 0 ? (
          <p className="px-3 py-6 text-center text-xs text-muted-foreground">
            {tab === 'mine'
              ? 'Nothing here is assigned to you.'
              : tab === 'resolved'
                ? 'Nothing resolved yet.'
                : 'No messages yet. Type / to reference a shipment, vehicle or driver.'}
          </p>
        ) : (
          stream.map((item) =>
            item.node === 'event' ? (
              <EventLine key={`e-${item.event.id}`} event={item.event} />
            ) : (
              <MessageRow
                key={item.message.id}
                message={item.message}
                replies={repliesOf.get(item.message.id) ?? []}
                busy={busy}
                onReply={setReplyTo}
                onEdit={(id, body) => edit.mutate({ id, body })}
                onWithdraw={handleWithdraw}
                onAssign={(id, assigneeId) => assign.mutate({ id, assigneeId })}
                onResolve={(id, resolved) => resolve.mutate({ id, resolved })}
              />
            ),
          )
        )}
      </div>

      <div className="shrink-0 border-t border-border pt-2">
        {replyTo ? (
          <div className="mb-1.5 flex items-center justify-between rounded-sm bg-surface-sunken px-2 py-1 text-[0.6875rem] text-muted-foreground">
            Replying in thread
            <button type="button" onClick={() => setReplyTo(null)} className="font-medium text-foreground hover:underline">
              Cancel
            </button>
          </div>
        ) : null}
        <Composer
          value={draft}
          onChange={setDraft}
          onSubmit={send}
          busy={post.isPending}
          placeholder="Comment, or type / for records"
        />
      </div>

      {confirmDialog}
    </section>
  );
}
