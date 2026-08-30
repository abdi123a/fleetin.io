import { useState } from 'react';

import { Avatar, Tooltip } from '@/design-system';
import { Check, CornerDownLeft, Pencil, Trash2, UserPlus } from '@/design-system/icons';
import { CrewPicker } from '@/components/crew';
import { resolveAssetUrl } from '@/services/api.client';
import { useAuthStore } from '@/stores';
import { cn, formatRelativeTime } from '@/utils';

import type { WorkspaceMessage } from '../contracts';
import { Composer } from '../composer/Composer';
import { MessageBody } from '../composer/MessageBody';

export interface MessageRowProps {
  message: WorkspaceMessage;
  replies?: WorkspaceMessage[];
  onReply?: (parentId: string) => void;
  onEdit: (id: string, body: string) => void;
  onWithdraw: (id: string) => void;
  onAssign: (id: string, assigneeId: string | null) => void;
  onResolve: (id: string, resolved: boolean) => void;
  busy?: boolean;
  /** Replies render without their own reply affordance — one level, never two. */
  nested?: boolean;
}

function fullName(person: { firstName: string; lastName: string }) {
  return `${person.firstName} ${person.lastName}`.trim();
}

/**
 * One message, and the assigned-comment mechanic built on top of it.
 *
 * ClickUp pitches its assigned comment as *"for when a task is too much"*, and
 * that is exactly the case this serves: "@Ahmed this driver is missing his
 * licence" needs an owner, but demanding a title, a due date and a priority
 * for it is what stops somebody writing it down at all.
 *
 * So an assigned message wears a rail down its left edge, a header naming who
 * owes it and who asked, and a Resolve box. It reaches the assignee's Inbox
 * beside real tasks, because to the person who owes it there is no difference.
 */
export function MessageRow({
  message, replies = [], onReply, onEdit, onWithdraw, onAssign, onResolve, busy, nested = false,
}: MessageRowProps) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(message.body);

  const isAuthor = currentUserId === message.author.id;
  const assignee = message.assignee ?? null;
  const assigned = assignee !== null;
  const resolved = Boolean(message.resolvedAt);
  const assignedToMe = message.assignee?.id === currentUserId;

  if (message.deletedAt) {
    return (
      <div className="px-3 py-2 text-xs italic text-muted-foreground">
        {fullName(message.author)} withdrew a message
      </div>
    );
  }

  return (
    <article
      className={cn(
        'group/message rounded-card border transition-colors duration-fast',
        assigned && !resolved
          ? 'border-l-2 border-l-primary border-border bg-surface-raised'
          : 'border-transparent hover:border-border',
        resolved && 'opacity-70',
        nested && 'ml-7',
      )}
    >
      {/* The assigned-comment header: what is owed, by whom, to whom. */}
      {assignee ? (
        <header className="flex flex-wrap items-center justify-between gap-2 border-b border-border px-3 py-1.5">
          <label className="flex cursor-pointer items-center gap-2 text-xs font-medium text-foreground">
            <input
              type="checkbox"
              checked={resolved}
              disabled={busy}
              onChange={(event) => onResolve(message.id, event.target.checked)}
              className="size-3.5 rounded-sm border-border accent-[var(--primary)]"
            />
            {resolved ? 'Resolved' : 'Resolve'}
          </label>
          <span className="text-[0.6875rem] text-muted-foreground">
            Assigned to{' '}
            <span className="font-medium text-foreground">
              {assignedToMe ? 'me' : fullName(assignee)}
            </span>
            {message.assignedBy ? <> by {fullName(message.assignedBy)}</> : null}
          </span>
        </header>
      ) : null}

      <div className="flex gap-2.5 px-3 py-2.5">
        <Avatar
          size="xs"
          name={fullName(message.author)}
          src={resolveAssetUrl(message.author.avatarUrl ?? undefined)}
          className="mt-0.5 shrink-0"
        />

        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-xs font-semibold text-foreground">{fullName(message.author)}</span>
            <time className="text-[0.6875rem] text-muted-foreground" dateTime={message.createdAt}>
              {formatRelativeTime(message.createdAt)}
            </time>
            {message.editedAt ? <span className="text-[0.6875rem] text-muted-foreground">edited</span> : null}
          </div>

          {editing ? (
            <div className="mt-2">
              <Composer
                value={draft}
                onChange={setDraft}
                busy={busy}
                rows={2}
                autoFocus
                onSubmit={() => {
                  onEdit(message.id, draft);
                  setEditing(false);
                }}
              />
            </div>
          ) : (
            <MessageBody body={message.body} currentUserId={currentUserId} className="mt-0.5" />
          )}

          <div className="mt-1.5 flex items-center gap-1">
            {onReply && !nested ? (
              <button
                type="button"
                onClick={() => onReply(message.id)}
                className="inline-flex items-center gap-1 rounded-sm px-1.5 py-0.5 text-[0.6875rem] text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground"
              >
                <CornerDownLeft className="size-3" aria-hidden /> Reply
              </button>
            ) : null}

            {/* Actions appear on hover, and stay put for keyboard users. */}
            <div className="ml-auto flex items-center gap-0.5 opacity-0 transition-opacity duration-fast focus-within:opacity-100 group-hover/message:opacity-100">
              <CrewPicker
                value={message.assignee ? [message.assignee.id] : []}
                busy={busy}
                align="end"
                onChange={(ids) => onAssign(message.id, ids.at(-1) ?? null)}
              >
                <button
                  type="button"
                  aria-label={assigned ? 'Reassign this comment' : 'Assign this comment'}
                  className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
                >
                  <UserPlus className="size-3.5" aria-hidden />
                </button>
              </CrewPicker>

              {assigned ? (
                <Tooltip content={resolved ? 'Reopen' : 'Resolve'}>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => onResolve(message.id, !resolved)}
                    aria-label={resolved ? 'Reopen this comment' : 'Resolve this comment'}
                    className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground"
                  >
                    <Check className="size-3.5" aria-hidden />
                  </button>
                </Tooltip>
              ) : null}

              {isAuthor ? (
                <>
                  <Tooltip content="Edit">
                    <button
                      type="button"
                      onClick={() => { setDraft(message.body); setEditing((v) => !v); }}
                      aria-label="Edit this message"
                      className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                  </Tooltip>
                  <Tooltip content="Withdraw">
                    <button
                      type="button"
                      disabled={busy}
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
          </div>

          {replies.length > 0 ? (
            <div className="mt-2 space-y-1 border-l border-border pl-3">
              {replies.map((reply) => (
                <MessageRow
                  key={reply.id}
                  message={reply}
                  nested
                  busy={busy}
                  onEdit={onEdit}
                  onWithdraw={onWithdraw}
                  onAssign={onAssign}
                  onResolve={onResolve}
                />
              ))}
            </div>
          ) : null}
        </div>
      </div>
    </article>
  );
}
