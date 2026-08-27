import { useMemo, useState } from 'react';

import { Button, Input, Spinner, useConfirm } from '@/design-system';
import {
  AlertTriangle,
  Layers,
  Lock,
  Mail,
  Pencil,
  Phone,
  Search,
  Trash2,
  UserPlus,
  Users,
} from '@/design-system/icons';
import {
  useAccessProfiles,
  useDeleteDirectoryUser,
  useDirectoryUsers,
  usePermissionCatalog,
  type DirectoryUser,
} from '@/features/access';
import { useAuthStore } from '@/stores';
import { cn } from '@/utils';

import { UserSheet } from '../components/UserSheet';

const STATUS_STYLES: Record<string, string> = {
  ACTIVE: 'border-success/20 bg-success-subtle text-success-subtle-foreground',
  INACTIVE: 'border-border bg-muted text-muted-foreground',
  SUSPENDED: 'border-destructive/20 bg-destructive-subtle text-destructive-subtle-foreground',
};

/**
 * The account directory.
 *
 * Every row states the access the account carries as a number, not only as a
 * profile name — "MANAGER" says nothing about how much of the platform that
 * opens, and the whole point of this screen is being able to see it.
 */
export function UsersTab() {
  const catalog = usePermissionCatalog();
  const profiles = useAccessProfiles();
  const users = useDirectoryUsers();
  const deleteUser = useDeleteDirectoryUser();
  const { confirm, confirmDialog } = useConfirm();

  const currentUserId = useAuthStore((s) => s.user?.id);

  const [query, setQuery] = useState('');
  const [sheetOpen, setSheetOpen] = useState(false);
  const [editing, setEditing] = useState<DirectoryUser | null>(null);

  const profileById = useMemo(
    () => new Map((profiles.data ?? []).map((profile) => [profile.id, profile])),
    [profiles.data],
  );

  const rows = useMemo(() => {
    const list = users.data?.items ?? [];
    const needle = query.trim().toLowerCase();
    if (!needle) return list;
    return list.filter((user) =>
      [user.firstName, user.lastName, user.email, user.role.name]
        .join(' ')
        .toLowerCase()
        .includes(needle),
    );
  }, [users.data, query]);

  const openNew = () => {
    setEditing(null);
    setSheetOpen(true);
  };

  const openEdit = (user: DirectoryUser) => {
    setEditing(user);
    setSheetOpen(true);
  };

  const remove = async (user: DirectoryUser) => {
    const ok = await confirm({
      title: `Delete ${user.firstName} ${user.lastName}?`,
      description: `${user.email} loses access immediately and the account cannot be recovered.`,
      confirmLabel: 'Delete account',
    });
    if (!ok) return;
    await deleteUser.mutateAsync(user.id);
  };

  if (catalog.isLoading || profiles.isLoading || users.isLoading) {
    return <LoadingBlock />;
  }

  if (catalog.isError || profiles.isError || users.isError) {
    return (
      <ErrorBlock
        message={
          (catalog.error ?? profiles.error ?? users.error) instanceof Error
            ? (catalog.error ?? profiles.error ?? users.error as Error).message
            : 'The directory could not be loaded.'
        }
      />
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          inputSize="sm"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search by name, email or profile"
          leadingIcon={<Search className="h-3.5 w-3.5" />}
          className="max-w-xs"
        />
        <span className="text-2xs text-muted-foreground">
          {rows.length} of {users.data?.meta.total ?? 0} accounts
        </span>
        <Button
          variant="primary"
          size="sm"
          shape="pill"
          className="ml-auto"
          onClick={openNew}
          leadingIcon={<UserPlus className="h-3.5 w-3.5" />}
        >
          New User
        </Button>
      </div>

      <div className="space-y-2">
        {rows.map((user) => {
          const profile = profileById.get(user.role.id);
          const isSelf = user.id === currentUserId;
          return (
            <div
              key={user.id}
              className="flex flex-col gap-3 rounded-card border border-border bg-card p-3.5 sm:flex-row sm:items-center sm:justify-between sm:px-5"
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-primary/20 bg-primary/10 text-xs font-bold text-primary">
                  {`${user.firstName[0] ?? ''}${user.lastName[0] ?? ''}`.toUpperCase()}
                </span>
                <div className="min-w-0 space-y-0.5">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="truncate text-sm font-bold text-foreground">
                      {user.firstName} {user.lastName}
                    </span>
                    <span
                      className={cn(
                        'rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase',
                        STATUS_STYLES[user.status] ?? STATUS_STYLES.INACTIVE,
                      )}
                    >
                      {user.status.toLowerCase()}
                    </span>
                    {isSelf && (
                      <span className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
                        You
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-2xs text-muted-foreground">
                    <span className="flex items-center gap-1 truncate">
                      <Mail className="h-2.5 w-2.5 shrink-0" />
                      {user.email}
                    </span>
                    {user.phoneNumber && (
                      <span className="flex items-center gap-1">
                        <Phone className="h-2.5 w-2.5 shrink-0" />
                        {user.phoneNumber}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              <div className="flex shrink-0 flex-wrap items-center gap-3">
                <div className="text-right">
                  <p className="flex items-center justify-end gap-1.5 text-xs font-bold text-foreground">
                    {profile?.isSystem && <Lock className="h-3 w-3 text-muted-foreground" />}
                    {user.role.name}
                  </p>
                  <p className="flex items-center justify-end gap-1 text-2xs text-muted-foreground">
                    <Layers className="h-2.5 w-2.5" />
                    {profile?.isSuperuser
                      ? 'Everything'
                      : `${profile?.grantCount ?? 0} of ${catalog.data?.total ?? 0} permissions`}
                  </p>
                </div>

                <div className="flex items-center gap-1.5">
                  <Button
                    variant="outline"
                    size="sm"
                    shape="pill"
                    onClick={() => openEdit(user)}
                    leadingIcon={<Pencil className="h-3 w-3" />}
                    className="text-xs"
                  >
                    Access
                  </Button>
                  {/* Deleting your own account signs you out of the screen you
                      are standing on, so it is refused rather than confirmed. */}
                  <Button
                    variant="ghost"
                    size="sm"
                    shape="pill"
                    disabled={isSelf || deleteUser.isPending}
                    title={isSelf ? 'You cannot delete your own account' : 'Delete account'}
                    onClick={() => remove(user)}
                    className="text-muted-foreground hover:text-destructive"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </div>
            </div>
          );
        })}

        {rows.length === 0 && (
          <div className="flex flex-col items-center justify-center rounded-card border border-dashed border-border bg-card py-12 text-center">
            <Users className="mb-3 h-6 w-6 text-muted-foreground" />
            <h3 className="text-base font-bold text-foreground">No accounts match</h3>
            <p className="mt-1 max-w-sm text-xs text-muted-foreground">
              {query ? 'Try a different search.' : 'Create the first account to get started.'}
            </p>
          </div>
        )}
      </div>

      {catalog.data && profiles.data && (
        <UserSheet
          open={sheetOpen}
          onOpenChange={setSheetOpen}
          catalog={catalog.data}
          profiles={profiles.data}
          user={editing}
        />
      )}
      {confirmDialog}
    </div>
  );
}

export function LoadingBlock() {
  return (
    <div className="flex items-center justify-center gap-2 rounded-card border border-border bg-card py-16 text-xs text-muted-foreground">
      <Spinner size="sm" />
      Loading from the server…
    </div>
  );
}

export function ErrorBlock({ message }: { message: string }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-card border border-destructive/25 bg-destructive-subtle py-12 text-center">
      <AlertTriangle className="mb-2 h-5 w-5 text-destructive" />
      <h3 className="text-sm font-bold text-destructive-subtle-foreground">Nothing loaded</h3>
      <p className="mt-1 max-w-md px-6 text-xs text-destructive-subtle-foreground/80">{message}</p>
    </div>
  );
}
