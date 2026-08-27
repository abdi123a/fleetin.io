import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';

import {
  createAccessProfile,
  createUser,
  deleteAccessProfile,
  deleteUser,
  fetchAccessProfile,
  fetchAccessProfiles,
  fetchPermissionCatalog,
  fetchUsers,
  updateAccessProfile,
  updateUser,
  type CreateProfilePayload,
  type CreateUserPayload,
  type UpdateProfilePayload,
  type UpdateUserPayload,
} from './accessService';

export const accessQueryKeys = {
  catalog: ['access', 'catalog'] as const,
  profiles: ['access', 'profiles'] as const,
  profile: (id: string) => ['access', 'profiles', id] as const,
  users: ['access', 'users'] as const,
};

/** The vocabulary is deployment-stable; refetching it on every focus is noise. */
export function usePermissionCatalog() {
  return useQuery({
    queryKey: accessQueryKeys.catalog,
    queryFn: fetchPermissionCatalog,
    staleTime: Infinity,
  });
}

export function useAccessProfiles() {
  return useQuery({ queryKey: accessQueryKeys.profiles, queryFn: fetchAccessProfiles });
}

export function useAccessProfile(id: string | null) {
  return useQuery({
    queryKey: accessQueryKeys.profile(id ?? 'none'),
    queryFn: () => fetchAccessProfile(id as string),
    enabled: Boolean(id),
  });
}

export function useDirectoryUsers() {
  return useQuery({ queryKey: accessQueryKeys.users, queryFn: () => fetchUsers({ limit: 200 }) });
}

/**
 * Every mutation here invalidates both lists.
 *
 * A profile and its holders are two views of one fact: creating a user changes
 * a profile's holder count, and editing a profile changes what its users can
 * do. Invalidating only the list that was written leaves the other tab stale.
 */
function useAccessMutation<TArgs, TResult>(mutationFn: (args: TArgs) => Promise<TResult>) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: accessQueryKeys.profiles });
      queryClient.invalidateQueries({ queryKey: accessQueryKeys.users });
    },
  });
}

export function useCreateAccessProfile() {
  return useAccessMutation((payload: CreateProfilePayload) => createAccessProfile(payload));
}

export function useUpdateAccessProfile() {
  return useAccessMutation(({ id, payload }: { id: string; payload: UpdateProfilePayload }) =>
    updateAccessProfile(id, payload),
  );
}

export function useDeleteAccessProfile() {
  return useAccessMutation((id: string) => deleteAccessProfile(id));
}

export function useCreateDirectoryUser() {
  return useAccessMutation((payload: CreateUserPayload) => createUser(payload));
}

export function useUpdateDirectoryUser() {
  return useAccessMutation(({ id, payload }: { id: string; payload: UpdateUserPayload }) =>
    updateUser(id, payload),
  );
}

export function useDeleteDirectoryUser() {
  return useAccessMutation((id: string) => deleteUser(id));
}
