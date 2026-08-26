import { useEffect, useMemo, useState } from 'react';

import {
  Button,
  Input,
  Select,
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
  Spinner,
} from '@/design-system';
import { AlertTriangle, Mail, Phone, ShieldCheck, UserPlus } from '@/design-system/icons';
import {
  useCreateAccessProfile,
  useCreateDirectoryUser,
  useUpdateDirectoryUser,
  type AccessProfile,
  type DirectoryUser,
  type PermissionCatalog,
  type UserStatus,
} from '@/features/access';

import { AccessComposer } from './AccessComposer';
import { useAccessDraft } from './useAccessDraft';

const STATUS_OPTIONS: { value: UserStatus; label: string }[] = [
  { value: 'ACTIVE', label: 'Active — can sign in now' },
  { value: 'INACTIVE', label: 'Inactive — account exists, no sign-in' },
  { value: 'SUSPENDED', label: 'Suspended — blocked' },
];

interface Identity {
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  password: string;
  status: UserStatus;
}

const EMPTY: Identity = {
  firstName: '',
  lastName: '',
  email: '',
  phoneNumber: '',
  password: '',
  status: 'ACTIVE',
};

/**
 * Create an account, or change the access on one that exists.
 *
 * The two cases share a sheet because they are the same decision at different
 * times — who this person is, and what they may do. Editing hides the identity
 * fields the API refuses to change (email and password are set once, by their
 * own endpoints) rather than showing inputs whose values would be discarded.
 */
export function UserSheet({
  open,
  onOpenChange,
  catalog,
  profiles,
  user,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  catalog: PermissionCatalog;
  profiles: AccessProfile[];
  /** Present when editing. */
  user?: DirectoryUser | null;
}) {
  const isEdit = Boolean(user);
  const [identity, setIdentity] = useState<Identity>(EMPTY);
  const [error, setError] = useState<string | null>(null);

  const draft = useAccessDraft(catalog, {
    initialProfileId: user?.role.id ?? '',
  });

  const createUser = useCreateDirectoryUser();
  const updateUser = useUpdateDirectoryUser();
  const createProfile = useCreateAccessProfile();
  const busy = createUser.isPending || updateUser.isPending || createProfile.isPending;

  /* Reopening the sheet for a different person must not inherit the last
     one's half-typed form. */
  useEffect(() => {
    if (!open) return;
    setError(null);
    setIdentity(
      user
        ? {
            firstName: user.firstName,
            lastName: user.lastName,
            email: user.email,
            phoneNumber: user.phoneNumber ?? '',
            password: '',
            status: user.status,
          }
        : EMPTY,
    );
    draft.setMode('profile');
    draft.setProfileId(user?.role.id ?? '');
    draft.setSelected(new Set());
    draft.setName('');
    draft.setDescription('');
    // Reset is keyed on which record the sheet was opened for, not on the
    // draft object, which changes identity on every keystroke.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, user?.id]);

  const identityProblem = useMemo(() => {
    if (!identity.firstName.trim() || !identity.lastName.trim()) return 'Enter a first and last name.';
    if (!isEdit) {
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(identity.email)) return 'Enter a valid email address.';
      if (identity.password.length < 8) return 'The password needs at least 8 characters.';
    }
    return null;
  }, [identity, isEdit]);

  const problem = identityProblem ?? draft.problem;

  const submit = async () => {
    if (problem) {
      setError(problem);
      return;
    }
    setError(null);

    try {
      /* Custom access is a profile that does not exist yet, so it has to be
         created before the user can reference it. Doing it here rather than
         in a separate step keeps "new user with bespoke access" a single
         action for the admin. */
      let roleId = draft.profileId;
      if (draft.mode === 'custom') {
        const profile = await createProfile.mutateAsync({
          name: draft.name,
          description: draft.description || undefined,
          permissions: draft.grants,
        });
        roleId = profile.id;
      }

      if (isEdit && user) {
        await updateUser.mutateAsync({
          id: user.id,
          payload: {
            firstName: identity.firstName.trim(),
            lastName: identity.lastName.trim(),
            phoneNumber: identity.phoneNumber.trim() || undefined,
            status: identity.status,
            roleId,
          },
        });
      } else {
        await createUser.mutateAsync({
          email: identity.email.trim().toLowerCase(),
          password: identity.password,
          firstName: identity.firstName.trim(),
          lastName: identity.lastName.trim(),
          phoneNumber: identity.phoneNumber.trim() || undefined,
          status: identity.status,
          roleId,
        });
      }

      onOpenChange(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'The server rejected the request.');
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="flex h-full w-full flex-col gap-0 overflow-hidden border-l border-border bg-background p-0 sm:max-w-3xl"
      >
        <div className="shrink-0 space-y-1 border-b border-border/40 px-6 pb-4 pt-6">
          <SheetTitle className="text-xl font-extrabold tracking-tight text-foreground">
            {isEdit ? `${user?.firstName} ${user?.lastName}` : 'New User'}
          </SheetTitle>
          <SheetDescription className="text-xs text-muted-foreground">
            {isEdit
              ? 'Change the profile details or the access this account carries.'
              : 'Create the account, then decide exactly what it may reach.'}
          </SheetDescription>
        </div>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5">
          <section className="space-y-3">
            <SectionLabel icon={<UserPlus className="h-3.5 w-3.5" />} title="Who" />

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <Field label="First name">
                <Input
                  inputSize="sm"
                  value={identity.firstName}
                  onChange={(e) => setIdentity((s) => ({ ...s, firstName: e.target.value }))}
                  placeholder="Amina"
                />
              </Field>
              <Field label="Last name">
                <Input
                  inputSize="sm"
                  value={identity.lastName}
                  onChange={(e) => setIdentity((s) => ({ ...s, lastName: e.target.value }))}
                  placeholder="Hassan"
                />
              </Field>

              {!isEdit && (
                <>
                  <Field label="Email">
                    <Input
                      inputSize="sm"
                      type="email"
                      leadingIcon={<Mail className="h-3.5 w-3.5" />}
                      value={identity.email}
                      onChange={(e) => setIdentity((s) => ({ ...s, email: e.target.value }))}
                      placeholder="amina@fleetin.dj"
                    />
                  </Field>
                  <Field label="Temporary password" hint="At least 8 characters. They can change it after signing in.">
                    <Input
                      inputSize="sm"
                      isPassword
                      value={identity.password}
                      onChange={(e) => setIdentity((s) => ({ ...s, password: e.target.value }))}
                      placeholder="••••••••"
                    />
                  </Field>
                </>
              )}

              <Field label="Phone" hint="Optional.">
                <Input
                  inputSize="sm"
                  leadingIcon={<Phone className="h-3.5 w-3.5" />}
                  value={identity.phoneNumber}
                  onChange={(e) => setIdentity((s) => ({ ...s, phoneNumber: e.target.value }))}
                  placeholder="+253 77 00 00 00"
                />
              </Field>
              <Field label="Account status">
                <Select
                  selectSize="sm"
                  value={identity.status}
                  onChange={(e) => setIdentity((s) => ({ ...s, status: e.target.value as UserStatus }))}
                  options={STATUS_OPTIONS}
                />
              </Field>
            </div>

            {isEdit && (
              <p className="text-2xs text-muted-foreground">
                Email and password are set at sign-up and are not editable here.
              </p>
            )}
          </section>

          <section className="space-y-3">
            <SectionLabel icon={<ShieldCheck className="h-3.5 w-3.5" />} title="What they may do" />
            <AccessComposer
              catalog={catalog}
              profiles={profiles}
              draft={draft}
              subjectName={`${identity.firstName} ${identity.lastName}`.trim()}
            />
          </section>
        </div>

        <div className="shrink-0 space-y-2 border-t border-border/40 bg-card px-6 py-4">
          {error && (
            <p className="flex items-start gap-2 rounded-md border border-destructive/25 bg-destructive-subtle px-3 py-2 text-xs text-destructive-subtle-foreground">
              <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              {error}
            </p>
          )}
          <div className="flex items-center justify-between gap-3">
            <p className="text-2xs text-muted-foreground">
              {problem ?? 'Ready to save.'}
            </p>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" shape="pill" onClick={() => onOpenChange(false)}>
                Cancel
              </Button>
              <Button
                variant="primary"
                size="sm"
                shape="pill"
                onClick={submit}
                disabled={busy || Boolean(problem)}
                leadingIcon={busy ? <Spinner size="sm" /> : undefined}
              >
                {isEdit ? 'Save changes' : 'Create user'}
              </Button>
            </div>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}

function SectionLabel({ icon, title }: { icon: React.ReactNode; title: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary">
        {icon}
      </span>
      <h3 className="text-xs font-bold uppercase tracking-wide text-foreground">{title}</h3>
    </div>
  );
}

function Field({
  label,
  hint,
  children,
}: {
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <label className="space-y-1">
      <span className="text-xs font-semibold text-foreground">{label}</span>
      {children}
      {hint && <span className="block text-2xs text-muted-foreground">{hint}</span>}
    </label>
  );
}
