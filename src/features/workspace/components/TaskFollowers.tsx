import { CrewPicker } from '@/components/crew';
import { Button, Tooltip } from '@/design-system';
import { Eye, EyeOff, UserPlus } from '@/design-system/icons';
import { useAuthStore } from '@/stores';
import { cn } from '@/utils';

import { useSetFollowers, useSetOwnFollow } from '../api/queries';
import type { TaskFollower } from '../contracts';
import { PersonAvatar } from './PersonAvatar';

export interface TaskFollowersProps {
  taskRef: string;
  followers: TaskFollower[];
  className?: string;
}

/**
 * Who is watching this without owning it.
 *
 * The third relationship, and the one that makes the single-assignee rule
 * workable: without it a manager who wants to keep sight of a job has to
 * assign it to themselves, and then nobody knows who is actually doing it.
 */
export function TaskFollowers({ taskRef, followers, className }: TaskFollowersProps) {
  const currentUserId = useAuthStore((state) => state.user?.id);
  const setFollowers = useSetFollowers();
  const own = useSetOwnFollow();

  const following = followers.some((f) => f.userId === currentUserId);
  const busy = setFollowers.isPending || own.isPending;

  return (
    <div className={cn('flex flex-wrap items-center gap-2', className)}>
      {followers.length > 0 ? (
        <span className="flex items-center -space-x-1.5">
          {followers.slice(0, 5).map((follower) => (
            <Tooltip
              key={follower.id}
              content={`${follower.user.firstName} ${follower.user.lastName}`}
            >
              <span className="ring-2 ring-surface-raised">
                <PersonAvatar person={follower.user} size="xs" />
              </span>
            </Tooltip>
          ))}
          {followers.length > 5 ? (
            <span className="flex size-6 items-center justify-center rounded-md bg-surface-sunken text-[0.625rem] font-semibold text-muted-foreground ring-2 ring-surface-raised">
              +{followers.length - 5}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="text-xs italic text-muted-foreground">Nobody following</span>
      )}

      <Button
        variant={following ? 'secondary' : 'outline'}
        size="xs"
        shape="pill"
        disabled={busy}
        onClick={() => own.mutate({ taskRef, follow: !following })}
        leadingIcon={following ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
      >
        {following ? 'Unfollow' : 'Follow'}
      </Button>

      <CrewPicker
        value={followers.map((f) => f.userId)}
        busy={busy}
        onChange={(userIds) => setFollowers.mutate({ taskRef, userIds })}
      >
        <button
          type="button"
          aria-label="Add followers"
          className="rounded-sm p-1 text-muted-foreground transition-colors duration-fast hover:bg-surface-sunken hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-ring"
        >
          <UserPlus className="size-3.5" aria-hidden />
        </button>
      </CrewPicker>
    </div>
  );
}
