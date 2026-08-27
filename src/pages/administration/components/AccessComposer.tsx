import { Input, Textarea } from '@/design-system';
import { AlertTriangle, Copy, Key, Layers, Lock, ShieldCheck } from '@/design-system/icons';
import {
  isSensitive,
  permissionLabel,
  type AccessProfile,
  type PermissionCatalog,
} from '@/features/access';
import { cn } from '@/utils';

import { PermissionMatrix } from './PermissionMatrix';
import { toProfileName, type AccessDraft } from './useAccessDraft';

/**
 * "What access is this person getting?" — answered two ways.
 *
 * Most accounts want a profile that already exists, so those come first, each
 * one stating how much it actually grants rather than only its name. Custom
 * access is the second answer, and it is deliberately a *saved profile* rather
 * than a per-user exception: the backend hangs permissions off roles, and an
 * unnamed one-off would be invisible everywhere except inside this form.
 */
export function AccessComposer({
  catalog,
  profiles,
  draft,
  subjectName,
}: {
  catalog: PermissionCatalog;
  profiles: AccessProfile[];
  draft: AccessDraft;
  /** Used to suggest a name for a custom profile. */
  subjectName?: string;
}) {
  const suggestName = () => {
    if (draft.name) return;
    const base = subjectName?.trim() ? `${subjectName} access` : 'Custom access';
    draft.setName(toProfileName(base));
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
        <ModeCard
          active={draft.mode === 'profile'}
          onClick={() => draft.setMode('profile')}
          icon={<ShieldCheck className="h-4 w-4" />}
          title="Use an access profile"
          blurb="Assign one of the profiles already defined. The usual choice."
        />
        <ModeCard
          active={draft.mode === 'custom'}
          onClick={() => {
            draft.setMode('custom');
            suggestName();
          }}
          icon={<Key className="h-4 w-4" />}
          title="Custom access"
          blurb="Pick module by module, then save it as a reusable profile."
        />
      </div>

      {draft.mode === 'profile' ? (
        <ProfileChooser catalog={catalog} profiles={profiles} draft={draft} />
      ) : (
        <CustomBuilder catalog={catalog} profiles={profiles} draft={draft} />
      )}
    </div>
  );
}

function ModeCard({
  active,
  onClick,
  icon,
  title,
  blurb,
}: {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  title: string;
  blurb: string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        'flex items-start gap-3 rounded-card border p-3.5 text-left transition-colors',
        active
          ? 'border-primary bg-primary-subtle'
          : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40',
      )}
    >
      <span
        className={cn(
          'flex h-9 w-9 shrink-0 items-center justify-center rounded-full',
          active ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground',
        )}
      >
        {icon}
      </span>
      <span className="min-w-0">
        <span className="block text-sm font-bold text-foreground">{title}</span>
        <span className="mt-0.5 block text-2xs leading-relaxed text-muted-foreground">{blurb}</span>
      </span>
    </button>
  );
}

function ProfileChooser({
  catalog,
  profiles,
  draft,
}: {
  catalog: PermissionCatalog;
  profiles: AccessProfile[];
  draft: AccessDraft;
}) {
  const chosen = profiles.find((p) => p.id === draft.profileId);

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {profiles.map((profile) => {
          const active = profile.id === draft.profileId;
          return (
            <button
              key={profile.id}
              type="button"
              aria-pressed={active}
              onClick={() => draft.setProfileId(profile.id)}
              className={cn(
                'rounded-card border p-3 text-left transition-colors',
                active
                  ? 'border-primary bg-primary-subtle'
                  : 'border-border bg-card hover:border-primary/40 hover:bg-muted/40',
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-xs font-bold tracking-wide text-foreground">
                  {profile.name}
                </span>
                {profile.isSystem ? (
                  <Lock className="h-3 w-3 shrink-0 text-muted-foreground" aria-label="Built-in" />
                ) : (
                  <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 text-[9px] font-semibold uppercase text-muted-foreground">
                    Custom
                  </span>
                )}
              </div>
              <p className="mt-1 line-clamp-2 text-2xs leading-relaxed text-muted-foreground">
                {profile.description ?? 'No description.'}
              </p>
              <p className="mt-2 flex items-center gap-1.5 text-2xs font-semibold text-primary">
                <Layers className="h-3 w-3" />
                {profile.isSuperuser
                  ? 'Everything — full control'
                  : `${profile.grantCount} of ${catalog.total} permissions`}
                <span className="font-normal text-muted-foreground">
                  · {profile.userCount} {profile.userCount === 1 ? 'user' : 'users'}
                </span>
              </p>
            </button>
          );
        })}
      </div>

      {chosen && <ProfileReview catalog={catalog} profile={chosen} />}
    </div>
  );
}

function ProfileReview({ catalog, profile }: { catalog: PermissionCatalog; profile: AccessProfile }) {
  const sensitive = profile.effectivePermissions.filter(isSensitive);

  return (
    <div className="rounded-card border border-border bg-muted/30 p-3.5">
      <p className="text-xs font-semibold text-foreground">
        {profile.name} gives this account{' '}
        <span className="text-primary">
          {profile.isSuperuser
            ? 'every permission in the system'
            : `${profile.grantCount} of ${catalog.total} permissions`}
        </span>
        .
      </p>
      {sensitive.length > 0 && (
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
          <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
          Includes {sensitive.length} sensitive:{' '}
          <span className="font-medium text-foreground">
            {sensitive.slice(0, 4).map(permissionLabel).join(', ')}
            {sensitive.length > 4 && ` +${sensitive.length - 4} more`}
          </span>
        </p>
      )}
    </div>
  );
}

function CustomBuilder({
  catalog,
  profiles,
  draft,
}: {
  catalog: PermissionCatalog;
  profiles: AccessProfile[];
  draft: AccessDraft;
}) {
  return (
    <div className="space-y-3.5">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="space-y-1">
          <span className="text-xs font-semibold text-foreground">Profile name</span>
          <Input
            inputSize="sm"
            value={draft.name}
            onChange={(e) => draft.setName(toProfileName(e.target.value))}
            placeholder="YARD_SUPERVISOR"
          />
          <span className="block text-2xs text-muted-foreground">
            Saved under this name so it can be reused and audited later.
          </span>
        </label>
        <label className="space-y-1">
          <span className="text-xs font-semibold text-foreground">What is it for?</span>
          <Textarea
            rows={2}
            value={draft.description}
            onChange={(e) => draft.setDescription(e.target.value)}
            placeholder="Runs the yard: reads shipments, closes empty returns."
            className="text-xs"
          />
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 rounded-md border border-border bg-muted/30 px-3 py-2">
        <span className="flex items-center gap-1.5 text-2xs font-semibold text-muted-foreground">
          <Copy className="h-3 w-3" />
          Start from
        </span>
        {profiles.slice(0, 6).map((profile) => (
          <button
            key={profile.id}
            type="button"
            onClick={() => draft.copyFrom(profile)}
            className="rounded-full border border-border bg-background px-2.5 py-1 text-2xs font-semibold text-foreground transition-colors hover:border-primary hover:text-primary"
          >
            {profile.name}
          </button>
        ))}
        <button
          type="button"
          onClick={draft.clear}
          className="ml-auto rounded-full px-2.5 py-1 text-2xs font-semibold text-muted-foreground transition-colors hover:text-destructive"
        >
          Clear all
        </button>
      </div>

      <AccessTally draft={draft} />

      <PermissionMatrix
        catalog={catalog}
        selected={draft.selected}
        onChange={draft.setSelected}
      />
    </div>
  );
}

/** The running answer to "how many am I giving him?". */
export function AccessTally({ draft }: { draft: AccessDraft }) {
  const { count, total, moduleCount, sensitive } = draft.summary;
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;

  return (
    <div className="sticky top-0 z-10 rounded-card border border-primary/25 bg-primary-subtle p-3.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-sm font-bold text-primary-subtle-foreground">
          Granting <span className="tabular-nums">{count}</span> of {total} permissions
        </p>
        <p className="text-2xs font-medium text-muted-foreground">
          across {moduleCount} {moduleCount === 1 ? 'module' : 'modules'} · {pct}% of the platform
        </p>
      </div>

      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-background/70">
        <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
      </div>

      {sensitive.length > 0 && (
        <p className="mt-2 flex flex-wrap items-center gap-1.5 text-2xs text-muted-foreground">
          <AlertTriangle className="h-3 w-3 shrink-0 text-warning" />
          <span className="font-semibold text-foreground">{sensitive.length} sensitive:</span>
          {sensitive.slice(0, 5).map(permissionLabel).join(', ')}
          {sensitive.length > 5 && ` +${sensitive.length - 5} more`}
        </p>
      )}
    </div>
  );
}
