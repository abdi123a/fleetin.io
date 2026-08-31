import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';

import { Spinner, useConfirm } from '@/design-system';
import { ArrowLeft, MessageSquare, Search, X } from '@/design-system/icons';
import { buildPath, ROUTES } from '@/config/routes';
import {
  ChannelHeader, ChannelMembersDialog, ChannelMessageList, ConversationRail,
  CreateChannelDialog, StartDirectDialog, ThreadPanel,
  Composer, MessageBody,
  useAssignMessage, useChannelMessages, useConversations, useEditMessage,
  useMarkChannelReadOnView, useMessageSearch, usePostMessage, useWithdrawMessage,
  type ChannelMessage, type Conversation,
} from '@/features/workspace';
import { cn, formatRelativeTime } from '@/utils';

/**
 * Messages — the conversation rail and whatever is open beside it.
 *
 * One screen, three panes at desk width: rail, conversation, thread. Below
 * `lg` the rail becomes the whole screen until something is picked, and the
 * thread becomes a full-height overlay — a three-pane layout squeezed onto a
 * phone gives all three panes too little to be useful.
 */
export function WorkspaceMessagesPage() {
  const { channelId } = useParams<{ channelId: string }>();
  const navigate = useNavigate();

  const { data: conversations = [], isLoading: railLoading } = useConversations();
  const { data: page, isLoading: riverLoading } = useChannelMessages(channelId);

  const [threadFor, setThreadFor] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [starting, setStarting] = useState(false);
  const [managing, setManaging] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState('');
  const [draft, setDraft] = useState('');

  const post = usePostMessage();
  const edit = useEditMessage();
  const withdraw = useWithdrawMessage();
  const assign = useAssignMessage();
  const { confirm, confirmDialog } = useConfirm();
  const { data: hits = [], isFetching: searchBusy } = useMessageSearch({ q: query, limit: 40 }, searching);

  const active = useMemo<Conversation | null>(
    () => conversations.find((c) => c.id === channelId) ?? null,
    [conversations, channelId],
  );
  const messages = page?.items ?? [];
  const newest = messages.at(-1)?.id;

  /* Opening a room reads it, and so does every message that lands while it is
     on screen — otherwise a badge accrues for messages the reader can see. */
  useMarkChannelReadOnView(channelId, newest);

  /* Leaving a conversation closes its thread; a panel outliving its channel
     shows a conversation from the room you just left. */
  useEffect(() => { setThreadFor(null); setDraft(''); }, [channelId]);

  const open = (conversation: Conversation) =>
    navigate(buildPath(ROUTES.workspaceChannel, { channelId: conversation.id }));

  /* `body` arrives already materialised — the display names on screen swapped
     back to storage tokens. Never send `draft`. */
  function send(body: string) {
    if (!body.trim() || !channelId) return;
    post.mutate({ body, channelId }, { onSuccess: () => setDraft('') });
  }

  async function handleWithdraw(id: string) {
    const ok = await confirm({
      title: 'Withdraw this message?',
      description: 'It stays in place as a tombstone so the conversation around it still reads.',
      confirmLabel: 'Withdraw',
      destructive: true,
    });
    if (ok) withdraw.mutate(id);
  }

  return (
    <div className="flex min-h-0 flex-1 overflow-hidden rounded-card border border-border bg-surface-raised">
      <ConversationRail
        conversations={conversations}
        activeId={channelId}
        loading={railLoading}
        onSelect={open}
        onCreateChannel={() => setCreating(true)}
        onStartDirect={() => setStarting(true)}
        className={cn('w-full shrink-0 lg:w-64', channelId && 'hidden lg:flex')}
      />

      <div className={cn('flex min-w-0 flex-1 flex-col', !channelId && 'hidden lg:flex')}>
        {!active ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
            <MessageSquare className="size-7 text-muted-foreground" aria-hidden />
            <p className="text-sm font-medium text-foreground">Pick a conversation</p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Channels and direct messages are on the left. Every shipment, vehicle and driver you
              mention here stays a live link.
            </p>
          </div>
        ) : (
          <>
            {/* Back to the rail — the only way out on a phone. */}
            <button
              type="button"
              onClick={() => navigate(ROUTES.workspaceMessages)}
              className="flex items-center gap-1 border-b border-border px-3 py-2 text-xs text-muted-foreground lg:hidden"
            >
              <ArrowLeft className="size-3.5" aria-hidden /> All conversations
            </button>

            <ChannelHeader
              conversation={active}
              onManageMembers={() => setManaging(true)}
              onSearch={() => setSearching((v) => !v)}
            />

            {searching ? (
              <div className="shrink-0 border-b border-border bg-surface-sunken p-2">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
                  <input
                    value={query}
                    autoFocus
                    onChange={(event) => setQuery(event.target.value)}
                    placeholder="Search messages — text, or a reference like 609196"
                    aria-label="Search messages"
                    className="h-9 w-full rounded-md border border-border bg-surface-raised pl-8 pr-8 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
                  />
                  <button
                    type="button"
                    onClick={() => { setSearching(false); setQuery(''); }}
                    aria-label="Close search"
                    className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-3.5" aria-hidden />
                  </button>
                </label>

                {query.trim() ? (
                  <div className="mt-2 max-h-64 overflow-y-auto rounded-md border border-border bg-surface-raised">
                    {searchBusy ? (
                      <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
                        <Spinner className="size-3.5" /> Searching…
                      </p>
                    ) : hits.length === 0 ? (
                      <p className="px-3 py-3 text-xs text-muted-foreground">Nothing matches “{query}”.</p>
                    ) : (
                      <ul className="divide-y divide-border">
                        {hits.map((hit) => (
                          <li key={hit.id} className="px-3 py-2">
                            <p className="text-[0.6875rem] text-muted-foreground">
                              <span className="font-semibold text-foreground">
                                {hit.author.firstName} {hit.author.lastName}
                              </span>{' '}
                              · {formatRelativeTime(hit.createdAt)}
                            </p>
                            <MessageBody body={hit.body} references={hit.references} className="line-clamp-2" />
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ) : null}
              </div>
            ) : null}

            <ChannelMessageList
              messages={messages}
              lastReadAt={active.lastReadAt}
              loading={riverLoading}
              emptyCopy={`This is the start of ${active.kind === 'DIRECT' ? active.name : `#${active.name}`}.`}
              busy={assign.isPending}
              onOpenThread={(message: ChannelMessage) => setThreadFor(message.id)}
              onEdit={(id, body) => edit.mutate({ id, body })}
              onWithdraw={handleWithdraw}
              onAssign={(id, assigneeId) => assign.mutate({ id, assigneeId })}
            />

            <div className="shrink-0 border-t border-border p-2">
              <Composer
                value={draft}
                onChange={setDraft}
                onSubmit={send}
                busy={post.isPending}
                placeholder={`Message ${active.kind === 'DIRECT' ? active.name : `#${active.name}`}`}
              />
            </div>
          </>
        )}
      </div>

      {threadFor && channelId && active ? (
        <ThreadPanel
          messageId={threadFor}
          channelId={channelId}
          channelName={active.kind === 'DIRECT' ? active.name : `#${active.name}`}
          onClose={() => setThreadFor(null)}
          className={cn(
            'w-full shrink-0 lg:w-80 xl:w-96',
            /* On a phone the thread takes the screen: three panes at 375px
               gives all three too little to read. */
            'absolute inset-0 z-10 lg:static lg:z-auto',
          )}
        />
      ) : null}

      <CreateChannelDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => navigate(buildPath(ROUTES.workspaceChannel, { channelId: id }))}
      />
      <StartDirectDialog
        open={starting}
        onOpenChange={setStarting}
        onOpened={(id) => navigate(buildPath(ROUTES.workspaceChannel, { channelId: id }))}
      />
      <ChannelMembersDialog open={managing} onOpenChange={setManaging} conversation={active} />

      {confirmDialog}
    </div>
  );
}

export default WorkspaceMessagesPage;
