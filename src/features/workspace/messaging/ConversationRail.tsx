import { useMemo, useState } from 'react';

import { Avatar, Spinner, Tooltip } from '@/design-system';
import { Lock, Plus, Search, UserRound } from '@/design-system/icons';
import { resolveAssetUrl } from '@/services/api.client';
import { cn } from '@/utils';

import type { Conversation } from '../contracts';

export interface ConversationRailProps {
  conversations: Conversation[];
  activeId?: string;
  loading?: boolean;
  onSelect: (conversation: Conversation) => void;
  onCreateChannel: () => void;
  onStartDirect: () => void;
  className?: string;
}

/**
 * The unread count.
 *
 * Two colours, because they mean two different things and Slack is right to
 * separate them: a room with unread messages is **quiet** — a teal count you
 * glance at — while a room where somebody used your name is **loud**, in the
 * destructive red the rest of the app reserves for things that are wrong. A
 * single colour for both is how the badge stops meaning anything.
 */
function UnreadPill({ unread, mentions }: { unread: number; mentions: number }) {
  if (mentions > 0) {
    return (
      <span className="ml-auto shrink-0 rounded-full bg-destructive px-1.5 py-0.5 text-[0.625rem] font-bold tabular-nums text-destructive-foreground">
        {mentions > 99 ? '99+' : mentions}
      </span>
    );
  }
  if (unread > 0) {
    return (
      <span className="ml-auto shrink-0 rounded-full bg-primary px-1.5 py-0.5 text-[0.625rem] font-bold tabular-nums text-primary-foreground">
        {unread > 99 ? '99+' : unread}
      </span>
    );
  }
  return null;
}

function ConversationRow({
  conversation, active, onSelect,
}: { conversation: Conversation; active: boolean; onSelect: () => void }) {
  const isDirect = conversation.kind === 'DIRECT';
  const unread = conversation.unread > 0;

  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? 'page' : undefined}
        className={cn(
          'relative flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors duration-fast',
          'focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
          active ? 'bg-primary-subtle' : 'hover:bg-surface-sunken',
        )}
      >
        {/* The selected room gets a rule, not just a wash — on a list of
            twenty rows a background tint alone is easy to lose. */}
        {active ? <span className="absolute inset-y-1 left-0 w-0.5 rounded-full bg-primary" aria-hidden /> : null}

        {isDirect ? (
          <span className="relative shrink-0">
            <Avatar
              size="xs"
              name={conversation.name}
              src={resolveAssetUrl(conversation.counterpart?.avatarUrl ?? undefined)}
            />
            {/* Presence belongs to people. A channel is never "online". */}
            <span
              className="absolute -bottom-0.5 -right-0.5 size-2 rounded-full bg-success ring-2 ring-surface-raised"
              aria-hidden
            />
          </span>
        ) : (
          <span
            className={cn(
              'flex size-5 shrink-0 items-center justify-center rounded-sm',
              active ? 'bg-primary text-primary-foreground' : 'bg-surface-sunken text-muted-foreground',
            )}
          >
            {/* A literal `#`, not an icon: the curated set has no Hash, and the
                character is what people read a channel name as anyway. */}
            {conversation.isPrivate ? (
              <Lock className="size-3" aria-hidden />
            ) : (
              <span className="text-xs font-bold leading-none" aria-hidden>#</span>
            )}
          </span>
        )}

        <span
          className={cn(
            'min-w-0 flex-1 truncate text-sm',
            active ? 'font-semibold text-primary-bold' : unread ? 'font-semibold text-foreground' : 'text-muted-foreground',
          )}
        >
          {conversation.name}
        </span>

        <UnreadPill unread={conversation.unread} mentions={conversation.mentions} />
      </button>
    </li>
  );
}

function Section({
  title, action, actionLabel, children,
}: { title: string; action: () => void; actionLabel: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="flex items-center justify-between px-2 pb-1 pt-3">
        <h3 className="text-[0.6875rem] font-semibold uppercase tracking-wide text-muted-foreground">{title}</h3>
        <Tooltip content={actionLabel}>
          <button
            type="button"
            onClick={action}
            aria-label={actionLabel}
            className="rounded-sm p-0.5 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          >
            <Plus className="size-3.5" aria-hidden />
          </button>
        </Tooltip>
      </div>
      <ul className="space-y-0.5">{children}</ul>
    </div>
  );
}

/**
 * Channels and direct messages in one rail, the way Slack does it.
 *
 * One list rather than two screens: the question "where was that conversation"
 * has one answer, and splitting rooms from people means checking two places
 * for the same thing.
 */
export function ConversationRail({
  conversations, activeId, loading, onSelect, onCreateChannel, onStartDirect, className,
}: ConversationRailProps) {
  const [filter, setFilter] = useState('');
  const [unreadsOnly, setUnreadsOnly] = useState(false);

  const { channels, directs, totalUnread } = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const visible = conversations.filter((c) => {
      if (unreadsOnly && c.unread === 0 && c.id !== activeId) return false;
      return !q || c.name.toLowerCase().includes(q);
    });
    return {
      channels: visible.filter((c) => c.kind === 'CHANNEL'),
      directs: visible.filter((c) => c.kind === 'DIRECT'),
      totalUnread: conversations.reduce((sum, c) => sum + c.unread, 0),
    };
  }, [conversations, filter, unreadsOnly, activeId]);

  return (
    <aside className={cn('flex min-h-0 flex-col border-r border-border bg-surface-raised', className)}>
      <div className="shrink-0 space-y-2 border-b border-border p-2">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-2 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden />
          <input
            value={filter}
            onChange={(event) => setFilter(event.target.value)}
            placeholder="Find a conversation"
            aria-label="Find a conversation"
            className="w-full rounded-md border border-border bg-surface-sunken py-1.5 pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
          />
        </label>

        <button
          type="button"
          onClick={() => setUnreadsOnly((v) => !v)}
          className={cn(
            'flex w-full items-center justify-between rounded-md px-2 py-1 text-[0.6875rem] font-medium transition-colors duration-fast',
            unreadsOnly ? 'bg-primary text-primary-foreground' : 'text-muted-foreground hover:bg-surface-sunken',
          )}
        >
          Unreads only
          {totalUnread > 0 ? <span className="tabular-nums">{totalUnread}</span> : null}
        </button>
      </div>

      <nav className="min-h-0 flex-1 overflow-y-auto px-1.5 pb-3" aria-label="Conversations">
        {loading ? (
          <div className="flex items-center justify-center gap-2 py-10 text-xs text-muted-foreground">
            <Spinner className="size-3.5" /> Loading…
          </div>
        ) : (
          <>
            <Section title="Channels" action={onCreateChannel} actionLabel="Create a channel">
              {channels.length === 0 ? (
                <li className="px-2 py-1.5 text-xs text-muted-foreground">No channels</li>
              ) : (
                channels.map((c) => (
                  <ConversationRow key={c.id} conversation={c} active={c.id === activeId} onSelect={() => onSelect(c)} />
                ))
              )}
            </Section>

            <Section title="Direct messages" action={onStartDirect} actionLabel="Message someone">
              {directs.length === 0 ? (
                <li className="flex items-center gap-1.5 px-2 py-1.5 text-xs text-muted-foreground">
                  <UserRound className="size-3.5" aria-hidden /> Nobody yet
                </li>
              ) : (
                directs.map((c) => (
                  <ConversationRow key={c.id} conversation={c} active={c.id === activeId} onSelect={() => onSelect(c)} />
                ))
              )}
            </Section>
          </>
        )}
      </nav>
    </aside>
  );
}
