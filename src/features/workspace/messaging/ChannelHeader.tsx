import { Avatar, AvatarGroup, Button, Tooltip } from '@/design-system';
import { Lock, Users } from '@/design-system/icons';
import { resolveAssetUrl } from '@/services/api.client';
import { cn } from '@/utils';

import type { Conversation } from '../contracts';

export interface ChannelHeaderProps {
  conversation: Conversation;
  onManageMembers: () => void;
  onSearch: () => void;
  canManage?: boolean;
  className?: string;
}

/**
 * Who is in this room, and what it is for.
 *
 * A channel leads with `#name`, its topic and its member faces. A DM leads
 * with the person — their face, their name and their role — because on a DM
 * "who am I talking to" is the only header question there is.
 */
export function ChannelHeader({
  conversation, onManageMembers, onSearch, canManage = true, className,
}: ChannelHeaderProps) {
  const isDirect = conversation.kind === 'DIRECT';

  return (
    <header
      className={cn(
        'flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1.5 border-b border-border bg-surface-raised px-4 py-2.5',
        className,
      )}
    >
      {isDirect ? (
        <span className="relative shrink-0">
          <Avatar
            size="sm"
            name={conversation.name}
            src={resolveAssetUrl(conversation.counterpart?.avatarUrl ?? undefined)}
          />
          <span className="absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full bg-success ring-2 ring-surface-raised" aria-hidden />
        </span>
      ) : (
        <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-primary-subtle text-primary-bold">
          {conversation.isPrivate ? (
            <Lock className="size-3.5" aria-hidden />
          ) : (
            <span className="text-sm font-bold leading-none" aria-hidden>#</span>
          )}
        </span>
      )}

      <div className="min-w-0 flex-1">
        <h2 className="truncate text-sm font-semibold text-foreground">{conversation.name}</h2>
        {conversation.topic ? (
          <p className="truncate text-xs text-muted-foreground">{conversation.topic}</p>
        ) : isDirect && conversation.counterpart ? (
          <p className="truncate text-xs text-muted-foreground">Direct message</p>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-2">
        {!isDirect ? (
          <Tooltip content={canManage ? 'Members' : `${conversation.memberCount} members`}>
            <button
              type="button"
              onClick={canManage ? onManageMembers : undefined}
              disabled={!canManage}
              className={cn(
                'flex items-center gap-1.5 rounded-full border border-border px-2 py-1 text-xs transition-colors duration-fast',
                canManage ? 'hover:border-primary hover:bg-primary-subtle' : 'cursor-default',
              )}
            >
              <AvatarGroup
                max={3}
                size="xs"
                items={conversation.members.map((m) => ({
                  name: `${m.firstName} ${m.lastName}`,
                  src: resolveAssetUrl(m.avatarUrl ?? undefined),
                }))}
              />
              <span className="tabular-nums text-muted-foreground">{conversation.memberCount}</span>
            </button>
          </Tooltip>
        ) : null}

        <Button variant="outline" size="xs" shape="pill" onClick={onSearch} leadingIcon={<Users className="h-3.5 w-3.5" />}>
          Search
        </Button>
      </div>
    </header>
  );
}
