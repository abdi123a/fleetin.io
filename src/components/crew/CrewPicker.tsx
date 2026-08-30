import * as Popover from '@radix-ui/react-popover';
import { useMemo, useState, type ReactNode } from 'react';

import { Avatar, Spinner } from '@/design-system';
import { Check, Search } from '@/design-system/icons';
import { useTeam, type TeamMember } from '@/features/team';
import { useAuthStore } from '@/stores';
import { cn } from '@/utils';

/**
 * Who is on this shipment — the picker behind the crew stack.
 *
 * Presentation only: it holds no shipment and saves nothing. The overview page
 * hands its `onChange` to a mutation and the create wizard hands it to form
 * state, which is the only reason the same control can sit in both places —
 * one of which has no shipment to save against yet.
 *
 * The list is the *team*, not the account directory: `useTeam` already drops
 * the shipper and transporter portal logins, so a customer can never end up
 * with their face on one of our jobs.
 */

export interface CrewPickerProps {
  /** Selected user ids, crew order — the first is the lead unless `leadUserId` says otherwise. */
  value: string[];
  leadUserId?: string;
  onChange: (userIds: string[], leadUserId: string | undefined) => void;
  /** The stack, or whatever else opens it. */
  children: ReactNode;
  align?: 'start' | 'center' | 'end';
  side?: 'top' | 'right' | 'bottom' | 'left';
  /** Disables every control while a save is in flight. */
  busy?: boolean;
}

/** `OPERATIONS` / `HR_ADMIN` are permission keys; this is prose. */
function titleCaseRole(role: string | null | undefined) {
  if (!role) return '';
  return role
    .toLowerCase()
    .split(/[_\s]+/)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function CrewPicker({
  value,
  leadUserId,
  onChange,
  children,
  align = 'end',
  side = 'bottom',
  busy = false,
}: CrewPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const { data: team, isLoading } = useTeam();
  const currentUserId = useAuthStore((s) => s.user?.id);

  const lead = leadUserId ?? value[0];

  /**
   * Crew first, then everyone else — but the order is frozen for as long as
   * the popover is open. Re-sorting on every tick would slide the next name
   * under the cursor the instant you selected one, so the second click lands
   * on somebody you did not mean to add.
   */
  const ordered = useMemo(() => {
    const members = team ?? [];
    const rank = new Map(value.map((id, index) => [id, index]));
    return [...members].sort((a, b) => {
      const aRank = rank.get(a.id) ?? Number.MAX_SAFE_INTEGER;
      const bRank = rank.get(b.id) ?? Number.MAX_SAFE_INTEGER;
      if (aRank !== bRank) return aRank - bRank;
      return a.fullName.localeCompare(b.fullName);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [team, open]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return ordered;
    return ordered.filter((member) =>
      `${member.fullName} ${titleCaseRole(member.roleName)}`.toLowerCase().includes(needle),
    );
  }, [ordered, query]);

  const toggle = (member: TeamMember) => {
    if (value.includes(member.id)) {
      const next = value.filter((id) => id !== member.id);
      // Taking the lead off the job hands point to whoever is left, rather
      // than leaving a crew with nobody to call.
      onChange(next, lead === member.id ? next[0] : lead);
      return;
    }
    onChange([...value, member.id], lead ?? member.id);
  };

  const makeLead = (member: TeamMember) => onChange(value, member.id);

  const me = (team ?? []).find((member) => member.id === currentUserId);
  const canTakeIt = me && !value.includes(me.id);

  return (
    <Popover.Root
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) setQuery('');
      }}
    >
      <Popover.Trigger asChild>{children}</Popover.Trigger>

      <Popover.Portal>
        <Popover.Content
          align={align}
          side={side}
          sideOffset={8}
          className="z-popover w-80 overflow-hidden rounded-md border border-border bg-surface shadow-md animate-zoom-in focus:outline-none"
        >
          <div className="border-b border-border/60 p-1.5">
            <div className="relative">
              <Search
                className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                aria-hidden
              />
              <input
                autoFocus
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Search the team…"
                className="h-8 w-full rounded-sm border border-transparent bg-surface-sunken pl-7 pr-2 text-xs text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none"
              />
            </div>
          </div>

          {/* Taking a job yourself is the single most common assignment there
              is, and hunting for your own name in a list of colleagues to do
              it is a strange way to spend a click. */}
          {canTakeIt && !query && (
            <button
              type="button"
              disabled={busy}
              onClick={() => toggle(me)}
              className="flex w-full items-center gap-2 border-b border-border/60 px-2.5 py-2 text-left text-xs font-semibold text-primary transition-colors hover:bg-surface-hover disabled:opacity-60"
            >
              <Avatar size="xs" name={me.fullName} src={me.avatarUrl ?? undefined} />
              Assign to me
            </button>
          )}

          <div
            className="max-h-72 overflow-y-auto p-1"
            onWheel={(event) => {
              // A Popover portals to <body>, outside the scroll-lock a parent
              // Dialog/Sheet applies — the lock eats the wheel event before it
              // reaches the list, so the list scrolls itself. Same reason as
              // Combobox; the crew picker lives inside the create wizard,
              // which is exactly such a Dialog.
              event.currentTarget.scrollTop += event.deltaY;
            }}
          >
            {isLoading && (
              <div className="flex justify-center py-6">
                <Spinner size="sm" />
              </div>
            )}

            {!isLoading && filtered.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">No matches</p>
            )}

            {filtered.map((member) => {
              const isOn = value.includes(member.id);
              const isLead = isOn && lead === member.id;
              return (
                <div
                  key={member.id}
                  className={cn(
                    'group flex items-center gap-2.5 rounded-sm px-2 py-1.5 transition-colors',
                    isOn ? 'bg-primary-subtle/50' : 'hover:bg-surface-hover',
                  )}
                >
                  <button
                    type="button"
                    disabled={busy}
                    onClick={() => toggle(member)}
                    className="flex min-w-0 flex-1 items-center gap-2.5 text-left disabled:opacity-60"
                  >
                    <Avatar
                      size="sm"
                      name={member.fullName}
                      src={member.avatarUrl ?? undefined}
                      className={cn(isLead && 'ring-2 ring-primary')}
                    />
                    <span className="min-w-0">
                      <span className="block truncate text-xs font-semibold text-foreground">
                        {member.fullName}
                      </span>
                      <span className="block truncate text-[11px] text-muted-foreground">
                        {titleCaseRole(member.roleName)}
                      </span>
                    </span>
                  </button>

                  {/* Point is only a question once there are two people to
                      choose between — a crew of one has an obvious answer and
                      does not need a control for it. */}
                  {isOn && value.length > 1 && (
                    isLead ? (
                      <span className="shrink-0 rounded-sm bg-primary px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-primary-foreground">
                        Lead
                      </span>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        onClick={() => makeLead(member)}
                        className="shrink-0 rounded-sm px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-[0.06em] text-muted-foreground opacity-0 transition-opacity hover:text-primary focus-visible:opacity-100 group-hover:opacity-100 disabled:opacity-60"
                      >
                        Make lead
                      </button>
                    )
                  )}

                  {isOn && (
                    <Check className="size-3.5 shrink-0 text-primary" aria-hidden />
                  )}
                </div>
              );
            })}
          </div>
        </Popover.Content>
      </Popover.Portal>
    </Popover.Root>
  );
}
