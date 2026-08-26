import { useCallback, useMemo, useState } from 'react';

import {
  fromGrants,
  summarize,
  toGrants,
  type AccessProfile,
  type PermissionCatalog,
} from '@/features/access';

export type AccessMode = 'profile' | 'custom';

/**
 * The access half of the new-user form, held apart from the identity half.
 *
 * Access in this system is carried by a role, so "custom access" is not a
 * per-user field — it is a new profile that gets created and then assigned.
 * Both modes therefore have to produce the same thing at submit time: one role
 * id. `resolve()` is where that happens, and it is the only place that knows
 * the difference.
 */
export interface AccessDraft {
  mode: AccessMode;
  setMode: (mode: AccessMode) => void;
  /** Chosen profile in `profile` mode. */
  profileId: string;
  setProfileId: (id: string) => void;
  /** Concrete permissions in `custom` mode. */
  selected: Set<string>;
  setSelected: (next: Set<string>) => void;
  /** Name for the profile a custom selection will be saved as. */
  name: string;
  setName: (name: string) => void;
  description: string;
  setDescription: (description: string) => void;
  /** Loads an existing profile's grants into the custom selection. */
  copyFrom: (profile: AccessProfile) => void;
  clear: () => void;
  /** Grants in stored form — wildcards collapsed. */
  grants: string[];
  summary: ReturnType<typeof summarize>;
  /** Empty while the form is not answerable. */
  problem: string | null;
}

/** Upper snake case, the shape the API requires of a role name. */
export function toProfileName(value: string): string {
  return value
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 60);
}

export function useAccessDraft(
  catalog: PermissionCatalog | undefined,
  options: { initialMode?: AccessMode; initialProfileId?: string } = {},
): AccessDraft {
  const [mode, setMode] = useState<AccessMode>(options.initialMode ?? 'profile');
  const [profileId, setProfileId] = useState(options.initialProfileId ?? '');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');

  const copyFrom = useCallback(
    (profile: AccessProfile) => {
      if (!catalog) return;
      setSelected(fromGrants(catalog, profile.permissions));
      setDescription((current) => current || `Based on ${profile.name}.`);
    },
    [catalog],
  );

  const clear = useCallback(() => setSelected(new Set()), []);

  const grants = useMemo(
    () => (catalog ? toGrants(catalog, selected) : []),
    [catalog, selected],
  );

  const summary = useMemo(
    () =>
      catalog
        ? summarize(catalog, selected)
        : { count: 0, total: 0, moduleCount: 0, sensitive: [] },
    [catalog, selected],
  );

  const problem = useMemo(() => {
    if (mode === 'profile') {
      return profileId ? null : 'Pick an access profile.';
    }
    if (summary.count === 0) return 'Tick at least one permission.';
    if (!toProfileName(name)) return 'Name this access profile.';
    return null;
  }, [mode, profileId, summary.count, name]);

  return {
    mode,
    setMode,
    profileId,
    setProfileId,
    selected,
    setSelected,
    name,
    setName,
    description,
    setDescription,
    copyFrom,
    clear,
    grants,
    summary,
    problem,
  };
}
