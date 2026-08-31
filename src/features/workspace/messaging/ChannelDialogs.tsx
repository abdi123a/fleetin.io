import { useEffect, useState } from 'react';

import { CrewPicker, CrewStack } from '@/components/crew';
import {
  Button, Dialog, DialogBody, DialogContent, DialogHeader, Input, Spinner, Switch,
} from '@/design-system';
import { Lock, Search } from '@/design-system/icons';
import { useTeam } from '@/features/team';
import { resolveAssetUrl } from '@/services/api.client';
import { useAuthStore } from '@/stores';
import { cn } from '@/utils';
import { Avatar } from '@/design-system';

import { useCreateChannel, useOpenDirectMessage, useSetChannelMembers } from '../api/queries';
import type { Conversation } from '../contracts';

/* ── Create a channel ────────────────────────────────────────────────────── */

export function CreateChannelDialog({
  open, onOpenChange, onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated?: (channelId: string) => void;
}) {
  const create = useCreateChannel();
  const [name, setName] = useState('');
  const [topic, setTopic] = useState('');
  const [isPrivate, setIsPrivate] = useState(false);
  const [memberIds, setMemberIds] = useState<string[]>([]);
  const { data: team = [] } = useTeam();

  useEffect(() => {
    if (!open) { setName(''); setTopic(''); setIsPrivate(false); setMemberIds([]); }
  }, [open]);

  const chosen = team.filter((m) => memberIds.includes(m.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader title="Create a channel" />
        <DialogBody className="space-y-4">
          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">Name</span>
            <div className="flex items-center gap-2 rounded-md border border-border bg-surface-raised px-2.5 focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-ring">
              <span className="text-sm font-bold text-muted-foreground" aria-hidden>#</span>
              <input
                value={name}
                autoFocus
                placeholder="empty-returns"
                onChange={(event) => setName(event.target.value)}
                className="h-9 flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
              />
            </div>
          </label>

          <label className="block">
            <span className="mb-1.5 block text-xs font-medium text-foreground">What is it for?</span>
            <Input value={topic} placeholder="Optional" onChange={(event) => setTopic(event.target.value)} />
          </label>

          <div className="rounded-card border border-border px-3 py-2.5">
            <Switch
              checked={isPrivate}
              onChange={(event) => setIsPrivate(event.target.checked)}
              label={
                <span className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                  <Lock className="size-3.5" aria-hidden /> Private
                </span>
              }
              description="Invisible to everyone except its members — not merely read-only to them."
            />
          </div>

          <div>
            <span className="mb-1.5 block text-xs font-medium text-foreground">Members</span>
            <CrewPicker value={memberIds} onChange={(ids) => setMemberIds(ids)}>
              <button
                type="button"
                className="flex min-h-10 w-full items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-1.5 text-left transition-colors duration-fast hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {chosen.length > 0 ? (
                  <>
                    <CrewStack
                      size="xs"
                      crew={chosen.map((m) => ({ id: m.id, fullName: m.fullName, avatarUrl: m.avatarUrl }))}
                    />
                    <span className="text-sm text-foreground">{chosen.length} added</span>
                  </>
                ) : (
                  <span className="text-sm text-muted-foreground">Just me for now</span>
                )}
              </button>
            </CrewPicker>
          </div>

          {create.isError ? (
            <p className="rounded-sm bg-destructive-subtle px-3 py-2 text-xs text-destructive">
              {(create.error as Error)?.message ?? 'Could not create that channel.'}
            </p>
          ) : null}
        </DialogBody>

        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            shape="pill"
            disabled={!name.trim() || create.isPending}
            leadingIcon={create.isPending ? <Spinner className="size-3.5" /> : undefined}
            onClick={() =>
              create.mutate(
                { name: name.trim(), topic: topic.trim() || undefined, isPrivate, memberIds },
                { onSuccess: (channel) => { onOpenChange(false); onCreated?.(channel.id); } },
              )
            }
          >
            Create
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/* ── Start a direct message ──────────────────────────────────────────────── */

export function StartDirectDialog({
  open, onOpenChange, onOpened,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onOpened?: (channelId: string) => void;
}) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const { data: team = [], isLoading } = useTeam();
  const openDm = useOpenDirectMessage();
  const [filter, setFilter] = useState('');

  useEffect(() => { if (!open) setFilter(''); }, [open]);

  const q = filter.trim().toLowerCase();
  const people = team
    .filter((m) => m.id !== currentUserId)
    .filter((m) => !q || m.fullName.toLowerCase().includes(q) || m.email.toLowerCase().includes(q));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader title="Message someone" />
        <DialogBody className="space-y-3">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
            <input
              value={filter}
              autoFocus
              onChange={(event) => setFilter(event.target.value)}
              placeholder="Search the team"
              aria-label="Search the team"
              className="h-10 w-full rounded-md border border-border bg-surface-raised pl-8 pr-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
            />
          </label>

          {isLoading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-xs text-muted-foreground">
              <Spinner className="size-3.5" /> Loading the team…
            </div>
          ) : people.length === 0 ? (
            <p className="py-8 text-center text-sm text-muted-foreground">Nobody matches “{filter}”.</p>
          ) : (
            <ul className="max-h-72 space-y-0.5 overflow-y-auto">
              {people.map((person) => (
                <li key={person.id}>
                  <button
                    type="button"
                    disabled={openDm.isPending}
                    onClick={() =>
                      openDm.mutate(person.id, {
                        onSuccess: (channel) => { onOpenChange(false); onOpened?.(channel.id); },
                      })
                    }
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-md px-2 py-1.5 text-left transition-colors duration-fast',
                      'hover:bg-surface-sunken focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring',
                    )}
                  >
                    <Avatar size="xs" name={person.fullName} src={resolveAssetUrl(person.avatarUrl ?? undefined)} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-foreground">{person.fullName}</span>
                      {person.roleName ? (
                        <span className="block truncate text-[0.6875rem] text-muted-foreground">{person.roleName}</span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}

/* ── Manage a channel's members ──────────────────────────────────────────── */

export function ChannelMembersDialog({
  open, onOpenChange, conversation,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  conversation: Conversation | null;
}) {
  const setMembers = useSetChannelMembers();
  const { data: team = [] } = useTeam();
  const [ids, setIds] = useState<string[]>([]);

  useEffect(() => {
    if (open && conversation) setIds(conversation.members.map((m) => m.id));
  }, [open, conversation]);

  if (!conversation) return null;
  const chosen = team.filter((m) => ids.includes(m.id));

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader title={`Members of #${conversation.name}`} />
        <DialogBody className="space-y-3">
          <CrewPicker value={ids} onChange={(next) => setIds(next)}>
            <button
              type="button"
              className="flex min-h-12 w-full items-center gap-2 rounded-md border border-border bg-surface-raised px-3 py-2 text-left transition-colors duration-fast hover:bg-surface-sunken"
            >
              {chosen.length > 0 ? (
                <>
                  <CrewStack
                    size="xs"
                    max={6}
                    crew={chosen.map((m) => ({ id: m.id, fullName: m.fullName, avatarUrl: m.avatarUrl }))}
                  />
                  <span className="text-sm text-foreground">{chosen.length} member{chosen.length === 1 ? '' : 's'}</span>
                </>
              ) : (
                <span className="text-sm text-muted-foreground">Nobody — add somebody</span>
              )}
            </button>
          </CrewPicker>
          <p className="text-[0.6875rem] text-muted-foreground">
            Removing somebody clears how far they had read, so they see what they missed if they come back.
          </p>
        </DialogBody>
        <div className="flex items-center justify-end gap-2 border-t border-border px-5 py-3">
          <Button variant="ghost" size="sm" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button
            size="sm"
            shape="pill"
            disabled={setMembers.isPending}
            leadingIcon={setMembers.isPending ? <Spinner className="size-3.5" /> : undefined}
            onClick={() =>
              setMembers.mutate(
                { id: conversation.id, memberIds: ids },
                { onSuccess: () => onOpenChange(false) },
              )
            }
          >
            Save
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
