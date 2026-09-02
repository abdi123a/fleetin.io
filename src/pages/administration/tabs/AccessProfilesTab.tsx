import { SheetHeading } from '@/components/common';
import { useMemo, useState } from 'react';

import { Button, Input, Sheet, SheetContent, SheetDescription, SheetTitle, Spinner, Textarea, useConfirm } from '@/design-system';
import { AlertTriangle, Key, Layers, Lock, Pencil, Plus, ShieldCheck, Trash2, Users } from '@/design-system/icons';
import {
  fromGrants,
  permissionLabel,
  toGrants,
  useAccessProfiles,
  useCreateAccessProfile,
  useDeleteAccessProfile,
  usePermissionCatalog,
  useUpdateAccessProfile,
  type AccessProfile,
} from '@/features/access';
import { PermissionMatrix, PermissionMatrixLocked } from '../components/PermissionMatrix';
import { toProfileName } from '../components/useAccessDraft';
import { ErrorBlock, LoadingBlock } from './UsersTab';

/**
 * The access profiles themselves.
 *
 * Built-in profiles are shown but not editable — `PermissionsGuard`, the login
 * scoping and the HR module all read them by name, so an admin who "tidied up"
 * SHIPPER would break every shipper portal account rather than change a label.
 * Custom profiles created from the new-user flow land here, where they can be
 * inspected, retuned and retired.
 */
export function AccessProfilesTab() {
  const catalog = usePermissionCatalog();
  const profiles = useAccessProfiles();
  const deleteProfile = useDeleteAccessProfile();
  const { confirm, confirmDialog } = useConfirm();

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<AccessProfile | null>(null);
  const [error, setError] = useState<string | null>(null);

  const [system, custom] = useMemo(() => {
    const list = profiles.data ?? [];
    return [list.filter((p) => p.isSystem), list.filter((p) => !p.isSystem)];
  }, [profiles.data]);

  if (catalog.isLoading || profiles.isLoading) return <LoadingBlock />;
  if (catalog.isError || profiles.isError || !catalog.data) {
    return <ErrorBlock message="The permission catalogue could not be loaded." />;
  }

  const remove = async (profile: AccessProfile) => {
    const ok = await confirm({
      title: `Delete ${profile.name}?`,
      description:
        profile.userCount > 0
          ? `${profile.userCount} account(s) still hold this profile. They must be moved first.`
          : 'The profile is removed. Nothing else changes.',
      confirmLabel: 'Delete profile',
    });
    if (!ok) return;
    try {
      setError(null);
      await deleteProfile.mutateAsync(profile.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The profile could not be deleted.');
    }
  };

  return (
    <div className="space-y-5">
      {error && (
        <p className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive-subtle px-3 py-2 text-xs text-destructive-subtle-foreground">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground">
          {catalog.data.total} permissions exist across{' '}
          {catalog.data.resources.length} modules. A profile is a named subset of them.
        </p>
        <Button
          variant="primary"
          size="sm"
          shape="pill"
          onClick={() => {
            setEditing(null);
            setOpen(true);
          }}
          leadingIcon={<Plus className="h-3.5 w-3.5" />}
        >
          New Profile
        </Button>
      </div>

      <Group
        title="Custom profiles"
        blurb="Created here or from the new-user flow. Editable."
        empty="None yet — build one with New Profile, or choose Custom access while creating a user."
        profiles={custom}
        total={catalog.data.total}
        onEdit={(profile) => {
          setEditing(profile);
          setOpen(true);
        }}
        onDelete={remove}
      />

      <Group
        title="Built-in profiles"
        blurb="Shipped with the platform and referenced by name in code. Assignable, not editable."
        profiles={system}
        total={catalog.data.total}
        onEdit={(profile) => {
          setEditing(profile);
          setOpen(true);
        }}
      />

      <ProfileSheet
        open={open}
        onOpenChange={setOpen}
        catalog={catalog.data}
        profile={editing}
      />
      {confirmDialog}
    </div>
  );
}

function Group({
  title,
  blurb,
  empty,
  profiles,
  total,
  onEdit,
  onDelete,
}: {
  title: string;
  blurb: string;
  empty?: string;
  profiles: AccessProfile[];
  total: number;
  onEdit: (profile: AccessProfile) => void;
  onDelete?: (profile: AccessProfile) => void;
}) {
  return (
    <section className="space-y-2.5">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
        <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</h3>
        <p className="text-2xs text-muted-foreground">{blurb}</p>
      </div>

      {profiles.length === 0 ? (
        <p className="rounded-card border border-dashed border-border bg-card px-4 py-6 text-center text-xs text-muted-foreground">
          {empty}
        </p>
      ) : (
        <div className="grid grid-cols-1 gap-2.5 lg:grid-cols-2">
          {profiles.map((profile) => (
            <article
              key={profile.id}
              className="flex flex-col gap-2.5 rounded-card border border-border bg-card p-4"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h4 className="flex items-center gap-1.5 text-sm font-bold text-foreground">
                    {profile.isSystem ? (
                      <Lock className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    ) : (
                      <Key className="h-3.5 w-3.5 shrink-0 text-primary" />
                    )}
                    {profile.name}
                  </h4>
                  <p className="mt-0.5 line-clamp-2 text-2xs leading-relaxed text-muted-foreground">
                    {profile.description ?? 'No description.'}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="pill"
                    onClick={() => onEdit(profile)}
                    className="text-xs text-muted-foreground hover:text-primary"
                    leadingIcon={profile.isSystem ? undefined : <Pencil className="h-3 w-3" />}
                  >
                    {profile.isSystem ? 'View' : 'Edit'}
                  </Button>
                  {onDelete && (
                    <Button
                      variant="ghost"
                      size="sm"
                      shape="pill"
                      onClick={() => onDelete(profile)}
                      className="text-muted-foreground hover:text-destructive"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t border-border/50 pt-2.5 text-2xs">
                <span className="flex items-center gap-1.5 font-semibold text-primary">
                  <Layers className="h-3 w-3" />
                  {profile.isSuperuser ? 'Everything' : `${profile.grantCount} of ${total} permissions`}
                </span>
                <span className="flex items-center gap-1.5 text-muted-foreground">
                  <Users className="h-3 w-3" />
                  {profile.userCount} {profile.userCount === 1 ? 'holder' : 'holders'}
                </span>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function ProfileSheet({
  open,
  onOpenChange,
  catalog,
  profile,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: NonNullable<ReturnType<typeof usePermissionCatalog>['data']>;
  profile: AccessProfile | null;
}) {
  const isEdit = Boolean(profile);
  const locked = Boolean(profile?.isSystem);

  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  const createProfile = useCreateAccessProfile();
  const updateProfile = useUpdateAccessProfile();
  const busy = createProfile.isPending || updateProfile.isPending;

  /* Sync on open rather than in an effect: the sheet is remounted per record
     by its key in practice, and this keeps the reset visible where it is
     read. */
  const key = open ? (profile?.id ?? 'new') : null;
  if (key !== loadedFor) {
    setLoadedFor(key);
    setError(null);
    setName(profile?.name ?? '');
    setDescription(profile?.description ?? '');
    setSelected(profile ? fromGrants(catalog, profile.permissions) : new Set());
  }

  const grants = toGrants(catalog, selected);
  const count = catalog.resources.reduce(
    (sum, entry) => sum + entry.permissions.filter((p) => selected.has(p)).length,
    0,
  );

  const save = async () => {
    setError(null);
    try {
      if (isEdit && profile) {
        await updateProfile.mutateAsync({
          id: profile.id,
          payload: { description: description || undefined, permissions: grants },
        });
      } else {
        await createProfile.mutateAsync({
          name: toProfileName(name),
          description: description || undefined,
          permissions: grants,
        });
      }
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The profile could not be saved.');
    }
  };

  const problem = locked
    ? null
    : count === 0
      ? 'Tick at least one permission.'
      : !isEdit && !toProfileName(name)
        ? 'Name the profile.'
        : null;

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-3xl"
      >
        <SheetHeading
          titleComponent={SheetTitle}
          descriptionComponent={SheetDescription}
          title={<>
            <ShieldCheck className="h-5 w-5 text-primary" />
            {profile ? profile.name : 'New Access Profile'}
          </>}
          description={locked
            ? 'A built-in profile. Shown so you can see exactly what it grants.'
            : 'A named set of permissions that accounts can be assigned to.'}
        />

        <div className="flex-1 space-y-4 overflow-y-auto px-6 py-5">
          {!locked && (
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <label className="space-y-1">
                <span className="text-xs font-semibold text-foreground">Profile name</span>
                <Input
                  inputSize="sm"
                  value={name}
                  disabled={isEdit}
                  onChange={(e) => setName(toProfileName(e.target.value))}
                  placeholder="YARD_SUPERVISOR"
                />
                {isEdit && (
                  <span className="block text-2xs text-muted-foreground">
                    The name is what accounts point at, so it stays fixed.
                  </span>
                )}
              </label>
              <label className="space-y-1">
                <span className="text-xs font-semibold text-foreground">What is it for?</span>
                <Textarea
                  rows={2}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className="text-xs"
                  placeholder="Runs the yard: reads shipments, closes empty returns."
                />
              </label>
            </div>
          )}

          <div className="rounded-card border border-primary/25 bg-primary-subtle px-3.5 py-2.5">
            <p className="text-sm font-bold text-primary-subtle-foreground">
              {profile?.isSuperuser
                ? 'Every permission in the system'
                : `${count} of ${catalog.total} permissions`}
            </p>
            {selected.size > 0 && (
              <p className="mt-0.5 line-clamp-1 text-2xs text-muted-foreground">
                {grants.slice(0, 6).map(permissionLabel).join(', ')}
                {grants.length > 6 && ` +${grants.length - 6} more`}
              </p>
            )}
          </div>

          {locked ? (
            <PermissionMatrixLocked>
              <PermissionMatrix catalog={catalog} selected={selected} onChange={() => {}} readOnly />
            </PermissionMatrixLocked>
          ) : (
            <PermissionMatrix catalog={catalog} selected={selected} onChange={setSelected} />
          )}
        </div>

        <div className="shrink-0 space-y-2 border-t border-border/40 bg-card px-6 py-4">
          {error && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive-subtle px-3 py-2 text-xs text-destructive-subtle-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xs text-muted-foreground">{problem ?? ''}</p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" shape="pill" onClick={() => onOpenChange(false)}>
                {locked ? 'Close' : 'Cancel'}
              </Button>
              {!locked && (
                <Button
                  variant="primary"
                  size="sm"
                  shape="pill"
                  onClick={save}
                  disabled={busy || Boolean(problem)}
                  leadingIcon={busy ? <Spinner size="sm" /> : undefined}
                >
                  {isEdit ? 'Save profile' : 'Create profile'}
                </Button>
              )}
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
